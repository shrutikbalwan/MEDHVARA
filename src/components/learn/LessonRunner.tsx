"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { checkAnswer, parseAnswer, type NumericInstance } from "@/lib/quiz/engine";
import { pickComputedQuestion } from "@/lib/quiz/pick";
import { saveTopicProgress } from "@/lib/supabase/learn-actions";
import { badgesQuery } from "@/types/badge";
import {
  LESSON_LEVELS,
  LESSON_QUIZ_LENGTH,
  type Lesson,
  type LessonLevel,
} from "@/types/lesson";

import styles from "./LessonRunner.module.css";

type SaveState = "idle" | "saving" | "saved" | "error";

export function LessonRunner({
  topicId,
  title,
  subject,
  description,
  previousScore,
}: {
  topicId: string;
  title: string;
  subject: string;
  /** Helps pick a computed question when the title alone is vague. */
  description: string | null;
  /** Score from an earlier attempt, or null if the topic is not completed. */
  previousScore: number | null;
}) {
  const [level, setLevel] = useState<LessonLevel>("beginner");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  /** Chosen option text per question index. */
  const [answers, setAnswers] = useState<Record<number, string>>({});
  /**
   * A question with a computed answer key and fresh numbers each attempt,
   * when one fits this topic. It replaces the AI's last question, so the quiz
   * stays 3 questions long and the score keeps its 0–3 range.
   */
  const [computed, setComputed] = useState<NumericInstance | null>(null);
  const [numericAnswer, setNumericAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  // The lesson is generated on click rather than on page load: each one uses
  // a message from the daily allowance, and a refresh or a stray visit should
  // not spend it.
  async function startLesson() {
    setIsLoading(true);
    setError(null);
    setLesson(null);
    setAnswers({});
    setComputed(null);
    setNumericAnswer("");
    setSubmitted(false);
    setSaveState("idle");
    setSaveError(null);

    try {
      const response = await fetch("/api/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: title, subject, level }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 429) setLimitReached(true);
        setError(payload?.error ?? "Could not load the lesson. Please try again.");
        return;
      }
      setLesson(payload.lesson as Lesson);
      // A random seed per attempt: new numbers every time.
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      setComputed(pickComputedQuestion({ title, description }, seed));
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function save(score: number) {
    setSaveState("saving");
    setSaveError(null);
    startTransition(async () => {
      // A rejected server action inside a transition is rethrown to the error
      // boundary and would replace the whole lesson, losing the score.
      let result: Awaited<ReturnType<typeof saveTopicProgress>>;
      try {
        result = await saveTopicProgress(topicId, score);
      } catch (error) {
        console.error("[learn] FAILED stage=progress.save (client)", error);
        setSaveState("error");
        setSaveError("Could not reach the server to save your progress. Please try again.");
        return;
      }
      if (result.ok) {
        setSaveState("saved");
        // Same route, so this component keeps its state; the layout's
        // BadgeToasts picks the ids up from the URL.
        if (result.newBadges.length > 0) {
          router.replace(`${pathname}${badgesQuery(result.newBadges)}`, { scroll: false });
        }
      } else {
        setSaveState("error");
        setSaveError(result.error);
      }
    });
  }

  const quiz = (lesson?.quiz ?? []).slice(0, computed ? LESSON_QUIZ_LENGTH - 1 : LESSON_QUIZ_LENGTH);
  const numericParsed = parseAnswer(numericAnswer);
  const numericResult = computed && numericAnswer.trim() ? checkAnswer(computed, numericAnswer) : null;
  const allAnswered =
    quiz.length > 0 &&
    quiz.every((_, index) => answers[index]) &&
    (!computed || numericParsed !== null);
  const score =
    quiz.filter((q, index) => answers[index] === q.correct_answer).length +
    (numericResult?.correct ? 1 : 0);
  const totalQuestions = quiz.length + (computed ? 1 : 0);

  function submitQuiz() {
    if (!allAnswered || submitted) return;
    setSubmitted(true);
    save(score);
  }

  return (
    <div className={styles.wrapper}>
      {previousScore !== null && !lesson ? (
        <p className={styles.previous}>
          ✓ Completed — last score {previousScore}/{LESSON_QUIZ_LENGTH}. You can take
          it again; the new score replaces the old one.
        </p>
      ) : null}

      {!lesson ? (
        <div className={styles.start}>
          <fieldset className={styles.levels} disabled={isLoading}>
            <legend className={styles.legend}>Your level</legend>
            {LESSON_LEVELS.map((option) => (
              <label key={option} className={styles.level}>
                <input
                  type="radio"
                  name="level"
                  value={option}
                  checked={level === option}
                  onChange={() => setLevel(option)}
                />
                <span>{option[0].toUpperCase() + option.slice(1)}</span>
              </label>
            ))}
          </fieldset>

          <button
            type="button"
            className={styles.primary}
            onClick={() => void startLesson()}
            disabled={isLoading || limitReached}
          >
            {isLoading ? "Preparing your lesson…" : "Start lesson"}
          </button>
          {isLoading ? (
            <p className={styles.thinking} role="status">
              MEDHVARA is writing your lesson. This can take a few seconds.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className={limitReached ? styles.limit : styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {lesson ? (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Explanation</h2>
            <p className={styles.body}>{lesson.explanation}</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Real-world example</h2>
            <p className={styles.body}>{lesson.example}</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Quiz</h2>
            <ol className={styles.quiz} role="list">
              {quiz.map((question, qIndex) => (
                <li key={qIndex}>
                  <fieldset className={styles.options} disabled={submitted}>
                    <legend className={styles.questionText}>
                      {qIndex + 1}. {question.question}
                    </legend>
                    {question.options.map((option) => {
                      const chosen = answers[qIndex] === option;
                      const isCorrect = option === question.correct_answer;
                      const marker = submitted
                        ? isCorrect
                          ? styles.correct
                          : chosen
                            ? styles.wrong
                            : ""
                        : "";
                      return (
                        <label key={option} className={`${styles.option} ${marker}`}>
                          <input
                            type="radio"
                            name={`q${qIndex}`}
                            value={option}
                            checked={chosen}
                            onChange={() =>
                              setAnswers((prev) => ({ ...prev, [qIndex]: option }))
                            }
                          />
                          <span>{option}</span>
                          {submitted && isCorrect ? (
                            <span className={styles.tag}>Correct answer</span>
                          ) : submitted && chosen ? (
                            <span className={styles.tag}>Your answer</span>
                          ) : null}
                        </label>
                      );
                    })}
                  </fieldset>
                </li>
              ))}

              {computed ? (
                <li>
                  <fieldset className={styles.options} disabled={submitted}>
                    <legend className={styles.questionText}>
                      {quiz.length + 1}. {computed.prompt}
                    </legend>
                    <p className={styles.exactNote}>
                      🧮 Exact answer, calculated by MEDHVARA — the numbers change every attempt.
                    </p>
                    <div className={styles.numericRow}>
                      <input
                        className={`${styles.numericInput} ${
                          submitted && numericResult ? (numericResult.correct ? styles.correct : styles.wrong) : ""
                        }`}
                        value={numericAnswer}
                        onChange={(event) => setNumericAnswer(event.target.value)}
                        placeholder={computed.unit ? `e.g. 4.7k (in ${computed.unit})` : "e.g. 42"}
                        aria-label={`Your answer${computed.unit ? ` in ${computed.unit}` : ""}`}
                        inputMode="text"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      {computed.unit ? <span className={styles.unit}>{computed.unit}</span> : null}
                    </div>
                    {!submitted && numericAnswer.trim() && numericParsed === null ? (
                      <p className={styles.numericHint}>Enter a number such as 150, 4.7k, 0.02 or 2.2µ.</p>
                    ) : null}
                    {submitted && numericResult ? (
                      <div className={styles.numericFeedback}>
                        <strong>{numericResult.correct ? "✓ Correct" : `✗ The answer is ${numericResult.expected}`}</strong>
                        {numericResult.explanation ? <span>{numericResult.explanation}</span> : null}
                      </div>
                    ) : null}
                  </fieldset>
                </li>
              ) : null}
            </ol>

            {!submitted ? (
              <button
                type="button"
                className={styles.primary}
                onClick={submitQuiz}
                disabled={!allAnswered}
              >
                Check answers
              </button>
            ) : (
              <div className={styles.result} role="status">
                <p className={styles.score}>
                  You scored {score} out of {totalQuestions}.
                </p>
                {saveState === "saving" ? (
                  <p className={styles.saveNote}>Saving your progress…</p>
                ) : saveState === "saved" ? (
                  <p className={styles.saveNote}>✓ Topic marked as completed.</p>
                ) : saveState === "error" ? (
                  <>
                    <p className={styles.error}>{saveError}</p>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => save(score)}
                    >
                      Try saving again
                    </button>
                  </>
                ) : null}

                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => void startLesson()}
                  disabled={isLoading || limitReached || saveState === "saving"}
                >
                  {isLoading ? "Preparing…" : "New lesson on this topic"}
                </button>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
