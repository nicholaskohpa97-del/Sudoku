import type { NextRequest } from "next/server";
import { authenticate, handle, json, readBody, requirePlayer } from "@/lib/server/http";
import { listBoard, postScore } from "@/lib/server/scores";
import { mutate, read } from "@/lib/server/store";
import type { BoardKind } from "@/lib/sudoku/types";

const BOARDS: BoardKind[] = ["all", "week", "daily", "players"];

/** Leaderboards: ?board=all|week|daily|players&tier=hard&limit=50. Public; signing in marks your own rows. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const q = request.nextUrl.searchParams;
    const board = BOARDS.includes(q.get("board") as BoardKind) ? (q.get("board") as BoardKind) : "all";
    const viewer = await authenticate(request);
    return json(
      await read((db) => listBoard(db, { board, tier: q.get("tier") ?? undefined, limit: Number(q.get("limit")) || undefined, viewerId: viewer?.id })),
    );
  });
}

/** Post a finished game. The server replays its move log and works out the score itself. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const player = await requirePlayer(request);
    const body = await readBody(request);
    return json(await mutate((db) => postScore(db, player, body)), 201);
  });
}
