import Link from "next/link";
import type { Metadata } from "next";

import { BadgeGrid } from "@/components/badges/BadgeGrid";
import { listBadgeShowcase } from "@/lib/badges";
import { createClient } from "@/lib/supabase/server";
import {
  getOwnProfile,
  getPhotoSignedUrl,
  isProfileComplete,
} from "@/lib/supabase/profile";

import styles from "../app.module.css";
import profileStyles from "./profile.module.css";

export const metadata: Metadata = { title: "Profile · MEDHVARA" };

function Tags({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className={profileStyles.detail}>
      <h2 className={profileStyles.detailLabel}>{label}</h2>
      <ul className={profileStyles.tags}>
        {values.map((value) => (
          <li key={value} className={profileStyles.tag}>
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** All badges, earned ones highlighted. Shown whether or not the profile is filled in. */
async function BadgesSection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const showcase = await listBadgeShowcase(user.id, supabase);
  const earnedCount = showcase.ok
    ? showcase.badges.filter((badge) => badge.earned_at !== null).length
    : 0;

  return (
    <section id="badges" className={profileStyles.badges}>
      <h2 className={profileStyles.detailLabel}>
        Badges{showcase.ok ? ` · ${earnedCount} of ${showcase.badges.length}` : ""}
      </h2>
      {!showcase.ok ? (
        <p className={styles.placeholder}>Badges could not be loaded right now.</p>
      ) : showcase.badges.length === 0 ? (
        <p className={styles.placeholder}>No badges have been set up yet.</p>
      ) : (
        <BadgeGrid badges={showcase.badges} />
      )}
    </section>
  );
}

export default async function ProfilePage() {
  const profile = await getOwnProfile();

  // The signup trigger creates a row immediately, so an empty profile is the
  // normal state for a new account — not a missing one.
  if (!profile || !isProfileComplete(profile)) {
    return (
      <>
        <h1 className={styles.title}>Profile</h1>
        <p className={styles.placeholder}>
          Your profile is empty. Add your details so people know who you are.
        </p>
        <Link href="/profile/edit" className={styles.back}>
          Fill in your profile →
        </Link>
        <BadgesSection />
      </>
    );
  }

  const photoUrl = await getPhotoSignedUrl(profile.photo_url);
  const meta = [
    profile.college,
    profile.branch,
    profile.year ? `Year ${profile.year}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className={profileStyles.header}>
        {photoUrl ? (
          /*
           * A plain <img> rather than next/image on purpose. The source is a
           * signed URL on your Supabase host: it expires, and next/image would
           * additionally require that host in `images.remotePatterns`, coupling
           * build config to an env value. The Next docs recommend `unoptimized`
           * for images behind authentication anyway, which is what this is.
           */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            width={88}
            height={88}
            className={profileStyles.photo}
          />
        ) : (
          <div className={profileStyles.photoFallback} aria-hidden="true">
            {profile.name?.charAt(0).toUpperCase() ?? "?"}
          </div>
        )}

        <div>
          <h1 className={styles.title}>{profile.name}</h1>
          {meta ? <p className={profileStyles.meta}>{meta}</p> : null}
        </div>
      </div>

      {profile.bio ? <p className={profileStyles.bio}>{profile.bio}</p> : null}

      <Tags label="Interests" values={profile.interests} />
      <Tags label="Skills" values={profile.skills} />

      <Link href="/profile/edit" className={styles.back}>
        Edit profile →
      </Link>
      <BadgesSection />
    </>
  );
}
