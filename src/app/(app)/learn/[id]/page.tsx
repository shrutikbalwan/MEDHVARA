import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { LessonRunner } from "@/components/learn/LessonRunner";
import { getTopicWithProgress } from "@/lib/supabase/topics";

import styles from "../../app.module.css";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const topic = await getTopicWithProgress(id);
  return { title: topic ? `${topic.title} · MEDHVARA` : "Lesson · MEDHVARA" };
}

export default async function TopicPage({ params }: PageProps) {
  // params is a Promise in Next 16 and must be awaited.
  const { id } = await params;
  const topic = await getTopicWithProgress(id);

  if (!topic) notFound();

  return (
    <>
      <Link href="/learn" className={styles.back}>
        ← All topics
      </Link>
      <p className={styles.lede}>{topic.subject}</p>
      <h1 className={styles.title}>{topic.title}</h1>
      {topic.description ? <p className={styles.lede}>{topic.description}</p> : null}

      <LessonRunner
        topicId={topic.id}
        title={topic.title}
        subject={topic.subject}
        description={topic.description}
        previousScore={topic.completed ? topic.quiz_score : null}
      />
    </>
  );
}
