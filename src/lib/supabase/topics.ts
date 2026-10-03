import { logStage, logStageError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import type { SubjectGroup, Topic, TopicWithProgress } from "@/types/topic";

export type SubjectListResult = {
  subjects: SubjectGroup[];
  /** Set when a read failed, so the page can explain instead of crashing. */
  error: string | null;
};

type ProgressRow = { topic_id: string; completed: boolean | null; quiz_score: number | null };

/**
 * Every topic grouped by subject, each marked with the signed-in user's
 * progress. Subjects sort alphabetically; topics by order_index, then title.
 *
 * Two queries rather than an embedded join: topic_progress's foreign key is
 * not guaranteed to be exposed to PostgREST, and a missing progress read
 * should still show the topics, just unticked.
 */
export async function listSubjectsWithProgress(): Promise<SubjectListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { subjects: [], error: null };

  const { data: topics, error: topicsError } = await supabase
    .from("topics")
    .select("id, subject, title, description, order_index")
    .order("subject", { ascending: true })
    .order("order_index", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true })
    .returns<Topic[]>();

  if (topicsError) {
    logStageError("learn", "topics.list", topicsError, { userId: user.id });
    return { subjects: [], error: topicsError.message };
  }

  const { data: progress, error: progressError } = await supabase
    .from("topic_progress")
    .select("topic_id, completed, quiz_score")
    .eq("user_id", user.id)
    .returns<ProgressRow[]>();

  // Non-fatal: the topics still render, without checkmarks.
  if (progressError) {
    logStageError("learn", "progress.list", progressError, { userId: user.id });
  }

  const byTopic = new Map((progress ?? []).map((row) => [row.topic_id, row]));
  const groups = new Map<string, TopicWithProgress[]>();

  for (const topic of topics ?? []) {
    const row = byTopic.get(topic.id);
    const list = groups.get(topic.subject) ?? [];
    list.push({
      ...topic,
      completed: Boolean(row?.completed),
      quiz_score: row?.quiz_score ?? null,
    });
    groups.set(topic.subject, list);
  }

  logStage("learn", "topics.list", {
    userId: user.id,
    topics: topics?.length ?? 0,
    completed: (progress ?? []).filter((row) => row.completed).length,
  });

  return {
    subjects: [...groups].map(([subject, list]) => ({ subject, topics: list })),
    error: null,
  };
}

/**
 * One topic with the user's progress, or null if the id is unknown or
 * malformed (a non-uuid id is a 22P02 error, which also reads as not found).
 */
export async function getTopicWithProgress(id: string): Promise<TopicWithProgress | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: topic, error } = await supabase
    .from("topics")
    .select("id, subject, title, description, order_index")
    .eq("id", id)
    .maybeSingle<Topic>();

  if (error) {
    logStageError("learn", "topics.read", error, { id, userId: user.id });
    return null;
  }
  if (!topic) {
    logStage("learn", "topics.read.not-found", { id, userId: user.id });
    return null;
  }

  const { data: row, error: progressError } = await supabase
    .from("topic_progress")
    .select("topic_id, completed, quiz_score")
    .eq("user_id", user.id)
    .eq("topic_id", id)
    .maybeSingle<ProgressRow>();

  if (progressError) {
    logStageError("learn", "progress.read", progressError, { id, userId: user.id });
  }

  return {
    ...topic,
    completed: Boolean(row?.completed),
    quiz_score: row?.quiz_score ?? null,
  };
}
