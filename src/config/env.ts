/**
 * Public environment variables — safe to import from Client Components.
 *
 * Only `NEXT_PUBLIC_*` values belong in this file. Next.js inlines these into
 * the browser bundle at build time, so anything added here is public by
 * definition. Server-only secrets live in `env.server.ts`.
 *
 * `process.env.NEXT_PUBLIC_*` must be written as a full literal expression for
 * the build-time replacement to work — destructuring `process.env` or building
 * the key dynamically yields `undefined` in the browser.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
  ),
  supabaseAnonKey: required(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ),
} as const;
