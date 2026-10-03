import { QUESTION_BANK, type BankQuestion } from "@/lib/quiz/bank";
import { instantiate, type NumericInstance } from "@/lib/quiz/engine";

/** Lower-case, straight apostrophes, superscript 2 → 2, so "Ohm’s Law" and "I²C" match. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[’‘`]/g, "'").replace(/²/g, "2").replace(/\s+/g, " ").trim();
}

/** Whole-word/phrase match, so "led" does not match "controlled" and "rc" not "source". */
function contains(text: string, keyword: string): boolean {
  const escaped = normalise(keyword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
}

/** Keyword hits, title counting double: the title says what the topic is about. */
function relevance(question: BankQuestion, title: string, description: string): number {
  return question.keywords.reduce(
    (score, keyword) => score + (contains(title, keyword) ? 2 : contains(description, keyword) ? 1 : 0),
    0,
  );
}

/** The bank questions that fit a topic, best match first. Empty when nothing fits. */
export function matchQuestions(topic: { title: string; description?: string | null }): BankQuestion[] {
  const title = normalise(topic.title);
  const description = normalise(topic.description ?? "");
  return QUESTION_BANK.map((question) => ({ question, score: relevance(question, title, description) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ question }) => question);
}

/**
 * One computed question for this topic with fresh numbers for `seed`, or
 * null when no bank question fits — the quiz then stays as the AI wrote it,
 * rather than asking something off-topic. Among equally good matches the
 * seed picks one, so retakes can vary the question as well as the numbers.
 */
export function pickComputedQuestion(
  topic: { title: string; description?: string | null },
  seed: number,
): NumericInstance | null {
  const matches = matchQuestions(topic);
  if (matches.length === 0) return null;
  const best = relevance(matches[0], normalise(topic.title), normalise(topic.description ?? ""));
  const top = matches.filter(
    (q) => relevance(q, normalise(topic.title), normalise(topic.description ?? "")) === best,
  );
  return instantiate(top[Math.abs(seed) % top.length], seed);
}
