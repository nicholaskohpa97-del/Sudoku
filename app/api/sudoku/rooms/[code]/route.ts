import type { NextRequest } from "next/server";
import { authenticate, handle, HttpError, json, readBody, requirePlayer } from "@/lib/server/http";
import {
  applyMove,
  backToLobby,
  endRoom,
  finalizeIfDone,
  getRoom,
  joinRoom,
  leaveRoom,
  needsFinalize,
  roomView,
  startRoom,
  touchPresence,
  updateSettings,
} from "@/lib/server/rooms";
import { mutate, read } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Poll room state. Also serves as the presence heartbeat. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/sudoku/rooms/[code]">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const viewer = await authenticate(request);
    const now = Date.now();
    // Only take the write path when a match has just run out of time.
    const stale = await read((db) => needsFinalize(getRoom(db, code), now));
    const view = stale
      ? await mutate((db) => {
          const room = getRoom(db, code);
          finalizeIfDone(db, room, now);
          return roomView(db, room, viewer?.id ?? null, now);
        })
      : await read((db) => {
          const room = getRoom(db, code);
          if (viewer && room.members.some((m) => m.playerId === viewer.id)) touchPresence(room.code, viewer.id, now);
          return roomView(db, room, viewer?.id ?? null, now);
        });
    return json(view);
  });
}

/** Room commands: join, leave, settings, start, move, end, lobby. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/sudoku/rooms/[code]">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const player = await requirePlayer(request);
    const body = await readBody(request);
    const result = await mutate((db) => {
      const room = getRoom(db, code);
      touchPresence(room.code, player.id);
      switch (body.action) {
        case "join":
          joinRoom(db, room, player);
          break;
        case "leave":
          leaveRoom(db, room, player.id);
          return { left: true };
        case "settings":
          updateSettings(room, player.id, body);
          break;
        case "start":
          startRoom(room, player.id);
          break;
        case "end":
          endRoom(db, room, player.id);
          break;
        case "lobby":
          backToLobby(room, player.id);
          break;
        case "move": {
          const move = applyMove(db, room, player.id, body);
          return { ...move, room: roomView(db, room, player.id) };
        }
        default:
          throw new HttpError(400, "Unknown action");
      }
      return roomView(db, room, player.id);
    });
    return json(result);
  });
}
