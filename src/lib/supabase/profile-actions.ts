"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/usage";
import { PROFILE_PHOTO_BUCKET, type Profile } from "@/types/database";

export type ProfileState = { error?: string };

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // must stay <= the bucket's file_size_limit

/** Extension is derived from the MIME type, never from the uploaded filename. */
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** "react, ml , web3" → ["react", "ml", "web3"] */
function parseList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function optionalText(value: FormDataEntryValue | null, max: number) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

export async function saveProfile(
  _prevState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createClient();

  // Server Actions accept direct POSTs, so identity is established here rather
  // than trusting anything the form sent. RLS is the second line of defence.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };
  if (name.length > 120) return { error: "Name is too long." };

  // `year` is a text column in this schema, so it is stored as typed rather
  // than parsed into a number.
  const year = optionalText(formData.get("year"), 40);

  // --- photo upload -------------------------------------------------------
  const photo = formData.get("photo");
  const hasNewPhoto = photo instanceof File && photo.size > 0;
  let newPhotoPath: string | null = null;

  if (hasNewPhoto) {
    if (photo.size > MAX_PHOTO_BYTES) {
      return { error: "Photo must be 5 MB or smaller." };
    }
    const extension = MIME_EXTENSIONS[photo.type];
    if (!extension) {
      return { error: "Photo must be a JPEG, PNG, WebP, or GIF image." };
    }

    // First path segment must be the user id — the storage policies key
    // ownership off it, so this is what stops one user writing into another's
    // folder.
    newPhotoPath = `${user.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(PROFILE_PHOTO_BUCKET)
      .upload(newPhotoPath, photo, { contentType: photo.type, upsert: false });

    if (uploadError) {
      return { error: `Photo upload failed: ${uploadError.message}` };
    }
  }

  // Read the existing row so an unchanged photo is preserved, a replaced one
  // can be cleaned up, and we know whether to insert or update. Insert/update
  // rather than upsert because this table's unique constraint on user_id is not
  // guaranteed, and upsert needs one to resolve the conflict target.
  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("id, photo_url")
    .eq("user_id", user.id)
    .maybeSingle<Pick<Profile, "id" | "photo_url">>();

  if (readError) {
    logSupabaseError("profile read failed", readError);
    if (newPhotoPath) {
      await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([newPhotoPath]);
    }
    return { error: "Could not load your profile. Please try again." };
  }

  const fields = {
    name,
    college: optionalText(formData.get("college"), 160),
    branch: optionalText(formData.get("branch"), 120),
    year,
    interests: parseList(formData.get("interests")),
    skills: parseList(formData.get("skills")),
    bio: optionalText(formData.get("bio"), 2000),
    photo_url: newPhotoPath ?? existing?.photo_url ?? null,
  };

  const { error: writeError } = existing
    ? await supabase.from("profiles").update(fields).eq("user_id", user.id)
    : await supabase.from("profiles").insert({ user_id: user.id, ...fields });

  if (writeError) {
    logSupabaseError("profile write failed", writeError);
    // Do not leave the just-uploaded file orphaned if the row write failed.
    if (newPhotoPath) {
      await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([newPhotoPath]);
    }
    return { error: "Could not save your profile. Please try again." };
  }

  // Only now is the old file safe to drop. Failure here is not worth failing
  // the save over — it leaves a stray object, not a broken profile.
  if (newPhotoPath && existing?.photo_url && existing.photo_url !== newPhotoPath) {
    await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([existing.photo_url]);
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  redirect("/profile");
}
