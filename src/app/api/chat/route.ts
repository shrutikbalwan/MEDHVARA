import { NextResponse, type NextRequest } from "next/server";

import { CHAT_HISTORY_TURNS, CHAT_SYSTEM_PROMPT } from "@/config/prompts";
import { claimDailyMessage } from "@/lib/daily-quota";
import { runTutorTool, TUTOR_TOOLS, type ToolRun } from "@/lib/calculators/tutor-tools";
import { createToolChatCompletion, GroqError, type ChatMessage } from "@/lib/groq";
import { logStage, logStageError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

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
    logStageError("chat", "auth", authError ?? { message: "no user in session" });
    return NextResponse.json(
      { error: "You need to be signed in to chat.", stage: "auth" },
      { status: 401 },
    );
  }

  // 2. Input.
  let message: string;
  try {
    const body = await request.json();
    message = String(body?.message ?? "").trim();
  } catch (error) {
    logStageError("chat", "input.parse", error, { userId: user.id });
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
  logStage("chat", "start", { userId: user.id, length: message.length });
  const quota = await claimDailyMessage(supabase, user.id, "chat");
  if (!quota.ok) return quota.response;

  // 4. Persist the user's message. RLS enforces that user_id is our own; the
  //    explicit value here is what satisfies the insert policy.
  const { error: userInsertError } = await supabase
    .from("messages")
    .insert({ user_id: user.id, role: "user", content: message });

  if (userInsertError) {
    logStageError("chat", "messages.insert-user", userInsertError, { userId: user.id });
    await quota.release();
    return NextResponse.json(
      {
        error: "Could not save your message. Please try again.",
        stage: "messages.insert-user",
        code: userInsertError.code,
      },
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
  if (historyError) {
    logStageError("chat", "messages.history", historyError, { userId: user.id });
  }

  const conversation: ChatMessage[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    ...(history ?? []).slice().reverse(),
  ];

  // 6. The AI call.
  logStage("chat", "ai.request", { userId: user.id, turns: conversation.length - 1 });
  // The model may call the verified calculators; every run is kept so the
  // real working can be shown under the reply.
  const toolRuns: ToolRun[] = [];
  let reply: string;
  try {
    reply = await createToolChatCompletion(conversation, {
      tools: TUTOR_TOOLS,
      runTool: (call) => {
        const run = runTutorTool(call.function.name, call.function.arguments);
        toolRuns.push(run);
        logStage("chat", "ai.tool", {
          userId: user.id,
          tool: run.name,
          ok: run.ok,
          ...(run.ok ? {} : { error: run.error }),
        });
        return {
          content: JSON.stringify(
            run.ok ? { result: run.result, summary: run.summary } : { error: run.error },
          ),
        };
      },
    });
  } catch (error) {
    await quota.release();

    if (error instanceof GroqError) {
      // error.message is written to be safe to show; upstream detail is logged,
      // not returned, so provider internals and the key never surface.
      logStageError("chat", "ai.request", error, { userId: user.id, status: error.status });
      return NextResponse.json(
        { error: `${error.message} Please try again in a moment.`, stage: "ai.request" },
        { status: error.status },
      );
    }

    // Includes a missing GROQ_API_KEY, which getGroqApiKey() throws as a plain Error.
    logStageError("chat", "ai.unexpected", error, { userId: user.id });
    return NextResponse.json(
      { error: "Something went wrong. Please try again.", stage: "ai.unexpected" },
      { status: 500 },
    );
  }

  // Append the calculations exactly as the engine produced them, so the
  // numbers the student relies on never depend on the model copying them
  // correctly. Stored with the reply, so history shows them too.
  const calculations = toolRuns.flatMap((run) => (run.ok ? [run.summary] : []));
  const uniqueCalculations = [...new Set(calculations)];
  if (uniqueCalculations.length > 0) {
    reply += `\n\n🧮 Calculated by MEDHVARA:\n${uniqueCalculations.map((line) => `• ${line}`).join("\n")}`;
  }

  // 7. Persist the reply. The user already has their answer at this point, so a
  //    write failure here is logged and reported without discarding the reply.
  const { error: replyInsertError } = await supabase
    .from("messages")
    .insert({ user_id: user.id, role: "assistant", content: reply });

  if (replyInsertError) {
    logStageError("chat", "messages.insert-assistant", replyInsertError, { userId: user.id });
    return NextResponse.json({
      reply,
      warning: "Your reply was not saved to history.",
      usage: { used: quota.used, limit: quota.limit },
    });
  }

  logStage("chat", "done", { userId: user.id, used: quota.used });
  return NextResponse.json({
    reply,
    usage: { used: quota.used, limit: quota.limit },
  });
}
