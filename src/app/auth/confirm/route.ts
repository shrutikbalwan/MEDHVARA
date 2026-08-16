import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for the confirmation link Supabase emails after sign up.
 *
 * Supabase sends one of two shapes depending on the project's email template
 * and auth flow, so both are handled:
 *   - `?token_hash=...&type=signup`  → verifyOtp
 *   - `?code=...`                    → exchangeCodeForSession (PKCE)
 *
 * Either way the session cookies are written by the server client here, in a
 * Route Handler, which is one of the few places Next.js permits cookie writes.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  // Only same-origin relative paths, so `next` cannot be used as an open redirect.
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const destination = nextParam.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : "/dashboard";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(destination, origin));
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, origin),
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, origin));
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, origin),
    );
  }

  return NextResponse.redirect(
    new URL("/login?error=Invalid+or+expired+confirmation+link", origin),
  );
}
