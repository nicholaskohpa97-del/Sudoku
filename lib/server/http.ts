import { randomBytes } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { HttpError } from "./errors";
import { mutate, read, type PlayerRecord } from "./store";

export { HttpError };

export function json<T>(data: T, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Wraps a handler so thrown HttpErrors become JSON error responses. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: "Something went wrong" }, 500);
  }
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Codes and names

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function newId(): string {
  return randomBytes(9).toString("base64url");
}

export function cleanName(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Name is required");
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 24) throw new HttpError(400, "Name must be 1–24 characters");
  return name;
}

export { normaliseCode } from "@/lib/sudoku/invite";

// ---------------------------------------------------------------------------
// Identity: Google accounts via Supabase Auth. The session lives in cookies;
// the JWT is verified on every request, and the player record is created
// from the Google profile the first time we see a user.

interface AuthUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** Display name from Google profile metadata, trimmed to the 24-char limit. */
export function displayNameFrom(meta: Record<string, unknown> | undefined, email: string | undefined): string {
  const candidates = [meta?.full_name, meta?.name, meta?.given_name, email?.split("@")[0]];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const name = c.replace(/\s+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 24).trim();
    if (name) return name;
  }
  return "Player";
}

async function currentUser(): Promise<AuthUser | null> {
  const supabase = await supabaseServer();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const meta = claims.user_metadata as Record<string, unknown> | undefined;
  return {
    id: claims.sub,
    name: displayNameFrom(meta, typeof claims.email === "string" ? claims.email : undefined),
    avatarUrl: typeof meta?.avatar_url === "string" ? meta.avatar_url : typeof meta?.picture === "string" ? meta.picture : null,
  };
}

export async function authenticate(): Promise<PlayerRecord | null> {
  const user = await currentUser();
  if (!user) return null;
  const existing = await read((db) => db.players[user.id] ?? null);
  if (existing) return existing;
  // First visit: create the player from the Google profile.
  return mutate((db) => {
    db.players[user.id] ??= { id: user.id, name: user.name, avatarUrl: user.avatarUrl, createdAt: Date.now() };
    return db.players[user.id];
  });
}

export async function requirePlayer(): Promise<PlayerRecord> {
  const player = await authenticate();
  if (!player) throw new HttpError(401, "Sign in with Google to play with friends");
  return player;
}
