import { QUESTION_BANK, type BankQuestion } from "@/lib/quiz/bank";
import { instantiate, mulberry32, type NumericInstance } from "@/lib/quiz/engine";

/**
 * The Daily Challenge: one computed question per calendar day, the same for
 * every student. Pure — the day alone decides the question and its numbers,
 * so the server can recompute the answer key when an answer comes in and the
 * key never has to be sent to the browser before the student answers.
 *
 * Days are YYYY-MM-DD in Asia/Kolkata (see activityDay in src/lib/activity.ts).
 */

/** Days since 1970-01-01 for a YYYY-MM-DD string. */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** A shuffled order of 0..length-1 for one pass through the bank. */
function cycleOrder(cycle: number, length: number): number[] {
  const random = mulberry32(cycle + 1);
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Which bank question a day gets. The bank is walked in a shuffled order, so
 * every question comes up once before any repeats and neighbouring days are
 * not all on the same topic. A new pass never opens with the question that
 * closed the last one, so no question appears two days running.
 */
export function challengeQuestionIndex(day: string, length: number): number {
  const n = dayNumber(day);
  const cycle = Math.floor(n / length);
  const position = n - cycle * length;
  const order = cycleOrder(cycle, length);
  if (length > 1) {
    const previousLast = cycleOrder(cycle - 1, length)[length - 1];
    if (order[0] === previousLast) [order[0], order[1]] = [order[1], order[0]];
  }
  return order[position];
}

/** Today's question with today's numbers. */
export function challengeForDay(
  day: string,
  bank: readonly BankQuestion[] = QUESTION_BANK,
): NumericInstance {
  const question = bank[challengeQuestionIndex(day, bank.length)];
  // A different seed per day, spread out so neighbouring days differ.
  const seed = Math.imul(dayNumber(day) + 1, 2654435761) >>> 0;
  return instantiate(question, seed);
}
