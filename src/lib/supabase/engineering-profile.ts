import { listBadgeShowcase, type BadgeStatus } from "@/lib/badges";
import { logStage, logStageError } from "@/lib/log";
import { getPhotoSignedUrl, normaliseProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";
import type { ProjectCard } from "@/types/project";

/**
 * Everything the profile page shows. Each section carries its own `ok`, so a
 * failed query turns into a message in that section rather than a broken page.
 */
export type EngineeringProfile = {
  /** null for a user who has never saved the profile form. */
  profile: { ok: true; data: Profile | null; photoUrl: string | null } | { ok: false };
  stats:
    | { ok: true; topicsCompleted: number; quizzesTaken: number; projectsCreated: number }
    | { ok: false };
  projects: { ok: true; list: ProjectCard[] } | { ok: false };
  badges: { ok: true; earned: BadgeStatus[]; all: BadgeStatus[] } | { ok: false };
};

/**
 * Loads one user's engineering profile.
 *
 * Takes a userId rather than reading the session so the same loader can back
 * a public profile page later. Today every table's RLS only lets a user read
 * their OWN rows, so passing someone else's id returns empty sections, not
 * their data.
 */
export async function getEngineeringProfile(userId: string): Promise<EngineeringProfile> {
  const supabase = await createClient();

  const [profileRes, progressRes, projectsRes, showcase] = await Promise.all([
    // limit(1) rather than maybeSingle(): user_id is not guaranteed unique,
    // and a duplicate must not take the page down.
    supabase.from("profiles").select("*").eq("user_id", userId).limit(1).returns<Profile[]>(),
    supabase
      .from("topic_progress")
      .select("completed, quiz_score")
      .eq("user_id", userId)
      .returns<{ completed: boolean | null; quiz_score: number | null }[]>(),
    supabase
      .from("projects")
      .select("id, title, status, difficulty, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .returns<ProjectCard[]>(),
    listBadgeShowcase(userId, supabase),
  ]);

  let profile: EngineeringProfile["profile"];
  if (profileRes.error) {
    logStageError("profile", "page.profile", profileRes.error, { userId });
    profile = { ok: false };
  } else {
    const normalised = normaliseProfile(profileRes.data?.[0] ?? null);
    profile = {
      ok: true,
      data: normalised,
      photoUrl: await getPhotoSignedUrl(normalised?.photo_url ?? null),
    };
  }

  if (progressRes.error) {
    logStageError("profile", "page.progress", progressRes.error, { userId });
  }
  if (projectsRes.error) {
    logStageError("profile", "page.projects", projectsRes.error, { userId });
  }

  const progress = progressRes.data ?? [];
  const projectList = projectsRes.data ?? [];

  const stats: EngineeringProfile["stats"] =
    progressRes.error || projectsRes.error
      ? { ok: false }
      : {
          ok: true,
          topicsCompleted: progress.filter((row) => row.completed).length,
          // A quiz is "taken" once it has a recorded score.
          quizzesTaken: progress.filter((row) => row.quiz_score != null).length,
          projectsCreated: projectList.length,
        };

  const projects: EngineeringProfile["projects"] = projectsRes.error
    ? { ok: false }
    : { ok: true, list: projectList };

  // listBadgeShowcase logs its own failure.
  const badges: EngineeringProfile["badges"] = showcase.ok
    ? {
        ok: true,
        earned: showcase.badges
          .filter((badge) => badge.earned_at !== null)
          .sort((a, b) => (a.earned_at ?? "").localeCompare(b.earned_at ?? "")),
        all: showcase.badges,
      }
    : { ok: false };

  logStage("profile", "page.load", {
    userId,
    hasProfile: profile.ok && Boolean(profile.data),
    stats: stats.ok ? `${stats.topicsCompleted}/${stats.quizzesTaken}/${stats.projectsCreated}` : "error",
    badges: badges.ok ? badges.earned.length : "error",
  });

  return { profile, stats, projects, badges };
}
