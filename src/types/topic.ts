/**
 * Mirrors the live tables:
 *   topics         (id uuid, subject text, title text, description text,
 *                   order_index int4, created_at timestamptz)
 *   topic_progress (user_id uuid, topic_id uuid, completed bool,
 *                   quiz_score int4, updated_at timestamptz)
 *                   primary key (user_id, topic_id)
 *
 * There is no subjects table: a subject is the `subject` text on each topic.
 */
export type Topic = {
  id: string;
  subject: string;
  title: string;
  description: string | null;
  order_index: number | null;
};

/** A topic plus the signed-in user's progress on it, for the /learn list. */
export type TopicWithProgress = Topic & {
  completed: boolean;
  /** Number of quiz questions answered correctly on the latest attempt. */
  quiz_score: number | null;
};

export type SubjectGroup = {
  subject: string;
  topics: TopicWithProgress[];
};
