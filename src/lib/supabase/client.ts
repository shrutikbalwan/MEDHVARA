import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/config/env";

/**
 * Supabase client for Client Components ("use client").
 *
 * Uses the anon key only — every query is subject to Row Level Security, which
 * is what makes it safe to ship to the browser. Cookie handling is automatic;
 * do not pass a custom `cookies` option unless you have a specific reason.
 *
 * `createBrowserClient` is a singleton by default, so calling this on every
 * render is cheap and returns the same instance.
 */
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
