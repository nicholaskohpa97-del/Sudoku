// Supabase settings for server-side storage. Read at runtime (not inlined
// into the browser bundle) because only API routes talk to Supabase.
// Accepts the names Supabase's Vercel integration sets as well as the
// legacy (anon / service_role) and newer (secret) key names.

export function supabaseUrl(env: Record<string, string | undefined> = process.env): string {
  return env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

/** Secret key that bypasses row-level security. Server only. */
export function supabaseSecretKey(env: Record<string, string | undefined> = process.env): string {
  return env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY ?? "";
}
