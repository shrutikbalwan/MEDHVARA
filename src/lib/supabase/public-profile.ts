import { listBadgeShowcase, type BadgeStatus } from "@/lib/badges";
import { logStage, logStageError } from "@/lib/log";
import { getPhotoSignedUrl } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

/**
 * The fields a public profile shows. Selected by name, never `*`, so a
 * private column added to profiles later is not exposed by accident.
 */
const PUBLIC_PROFILE_COLUMNS = "user_id, name, college, branch, year, skills, interests, bio, photo_url";

export type PublicProfileFields = {
  user_id: string;
  name: string | null;
  college: string | null;
  branch: string | null;
  year: string | null;
  skills: string[];
  interests: string[];
  bio: string | null;
  photo_url: string | null;
};

export type PublicProject = {
  id: string;
  title: string;
  difficulty: string | null;
  created_at: string;
};

export type PublicProfile = {
  profile: PublicProfileFields;
  photoUrl: string | null;
  stats:
    | {
        ok: true;
        topicsCompleted: number;
        quizzesTaken: number;
        projectsCreated: number;
        projectsCompleted: number;
      }
    | { ok: false; missingFunction: boolean };
  projects: { ok: true; list: PublicProject[] } | { ok: false };
  badges: { ok: true; earned: BadgeStatus[]; total: number } | { ok: false };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StatsRow = {
  topics_completed: number;
  quizzes_taken: number;
  projects_created: number;
  projects_completed: number;
};

/**
 * Loads the shareable profile at /profile/<userId>, as seen by the signed-in
 * viewer. Returns null when there is nothing to show: a malformed id, no
 * profile row, or (before 0007_public_profiles.sql is run) RLS hiding other
 * users' rows — all of which the page renders as "not found".
 *
 * Only Completed projects are listed: that is all the projects RLS policy
 * lets other students read, and it is applied here too so the owner's own
 * preview matches what others see.
 */
export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  if (!UUID.test(userId)) return null;

  const supabase = await createClient();

  const [profileRes, statsRes, projectsRes, showcase] = await Promise.all([
    supabase
      .from("profiles")
      .select(PUBLIC_PROFILE_COLUMNS)
      .eq("user_id", userId)
      .limit(1)
      .returns<PublicProfileFields[]>(),
    supabase.rpc("public_profile_stats", { p_user_id: userId }).returns<StatsRow[]>(),
    supabase
      .from("projects")
      .select("id, title, difficulty, created_at")
      .eq("owner_id", userId)
      .eq("status", "Completed")
      .order("created_at", { ascending: false })
      .returns<PublicProject[]>(),
    listBadgeShowcase(userId, supabase),
  ]);

  if (profileRes.error) {
    logStageError("public-profile", "profile.read", profileRes.error, { userId });
    return null;
  }
  const row = profileRes.data?.[0];
  if (!row) {
    logStage("public-profile", "not-found", { userId });
    return null;
  }
  const profile = { ...row, skills: row.skills ?? [], interests: row.interests ?? [] };

  let stats: PublicProfile["stats"];
  const statsRow = Array.isArray(statsRes.data) ? statsRes.data[0] : undefined;
  if (statsRes.error || !statsRow) {
    logStageError(
      "public-profile",
      "stats.rpc",
      statsRes.error ?? { message: "public_profile_stats returned no row" },
      { userId },
    );
    // PGRST202 = the function does not exist yet: 0007 has not been run.
    stats = { ok: false, missingFunction: statsRes.error?.code === "PGRST202" };
  } else {
    stats = {
      ok: true,
      topicsCompleted: statsRow.topics_completed,
      quizzesTaken: statsRow.quizzes_taken,
      projectsCreated: statsRow.projects_created,
      projectsCompleted: statsRow.projects_completed,
    };
  }

  if (projectsRes.error) {
    logStageError("public-profile", "projects.read", projectsRes.error, { userId });
  }
  const projects: PublicProfile["projects"] = projectsRes.error
    ? { ok: false }
    : { ok: true, list: projectsRes.data ?? [] };

  const badges: PublicProfile["badges"] = showcase.ok
    ? {
        ok: true,
        earned: showcase.badges
          .filter((badge) => badge.earned_at !== null)
          .sort((a, b) => (a.earned_at ?? "").localeCompare(b.earned_at ?? "")),
        total: showcase.badges.length,
      }
    : { ok: false };

  logStage("public-profile", "load", {
    userId,
    stats: stats.ok ? "ok" : "error",
    projects: projects.ok ? projects.list.length : "error",
    badges: badges.ok ? badges.earned.length : "error",
  });

  return {
    profile,
    // Needs 0007's storage policy to work for other users' photos; without it
    // this is null and the initial is shown instead.
    photoUrl: await getPhotoSignedUrl(profile.photo_url),
    stats,
    projects,
    badges,
  };
}
