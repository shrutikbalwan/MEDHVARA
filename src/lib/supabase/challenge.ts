import { activityDay } from "@/lib/activity";
import { challengeForDay } from "@/lib/challenge";
import { logStageError } from "@/lib/log";
import { checkAnswer } from "@/lib/quiz/engine";
import { createClient } from "@/lib/supabase/server";
import type { ChallengeResult, ChallengeState } from "@/types/challenge";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export const CHALLENGE_TABLE = "daily_challenge_attempts";
export const CHALLENGE_MIGRATION_HINT = "Run supabase/migrations/0009_daily_challenge.sql";

/** The result for a stored answer to `day`'s question, recomputed from the bank. */
export function resultFor(day: string, answer: string, correct: boolean): ChallengeResult {
  const check = checkAnswer(challengeForDay(day), answer);
  // `correct` is what was stored when the student answered; it stays the
  // record even if a tolerance changes later.
  return { correct, answer, expected: check.expected, explanation: check.explanation };
}

/** Today's challenge and the user's attempt at it, for the dashboard card. */
export async function getDailyChallenge(
  userId: string,
  client?: ServerClient,
): Promise<ChallengeState> {
  const supabase = client ?? (await createClient());
  const day = activityDay();
  const challenge = challengeForDay(day);

  const [todayRes, solvedRes] = await Promise.all([
    supabase
      .from(CHALLENGE_TABLE)
      .select("answer, correct")
      .eq("user_id", userId)
      .eq("challenge_date", day)
      .limit(1)
      .returns<{ answer: string | null; correct: boolean | null }[]>(),
    supabase
      .from(CHALLENGE_TABLE)
      .select("challenge_date")
      .eq("user_id", userId)
      .eq("correct", true)
      .returns<{ challenge_date: string }[]>(),
  ]);

  const error = todayRes.error ?? solvedRes.error;
  if (error) {
    logStageError("challenge", "read", error, { userId, day, hint: CHALLENGE_MIGRATION_HINT });
    return { ok: false };
  }

  const row = todayRes.data?.[0];
  return {
    ok: true,
    day,
    prompt: challenge.prompt,
    unit: challenge.unit,
    attempt: row ? resultFor(day, row.answer ?? "", Boolean(row.correct)) : null,
    solved: solvedRes.data?.length ?? 0,
  };
}
