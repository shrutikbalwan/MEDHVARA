import type { Topic } from "@/types/topic";
import { LESSON_QUIZ_LENGTH } from "@/types/lesson";

/** A completed topic is "stale" once it has not been practised for this long. */
export const STALE_AFTER_DAYS = 14;

/** How many topics the dashboard suggests at once. */
export const REVISION_LIMIT = 3;

export type ProgressRow = {
  topic_id: string;
  completed: boolean | null;
  quiz_score: number | null;
  updated_at: string | null;
};

export type RevisionItem = {
  topic: Topic;
  /** low_score: under half marks on the last quiz. stale: not practised for STALE_AFTER_DAYS. */
  reason: "low_score" | "stale";
  score: number | null;
  /** Whole days since the last attempt, or null if unknown. */
  daysSince: number | null;
};

/** True when the last quiz scored under half marks, i.e. 0 or 1 out of 3. */
export function isLowScore(score: number | null): boolean {
  return score !== null && score / LESSON_QUIZ_LENGTH < 0.5;
}

/**
 * The completed topics most worth revisiting: low quiz scores first (lowest
 * score, then longest ago), then topics untouched for STALE_AFTER_DAYS
 * (longest ago first). Topics that are not completed are left to "Continue
 * learning", and progress on topics that no longer exist is ignored.
 * Pure, so it can be tested without a database.
 */
export function pickRevisionTopics(
  topics: Topic[],
  progress: ProgressRow[],
  now: Date = new Date(),
  limit: number = REVISION_LIMIT,
): RevisionItem[] {
  const byId = new Map(topics.map((topic) => [topic.id, topic]));

  const items: (RevisionItem & { at: number })[] = [];
  for (const row of progress) {
    const topic = byId.get(row.topic_id);
    if (!topic || !row.completed) continue;

    const at = row.updated_at ? Date.parse(row.updated_at) : NaN;
    const daysSince = Number.isNaN(at) ? null : Math.max(0, Math.floor((now.getTime() - at) / 86_400_000));

    if (isLowScore(row.quiz_score)) {
      items.push({ topic, reason: "low_score", score: row.quiz_score, daysSince, at });
    } else if (daysSince !== null && daysSince >= STALE_AFTER_DAYS) {
      items.push({ topic, reason: "stale", score: row.quiz_score, daysSince, at });
    }
  }

  // An unknown date sorts as oldest: the student has not seen it recently.
  const age = (item: { at: number }) => (Number.isNaN(item.at) ? 0 : item.at);
  return items
    .sort((a, b) => {
      if (a.reason !== b.reason) return a.reason === "low_score" ? -1 : 1;
      if (a.reason === "low_score" && a.score !== b.score) return (a.score ?? 0) - (b.score ?? 0);
      return age(a) - age(b);
    })
    .slice(0, limit)
    .map(({ topic, reason, score, daysSince }) => ({ topic, reason, score, daysSince }));
}
