import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";

import { env } from "@/config/env";

/**
 * Supabase client for Server Components, Route Handlers, and Server Actions.
 *
 * Still the anon key — Row Level Security stays in force. What the server
 * client adds is the user's session, read from the request cookies, so RLS
 * policies evaluate against the signed-in user rather than an anonymous one.
 *
 * Create a new client per request. Never hoist this to a module-level constant:
 * a shared instance would leak one user's session into another's request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies — only Server Actions and
          // Route Handlers can. This throw is expected during RSC render and
          // safe to swallow *because* src/proxy.ts refreshes the session on
          // every request and writes the cookies there. Remove the proxy and
          // this catch starts silently dropping refreshed tokens.
        }
      },
    },
  });
}
