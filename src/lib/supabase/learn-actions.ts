"use server";

import { revalidatePath } from "next/cache";

import { checkAndAwardBadges } from "@/lib/badges";
import { logStage, logStageError } from "@/lib/log";
import { ensureProfileRow } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import type { Badge } from "@/types/badge";
import { LESSON_QUIZ_LENGTH } from "@/types/lesson";

export type SaveProgressResult =
  | { ok: true; newBadges: Badge[] }
  | { ok: false; error: string };

/**
 * Marks a topic completed for the signed-in user with their quiz score
 * (number of questions answered correctly).
 *
 * The score is computed in the browser, because the lesson and its answers
 * are generated per request and never stored. It is range-checked here, but a
 * determined student could still submit any value in range — acceptable for a
 * self-study tracker, not for anything graded.
 *
 * Upsert on (user_id, topic_id), the table's primary key: a retake overwrites
 * the previous score rather than adding a row.
 */
export async function saveTopicProgress(
  topicId: string,
  score: number,
): Promise<SaveProgressResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "You need to be signed in to save progress." };
  }

  if (!Number.isInteger(score) || score < 0 || score > LESSON_QUIZ_LENGTH) {
    return { ok: false, error: "That is not a valid score." };
  }

  // Same new-account guard as the AI routes, in case topic_progress.user_id
  // references profiles like daily_usage does.
  await ensureProfileRow(supabase, user.id);

  const { error } = await supabase.from("topic_progress").upsert(
    {
      // From the verified session, never from the caller.
      user_id: user.id,
      topic_id: topicId,
      completed: true,
      quiz_score: score,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,topic_id" },
  );

  if (error) {
    logStageError("learn", "progress.save", error, { topicId, score, userId: user.id });
    // 42501 = RLS refused it; 23503 = a referenced row (the topic, or the
    // user's profile) is missing — the log line names which constraint.
    if (error.code === "42501") {
      return {
        ok: false,
        error:
          "The database refused to save your progress (row-level security). Run supabase/migrations/0005_learning_rls.sql.",
      };
    }
    if (error.code === "23503") {
      return {
        ok: false,
        error: "Could not save your progress: a linked record is missing. Please reload and try again.",
      };
    }
    return { ok: false, error: "Could not save your progress. Please try again." };
  }

  logStage("learn", "progress.save", { topicId, score, userId: user.id });
  revalidatePath("/learn");
  revalidatePath(`/learn/${topicId}`);
  // After the write, so this completion counts. Never fails the save.
  const newBadges = await checkAndAwardBadges(user.id, supabase);
  return { ok: true, newBadges };
}
