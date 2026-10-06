// Persistence for players, rooms, leagues and match results.
//
// Two backends sit behind the same `read` / `mutate` interface:
// - Supabase Postgres (when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
//   set): the whole database is one JSONB row in `sudoku_state`
//   (see supabase/schema.sql). Writes use optimistic concurrency on a
//   `version` column and retry on conflict, so concurrent serverless
//   instances never overwrite each other's changes.
// - Local JSON file (otherwise): for `next dev` / single-server hosting.
//   Writes are serialised in-process and replaced atomically.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "@/lib/supabase/env";
import type { Difficulty } from "@/lib/sudoku/engine";
import type { RoomStatus } from "@/lib/sudoku/types";
import { HttpError } from "./errors";
import { explainDbError } from "./supabase-diagnostics";

export interface PlayerRecord {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: number;
}

export interface RoomMember {
  playerId: string;
  joinedAt: number;
  /** Givens plus every correct entry, "0" elsewhere. */
  board: string;
  mistakes: number;
  finishedMs: number | null;
  eliminated: boolean;
}

export interface RoomRecord {
  code: string;
  hostId: string;
  difficulty: Difficulty;
  maxPlayers: number;
  leagueCode: string | null;
  status: RoomStatus;
  round: number;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  endsAt: number | null;
  finishedAt: number | null;
  puzzle: string | null;
  solution: string | null;
  members: RoomMember[];
  /** Points per player for the last finished round, if league-linked. */
  points: Record<string, number> | null;
}

export interface LeagueRecord {
  code: string;
  name: string;
  ownerId: string;
  createdAt: number;
  memberIds: string[];
}

export interface MatchResult {
  playerId: string;
  completed: boolean;
  place: number | null;
  mistakes: number;
  timeMs: number | null;
  filled: number;
  points: number;
}

export interface MatchRecord {
  id: string;
  leagueCode: string;
  roomCode: string;
  difficulty: Difficulty;
  endedAt: number;
  month: string;
  results: MatchResult[];
}

export interface Db {
  version: 1;
  players: Record<string, PlayerRecord>;
  rooms: Record<string, RoomRecord>;
  leagues: Record<string, LeagueRecord>;
  matches: MatchRecord[];
}

function emptyDb(): Db {
  return { version: 1, players: {}, rooms: {}, leagues: {}, matches: [] };
}

interface Backend {
  read(): Promise<Db>;
  mutate<T>(fn: (db: Db) => T): Promise<T>;
}

/** Runs tasks one at a time within this process. */
function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}

// ---------------------------------------------------------------------------
// Local file backend

function fileBackend(): Backend {
  const dataDir = process.env.SUDOKU_DATA_DIR ?? path.join(process.cwd(), ".data");
  const dataFile = path.join(dataDir, "sudoku.json");
  let db: Db | null = null;
  const enqueue = serialQueue();

  async function load(): Promise<Db> {
    if (db) return db;
    try {
      db = { ...emptyDb(), ...(JSON.parse(await readFile(dataFile, "utf8")) as Db) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      db = emptyDb();
    }
    return db;
  }

  return {
    read: () => enqueue(load),
    // Persisted even if `fn` throws, because commands may legitimately change
    // state (e.g. closing an expired match) before rejecting the request.
    mutate: (fn) =>
      enqueue(async () => {
        const current = await load();
        try {
          return fn(current);
        } finally {
          await mkdir(dataDir, { recursive: true });
          const tmp = `${dataFile}.${process.pid}.tmp`;
          await writeFile(tmp, JSON.stringify(current));
          await rename(tmp, dataFile);
        }
      }),
  };
}

// ---------------------------------------------------------------------------
// Supabase backend

export const STATE_TABLE = "sudoku_state";
const STATE_ID = "main";
/** Reads may be served from this instance's copy if it is at most this old. */
const READ_MAX_AGE_MS = 1000;
const MAX_WRITE_ATTEMPTS = 8;

interface StateRow {
  data: Db;
  version: number;
}

/** The three queries the backend needs; a fake implements this in tests. */
export interface StateStore {
  load(): Promise<StateRow | null>;
  /** Insert the first row; false if another instance created it first. */
  create(data: Db): Promise<boolean>;
  /** Replace the row if it is still at `version`; false on a concurrent write. */
  replace(data: Db, version: number): Promise<boolean>;
}

function supabaseStateStore(url: string, secretKey: string): StateStore {
  const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const table = () => supabase.from(STATE_TABLE);
  const fail = (what: string, error: { code?: string; message: string }): never => {
    console.error(`[sudoku] Supabase ${what} failed:`, error.code, error.message);
    throw explainDbError(what, error, secretKey, url);
  };
  return {
    async load() {
      const { data, error } = await table().select("data, version").eq("id", STATE_ID).maybeSingle();
      if (error) fail("read", error);
      return (data as StateRow | null) ?? null;
    },
    async create(data) {
      const { error } = await table().insert({ id: STATE_ID, data, version: 1 });
      if (!error) return true;
      if (error.code === "23505") return false; // unique violation: someone else created it
      return fail("insert", error);
    },
    async replace(data, version) {
      const { data: rows, error } = await table()
        .update({ data, version: version + 1, updated_at: new Date().toISOString() })
        .eq("id", STATE_ID)
        .eq("version", version)
        .select("version");
      if (error) fail("update", error);
      return (rows?.length ?? 0) > 0;
    },
  };
}

export function stateStoreBackend(store: StateStore, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Backend {
  let cache: { db: Db; version: number | null; fetchedAt: number } | null = null;
  let inflight: Promise<void> | null = null;
  const enqueue = serialQueue();

  async function refresh(): Promise<void> {
    const row = await store.load();
    cache = row
      ? { db: { ...emptyDb(), ...row.data }, version: row.version, fetchedAt: Date.now() }
      : { db: emptyDb(), version: null, fetchedAt: Date.now() };
  }

  /** Ensures the cached copy is no older than `maxAgeMs` (or refetches when `force`), coalescing concurrent fetches. */
  async function fresh(maxAgeMs: number, force = false): Promise<NonNullable<typeof cache>> {
    if (force) await inflight; // don't reuse a fetch that may predate the conflict
    if (force || !cache || Date.now() - cache.fetchedAt > maxAgeMs) {
      inflight ??= refresh().finally(() => {
        inflight = null;
      });
      await inflight;
    }
    return cache!;
  }

  return {
    read: async () => (await fresh(READ_MAX_AGE_MS)).db,
    mutate: (fn) =>
      enqueue(async () => {
        // Optimistic: try against our cached copy; on conflict, refetch and retry.
        let snapshot = await fresh(READ_MAX_AGE_MS);
        for (let attempt = 1; ; attempt++) {
          const draft = structuredClone(snapshot.db);
          const result = fn(draft); // throws → nothing is written
          const ok = snapshot.version === null ? await store.create(draft) : await store.replace(draft, snapshot.version);
          if (ok) {
            cache = { db: draft, version: (snapshot.version ?? 0) + 1, fetchedAt: Date.now() };
            return result;
          }
          if (attempt >= MAX_WRITE_ATTEMPTS) throw new Error("Too many concurrent writes — try again");
          await sleep(Math.random() * 40 * attempt);
          snapshot = await fresh(0, true);
        }
      }),
  };
}

// ---------------------------------------------------------------------------

// Serverless hosts have a read-only filesystem, so the file backend cannot
// work there. Fail with a clear message instead of a generic EROFS 500.
export const STORAGE_NOT_CONFIGURED =
  "Storage isn't configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel, then redeploy";

function unconfiguredBackend(): Backend {
  const fail = async (): Promise<never> => {
    console.error(`[sudoku] ${STORAGE_NOT_CONFIGURED}`);
    throw new HttpError(503, STORAGE_NOT_CONFIGURED);
  };
  return { read: fail, mutate: fail };
}

export function selectBackend(env: Record<string, string | undefined> = process.env): "supabase" | "file" | "unconfigured" {
  if (supabaseUrl(env) && supabaseSecretKey(env)) return "supabase";
  if (env.VERCEL && !env.SUDOKU_DATA_DIR) return "unconfigured";
  return "file";
}

const globalStore = globalThis as typeof globalThis & { __sudokuStore?: Backend };
const backend: Backend = (globalStore.__sudokuStore ??= {
  supabase: () => stateStoreBackend(supabaseStateStore(supabaseUrl(), supabaseSecretKey())),
  file: fileBackend,
  unconfigured: unconfiguredBackend,
}[selectBackend()]());

/** Read-only access. Do not mutate `db` inside `fn`. */
export async function read<T>(fn: (db: Db) => T): Promise<T> {
  return fn(await backend.read());
}

/**
 * Exclusive read-modify-write. `fn` may run more than once if another
 * server instance writes concurrently, so it must not have external side
 * effects beyond in-memory caches.
 */
export function mutate<T>(fn: (db: Db) => T): Promise<T> {
  return backend.mutate(fn);
}
