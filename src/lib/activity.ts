import { logStage, logStageError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Days are counted in the students' own timezone, not UTC: in UTC, anything
 * after 5:30 am IST would still be "yesterday" and break streaks unfairly.
 */
export const ACTIVITY_TIMEZONE = "Asia/Kolkata";

/** Streaks longer than this are reported as this; keeps the read bounded. */
const MAX_STREAK_DAYS = 400;

/** YYYY-MM-DD for `date` in ACTIVITY_TIMEZONE (en-CA formats as ISO). */
export function activityDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ACTIVITY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** The YYYY-MM-DD day before `day`, as calendar arithmetic (no timezone drift). */
function previousDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * Marks today as an active day for the user. Safe to call any number of times
 * a day: ON CONFLICT DO NOTHING on (user_id, activity_date).
 *
 * Never throws — a missed activity write must not fail a quiz save or a page
 * load. Failures are logged with their cause.
 */
export async function recordActivity(userId: string, client?: ServerClient): Promise<void> {
  try {
    const supabase = client ?? (await createClient());
    const day = activityDay();
    const { error } = await supabase
      .from("activity_log")
      .upsert(
        { user_id: userId, activity_date: day },
        { onConflict: "user_id,activity_date", ignoreDuplicates: true },
      );

    if (error) {
      logStageError("activity", "record", error, {
        userId,
        day,
        hint: "Run supabase/migrations/0008_activity_log.sql",
      });
      return;
    }
    logStage("activity", "record", { userId, day });
  } catch (error) {
    logStageError("activity", "record.unexpected", error, { userId });
  }
}

/**
 * Counts consecutive active days ending today. If today has no activity yet
 * but yesterday does, the streak is still alive and counts back from
 * yesterday — it only breaks once a whole day passes with nothing logged.
 * Pure, so it can be tested without a database.
 */
export function computeStreak(activeDays: Iterable<string>, today: string = activityDay()): number {
  const days = new Set(activeDays);
  let cursor = days.has(today) ? today : previousDay(today);
  let streak = 0;
  while (days.has(cursor) && streak < MAX_STREAK_DAYS) {
    streak++;
    cursor = previousDay(cursor);
  }
  return streak;
}

export type StreakResult = { ok: true; streak: number } | { ok: false };

/** The user's current streak, read from activity_log. */
export async function getCurrentStreak(
  userId: string,
  client?: ServerClient,
): Promise<StreakResult> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("activity_log")
    .select("activity_date")
    .eq("user_id", userId)
    .order("activity_date", { ascending: false })
    // A streak can only use the most recent days; this bounds the read.
    .limit(MAX_STREAK_DAYS + 1)
    .returns<{ activity_date: string }[]>();

  if (error) {
    logStageError("activity", "streak.read", error, { userId });
    return { ok: false };
  }
  return { ok: true, streak: computeStreak((data ?? []).map((row) => row.activity_date)) };
}
