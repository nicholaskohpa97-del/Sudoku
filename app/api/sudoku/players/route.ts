import { cleanName, handle, json, readBody, requirePlayer } from "@/lib/server/http";
import { mutate } from "@/lib/server/store";
import type { PlayerProfile } from "@/lib/sudoku/types";

export const dynamic = "force-dynamic";

/** The signed-in player (created from the Google profile on first visit). */
export async function GET() {
  return handle(async () => {
    const player = await requirePlayer();
    return json<PlayerProfile>({ id: player.id, name: player.name, avatarUrl: player.avatarUrl ?? null });
  });
}

/** Change the display name other players see. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const player = await requirePlayer();
    const name = cleanName((await readBody(request)).name);
    await mutate((db) => {
      db.players[player.id].name = name;
    });
    return json<PlayerProfile>({ id: player.id, name, avatarUrl: player.avatarUrl ?? null });
  });
}
