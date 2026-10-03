import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CopyProfileLink } from "@/components/profile/CopyProfileLink";
import { getPublicProfile } from "@/lib/supabase/public-profile";
import { createClient } from "@/lib/supabase/server";

import styles from "../../app.module.css";
import p from "../profile.module.css";
import { Avatar, EarnedBadgeRow, StatsRow, Tags } from "../showcase";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ userId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { userId } = await params;
  const data = await getPublicProfile(userId);
  const name = data?.profile.name?.trim();
  return { title: name ? `${name} · MEDHVARA` : "Profile · MEDHVARA" };
}

/**
 * The shareable profile. Any signed-in student can open it (the (app) layout
 * still requires a session); it shows only showcase fields — never email,
 * which is not stored in profiles at all — and only Completed projects.
 *
 * Static /profile/edit takes precedence over this dynamic segment, so the
 * edit page is unaffected.
 */
export default async function PublicProfilePage({ params }: PageProps) {
  // params is a Promise in Next 16 and must be awaited.
  const { userId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const data = await getPublicProfile(userId);
  if (!data) notFound();

  const { profile, photoUrl, stats, projects, badges } = data;
  const isOwner = user?.id === profile.user_id;
  const name = profile.name?.trim() || "A MEDHVARA student";
  const meta = [profile.college, profile.branch, profile.year ? `Year ${profile.year}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {isOwner ? (
        <p className={p.ownerBanner}>
          This is how other students see your profile.{" "}
          <Link href="/profile" className={p.inlineLink}>
            Back to your profile
          </Link>
        </p>
      ) : null}

      <header className={p.header}>
        <Avatar photoUrl={photoUrl} name={profile.name} />
        <div className={p.identity}>
          <h1 className={styles.title}>{name}</h1>
          {meta ? <p className={p.meta}>{meta}</p> : null}
          {profile.bio ? <p className={p.bio}>{profile.bio}</p> : null}
          <div className={p.headerActions}>
            <CopyProfileLink userId={profile.user_id} />
          </div>
        </div>
      </header>

      <section className={p.section}>
        <h2 className={p.sectionTitle}>Skills</h2>
        {profile.skills.length > 0 ? (
          <Tags values={profile.skills} />
        ) : (
          <p className={p.empty}>No skills listed yet.</p>
        )}
        {profile.interests.length > 0 ? (
          <>
            <h3 className={p.subTitle}>Interests</h3>
            <Tags values={profile.interests} />
          </>
        ) : null}
      </section>

      <section className={p.section}>
        <h2 className={p.sectionTitle}>Stats</h2>
        {stats.ok ? (
          <StatsRow
            stats={[
              { label: "Topics completed", value: stats.topicsCompleted },
              { label: "Quizzes taken", value: stats.quizzesTaken },
              { label: "Projects completed", value: stats.projectsCompleted },
            ]}
          />
        ) : (
          <p className={p.empty}>
            {stats.missingFunction
              ? "Stats are not set up yet. Run supabase/migrations/0007_public_profiles.sql."
              : "Stats could not be loaded right now."}
          </p>
        )}
      </section>

      <section className={p.section}>
        <h2 className={p.sectionTitle}>
          Badges
          {badges.ok && badges.total > 0 ? (
            <span className={p.count}>
              {" "}
              {badges.earned.length} of {badges.total}
            </span>
          ) : null}
        </h2>
        {!badges.ok ? (
          <p className={p.empty}>Badges could not be loaded right now.</p>
        ) : badges.earned.length === 0 ? (
          <p className={p.empty}>No badges yet.</p>
        ) : (
          <EarnedBadgeRow badges={badges.earned} />
        )}
      </section>

      <section className={p.section}>
        <h2 className={p.sectionTitle}>
          Completed projects
          {projects.ok && projects.list.length > 0 ? (
            <span className={p.count}> {projects.list.length}</span>
          ) : null}
        </h2>
        {!projects.ok ? (
          <p className={p.empty}>Projects could not be loaded right now.</p>
        ) : projects.list.length === 0 ? (
          <p className={p.empty}>No completed projects yet.</p>
        ) : (
          <ul className={p.projects}>
            {projects.list.map((project) => {
              const pills = (
                <span className={p.pills}>
                  <span className={p.status}>Completed</span>
                  {project.difficulty ? (
                    <span className={p.difficulty}>{project.difficulty}</span>
                  ) : null}
                </span>
              );
              return (
                <li key={project.id}>
                  {/* Only the owner can open the full project page; for
                      everyone else it would 404, so it is not a link. */}
                  {isOwner ? (
                    <Link href={`/projects/${project.id}`} className={p.project}>
                      <span className={p.projectTitle}>{project.title}</span>
                      {pills}
                    </Link>
                  ) : (
                    <div className={`${p.project} ${p.projectStatic}`}>
                      <span className={p.projectTitle}>{project.title}</span>
                      {pills}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
