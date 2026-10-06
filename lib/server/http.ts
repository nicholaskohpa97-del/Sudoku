import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors";
import { read, type PlayerRecord } from "./store";

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
// Identity: lightweight device-bound players. The client stores
// `{ id, token }` locally and sends `Authorization: Bearer <id>:<token>`.

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function newId(): string {
  return randomBytes(9).toString("base64url");
}

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function cleanName(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Name is required");
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 24) throw new HttpError(400, "Name must be 1–24 characters");
  return name;
}

export { normaliseCode } from "@/lib/sudoku/invite";

export async function authenticate(request: Request): Promise<PlayerRecord | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([\w-]+):([\w-]+)$/.exec(header);
  if (!match) return null;
  const [, id, token] = match;
  return read((db) => {
    const player = db.players[id];
    if (!player) return null;
    const expected = Buffer.from(player.tokenHash, "hex");
    const actual = Buffer.from(hashToken(token), "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? player : null;
  });
}

export async function requirePlayer(request: Request): Promise<PlayerRecord> {
  const player = await authenticate(request);
  if (!player) throw new HttpError(401, "Set a player name first");
  return player;
}
