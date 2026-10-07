import { cleanName, handle, hashToken, json, newId, newToken, readBody, requirePlayer } from "@/lib/server/http";
import { assertNameFree } from "@/lib/server/names";
import { mutate } from "@/lib/server/store";
import type { PlayerSession } from "@/lib/sudoku/types";

/** Register a new player on this device. */
export async function POST(request: Request) {
  return handle(async () => {
    const name = cleanName((await readBody(request)).name);
    const session = await mutate((db): PlayerSession => {
      assertNameFree(db, name);
      const id = newId();
      const token = newToken();
      db.players[id] = { id, name, tokenHash: hashToken(token), createdAt: Date.now() };
      return { id, name, token };
    });
    return json(session, 201);
  });
}

/** Rename the current player. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const player = await requirePlayer(request);
    const name = cleanName((await readBody(request)).name);
    await mutate((db) => {
      assertNameFree(db, name, player.id);
      db.players[player.id].name = name;
    });
    return json({ id: player.id, name });
  });
}

/** Check that the stored credentials are still valid. */
export async function GET(request: Request) {
  return handle(async () => {
    const player = await requirePlayer(request);
    return json({ id: player.id, name: player.name });
  });
}
