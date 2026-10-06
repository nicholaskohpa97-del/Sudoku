// Supabase settings for server-side storage, read at runtime.
//
// A Vercel project can carry several Supabase connections: the plain names
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) belong to whichever store was
// connected first, and later connections get a custom prefix (for example
// MYDB_SUPABASE_URL). So instead of trusting one fixed name, we collect every
// URL + secret-key pair and let the store pick the project that actually has
// the game table.

export interface SupabaseConnection {
  /** Env var names it came from (never the values). */
  urlVar: string;
  keyVar: string;
  url: string;
  key: string;
}

type Env = Record<string, string | undefined>;

/** Names a secret-key variable may have; the part before is the connection's "head". */
const KEY_SUFFIXES = ["SERVICE_ROLE_KEY", "SECRET_KEY"];

function looksLikeSupabaseUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/** Candidate URL variable names for a key variable with this head (e.g. "MYDB_SUPABASE_"). */
function urlVarsFor(head: string): string[] {
  const base = head.replace(/SUPABASE_$/, ""); // "MYDB_"
  return [`${head}URL`, `${base}SUPABASE_URL`, `${base}NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_${head}URL`];
}

/**
 * Every Supabase connection found in `env`, best first: an explicit
 * SUDOKU_SUPABASE_* override, then the others in a stable order.
 */
export function supabaseConnections(env: Env = process.env): SupabaseConnection[] {
  const found: SupabaseConnection[] = [];
  for (const keyVar of Object.keys(env).sort()) {
    const suffix = KEY_SUFFIXES.find((s) => keyVar.endsWith(s));
    const key = env[keyVar];
    if (!suffix || !key) continue;
    const head = keyVar.slice(0, -suffix.length);
    if (head && !head.endsWith("_")) continue;
    const urlVar = urlVarsFor(head).find((name) => looksLikeSupabaseUrl(env[name]));
    if (!urlVar) continue;
    const url = env[urlVar]!.replace(/\/+$/, "");
    // Only Supabase-looking pairs: the name or the host says so.
    if (!/SUPABASE/.test(keyVar + urlVar) && !/supabase\.(co|in|net)$/.test(new URL(url).hostname)) continue;
    found.push({ urlVar, keyVar, url, key });
  }
  // One entry per (project, key); explicit override first.
  const seen = new Set<string>();
  return found
    .sort((a, b) => Number(b.keyVar.startsWith("SUDOKU_")) - Number(a.keyVar.startsWith("SUDOKU_")))
    .filter((c) => {
      const id = `${c.url}|${c.key}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}
