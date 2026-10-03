import Link from "next/link";
import type { Metadata } from "next";

import { listSubjectsWithProgress } from "@/lib/supabase/topics";
import { LESSON_QUIZ_LENGTH } from "@/types/lesson";

import styles from "../app.module.css";
import learnStyles from "./learn.module.css";

export const metadata: Metadata = { title: "Learn · MEDHVARA" };

// Per-user progress that changes after every quiz; never serve it from cache.
export const dynamic = "force-dynamic";

/**
 * The signed-in gate lives in src/app/(app)/layout.tsx, with src/proxy.ts
 * redirecting earlier still. Nothing here is reachable signed out.
 */
export default async function LearnPage() {
  const { subjects, error } = await listSubjectsWithProgress();

  return (
    <>
      <h1 className={styles.title}>Learn</h1>
      <p className={styles.lede}>
        Pick a topic for a short lesson and a three-question quiz.
      </p>

      {error ? (
        <p className={styles.placeholder}>
          Topics could not be loaded right now. Please try again.
        </p>
      ) : subjects.length === 0 ? (
        <p className={styles.placeholder}>No topics have been added yet.</p>
      ) : (
        subjects.map(({ subject, topics }) => {
          const done = topics.filter((topic) => topic.completed).length;
          return (
            <section key={subject} className={learnStyles.subject}>
              <div className={learnStyles.subjectHeader}>
                <h2 className={learnStyles.subjectTitle}>{subject}</h2>
                <span className={learnStyles.count}>
                  {done} of {topics.length} done
                </span>
              </div>

              <ul className={learnStyles.topics}>
                {topics.map((topic) => (
                  <li key={topic.id}>
                    <Link href={`/learn/${topic.id}`} className={learnStyles.topic}>
                      <span
                        className={`${learnStyles.check} ${
                          topic.completed ? learnStyles.checkDone : ""
                        }`}
                        aria-label={topic.completed ? "Completed" : "Not started"}
                        role="img"
                      >
                        {topic.completed ? "✓" : ""}
                      </span>
                      <span className={learnStyles.topicText}>
                        <span className={learnStyles.topicTitle}>{topic.title}</span>
                        {topic.description ? (
                          <span className={learnStyles.topicDescription}>
                            {topic.description}
                          </span>
                        ) : null}
                      </span>
                      {topic.completed && topic.quiz_score != null ? (
                        <span className={learnStyles.score}>{topic.quiz_score}/{LESSON_QUIZ_LENGTH}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}
