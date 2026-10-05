import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL, supabaseAuthConfigured } from "./env";

/** Supabase client bound to the request's auth cookies (route handlers only). */
export async function supabaseServer() {
  if (!supabaseAuthConfigured) return null;
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a context that can't set cookies; proxy.ts refreshes them instead.
        }
      },
    },
  });
}
