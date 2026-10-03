"use server";

import { revalidatePath } from "next/cache";

import { recordActivity } from "@/lib/activity";
import { checkAndAwardBadges } from "@/lib/badges";
import { logStage, logStageError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PROJECT_STATUS,
  PROJECT_STATUSES,
  type ProjectStatus,
} from "@/types/project";
import type { Badge } from "@/types/badge";
import { DIFFICULTIES, type Difficulty } from "@/types/project-plan";

export type SaveProjectInput = {
  title: string;
  problem_statement: string;
  architecture_overview: string;
  objectives: string[];
  components: string[];
  technologies: string[];
  development_steps: string[];
  subjects_to_learn_first: string[];
  difficulty: string;
};

export type SaveProjectResult =
  | { ok: true; id: string; newBadges: Badge[] }
  | { ok: false; error: string };

const MAX_ITEMS = 40;
const MAX_ITEM_LENGTH = 500;

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value ?? "").trim().slice(0, MAX_ITEM_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}

/**
 * Writes an edited plan to public.projects.
 *
 * Server Actions are reachable by direct POST, so every field is re-validated
 * here rather than trusting the form. owner_id comes from the verified session,
 * never from the payload — and the insert policy would reject a forged one.
 */
export async function saveProject(
  input: SaveProjectInput,
): Promise<SaveProjectResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "You need to be signed in to save a project." };
  }

  const title = String(input?.title ?? "").trim().slice(0, 200);
  if (!title) return { ok: false, error: "Give the project a title before saving." };

  const difficulty = DIFFICULTIES.includes(input?.difficulty as Difficulty)
    ? (input.difficulty as Difficulty)
    : null;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      // The column is owner_id on this table, not user_id.
      owner_id: user.id,
      title,
      problem_statement: String(input?.problem_statement ?? "").trim() || null,
      architecture_overview: String(input?.architecture_overview ?? "").trim() || null,
      objectives: cleanList(input?.objectives),
      components: cleanList(input?.components),
      technologies: cleanList(input?.technologies),
      development_steps: cleanList(input?.development_steps),
      subjects_to_learn_first: cleanList(input?.subjects_to_learn_first),
      difficulty,
      status: DEFAULT_PROJECT_STATUS,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    logStageError("projects", "insert", error, { userId: user.id });

    // 42703 = undefined_column: the 0004 migration has not been run yet.
    if (error.code === "42703") {
      return {
        ok: false,
        error:
          "The projects table is missing the plan columns. Run supabase/migrations/0004_projects_plan_columns.sql, then try again.",
      };
    }
    // 42501 = insufficient_privilege, i.e. an RLS policy refused the insert.
    if (error.code === "42501") {
      return {
        ok: false,
        error:
          "The database refused the save (row-level security). Check the projects policies in 0004_projects_plan_columns.sql.",
      };
    }
    return { ok: false, error: "Could not save the project. Please try again." };
  }

  logStage("projects", "insert", { id: data.id, userId: user.id });
  revalidatePath("/projects");
  await recordActivity(user.id, supabase);
  const newBadges = await checkAndAwardBadges(user.id, supabase);
  return { ok: true, id: data.id, newBadges };
}

/** Shared error mapping so every project write explains itself the same way. */
function describeWriteError(error: {
  code?: string;
  message: string;
}): string {
  if (error.code === "42703") {
    return "The projects table is missing the plan columns. Run supabase/migrations/0004_projects_plan_columns.sql, then try again.";
  }
  if (error.code === "42501") {
    return "The database refused the change (row-level security). Check the projects policies in 0004_projects_plan_columns.sql.";
  }
  // 23514 = check_violation: a status or difficulty value the table's own
  // constraint does not allow.
  if (error.code === "23514") {
    return "The database rejected one of the values (check constraint on status or difficulty).";
  }
  return "Could not save the change. Please try again.";
}

/**
 * PostgREST reports success for an update or delete that matched no rows —
 * which is exactly what an RLS refusal or a wrong id looks like. Without this
 * check the UI says "saved" while nothing changed.
 */
const NO_ROWS_ERROR =
  "That project was not changed: it does not exist, or the database did not let this account modify it.";

export type ProjectMutationResult = { ok: true } | { ok: false; error: string };

/** Status changes and edits can earn badges (e.g. reaching "Completed"). */
export type ProjectUpdateResult =
  | { ok: true; newBadges: Badge[] }
  | { ok: false; error: string };

/**
 * Updates only the status. Kept separate from the full edit so the dropdown can
 * save immediately without submitting every other field.
 */
export async function updateProjectStatus(
  id: string,
  status: string,
): Promise<ProjectUpdateResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "You need to be signed in." };
  }

  if (!PROJECT_STATUSES.includes(status as ProjectStatus)) {
    return { ok: false, error: "That is not a valid status." };
  }

  // The owner_id filter is belt-and-braces next to the update policy: RLS
  // already restricts which rows can be targeted.
  const { data, error } = await supabase
    .from("projects")
    .update({ status })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id");

  if (error) {
    logStageError("projects", "status-update", error, { id, status, userId: user.id });
    return { ok: false, error: describeWriteError(error) };
  }
  if (!data || data.length === 0) {
    logStageError("projects", "status-update", { code: "NO_ROWS", message: "update matched 0 rows" }, { id, status, userId: user.id });
    return { ok: false, error: NO_ROWS_ERROR };
  }

  logStage("projects", "status-update", { id, status, userId: user.id });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  const newBadges = await checkAndAwardBadges(user.id, supabase);
  return { ok: true, newBadges };
}

export type UpdateProjectInput = SaveProjectInput & { status: string };

/** Saves edits to every editable field of an existing project. */
export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<ProjectUpdateResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "You need to be signed in." };
  }

  const title = String(input?.title ?? "").trim().slice(0, 200);
  if (!title) return { ok: false, error: "Give the project a title before saving." };

  const difficulty = DIFFICULTIES.includes(input?.difficulty as Difficulty)
    ? (input.difficulty as Difficulty)
    : null;
  const status = PROJECT_STATUSES.includes(input?.status as ProjectStatus)
    ? (input.status as ProjectStatus)
    : DEFAULT_PROJECT_STATUS;

  const { data, error } = await supabase
    .from("projects")
    .update({
      title,
      problem_statement: String(input?.problem_statement ?? "").trim() || null,
      architecture_overview: String(input?.architecture_overview ?? "").trim() || null,
      objectives: cleanList(input?.objectives),
      components: cleanList(input?.components),
      technologies: cleanList(input?.technologies),
      development_steps: cleanList(input?.development_steps),
      subjects_to_learn_first: cleanList(input?.subjects_to_learn_first),
      difficulty,
      status,
    })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id");

  if (error) {
    logStageError("projects", "update", error, { id, userId: user.id });
    return { ok: false, error: describeWriteError(error) };
  }
  if (!data || data.length === 0) {
    logStageError("projects", "update", { code: "NO_ROWS", message: "update matched 0 rows" }, { id, userId: user.id });
    return { ok: false, error: NO_ROWS_ERROR };
  }

  logStage("projects", "update", { id, status, userId: user.id });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  const newBadges = await checkAndAwardBadges(user.id, supabase);
  return { ok: true, newBadges };
}

export async function deleteProject(id: string): Promise<ProjectMutationResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "You need to be signed in." };
  }

  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id");

  if (error) {
    logStageError("projects", "delete", error, { id, userId: user.id });
    return { ok: false, error: "Could not delete the project. Please try again." };
  }
  if (!data || data.length === 0) {
    logStageError("projects", "delete", { code: "NO_ROWS", message: "delete matched 0 rows" }, { id, userId: user.id });
    return { ok: false, error: NO_ROWS_ERROR };
  }

  logStage("projects", "delete", { id, userId: user.id });
  revalidatePath("/projects");
  return { ok: true };
}
