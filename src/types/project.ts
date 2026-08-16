import type { Difficulty } from "@/types/project-plan";

export const PROJECT_STATUSES = [
  "Idea",
  "Planning",
  "Building",
  "Testing",
  "Completed",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const DEFAULT_PROJECT_STATUS: ProjectStatus = "Idea";

/**
 * A row of public.projects.
 *
 * `status` and `difficulty` are plain text columns in the database, so a row
 * written before these lists existed can hold anything. Both are typed loosely
 * here and narrowed at the point of use rather than assumed.
 */
export type Project = {
  id: string;
  owner_id: string;
  title: string;
  problem_statement: string | null;
  architecture_overview: string | null;
  objectives: string[];
  components: string[];
  technologies: string[];
  development_steps: string[];
  subjects_to_learn_first: string[];
  difficulty: Difficulty | string | null;
  status: ProjectStatus | string | null;
  notes: string | null;
  created_at: string;
};

/** Columns needed for a list card — cheaper than selecting whole rows. */
export type ProjectCard = Pick<
  Project,
  "id" | "title" | "status" | "difficulty" | "created_at"
>;
