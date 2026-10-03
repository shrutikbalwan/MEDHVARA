import { extractJsonObject } from "@/lib/project-plan";
import { LESSON_QUIZ_LENGTH, type Lesson, type QuizQuestion } from "@/types/lesson";

export type LessonParseResult =
  | { ok: true; lesson: Lesson }
  | { ok: false; reason: string };

/** Trimmed non-empty string, or null. */
function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Options as plain strings. Models sometimes send {text: "..."} objects or
 * prefix each option with "A) " — both are format slips, so they are
 * normalised rather than rejected.
 */
function asOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const options = value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        for (const key of ["text", "option", "value", "label"]) {
          const nested = (item as Record<string, unknown>)[key];
          if (typeof nested === "string") return nested;
        }
      }
      return "";
    })
    .map((option) => option.replace(/^\s*[A-Da-d][).:]\s+/, "").trim())
    .filter(Boolean);

  // Duplicate options would make the answer ambiguous.
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null;
  return options.length >= 2 ? options : null;
}

/**
 * Resolves the model's answer to the exact text of one option. Accepts the
 * option text itself, a letter ("B", "b)", "Option B"), or a 0-based index —
 * all common model habits. Anything that does not land on exactly one option
 * is rejected: a quiz with an unmatchable answer is unusable.
 */
function resolveAnswer(value: unknown, options: string[]): string | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return options[value] ?? null;
  }

  const text = asString(value);
  if (!text) return null;

  const exact = options.find((option) => option.toLowerCase() === text.toLowerCase());
  if (exact) return exact;

  const letter = text.match(/^(?:option\s+)?([A-Da-d])(?:[).:]|\s|$)/i);
  if (letter) {
    const option = options[letter[1].toUpperCase().charCodeAt(0) - 65];
    if (option) {
      // "B) Ohm's law" — the letter and the text must agree if both are given.
      const rest = text.slice(letter[0].length).trim();
      if (!rest || rest.toLowerCase() === option.toLowerCase()) return option;
    }
  }

  return null;
}

function asQuizQuestion(value: unknown, index: number): QuizQuestion | string {
  if (!value || typeof value !== "object") return `quiz[${index}] is not an object`;
  const source = value as Record<string, unknown>;

  const question = asString(source.question);
  if (!question) return `quiz[${index}].question missing`;

  const options = asOptions(source.options);
  if (!options) return `quiz[${index}].options must be 2+ distinct strings`;

  const answer = resolveAnswer(
    source.correct_answer ?? source.correctAnswer ?? source.answer,
    options,
  );
  if (!answer) return `quiz[${index}].correct_answer does not match any option`;

  return { question, options, correct_answer: answer };
}

/**
 * Parses and validates a model response into a Lesson. Uses the same tolerant
 * JSON extraction as the project builder (fences and stray prose survive).
 *
 * Never throws: every failure is a reason the route logs and feeds back to the
 * model on retry.
 */
export function parseLesson(raw: string): LessonParseResult {
  const json = extractJsonObject(raw);
  if (!json) return { ok: false, reason: "no JSON object found in response" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      reason: `JSON.parse failed: ${error instanceof Error ? error.message : "unknown"}`,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "parsed value is not a JSON object" };
  }

  const source = parsed as Record<string, unknown>;
  const problems: string[] = [];

  const explanation = asString(source.explanation);
  if (!explanation) problems.push("explanation missing");

  const example = asString(source.example);
  if (!example) problems.push("example missing");

  const quiz: QuizQuestion[] = [];
  if (!Array.isArray(source.quiz)) {
    problems.push("quiz is not an array");
  } else {
    const quizProblems: string[] = [];
    source.quiz.forEach((item, index) => {
      const result = asQuizQuestion(item, index);
      if (typeof result === "string") quizProblems.push(result);
      else quiz.push(result);
    });
    // Extra or broken questions are dropped as long as enough valid ones remain.
    if (quiz.length < LESSON_QUIZ_LENGTH) {
      problems.push(
        `quiz needs ${LESSON_QUIZ_LENGTH} valid questions, got ${quiz.length}`,
        ...quizProblems,
      );
    }
  }

  if (problems.length > 0) {
    return { ok: false, reason: problems.join("; ") };
  }

  return {
    ok: true,
    lesson: {
      explanation: explanation!,
      example: example!,
      quiz: quiz.slice(0, LESSON_QUIZ_LENGTH),
    },
  };
}
