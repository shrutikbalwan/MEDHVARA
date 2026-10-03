import Link from "next/link";
import type { Metadata } from "next";

import { Calculators } from "@/components/tools/Calculators";

import styles from "../app.module.css";

export const metadata: Metadata = { title: "Calculators · MEDHVARA" };

/**
 * Everyday electronics calculators. They run entirely in the browser on the
 * same verified engine the chat tutor uses, so they cost no daily messages.
 * The signed-in gate is src/app/(app)/layout.tsx.
 */
export default function ToolsPage() {
  return (
    <>
      <h1 className={styles.title}>Calculators</h1>
      <p className={styles.lede}>
        Quick, exact answers for everyday electronics. Type values the way you write them —{" "}
        <code>4.7k</code>, <code>100nF</code>, <code>20mA</code>. Need it explained?{" "}
        <Link href="/chat" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
          Ask MEDHVARA
        </Link>
        .
      </p>
      <Calculators />
    </>
  );
}
