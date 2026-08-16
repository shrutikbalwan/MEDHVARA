import Link from "next/link";
import type { Metadata } from "next";

import { listProjects } from "@/lib/supabase/projects";

import styles from "../app.module.css";
import projectStyles from "./projects.module.css";

export const metadata: Metadata = { title: "Projects · MEDHVARA" };

// Per-user data that changes on every save; never serve it from cache.
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { projects, error } = await listProjects();

  return (
    <>
      <div className={projectStyles.headerRow}>
        <h1 className={styles.title}>Projects</h1>
        <Link href="/projects/new" className={projectStyles.newButton}>
          New project
        </Link>
      </div>

      {error ? (
        <p className={styles.placeholder}>
          Your projects could not be loaded right now. Please try again.
        </p>
      ) : projects.length === 0 ? (
        <p className={styles.placeholder}>
          No projects yet. Describe an idea and MEDHVARA will draft a plan you can
          edit and save.
        </p>
      ) : (
        <ul className={projectStyles.grid}>
          {projects.map((project) => (
            <li key={project.id}>
              <Link href={`/projects/${project.id}`} className={projectStyles.card}>
                <h2 className={projectStyles.cardTitle}>{project.title}</h2>
                <div className={projectStyles.badges}>
                  {project.status ? (
                    <span className={projectStyles.status}>{project.status}</span>
                  ) : null}
                  {project.difficulty ? (
                    <span className={projectStyles.difficulty}>
                      {project.difficulty}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
