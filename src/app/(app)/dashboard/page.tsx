import Link from "next/link";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";

import styles from "../app.module.css";

export const metadata: Metadata = { title: "Dashboard · MEDHVARA" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <h1 className={styles.title}>Welcome back</h1>
      <p className={styles.lede}>
        Signed in as {user?.email}. Pick up where you left off.
      </p>

      <div className={styles.cards}>
        <Link href="/chat" className={styles.card}>
          <h2 className={styles.cardTitle}>Chat</h2>
          <p className={styles.cardBody}>Start or continue a conversation.</p>
        </Link>

        <Link href="/learn" className={styles.card}>
          <h2 className={styles.cardTitle}>Learn</h2>
          <p className={styles.cardBody}>Short lessons with a quiz, topic by topic.</p>
        </Link>

        <Link href="/projects" className={styles.card}>
          <h2 className={styles.cardTitle}>Projects</h2>
          <p className={styles.cardBody}>Organise your work into projects.</p>
        </Link>

        <Link href="/profile" className={styles.card}>
          <h2 className={styles.cardTitle}>Profile</h2>
          <p className={styles.cardBody}>Your college, skills, and interests.</p>
        </Link>
      </div>
    </>
  );
}
