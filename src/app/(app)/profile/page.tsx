import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { BadgeGrid } from "@/components/badges/BadgeGrid";
import { CopyProfileLink } from "@/components/profile/CopyProfileLink";
import { getEngineeringProfile } from "@/lib/supabase/engineering-profile";
import { isProfileComplete } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

import styles from "../app.module.css";
import p from "./profile.module.css";
import { Avatar, EarnedBadgeRow, StatsRow, Tags } from "./showcase";

export const metadata: Metadata = { title: "Profile · MEDHVARA" };

// Stats, badges, and projects change after every quiz and save.
export const dynamic = "force-dynamic";

/**
 * GitHub-style engineering profile for the signed-in user. The signed-in gate
 * lives in src/app/(app)/layout.tsx; editing stays at /profile/edit.
 */
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { profile, stats, projects, badges } = await getEngineeringProfile(user.id);

  const data = profile.ok ? profile.data : null;
  const complete = isProfileComplete(data);
  const meta = [data?.college, data?.branch, data?.year ? `Year ${data.year}` : null]
    .filter(Boolean)
    .join(" · ");
  const lockedCount = badges.ok ? badges.all.length - badges.earned.length : 0;

  return (
    <>
      {/* 1. Header */}
      <header className={p.header}>
        <Avatar photoUrl={profile.ok ? profile.photoUrl : null} name={data?.name ?? null} />

        <div className={p.identity}>
          <h1 className={styles.title}>{complete ? data!.name : "Your profile"}</h1>
          {meta ? <p className={p.meta}>{meta}</p> : null}
          {data?.bio ? <p className={p.bio}>{data.bio}</p> : null}

          {!profile.ok ? (
            <p className={p.empty}>Your profile details could not be loaded right now.</p>
          ) : !complete ? (
            <p className={p.nudge}>
              Add your name, college, and skills so your profile tells your story.
            </p>
          ) : null}

          <div className={p.headerActions}>
            <Link href="/profile/edit" className={p.editButton}>
              {complete ? "Edit profile" : "Fill in your profile"}
            </Link>
            {complete ? (
              <>
                <CopyProfileLink userId={user.id} />
                <Link href={`/profile/${user.id}`} className={p.inlineLink}>
                  See what others see
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* 2. Skills (and interests, which the form already collects) */}
      <section className={p.section}>
        <h2 className={p.sectionTitle}>Skills</h2>
        {data && data.skills.length > 0 ? (
          <Tags values={data.skills} />
        ) : (
          <p className={p.empty}>
            No skills added yet —{" "}
            <Link href="/profile/edit" className={p.inlineLink}>
              add a few
            </Link>{" "}
            like C, Arduino, or PCB design.
          </p>
        )}
        {data && data.interests.length > 0 ? (
          <>
            <h3 className={p.subTitle}>Interests</h3>
            <Tags values={data.interests} />
          </>
        ) : null}
      </section>

      {/* 3. Stats */}
      <section className={p.section} aria-labelledby="stats-title">
        <h2 id="stats-title" className={p.sectionTitle}>
          Stats
        </h2>
        {!stats.ok ? (
          <p className={p.empty}>Your stats could not be loaded right now.</p>
        ) : (
          <StatsRow
            stats={[
              { label: "Topics completed", value: stats.topicsCompleted },
              { label: "Quizzes taken", value: stats.quizzesTaken },
              { label: "Projects created", value: stats.projectsCreated },
            ]}
          />
        )}
      </section>

      {/* 4. Badges */}
      <section id="badges" className={p.section}>
        <h2 className={p.sectionTitle}>
          Badges
          {badges.ok && badges.all.length > 0 ? (
            <span className={p.count}>
              {" "}
              {badges.earned.length} of {badges.all.length}
            </span>
          ) : null}
        </h2>

        {!badges.ok ? (
          <p className={p.empty}>Your badges could not be loaded right now.</p>
        ) : (
          <>
            {badges.earned.length === 0 ? (
              <p className={p.empty}>
                No badges yet —{" "}
                <Link href="/learn" className={p.inlineLink}>
                  complete a lesson
                </Link>{" "}
                to earn your first!
              </p>
            ) : (
              <EarnedBadgeRow badges={badges.earned} />
            )}

            {lockedCount > 0 ? (
              <details className={p.locked}>
                <summary>
                  {badges.earned.length === 0
                    ? `See all ${badges.all.length} badges and how to earn them`
                    : `See ${lockedCount} more to earn`}
                </summary>
                <BadgeGrid badges={badges.all.filter((badge) => badge.earned_at === null)} />
              </details>
            ) : null}
          </>
        )}
      </section>

      {/* 5. Projects */}
      <section className={p.section}>
        <h2 className={p.sectionTitle}>
          Projects
          {projects.ok && projects.list.length > 0 ? (
            <span className={p.count}> {projects.list.length}</span>
          ) : null}
        </h2>

        {!projects.ok ? (
          <p className={p.empty}>Your projects could not be loaded right now.</p>
        ) : projects.list.length === 0 ? (
          <p className={p.empty}>
            No projects yet —{" "}
            <Link href="/projects/new" className={p.inlineLink}>
              plan your first one
            </Link>
            .
          </p>
        ) : (
          <ul className={p.projects}>
            {projects.list.map((project) => (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`} className={p.project}>
                  <span className={p.projectTitle}>{project.title}</span>
                  <span className={p.pills}>
                    <span className={p.status}>{project.status || "Not set"}</span>
                    {project.difficulty ? (
                      <span className={p.difficulty}>{project.difficulty}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
