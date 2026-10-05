// Persistence for players, rooms, leagues and match results.
//
// Two backends sit behind the same `read` / `mutate` interface:
// - Vercel Blob (when BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN is set): the whole database is
//   one private JSON blob. Writes use optimistic concurrency (`ifMatch` on
//   the ETag) and retry on conflict, so concurrent serverless instances never
//   overwrite each other's changes.
// - Local JSON file (otherwise): for `next dev` / single-server hosting.
//   Writes are serialised in-process and replaced atomically.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { BlobError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import type { Difficulty } from "@/lib/sudoku/engine";
import type { RoomStatus } from "@/lib/sudoku/types";
import { HttpError } from "./errors";

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
// Vercel Blob backend

const BLOB_PATH = "sudoku/db.json";
/** Reads may be served from this instance's copy if it is at most this old. */
const READ_MAX_AGE_MS = 1000;
const MAX_WRITE_ATTEMPTS = 8;

function blobBackend(): Backend {
  let cache: { db: Db; etag: string | null; fetchedAt: number } | null = null;
  let inflight: Promise<void> | null = null;
  const enqueue = serialQueue();

  async function refresh(): Promise<void> {
    const result = await get(BLOB_PATH, {
      access: "private",
      useCache: false,
      ...(cache?.etag ? { ifNoneMatch: cache.etag } : {}),
    });
    const now = Date.now();
    if (!result) {
      cache = { db: emptyDb(), etag: null, fetchedAt: now };
    } else if (result.statusCode === 304 && cache) {
      cache.fetchedAt = now;
    } else if (result.statusCode === 200) {
      const text = await new Response(result.stream).text();
      cache = { db: { ...emptyDb(), ...(JSON.parse(text) as Db) }, etag: result.blob.etag, fetchedAt: now };
    }
  }

  /** Ensures the cached copy is no older than `maxAgeMs`, coalescing concurrent fetches. */
  async function fresh(maxAgeMs: number): Promise<NonNullable<typeof cache>> {
    if (!cache || Date.now() - cache.fetchedAt > maxAgeMs) {
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
          try {
            const written = await put(BLOB_PATH, JSON.stringify(draft), {
              access: "private",
              contentType: "application/json",
              addRandomSuffix: false,
              cacheControlMaxAge: 60,
              ...(snapshot.etag ? { allowOverwrite: true, ifMatch: snapshot.etag } : { allowOverwrite: false }),
            });
            cache = { db: draft, etag: written.etag, fetchedAt: Date.now() };
            return result;
          } catch (err) {
            // A precondition failure (or "already exists" on first create) means
            // another instance wrote first.
            const conflict = err instanceof BlobPreconditionFailedError || (!snapshot.etag && err instanceof BlobError);
            if (!conflict || attempt >= MAX_WRITE_ATTEMPTS) throw err;
            await new Promise((r) => setTimeout(r, Math.random() * 40 * attempt));
            snapshot = await fresh(0);
          }
        }
      }),
  };
}

// ---------------------------------------------------------------------------

// Serverless hosts have a read-only filesystem, so the file backend cannot
// work there. Fail with a clear message instead of a generic EROFS 500.
export const STORAGE_NOT_CONFIGURED =
  "Storage isn't configured — connect a Vercel Blob store to this project (sets BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN), then redeploy";

function unconfiguredBackend(): Backend {
  const fail = async (): Promise<never> => {
    console.error(`[sudoku] ${STORAGE_NOT_CONFIGURED}`);
    throw new HttpError(503, STORAGE_NOT_CONFIGURED);
  };
  return { read: fail, mutate: fail };
}

export function selectBackend(env: Record<string, string | undefined> = process.env): "blob" | "file" | "unconfigured" {
  // Newer Blob connections authenticate with the deployment's OIDC token and
  // only set BLOB_STORE_ID; older ones set a read-write token. @vercel/blob
  // handles both, so either means Blob storage is available.
  if (env.BLOB_STORE_ID || env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (env.VERCEL && !env.SUDOKU_DATA_DIR) return "unconfigured";
  return "file";
}

const globalStore = globalThis as typeof globalThis & { __sudokuStore?: Backend };
const backend: Backend = (globalStore.__sudokuStore ??= {
  blob: blobBackend,
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
