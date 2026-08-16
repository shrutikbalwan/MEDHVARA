import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/usage";
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
    logSupabaseError("profile read failed", error);
    throw new Error(`Could not load profile: ${error.message}`);
  }
  return data;
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
