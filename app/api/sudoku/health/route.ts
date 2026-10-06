import { json } from "@/lib/server/http";
import { read, selectBackend } from "@/lib/server/store";
import { keyKind } from "@/lib/server/supabase-diagnostics";
import { supabaseSecretKey, supabaseUrl } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * Setup check: which storage is active and whether it works. Open
 * /api/sudoku/health in a browser. Never returns key values.
 */
export async function GET() {
  const backend = selectBackend();
  let host: string | null = null;
  try {
    host = supabaseUrl() ? new URL(supabaseUrl()).host : null;
  } catch {
    host = "invalid SUPABASE_URL";
  }
  const config = { backend, supabaseHost: host, keyKind: keyKind(supabaseSecretKey()) };
  try {
    const players = await read((db) => Object.keys(db.players).length);
    return json({ ok: true, ...config, players });
  } catch (err) {
    return json({ ok: false, ...config, problem: (err as Error).message }, 503);
  }
}
