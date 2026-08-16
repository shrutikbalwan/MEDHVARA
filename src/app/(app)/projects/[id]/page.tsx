import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ProjectDetail } from "@/components/projects/ProjectDetail";
import { getProject } from "@/lib/supabase/projects";

import styles from "../../app.module.css";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  return { title: project ? `${project.title} · MEDHVARA` : "Project · MEDHVARA" };
}

export default async function ProjectPage({ params }: PageProps) {
  // params is a Promise in Next 16 and must be awaited.
  const { id } = await params;
  const project = await getProject(id);

  // Someone else's project is invisible under RLS, so it reaches here as null
  // and 404s — the same response as a genuinely missing id, which is what stops
  // ids being probed for existence.
  if (!project) notFound();

  return (
    <>
      <Link href="/projects" className={styles.back}>
        ← All projects
      </Link>
      <h1 className={styles.title}>{project.title}</h1>
      <ProjectDetail project={project} />
    </>
  );
}
