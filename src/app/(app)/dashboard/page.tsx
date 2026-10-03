import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getDashboardData } from "@/lib/supabase/dashboard";

import styles from "../app.module.css";
import dash from "./dashboard.module.css";

export const metadata: Metadata = { title: "Dashboard · MEDHVARA" };

// Per-user data that changes after every quiz and project save.
export const dynamic = "force-dynamic";

/**
 * The signed-in gate lives in src/app/(app)/layout.tsx, with src/proxy.ts
 * redirecting earlier still. The redirect below only covers the gap between
 * the layout's check and this read, e.g. a session that expired in between.
 */
export default async function DashboardPage() {
  const data = await getDashboardData();
  if (!data) redirect("/login");

  const { name, learning, projects, badges } = data;

  return (
    <>
      <h1 className={styles.title}>
        {name ? `Welcome back, ${name} 👋` : "Welcome back 👋"}
      </h1>
      {name ? (
        <p className={styles.lede}>Pick up where you left off.</p>
      ) : (
        <p className={styles.lede}>
          <Link href="/profile/edit" className={dash.inlineLink}>
            Add your name to your profile
          </Link>{" "}
          so MEDHVARA knows what to call you.
        </p>
      )}

      <div className={dash.actions}>
        <Link href="/chat" className={dash.primary}>
          Ask MEDHVARA
        </Link>
        <Link href="/projects/new" className={dash.secondary}>
          Plan a project
        </Link>
      </div>

      <section className={dash.section}>
        <div className={dash.sectionHeader}>
          <h2 className={dash.sectionTitle}>Learning progress</h2>
          <Link href="/learn" className={dash.viewAll}>
            All topics →
          </Link>
        </div>

        {!learning.ok ? (
          <p className={dash.empty}>
            Your learning progress could not be loaded right now. Please refresh.
          </p>
        ) : learning.total === 0 ? (
          <p className={dash.empty}>No topics have been added yet. Check back soon!</p>
        ) : (
          <>
            <p className={dash.stat}>
              <strong>{learning.completed}</strong> of {learning.total} topics completed
            </p>
            <div
              className={dash.bar}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={learning.total}
              aria-valuenow={learning.completed}
              aria-label="Topics completed"
            >
              <div
                className={dash.barFill}
                style={{ width: `${(learning.completed / learning.total) * 100}%` }}
              />
            </div>

            {learning.completed === 0 ? (
              <p className={dash.empty}>
                You haven&apos;t started learning yet — pick a topic!
              </p>
            ) : null}

            {learning.next ? (
              <Link href={`/learn/${learning.next.id}`} className={dash.card}>
                <span className={dash.cardLabel}>
                  {learning.completed === 0 ? "Start here" : "Continue learning"}
                </span>
                <span className={dash.cardTitle}>{learning.next.title}</span>
                <span className={dash.cardMeta}>{learning.next.subject}</span>
              </Link>
            ) : (
              <p className={dash.empty}>
                You&apos;ve completed every topic 🎉 Retake any quiz from the topics page.
              </p>
            )}
          </>
        )}
      </section>

      <section className={dash.section}>
        <div className={dash.sectionHeader}>
          <h2 className={dash.sectionTitle}>
            Badges
            {badges.ok && badges.total > 0 ? (
              <span className={dash.sectionCount}>
                {" "}
                {badges.earned.length} of {badges.total}
              </span>
            ) : null}
          </h2>
          <Link href="/profile#badges" className={dash.viewAll}>
            All badges →
          </Link>
        </div>

        {!badges.ok ? (
          <p className={dash.empty}>Your badges could not be loaded right now. Please refresh.</p>
        ) : badges.earned.length === 0 ? (
          <p className={dash.empty}>
            No badges yet — finish a quiz or plan a project to earn your first!
          </p>
        ) : (
          <ul className={dash.badgeRow}>
            {badges.earned.map((badge) => (
              <li key={badge.id} className={dash.badge} title={badge.description}>
                <span className={dash.badgeIcon} aria-hidden="true">
                  {badge.icon || "🏅"}
                </span>
                <span className={dash.badgeName}>{badge.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={dash.section}>
        <div className={dash.sectionHeader}>
          <h2 className={dash.sectionTitle}>Recent projects</h2>
          <Link href="/projects" className={dash.viewAll}>
            All projects →
          </Link>
        </div>

        {!projects.ok ? (
          <p className={dash.empty}>
            Your projects could not be loaded right now. Please refresh.
          </p>
        ) : projects.recent.length === 0 ? (
          <p className={dash.empty}>
            You haven&apos;t planned a project yet —{" "}
            <Link href="/projects/new" className={dash.inlineLink}>
              describe an idea
            </Link>{" "}
            and MEDHVARA will draft a plan.
          </p>
        ) : (
          <ul className={dash.list}>
            {projects.recent.map((project) => (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`} className={dash.row}>
                  <span className={dash.rowTitle}>{project.title}</span>
                  <span className={dash.status}>{project.status || "Not set"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
