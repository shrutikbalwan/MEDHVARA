/**
 * Mirrors public.daily_challenge_attempts (supabase/migrations/0009):
 *   user_id uuid, challenge_date date, question_id text, answer text,
 *   correct bool, created_at timestamptz; primary key (user_id, challenge_date)
 *
 * One attempt per student per day: there is no update policy.
 */

/** How a submitted answer went. Safe to show once the student has answered. */
export type ChallengeResult = {
  correct: boolean;
  /** What the student typed. */
  answer: string;
  /** The exact answer, e.g. "4.7 kΩ". */
  expected: string;
  explanation: string;
};

/**
 * What the dashboard card needs. The answer key is deliberately absent until
 * the student has answered.
 */
export type ChallengeState =
  | {
      ok: true;
      /** YYYY-MM-DD (Asia/Kolkata) the question belongs to. */
      day: string;
      prompt: string;
      unit: string;
      /** Today's attempt, or null if not answered yet. */
      attempt: ChallengeResult | null;
      /** Challenges answered correctly, all time. */
      solved: number;
    }
  | { ok: false };

/** The longest answer stored; anything longer is not a number anyway. */
export const CHALLENGE_ANSWER_MAX = 40;
