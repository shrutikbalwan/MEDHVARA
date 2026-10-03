export const LESSON_LEVELS = ["beginner", "intermediate"] as const;
export type LessonLevel = (typeof LESSON_LEVELS)[number];

/** Questions per lesson. The prompt, the parser, and the route all read this. */
export const LESSON_QUIZ_LENGTH = 3;

export type QuizQuestion = {
  question: string;
  options: string[];
  /** Always exactly one of `options`, verbatim — the parser guarantees it. */
  correct_answer: string;
};

export type Lesson = {
  explanation: string;
  example: string;
  quiz: QuizQuestion[];
};
