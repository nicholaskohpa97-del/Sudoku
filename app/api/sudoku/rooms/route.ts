import { handle, json, readBody, requirePlayer } from "@/lib/server/http";
import { createRoom, roomView, touchPresence } from "@/lib/server/rooms";
import { mutate } from "@/lib/server/store";

/** Create a multiplayer room; the creator becomes host. */
export async function POST(request: Request) {
  return handle(async () => {
    const player = await requirePlayer();
    const body = await readBody(request);
    const view = await mutate((db) => {
      const room = createRoom(db, player, body);
      touchPresence(room.code, player.id);
      return roomView(db, room, player.id);
    });
    return json(view, 201);
  });
}
