import { getCurrentStreak } from "@/lib/activity";
import { logStage, logStageError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type UserStats = {
  topics_completed: number;
  quizzes_taken: number;
  projects_created: number;
  projects_completed: number;
  badges_earned: number;
  /** Consecutive active days ending today (or yesterday, if today is not logged yet). */
  current_streak: number;
  // Placeholders until community features exist.
  community_questions: number;
  community_answers: number;
  projects_shared: number;
  /**
   * Sources that could not be read, e.g. ["badges"]. Their numbers above are
   * 0. Empty for a normal load — including a brand-new user, whose zeros are
   * real.
   */
  unavailable: ("progress" | "projects" | "badges" | "streak")[];
};

/**
 * One consolidated stats object for the user. All reads run in parallel and
 * each is filtered to this user — required, since some of these tables are
 * readable by every signed-in user for public profiles.
 *
 * Never throws: a brand-new user gets all zeros, and a failed read zeroes
 * only its own numbers and is listed in `unavailable` (and logged).
 */
export async function getUserStats(userId: string, client?: ServerClient): Promise<UserStats> {
  const supabase = client ?? (await createClient());

  const [progressRes, projectsRes, badgesRes, streak] = await Promise.all([
    supabase
      .from("topic_progress")
      .select("completed, quiz_score")
      .eq("user_id", userId)
      .returns<{ completed: boolean | null; quiz_score: number | null }[]>(),
    supabase
      .from("projects")
      .select("status")
      .eq("owner_id", userId)
      .returns<{ status: string | null }[]>(),
    supabase
      .from("user_badges")
      .select("badge_id")
      .eq("user_id", userId)
      .returns<{ badge_id: string }[]>(),
    getCurrentStreak(userId, supabase),
  ]);

  const unavailable: UserStats["unavailable"] = [];
  if (progressRes.error) {
    logStageError("stats", "progress.read", progressRes.error, { userId });
    unavailable.push("progress");
  }
  if (projectsRes.error) {
    logStageError("stats", "projects.read", projectsRes.error, { userId });
    unavailable.push("projects");
  }
  if (badgesRes.error) {
    logStageError("stats", "badges.read", badgesRes.error, { userId });
    unavailable.push("badges");
  }
  if (!streak.ok) unavailable.push("streak"); // getCurrentStreak logs its own failure.

  const progress = progressRes.data ?? [];
  const projects = projectsRes.data ?? [];

  const stats: UserStats = {
    topics_completed: progress.filter((row) => row.completed).length,
    // A quiz counts as taken once it has a recorded score.
    quizzes_taken: progress.filter((row) => row.quiz_score != null).length,
    projects_created: projects.length,
    projects_completed: projects.filter((p) => p.status === "Completed").length,
    badges_earned: (badgesRes.data ?? []).length,
    current_streak: streak.ok ? streak.streak : 0,
    community_questions: 0,
    community_answers: 0,
    projects_shared: 0,
    unavailable,
  };

  logStage("stats", "load", { userId, ...stats });
  return stats;
}
