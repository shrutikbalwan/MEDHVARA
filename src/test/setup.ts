/**
 * Loaded before every test file (see the "test" script in package.json).
 *
 * src/config/env.ts throws at import time without these, and many modules
 * import the Supabase client indirectly. Tests never reach a real backend:
 * database calls go through the fake client in fake-supabase.ts, and Groq
 * calls through a stubbed fetch.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.GROQ_API_KEY ??= "test-groq-key";
