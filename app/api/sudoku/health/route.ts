import { createClient } from "@supabase/supabase-js";
import { json } from "@/lib/server/http";
import { read, selectBackend, STATE_TABLE } from "@/lib/server/store";
import { keyKind, projectRef } from "@/lib/server/supabase-diagnostics";
import { supabaseSecretKey, supabaseUrl } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/** Raw view of what Supabase says, for setup debugging. Contains no secrets. */
async function probeSupabase(url: string, key: string) {
  // 1. Is the Data API (REST) answering for this project at all?
  let rest: { status: number | null; body?: string };
  try {
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
    rest = { status: res.status, ...(res.ok ? {} : { body: (await res.text()).slice(0, 300) }) };
  } catch (err) {
    rest = { status: null, body: (err as Error).message };
  }
  // 2. The exact query the game makes, with Supabase's own error fields.
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.from(STATE_TABLE).select("id").limit(1);
  return {
    restApi: rest,
    tableQuery: error ? { code: error.code, message: error.message, hint: error.hint, details: error.details } : "ok",
  };
}

/**
 * Setup check: which storage is active and whether it works. Open
 * /api/sudoku/health in a browser. Never returns key values.
 */
export async function GET() {
  const backend = selectBackend();
  const url = supabaseUrl();
  const key = supabaseSecretKey();
  const config = { backend, supabaseProject: url ? projectRef(url) : null, keyKind: keyKind(key) };
  try {
    const players = await read((db) => Object.keys(db.players).length);
    return json({ ok: true, ...config, players });
  } catch (err) {
    const raw = backend === "supabase" ? await probeSupabase(url, key).catch((e) => ({ probeError: String(e) })) : undefined;
    return json({ ok: false, ...config, problem: (err as Error).message, supabase: raw }, 503);
  }
}
