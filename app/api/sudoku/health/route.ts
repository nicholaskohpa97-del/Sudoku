import { json } from "@/lib/server/http";
import { probeConnection, read, selectBackend } from "@/lib/server/store";
import { keyKind, projectRef } from "@/lib/server/supabase-diagnostics";
import { supabaseConnections } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * Setup check: which storage is active and whether it works. Open
 * /api/sudoku/health in a browser. Lists every Supabase connection found in
 * the environment by variable NAME and project ID; never returns key values.
 */
export async function GET() {
  const backend = selectBackend();
  const connections = await Promise.all(
    supabaseConnections().map(async (c) => {
      const error = await probeConnection(c);
      return {
        project: projectRef(c.url),
        urlVar: c.urlVar,
        keyVar: c.keyVar,
        keyKind: keyKind(c.key),
        table: error ? { ok: false, code: error.code ?? null, message: error.message } : { ok: true },
      };
    }),
  );
  const inUse = connections.find((c) => c.table.ok)?.project ?? null;
  const base = { backend, inUse, connections };
  try {
    const players = await read((db) => Object.keys(db.players).length);
    return json({ ok: true, ...base, players });
  } catch (err) {
    const hint =
      backend === "supabase" && !inUse
        ? "None of these projects has the sudoku_state table. If your project isn't listed, its connection isn't in this deployment yet: check Vercel → Storage (Production ticked) and redeploy."
        : undefined;
    return json({ ok: false, ...base, problem: (err as Error).message, hint }, 503);
  }
}
