import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { ProfileForm } from "@/components/profile/ProfileForm";
import { getOwnProfile, isProfileComplete } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

import styles from "../../app.module.css";

export const metadata: Metadata = { title: "Edit profile · MEDHVARA" };

// Per-user form defaults; never serve them from cache.
export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  // src/proxy.ts and the (app) layout already send signed-out requests to
  // /login. Checked again here so this page never reaches the profile query
  // or renders the form without a verified session. redirect() throws by
  // design, so it is deliberately outside any try/catch.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Throws on a read failure; src/app/(app)/error.tsx shows a retry rather
  // than an empty form whose save would overwrite real data.
  const profile = await getOwnProfile();

  // A bare row (created automatically for new accounts) has no name yet, so
  // it is still "create" from the student's point of view.
  const isNew = !isProfileComplete(profile);

  return (
    <>
      <h1 className={styles.title}>{isNew ? "Create your profile" : "Edit your profile"}</h1>
      <p className={styles.lede}>
        Your name, college, branch, year, skills, interests, bio, and photo appear
        on your shareable profile, which any signed-in student can view. Only you
        can change them. Everything except your name is optional.
      </p>

      <ProfileForm profile={profile} />

      <Link href="/profile" className={styles.back}>
        ← Cancel
      </Link>
    </>
  );
}
