import { NextResponse, type NextRequest } from "next/server";

import { CHAT_HISTORY_TURNS, CHAT_SYSTEM_PROMPT } from "@/config/prompts";
import { claimDailyMessage } from "@/lib/daily-quota";
import { createChatCompletion, GroqError, type ChatMessage } from "@/lib/groq";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/usage";

/** Route handlers are uncached for POST, but be explicit about it. */
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 4000;

type StoredMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 1. Identity. getUser() revalidates the token against the auth server rather
  //    than trusting the cookie, so this is safe as an access decision.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "You need to be signed in to chat." },
      { status: 401 },
    );
  }

  // 2. Input.
  let message: string;
  try {
    const body = await request.json();
    message = String(body?.message ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message is too long (limit ${MAX_MESSAGE_LENGTH} characters).` },
      { status: 400 },
    );
  }

  // 3. Quota — shared with /api/project-builder. Reserved BEFORE the AI call
  //    and released further down if the AI call fails.
  const quota = await claimDailyMessage(supabase, user.id);
  if (!quota.ok) return quota.response;

  // 4. Persist the user's message. RLS enforces that user_id is our own; the
  //    explicit value here is what satisfies the insert policy.
  const { error: userInsertError } = await supabase
    .from("messages")
    .insert({ user_id: user.id, role: "user", content: message });

  if (userInsertError) {
    logSupabaseError("messages insert (user) failed", userInsertError);
    await quota.release();
    return NextResponse.json(
      { error: "Could not save your message. Please try again." },
      { status: 500 },
    );
  }

  // 5. Recent history for context. Fetched newest-first to use the index, then
  //    reversed into chronological order for the model.
  const { data: history, error: historyError } = await supabase
    .from("messages")
    .select("role, content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(CHAT_HISTORY_TURNS)
    .returns<StoredMessage[]>();

  // Non-fatal: without history the model still answers, just without context.
  if (historyError) logSupabaseError("messages history read failed", historyError);

  const conversation: ChatMessage[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    ...(history ?? []).slice().reverse(),
  ];

  // 6. The AI call.
  let reply: string;
  try {
    reply = await createChatCompletion(conversation);
  } catch (error) {
    await quota.release();

    if (error instanceof GroqError) {
      // error.message is written to be safe to show; upstream detail is logged,
      // not returned, so provider internals and the key never surface.
      return NextResponse.json(
        { error: `${error.message} Please try again in a moment.` },
        { status: error.status },
      );
    }

    console.error("Unexpected chat failure:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  // 7. Persist the reply. The user already has their answer at this point, so a
  //    write failure here is logged and reported without discarding the reply.
  const { error: replyInsertError } = await supabase
    .from("messages")
    .insert({ user_id: user.id, role: "assistant", content: reply });

  if (replyInsertError) {
    logSupabaseError("messages insert (assistant) failed", replyInsertError);
    return NextResponse.json({
      reply,
      warning: "Your reply was not saved to history.",
      usage: { used: quota.used, limit: quota.limit },
    });
  }

  return NextResponse.json({
    reply,
    usage: { used: quota.used, limit: quota.limit },
  });
}
