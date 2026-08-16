import Link from "next/link";
import type { Metadata } from "next";

import { ProjectPlanBuilder } from "@/components/projects/ProjectPlanBuilder";

import styles from "../../app.module.css";

export const metadata: Metadata = { title: "New project · MEDHVARA" };

/**
 * The signed-in gate lives in src/app/(app)/layout.tsx, which redirects to
 * /login before this renders, with src/proxy.ts stopping the request earlier
 * still. Nothing here is reachable signed out.
 */
export default function NewProjectPage() {
  return (
    <>
      <h1 className={styles.title}>New project</h1>
      <p className={styles.lede}>
        Describe your idea and MEDHVARA will draft a plan you can edit before saving.
      </p>

      <ProjectPlanBuilder />

      <Link href="/projects" className={styles.back}>
        ← Back to projects
      </Link>
    </>
  );
}
