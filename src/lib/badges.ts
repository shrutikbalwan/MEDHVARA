import { logStage, logStageError } from "@/lib/log";
import { ensureProfileRow } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { BADGE_IDS, type Badge, type BadgeId } from "@/types/badge";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** The user's real data each rule is evaluated against. */
type Facts = {
  hasName: boolean;
  completedCount: number;
  hasQuizScore: boolean;
  /** Lower-cased subjects of the topics the user has completed. */
  completedSubjects: Set<string>;
  projectCount: number;
  hasCompletedProject: boolean;
};

/** Which fact sources loaded. A rule whose source failed is skipped, never guessed. */
type Loaded = { profile: boolean; progress: boolean; subjects: boolean; projects: boolean };

const RULES: Record<BadgeId, { needs: (keyof Loaded)[]; earned: (f: Facts) => boolean }> = {
  first_profile: { needs: ["profile"], earned: (f) => f.hasName },
  first_lesson: { needs: ["progress"], earned: (f) => f.completedCount >= 1 },
  first_quiz: { needs: ["progress"], earned: (f) => f.hasQuizScore },
  five_lessons: { needs: ["progress"], earned: (f) => f.completedCount >= 5 },
  circuit_explorer: {
    needs: ["progress", "subjects"],
    earned: (f) => f.completedSubjects.has("basic electronics"),
  },
  embedded_explorer: {
    needs: ["progress", "subjects"],
    earned: (f) => f.completedSubjects.has("embedded systems"),
  },
  iot_explorer: {
    needs: ["progress", "subjects"],
    earned: (f) => f.completedSubjects.has("iot"),
  },
  first_project: { needs: ["projects"], earned: (f) => f.projectCount >= 1 },
  project_builder: { needs: ["projects"], earned: (f) => f.projectCount >= 3 },
  project_finisher: { needs: ["projects"], earned: (f) => f.hasCompletedProject },
  // Placeholder: needs daily login/activity tracking, which does not exist yet.
  // Never awarded until that data is available.
  streak_7: { needs: [], earned: () => false },
};

/**
 * Evaluates every badge rule against the user's real data and inserts the ones
 * they newly qualify for into user_badges. Returns only the badges earned by
 * THIS call, ready for a "Badge earned" toast.
 *
 * Never throws and never fails the caller's action: badges are a bonus, so any
 * problem is logged and the result is simply fewer (or no) badges. A brand-new
 * user with no profile name, progress, or projects gets an empty list.
 *
 * Pass the request's Supabase client when the caller already has one.
 */
export async function checkAndAwardBadges(
  userId: string,
  client?: ServerClient,
): Promise<Badge[]> {
  try {
    const supabase = client ?? (await createClient());

    const [profileRes, progressRes, projectsRes, ownedRes, catalogueRes] = await Promise.all([
      // limit(1): user_id is not guaranteed unique on profiles.
      supabase.from("profiles").select("name").eq("user_id", userId).limit(1),
      supabase
        .from("topic_progress")
        .select("topic_id, completed, quiz_score")
        .eq("user_id", userId)
        .returns<{ topic_id: string; completed: boolean | null; quiz_score: number | null }[]>(),
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
      supabase
        .from("badges")
        .select("id, name, description, icon")
        .in("id", [...BADGE_IDS])
        .returns<Badge[]>(),
    ]);

    // Without these two there is no safe way to know what is new.
    if (ownedRes.error) {
      logStageError("badges", "owned.read", ownedRes.error, { userId });
      return [];
    }
    if (catalogueRes.error) {
      logStageError("badges", "catalogue.read", catalogueRes.error, { userId });
      return [];
    }

    const loaded: Loaded = {
      profile: !profileRes.error,
      progress: !progressRes.error,
      projects: !projectsRes.error,
      subjects: false,
    };
    if (profileRes.error) logStageError("badges", "profile.read", profileRes.error, { userId });
    if (progressRes.error) logStageError("badges", "progress.read", progressRes.error, { userId });
    if (projectsRes.error) logStageError("badges", "projects.read", projectsRes.error, { userId });

    const progress = progressRes.data ?? [];
    const completedIds = progress.filter((row) => row.completed).map((row) => row.topic_id);

    // Subjects only for the topics actually completed.
    const completedSubjects = new Set<string>();
    if (completedIds.length === 0) {
      loaded.subjects = true;
    } else {
      const { data: topics, error } = await supabase
        .from("topics")
        .select("subject")
        .in("id", completedIds)
        .returns<{ subject: string | null }[]>();
      if (error) {
        logStageError("badges", "subjects.read", error, { userId });
      } else {
        loaded.subjects = true;
        for (const topic of topics ?? []) {
          if (topic.subject) completedSubjects.add(topic.subject.trim().toLowerCase());
        }
      }
    }

    const projects = projectsRes.data ?? [];
    const facts: Facts = {
      hasName: Boolean(
        (profileRes.data?.[0] as { name?: string | null } | undefined)?.name?.trim(),
      ),
      completedCount: completedIds.length,
      hasQuizScore: progress.some((row) => row.quiz_score != null),
      completedSubjects,
      projectCount: projects.length,
      hasCompletedProject: projects.some((p) => p.status === "Completed"),
    };

    const owned = new Set((ownedRes.data ?? []).map((row) => row.badge_id));
    const catalogue = new Map((catalogueRes.data ?? []).map((badge) => [badge.id, badge]));

    const qualified = BADGE_IDS.filter(
      (id) =>
        !owned.has(id) &&
        RULES[id].needs.every((source) => loaded[source]) &&
        RULES[id].earned(facts),
    );

    // user_badges.badge_id references badges.id, so a badge missing from the
    // catalogue cannot be inserted. Skip it loudly instead of failing the rest.
    const missing = qualified.filter((id) => !catalogue.has(id));
    if (missing.length > 0) {
      logStageError(
        "badges",
        "catalogue.missing",
        {
          message: `qualified for badges not in public.badges: ${missing.join(", ")}`,
          hint: "Run supabase/migrations/0006_badges.sql to seed them.",
        },
        { userId },
      );
    }
    const toAward = qualified.filter((id) => catalogue.has(id));
    if (toAward.length === 0) return [];

    // user_badges.user_id may reference profiles, as daily_usage does.
    await ensureProfileRow(supabase, userId);

    // ON CONFLICT DO NOTHING on (user_id, badge_id): if a concurrent call
    // already awarded one, it is skipped here and only the rows actually
    // inserted come back — so a badge is never announced twice.
    const { data: inserted, error: insertError } = await supabase
      .from("user_badges")
      .upsert(
        toAward.map((badge_id) => ({ user_id: userId, badge_id })),
        { onConflict: "user_id,badge_id", ignoreDuplicates: true },
      )
      .select("badge_id")
      .returns<{ badge_id: string }[]>();

    if (insertError) {
      logStageError("badges", "award.insert", insertError, { userId, badges: toAward });
      return [];
    }

    const earned = (inserted ?? [])
      .map((row) => catalogue.get(row.badge_id))
      .filter((badge): badge is Badge => Boolean(badge));

    logStage("badges", "award", { userId, earned: earned.map((b) => b.id) });
    return earned;
  } catch (error) {
    logStageError("badges", "unexpected", error, { userId });
    return [];
  }
}

/**
 * The user's own badges among `ids`, with catalogue details. Used by the toast
 * to resolve ids passed in the URL — only badges the user really holds are
 * returned, so a hand-edited link cannot fake an award.
 */
export async function getOwnedBadges(userId: string, ids: string[]): Promise<Badge[]> {
  const wanted = ids.filter((id) => (BADGE_IDS as readonly string[]).includes(id));
  if (wanted.length === 0) return [];

  const supabase = await createClient();
  const [ownedRes, catalogueRes] = await Promise.all([
    supabase
      .from("user_badges")
      .select("badge_id")
      .eq("user_id", userId)
      .in("badge_id", wanted)
      .returns<{ badge_id: string }[]>(),
    supabase
      .from("badges")
      .select("id, name, description, icon")
      .in("id", wanted)
      .returns<Badge[]>(),
  ]);

  if (ownedRes.error || catalogueRes.error) {
    logStageError("badges", "toast.read", ownedRes.error ?? catalogueRes.error, { userId });
    return [];
  }

  const owned = new Set((ownedRes.data ?? []).map((row) => row.badge_id));
  const catalogue = new Map((catalogueRes.data ?? []).map((badge) => [badge.id, badge]));
  return wanted
    .filter((id) => owned.has(id))
    .map((id) => catalogue.get(id))
    .filter((badge): badge is Badge => Boolean(badge));
}

export type BadgeStatus = Badge & {
  /** When the user earned it, or null if not yet earned. */
  earned_at: string | null;
};

export type BadgeShowcase = { ok: true; badges: BadgeStatus[] } | { ok: false };

/**
 * Every badge in the catalogue with the user's earned state, for the profile
 * grid and the dashboard row. Known badges come first in BADGE_IDS order; any
 * extra rows someone adds to public.badges follow, by name.
 */
export async function listBadgeShowcase(
  userId: string,
  client?: ServerClient,
): Promise<BadgeShowcase> {
  const supabase = client ?? (await createClient());

  const [catalogueRes, ownedRes] = await Promise.all([
    supabase.from("badges").select("id, name, description, icon").returns<Badge[]>(),
    supabase
      .from("user_badges")
      .select("badge_id, earned_at")
      .eq("user_id", userId)
      .returns<{ badge_id: string; earned_at: string | null }[]>(),
  ]);

  if (catalogueRes.error || ownedRes.error) {
    logStageError("badges", "showcase.read", catalogueRes.error ?? ownedRes.error, { userId });
    return { ok: false };
  }

  // A row with a null earned_at is still earned; fall back to an empty string
  // so "earned" is never confused with "missing".
  const earned = new Map((ownedRes.data ?? []).map((row) => [row.badge_id, row.earned_at ?? ""]));
  const rank = (id: string) => {
    const index = (BADGE_IDS as readonly string[]).indexOf(id);
    return index === -1 ? BADGE_IDS.length : index;
  };

  const badges = (catalogueRes.data ?? [])
    .map((badge) => ({ ...badge, earned_at: earned.get(badge.id) ?? null }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));

  return { ok: true, badges };
}
