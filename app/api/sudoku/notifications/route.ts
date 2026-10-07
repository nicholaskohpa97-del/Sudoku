import type { NextRequest } from "next/server";
import { handle, json, readBody, requirePlayer } from "@/lib/server/http";
import { listNotifications, markRead } from "@/lib/server/scores";
import { mutate, read } from "@/lib/server/store";

/** Your inbox: dethroned alerts and beaten scores, newest first. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const player = await requirePlayer(request);
    return json(await read((db) => listNotifications(db, player.id)));
  });
}

/** Mark messages as read: { ids: [...] } or { all: true }. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const player = await requirePlayer(request);
    const body = await readBody(request);
    const ids = body.all === true ? "all" : Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
    return json(
      await mutate((db) => {
        markRead(db, player.id, ids);
        return listNotifications(db, player.id);
      }),
    );
  });
}
