import type { PostgrestError } from "@supabase/supabase-js";

import { logStage, logStageError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_PHOTO_BUCKET, type Profile } from "@/types/database";

/**
 * Loads the signed-in user's profile, or null if they have not created one.
 *
 * The `.eq("user_id", ...)` filter is redundant next to the select policy,
 * which already limits visible rows to the caller's own. It stays so the query
 * is explicit and remains correct if the policies are ever loosened.
 */
export async function getOwnProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Profile>();

  if (error) {
    logStageError("profile", "read", error, { userId: user.id });
    throw new Error(`Could not load profile: ${error.message}`);
  }
  return data;
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type EnsureProfileResult =
  | { ok: true; created: boolean }
  | { ok: false; error: PostgrestError };

/**
 * Makes sure the user has a profiles row, inserting a bare one if not.
 *
 * Nothing creates a profile at signup on the live schema — a row only appears
 * once the user saves the profile form. Tables that reference profiles
 * (daily_usage, messages) then reject a brand-new user's writes with 23503,
 * which is why chat worked for an account with a saved profile and failed for
 * every new one.
 *
 * The bare row has no name, so isProfileComplete() still reports it as
 * unfinished and saveProfile() takes its update path later.
 */
export async function ensureProfileRow(
  supabase: ServerClient,
  userId: string,
): Promise<EnsureProfileResult> {
  // limit(1) rather than maybeSingle(): user_id is not guaranteed unique, and a
  // duplicate must not turn into a PGRST116 failure here.
  const { data, error: readError } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (readError) {
    logStageError("profile", "ensure.read", readError, { userId });
    return { ok: false, error: readError };
  }
  if (data && data.length > 0) return { ok: true, created: false };

  // id is set to the auth uid as well, so a foreign key pointing at either
  // profiles.id or profiles.user_id is satisfied.
  let { error } = await supabase
    .from("profiles")
    .insert({ id: userId, user_id: userId });

  // 22P02 = id is not a uuid column; 428C9 = id is GENERATED ALWAYS. Either
  // way, let the column default fill it.
  if (error && (error.code === "22P02" || error.code === "428C9")) {
    ({ error } = await supabase.from("profiles").insert({ user_id: userId }));
  }

  // 23505 = a concurrent request created it first, which is the outcome we want.
  if (!error || error.code === "23505") {
    logStage("profile", "ensure.created", { userId, raced: Boolean(error) });
    return { ok: true, created: !error };
  }

  logStageError("profile", "ensure.insert", error, { userId });
  return { ok: false, error };
}

/** True once the user has actually entered something. */
export function isProfileComplete(profile: Profile | null): boolean {
  return Boolean(profile?.name?.trim());
}

/**
 * Mints a short-lived URL for a photo in the private bucket.
 *
 * The bucket is not public, so `getPublicUrl` would return a link that 404s.
 * Signed URLs expire, which is the point: a leaked link stops working.
 */
export async function getPhotoSignedUrl(
  path: string | null,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!path) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) return null;
  return data.signedUrl;
}
