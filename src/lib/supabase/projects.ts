import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/usage";
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
    logSupabaseError("projects list failed", error);
    return { projects: [], error: error.message };
  }

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
    logSupabaseError("project read failed", error);
    return null;
  }

  return data;
}
