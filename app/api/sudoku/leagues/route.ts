import { cleanName, handle, json, readBody, requirePlayer } from "@/lib/server/http";
import { createLeague, myLeagues, summarise } from "@/lib/server/leagues";
import { mutate, read } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Leagues the current player belongs to. */
export async function GET() {
  return handle(async () => {
    const player = await requirePlayer();
    return json(await read((db) => myLeagues(db, player.id)));
  });
}

/** Create a league (a friend group with a monthly tournament). */
export async function POST(request: Request) {
  return handle(async () => {
    const player = await requirePlayer();
    const name = cleanName((await readBody(request)).name);
    const league = await mutate((db) => summarise(createLeague(db, player, name)));
    return json(league, 201);
  });
}
