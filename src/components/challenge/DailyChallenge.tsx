"use client";

import { usePathname, useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";

import { parseAnswer } from "@/lib/quiz/engine";
import { submitDailyChallenge } from "@/lib/supabase/challenge-actions";
import { badgesQuery } from "@/types/badge";
import { CHALLENGE_ANSWER_MAX, type ChallengeResult } from "@/types/challenge";

import styles from "./DailyChallenge.module.css";

export function DailyChallenge({
  day,
  prompt,
  unit,
  attempt,
  solved,
}: {
  day: string;
  prompt: string;
  unit: string;
  /** Today's stored attempt, from the server. */
  attempt: ChallengeResult | null;
  solved: number;
}) {
  const [answer, setAnswer] = useState("");
  /** The result of an answer given on this page, before the server re-renders. */
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const inputId = useId();

  const shown = result ?? attempt;
  const parsed = parseAnswer(answer);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (parsed === null || isPending) return;
    setError(null);
    startTransition(async () => {
      // A rejected server action inside a transition is rethrown to the error
      // boundary and would replace the whole dashboard.
      let response: Awaited<ReturnType<typeof submitDailyChallenge>>;
      try {
        response = await submitDailyChallenge(day, answer);
      } catch (cause) {
        console.error("[challenge] FAILED stage=submit (client)", cause);
        setError("Could not reach the server. Check your connection and try again.");
        return;
      }
      if (!response.ok) {
        setError(response.error);
        // New day, or already answered elsewhere: the server has the truth.
        if (response.reload) router.refresh();
        return;
      }
      setResult(response.result);
      // The layout's BadgeToasts picks the ids up from the URL.
      if (response.newBadges.length > 0) {
        router.replace(`${pathname}${badgesQuery(response.newBadges)}`, { scroll: false });
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className={styles.card}>
      <p className={styles.prompt}>{prompt}</p>

      {shown ? (
        <div
          className={`${styles.result} ${shown.correct ? styles.correct : styles.wrong}`}
          role="status"
        >
          <strong>
            {shown.correct
              ? `✓ Correct — ${shown.expected}`
              : `✗ You answered ${shown.answer}${unit ? ` ${unit}` : ""}. The answer is ${shown.expected}.`}
          </strong>
          {shown.explanation ? <span>{shown.explanation}</span> : null}
          <span className={styles.next}>A new challenge appears tomorrow.</span>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <label htmlFor={inputId} className={styles.label}>
            Your answer{unit ? ` (in ${unit})` : ""} — one try per day
          </label>
          <div className={styles.row}>
            <input
              id={inputId}
              className={styles.input}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="e.g. 4.7k or 0.02"
              maxLength={CHALLENGE_ANSWER_MAX}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              disabled={isPending}
            />
            {unit ? <span className={styles.unit}>{unit}</span> : null}
            <button type="submit" className={styles.submit} disabled={parsed === null || isPending}>
              {isPending ? "Checking…" : "Submit"}
            </button>
          </div>
          {answer.trim() && parsed === null ? (
            <p className={styles.hint}>Enter a number such as 150, 4.7k, 0.02 or 2.2µ.</p>
          ) : null}
        </form>
      )}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <p className={styles.meta}>
        🧮 Exact answer, calculated by MEDHVARA · Solved so far:{" "}
        <strong>{solved}</strong>
      </p>
    </div>
  );
}
