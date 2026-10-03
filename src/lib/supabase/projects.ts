import { logStage, logStageError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import type { Project, ProjectCard } from "@/types/project";

export type ProjectListResult = {
  projects: ProjectCard[];
  /** Set when the read failed, so the page can explain instead of crashing. */
  error: string | null;
};

/**
 * Lists the signed-in user's projects, newest first.
 *
 * The `.eq("owner_id", ...)` filter is redundant next to the select policy,
 * which already limits visible rows to the caller's own. It stays so the query
 * is explicit and remains correct if the policies are ever loosened.
 */
export async function listProjects(): Promise<ProjectListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { projects: [], error: null };

  const { data, error } = await supabase
    .from("projects")
    .select("id, title, status, difficulty, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .returns<ProjectCard[]>();

  if (error) {
    logStageError("projects", "list", error, { userId: user.id });
    return { projects: [], error: error.message };
  }

  logStage("projects", "list", { userId: user.id, count: data?.length ?? 0 });
  return { projects: data ?? [], error: null };
}

/**
 * Loads one project by id, or null if it does not exist — or belongs to someone
 * else, which RLS makes indistinguishable from missing. That is the desired
 * behaviour: a stranger's project should 404, not 403, so ids cannot be probed.
 */
export async function getProject(id: string): Promise<Project | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle<Project>();

  if (error) {
    logStageError("projects", "read", error, { id, userId: user.id });
    return null;
  }

  // Null with no error: a wrong id, or someone else's project hidden by RLS.
  if (!data) logStage("projects", "read.not-found", { id, userId: user.id });
  return data;
}
