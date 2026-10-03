"use server";

import { revalidatePath } from "next/cache";

import { activityDay, recordActivity } from "@/lib/activity";
import { checkAndAwardBadges } from "@/lib/badges";
import { challengeForDay } from "@/lib/challenge";
import { logStage, logStageError } from "@/lib/log";
import { checkAnswer, parseAnswer } from "@/lib/quiz/engine";
import { CHALLENGE_MIGRATION_HINT, CHALLENGE_TABLE } from "@/lib/supabase/challenge";
import { ensureProfileRow } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import type { Badge } from "@/types/badge";
import { CHALLENGE_ANSWER_MAX, type ChallengeResult } from "@/types/challenge";

export type SubmitChallengeResult =
  | { ok: true; result: ChallengeResult; newBadges: Badge[] }
  | {
      ok: false;
      error: string;
      /** The page is out of date (new day, or answered in another tab): reload it. */
      reload?: boolean;
    };

/**
 * Checks the signed-in user's answer to today's Daily Challenge and stores it.
 * One attempt per day: the table's primary key is (user_id, challenge_date).
 *
 * The answer key is recomputed here from the day, never taken from the
 * browser. `day` is the day the student's page showed; it must still be today,
 * so an answer typed just before midnight is not marked against a different
 * question.
 */
export async function submitDailyChallenge(
  day: string,
  answer: string,
): Promise<SubmitChallengeResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "You need to be signed in to answer the challenge." };
  }

  const today = activityDay();
  if (day !== today) {
    return { ok: false, error: "A new day has started — here is today's challenge.", reload: true };
  }

  const typed = String(answer ?? "").trim().slice(0, CHALLENGE_ANSWER_MAX);
  if (parseAnswer(typed) === null) {
    return { ok: false, error: "Enter a number such as 150, 4.7k, 0.02 or 2.2µ." };
  }

  const challenge = challengeForDay(today);
  const check = checkAnswer(challenge, typed);

  // In case daily_challenge_attempts.user_id references profiles, as
  // daily_usage does.
  await ensureProfileRow(supabase, user.id);

  const { error } = await supabase.from(CHALLENGE_TABLE).insert({
    // From the verified session, never from the caller.
    user_id: user.id,
    challenge_date: today,
    question_id: challenge.id,
    answer: typed,
    correct: check.correct,
  });

  if (error) {
    // 23505 = already answered today, e.g. in another tab.
    if (error.code === "23505") {
      return { ok: false, error: "You've already answered today's challenge.", reload: true };
    }
    logStageError("challenge", "submit", error, {
      userId: user.id,
      day: today,
      hint: CHALLENGE_MIGRATION_HINT,
    });
    return { ok: false, error: "Could not save your answer. Please try again." };
  }

  logStage("challenge", "submit", {
    userId: user.id,
    day: today,
    question: challenge.id,
    correct: check.correct,
  });
  revalidatePath("/dashboard");
  // Answering counts as today's activity, then may complete a badge.
  // Neither can fail the submission.
  await recordActivity(user.id, supabase);
  const newBadges = await checkAndAwardBadges(user.id, supabase);

  return {
    ok: true,
    result: {
      correct: check.correct,
      answer: typed,
      expected: check.expected,
      explanation: check.explanation,
    },
    newBadges,
  };
}
