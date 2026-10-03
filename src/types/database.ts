/**
 * Types mirroring the LIVE public.profiles table, verified against the
 * PostgREST schema on 2026-08-16:
 *
 *   id uuid, user_id uuid, name text, college text, branch text,
 *   year text, interests text[], skills text[], bio text,
 *   photo_url text, created_at timestamptz
 *
 * Note `year` is text in the database, not a number, and there is no
 * `username` or `updated_at` column.
 *
 * Once the schema settles, replace this file with generated types:
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export const PROFILE_PHOTO_BUCKET = "profile-photos";

/**
 * `interests` and `skills` are nullable text[] in the database (a bare row
 * from ensureProfileRow has both NULL). They are typed as arrays because every
 * loader runs rows through normaliseProfile() / its own `?? []` first.
 */
export type Profile = {
  id: string;
  /** FK to auth.users.id — the column the app filters and writes on. */
  user_id: string;
  name: string | null;
  college: string | null;
  branch: string | null;
  year: string | null;
  interests: string[];
  skills: string[];
  bio: string | null;
  /** Storage object path inside the private bucket, not a browsable URL. */
  photo_url: string | null;
  created_at: string;
};
