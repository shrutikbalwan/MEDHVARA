import { listBadgeShowcase, type BadgeStatus } from "@/lib/badges";
import { logStage, logStageError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import type { ProjectCard } from "@/types/project";
import type { Topic } from "@/types/topic";

/**
 * Each section carries its own error, so one failed query shows a message in
 * its own card instead of taking the whole dashboard down.
 */
export type DashboardData = {
  name: string | null;
  learning:
    | {
        ok: true;
        completed: number;
        total: number;
        /** Lowest order_index not yet completed; null when all are done or none exist. */
        next: Topic | null;
      }
    | { ok: false };
  projects: { ok: true; recent: ProjectCard[] } | { ok: false };
  /** Earned badges only, oldest first, plus the catalogue size for "X of Y". */
  badges: { ok: true; earned: BadgeStatus[]; total: number } | { ok: false };
};

const RECENT_PROJECTS = 3;

/**
 * Everything /dashboard shows for the signed-in user, fetched in parallel.
 *
 * A brand-new user legitimately has no profile name, no progress rows, and no
 * projects; each of those comes back as an empty value, never an error.
 */
export async function getDashboardData(): Promise<DashboardData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileResult, topicsResult, progressResult, projectsResult, showcase] = await Promise.all([
    // limit(1) rather than maybeSingle(): user_id is not guaranteed unique.
    supabase.from("profiles").select("name").eq("user_id", user.id).limit(1),
    supabase
      .from("topics")
      .select("id, subject, title, description, order_index")
      .order("order_index", { ascending: true, nullsFirst: false })
      .order("subject", { ascending: true })
      .order("title", { ascending: true })
      .returns<Topic[]>(),
    supabase
      .from("topic_progress")
      .select("topic_id")
      .eq("user_id", user.id)
      .eq("completed", true)
      .returns<{ topic_id: string }[]>(),
    supabase
      .from("projects")
      .select("id, title, status, difficulty, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(RECENT_PROJECTS)
      .returns<ProjectCard[]>(),
    listBadgeShowcase(user.id, supabase),
  ]);

  // Name: a read failure just means a nameless greeting.
  if (profileResult.error) {
    logStageError("dashboard", "profile.read", profileResult.error, { userId: user.id });
  }
  const rawName = (profileResult.data?.[0] as { name?: string | null } | undefined)?.name;
  const name = rawName?.trim() || null;

  // Learning progress needs both topics and progress.
  let learning: DashboardData["learning"];
  if (topicsResult.error || progressResult.error) {
    if (topicsResult.error) {
      logStageError("dashboard", "topics.read", topicsResult.error, { userId: user.id });
    }
    if (progressResult.error) {
      logStageError("dashboard", "progress.read", progressResult.error, { userId: user.id });
    }
    learning = { ok: false };
  } else {
    const topics = topicsResult.data ?? [];
    const done = new Set((progressResult.data ?? []).map((row) => row.topic_id));
    // Count only progress on topics that still exist, so "X of Y" can never
    // read more than Y after a topic is deleted.
    const completed = topics.filter((topic) => done.has(topic.id)).length;
    learning = {
      ok: true,
      completed,
      total: topics.length,
      // Topics are already sorted by order_index, so the first unfinished one
      // is the next to take.
      next: topics.find((topic) => !done.has(topic.id)) ?? null,
    };
  }

  let projects: DashboardData["projects"];
  if (projectsResult.error) {
    logStageError("dashboard", "projects.read", projectsResult.error, { userId: user.id });
    projects = { ok: false };
  } else {
    projects = { ok: true, recent: projectsResult.data ?? [] };
  }

  // listBadgeShowcase logs its own failure.
  const badges: DashboardData["badges"] = showcase.ok
    ? {
        ok: true,
        earned: showcase.badges
          .filter((badge) => badge.earned_at !== null)
          .sort((a, b) => (a.earned_at ?? "").localeCompare(b.earned_at ?? "")),
        total: showcase.badges.length,
      }
    : { ok: false };

  logStage("dashboard", "load", {
    userId: user.id,
    hasName: Boolean(name),
    learning: learning.ok ? `${learning.completed}/${learning.total}` : "error",
    projects: projects.ok ? projects.recent.length : "error",
    badges: badges.ok ? badges.earned.length : "error",
  });

  return { name, learning, projects, badges };
}
