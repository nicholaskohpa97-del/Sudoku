import type { NextRequest } from "next/server";
import { authenticate, handle, HttpError, json, readBody, requirePlayer } from "@/lib/server/http";
import { getLeague, joinLeague, leagueView, leaveLeague } from "@/lib/server/leagues";
import { mutate, read } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** League details and the standings for `?month=YYYY-MM` (default: this month). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/sudoku/leagues/[code]">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const viewer = await authenticate(request);
    const month = request.nextUrl.searchParams.get("month");
    return json(await read((db) => leagueView(db, getLeague(db, code), viewer?.id ?? null, month)));
  });
}

/** League commands: join, leave. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/sudoku/leagues/[code]">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const player = await requirePlayer(request);
    const { action } = await readBody(request);
    const result = await mutate((db) => {
      const league = getLeague(db, code);
      if (action === "join") joinLeague(league, player);
      else if (action === "leave") {
        leaveLeague(db, league, player);
        return { left: true };
      } else throw new HttpError(400, "Unknown action");
      return leagueView(db, league, player.id, null);
    });
    return json(result);
  });
}
