"use client";

import { useState, useTransition } from "react";

import { saveTopicProgress } from "@/lib/supabase/learn-actions";
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
  previousScore,
}: {
  topicId: string;
  title: string;
  subject: string;
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
  const [submitted, setSubmitted] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // The lesson is generated on click rather than on page load: each one uses
  // a message from the daily allowance, and a refresh or a stray visit should
  // not spend it.
  async function startLesson() {
    setIsLoading(true);
    setError(null);
    setLesson(null);
    setAnswers({});
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
      const result = await saveTopicProgress(topicId, score);
      if (result.ok) {
        setSaveState("saved");
      } else {
        setSaveState("error");
        setSaveError(result.error);
      }
    });
  }

  const quiz = lesson?.quiz ?? [];
  const allAnswered = quiz.length > 0 && quiz.every((_, index) => answers[index]);
  const score = quiz.filter((q, index) => answers[index] === q.correct_answer).length;

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
                  You scored {score} out of {quiz.length}.
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
