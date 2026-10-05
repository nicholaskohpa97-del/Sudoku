"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL, supabaseAuthConfigured } from "./env";

let client: SupabaseClient | null = null;

/** Browser Supabase client (session kept in cookies), or null when not configured. */
export function supabaseBrowser(): SupabaseClient | null {
  if (!supabaseAuthConfigured) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
  return client;
}
