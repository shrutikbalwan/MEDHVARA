import { logStageError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

export type ChatMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

/** How much history the chat page renders on open. */
const HISTORY_LIMIT = 100;

export type ChatHistory = {
  messages: ChatMessageRow[];
  /** Set when history could not be read, so the page can say so instead of crashing. */
  error: string | null;
};

/**
 * Loads the signed-in user's chat history, oldest first.
 *
 * Fetched newest-first so the index on (user_id, created_at desc) is used and
 * the *most recent* 100 are kept, then reversed for display.
 *
 * A read failure is returned rather than thrown: an unreachable history table
 * should degrade to an empty transcript, not a 500 on a page the user can
 * otherwise still use.
 */
export async function getChatHistory(): Promise<ChatHistory> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { messages: [], error: null };

  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT)
    .returns<ChatMessageRow[]>();

  if (error) {
    logStageError("chat", "history.page-load", error, { userId: user.id });
    return { messages: [], error: error.message };
  }

  return { messages: (data ?? []).slice().reverse(), error: null };
}
