// Turns Supabase / PostgREST failures into messages a person can act on,
// and inspects the configured key without revealing it.
import { HttpError } from "./errors";

export interface DbError {
  code?: string;
  message: string;
}

/** What kind of key is configured: the secret one is required for server writes. */
export function keyKind(key: string): "secret" | "public" | "missing" | "unknown" {
  if (!key) return "missing";
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "public";
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: string };
      if (payload.role === "service_role") return "secret";
      if (payload.role === "anon" || payload.role === "authenticated") return "public";
    } catch {
      // Not a JWT we can read.
    }
  }
  return "unknown";
}

/** Maps a failed query to an HttpError whose message names the fix. */
/** "vlspwmpdzdviqnmyclzs" from "https://vlspwmpdzdviqnmyclzs.supabase.co". */
export function projectRef(url: string): string | null {
  try {
    return new URL(url).host.split(".")[0] || null;
  } catch {
    return null;
  }
}

export function explainDbError(what: string, error: DbError, key: string, url = ""): HttpError {
  const msg = error.message ?? "";
  const kind = keyKind(key);
  const ref = projectRef(url);
  const inProject = ref ? ` in Supabase project "${ref}"` : "";
  let advice: string;
  if (error.code === "PGRST106" || error.code === "PGRST002" || /invalid schema|schema must be one of|data api/i.test(msg)) {
    advice = `Supabase's Data API can't see the public schema${inProject}. Go to Project Settings → Data API, turn the Data API on, make sure "public" is listed under Exposed schemas, and save.`;
  } else if (error.code === "PGRST205" || error.code === "42P01" || /schema cache|does not exist|relation/i.test(msg)) {
    advice = `The sudoku_state table is missing${inProject}. Open that project's SQL Editor, run supabase/schema.sql, then try again. If you already did, check you ran it in this project and that the Data API is on (Project Settings → Data API).`;
  } else if (kind === "public" || error.code === "42501" || /permission denied/i.test(msg)) {
    advice =
      "SUPABASE_SERVICE_ROLE_KEY holds the public (anon/publishable) key. In Vercel, replace it with the service_role / secret key from Supabase → Project Settings → API Keys, then redeploy.";
  } else if (/invalid api key|jwt|unauthorized|no api key/i.test(msg) || error.code === "PGRST301") {
    advice =
      "Supabase rejected the key. Check that SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL come from the same Supabase project, then redeploy.";
  } else if (/fetch failed|ENOTFOUND|ECONNREFUSED|network|timeout|503|paused/i.test(msg)) {
    advice = "Can't reach Supabase. Check SUPABASE_URL, and resume the project in the Supabase dashboard if it's paused.";
  } else {
    advice = `Supabase ${what} failed: ${msg || "unknown error"}${error.code ? ` (${error.code})` : ""}`;
  }
  return new HttpError(503, advice);
}
