import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/config/env";

/**
 * Refreshes the Supabase auth session on every matched request and writes any
 * rotated tokens back to the response.
 *
 * This exists because Server Components cannot set cookies. Without it, an
 * expired access token would be refreshed during render and the new token
 * silently discarded, producing the classic symptoms: random logouts, sessions
 * that die early, and a storm of refresh-token requests.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // No-store headers supplied by @supabase/ssr. Responses carrying a
        // Set-Cookie for auth must never be cached by a CDN or reverse proxy,
        // or one user's session token can be served to another user.
        for (const [key, headerValue] of Object.entries(headers)) {
          response.headers.set(key, headerValue);
        }
      },
    },
  });

  // Must be awaited before the response is returned. A refresh that completes
  // after the response is committed cannot write its cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === "/login" || pathname === "/signup";
  const isPublicRoute =
    isAuthRoute ||
    pathname.startsWith("/auth") ||
    // Health check must answer without a session, or it can only ever report
    // on signed-in requests — useless for monitoring.
    pathname.startsWith("/api/health");

  // Redirect here purely so unauthenticated users do not see a protected page
  // flash before the layout's own check runs. The real gate is the getUser()
  // call in src/app/(app)/layout.tsx — never rely on this alone for access
  // control, since proxy matchers are easy to get subtly wrong.
  if (!user && !isPublicRoute) {
    // API routes get a JSON 401. Redirecting them to the HTML login page would
    // hand a fetch() caller a 200 full of markup, which reads as success.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "You need to be signed in." },
        { status: 401 },
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
