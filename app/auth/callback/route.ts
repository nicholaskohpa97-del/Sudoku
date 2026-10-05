import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/sudoku/invite";
import { supabaseServer } from "@/lib/supabase/server";

/** Google → Supabase → here: swap the one-time code for a session cookie, then return to the page the player came from. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  const supabase = await supabaseServer();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    console.error("[auth] code exchange failed:", error.message);
  }
  const back = new URL(next, origin);
  back.searchParams.set("signin", "failed");
  return NextResponse.redirect(back);
}
