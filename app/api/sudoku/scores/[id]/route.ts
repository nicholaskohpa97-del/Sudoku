import type { NextRequest } from "next/server";
import { authenticate, handle, HttpError, json, readBody, requirePlayer } from "@/lib/server/http";
import { puzzleOf, scoreDetail, startChallenge, submitChallenge } from "@/lib/server/scores";
import { mutate, read } from "@/lib/server/store";

/** One score, with everyone's results on the same puzzle and whether you can challenge it. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/sudoku/scores/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const viewer = await authenticate(request);
    return json(await read((db) => scoreDetail(db, id, viewer)));
  });
}

/** Challenge it: `start` locks in your single scored attempt, `submit` sends the finished game. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/sudoku/scores/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const player = await requirePlayer(request);
    const body = await readBody(request);
    switch (body.action) {
      case "start":
        return json(await mutate((db) => startChallenge(db, player, id)));
      case "submit":
        return json(await mutate((db) => submitChallenge(db, player, id, body)));
      case "puzzle": {
        // Only someone who has started the challenge gets the puzzle's identity.
        const ok = await read((db) => (db.attempts ?? []).some((a) => a.playerId === player.id && a.scoreId === id && !a.doneAt));
        if (!ok) throw new HttpError(409, "Start the challenge first");
        const puzzle = await read((db) => puzzleOf(db, id));
        if (!puzzle) throw new HttpError(404, "Puzzle not found");
        return json({ baseId: puzzle.baseId, seed: puzzle.seed });
      }
      default:
        throw new HttpError(400, "Unknown action");
    }
  });
}
