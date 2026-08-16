/**
 * Server-only environment variables.
 *
 * NEVER import this file from a Client Component or any module reachable from
 * one. These values have no `NEXT_PUBLIC_` prefix, so Next.js will not inline
 * them into the browser bundle — importing this module client-side yields
 * `undefined` and trips the guard below rather than leaking the secret, but the
 * import itself is still a mistake worth catching in review.
 */

if (typeof window !== "undefined") {
  throw new Error(
    "env.server.ts was imported in a browser context. Server-only secrets must " +
      "never reach the client bundle.",
  );
}

/**
 * The service role key bypasses Row Level Security entirely. Read it only
 * inside route handlers, server actions, or scripts — and only when the
 * anon-key client genuinely cannot do the job.
 */
/**
 * Groq API key. Server-side only — it has no `NEXT_PUBLIC_` prefix, so Next.js
 * will not inline it into the browser bundle, and nothing in `src/components`
 * may import this module.
 */
export function getGroqApiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error(
      "Missing GROQ_API_KEY. Set it in .env.local (never with a NEXT_PUBLIC_ prefix).",
    );
  }
  return key;
}

export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Set it in .env.local (never with a NEXT_PUBLIC_ prefix).",
    );
  }
  return key;
}
