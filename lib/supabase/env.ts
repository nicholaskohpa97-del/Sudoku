// Supabase configuration. NEXT_PUBLIC_* values are inlined into the browser
// bundle at build time, so they must be referenced literally here.
// Both the legacy key names (anon / service_role) and the newer ones
// (publishable / secret) are accepted.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** True when sign-in can work (URL + public key present). */
export const supabaseAuthConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);

/** Server-only secret key that bypasses row-level security. Never import from client code. */
export function supabaseSecretKey(env: Record<string, string | undefined> = process.env): string {
  return env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY ?? "";
}
