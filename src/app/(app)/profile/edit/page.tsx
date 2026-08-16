import Link from "next/link";
import type { Metadata } from "next";

import { ProfileForm } from "@/components/profile/ProfileForm";
import { getOwnProfile } from "@/lib/supabase/profile";

import styles from "../../app.module.css";

export const metadata: Metadata = { title: "Edit profile · MEDHVARA" };

export default async function EditProfilePage() {
  const profile = await getOwnProfile();

  return (
    <>
      <h1 className={styles.title}>
        {profile ? "Edit your profile" : "Create your profile"}
      </h1>
      <p className={styles.lede}>
        Only you can see or change this. Everything except your name is optional.
      </p>

      <ProfileForm profile={profile} />

      <Link href={profile ? "/profile" : "/dashboard"} className={styles.back}>
        ← Cancel
      </Link>
    </>
  );
}
