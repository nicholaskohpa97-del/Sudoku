import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL, supabaseAuthConfigured } from "@/lib/supabase/env";

/**
 * Keeps the Supabase session fresh: if the access token has expired, the
 * refresh token is exchanged and the new cookies are written to both the
 * request (for this render/handler) and the response (for the browser).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!supabaseAuthConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  // Validates the JWT and refreshes it when needed. Do not remove.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Pages and API routes only; skip static assets, icons and the manifest.
  matcher: ["/((?!_next/static|_next/image|icons/|icon.svg|apple-icon.png|manifest.webmanifest|favicon.ico).*)"],
};
