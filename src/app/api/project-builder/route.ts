import { NextResponse, type NextRequest } from "next/server";

import { DAILY_MESSAGE_LIMIT, PROJECT_BUILDER_SYSTEM_PROMPT } from "@/config/prompts";
import { createChatCompletion, GroqError, type ChatMessage } from "@/lib/groq";
import { parseProjectPlan } from "@/lib/project-plan";
import { createClient } from "@/lib/supabase/server";
import { releaseDailySlot, reserveDailySlot } from "@/lib/supabase/usage";

export const dynamic = "force-dynamic";

const MAX_IDEA_LENGTH = 2000;
/** One retry only. Each attempt costs a Groq call but not a second quota slot. */
const MAX_ATTEMPTS = 2;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 1. Identity — getUser() revalidates against the auth server rather than
  //    trusting the cookie.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "You need to be signed in to build a project plan." },
      { status: 401 },
    );
  }

  // 2. Input.
  let idea: string;
  try {
    const body = await request.json();
    idea = String(body?.idea ?? body?.message ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!idea) {
    return NextResponse.json(
      { error: "Describe your project idea first." },
      { status: 400 },
    );
  }
  if (idea.length > MAX_IDEA_LENGTH) {
    return NextResponse.json(
      { error: `Idea is too long (limit ${MAX_IDEA_LENGTH} characters).` },
      { status: 400 },
    );
  }

  // 3. Quota — the same daily allowance as /api/chat, sharing one counter, so a
  //    student cannot get 30 chats *and* 30 plans out of a 30-message budget.
  const reservation = await reserveDailySlot(supabase, user.id, DAILY_MESSAGE_LIMIT);

  if (!reservation.ok) {
    // Exact Postgres code/message/details/hint already logged by the helper.
    return NextResponse.json(
      { error: "Could not check your daily usage. Please try again." },
      { status: 500 },
    );
  }

  if (!reservation.allowed) {
    return NextResponse.json(
      {
        error: `You have reached your daily limit of ${DAILY_MESSAGE_LIMIT} messages. Please try again tomorrow.`,
        limit: DAILY_MESSAGE_LIMIT,
        used: reservation.used,
      },
      { status: 429 },
    );
  }

  // 4. Generate, validate, and retry once if the shape is wrong.
  const messages: ChatMessage[] = [
    { role: "system", content: PROJECT_BUILDER_SYSTEM_PROMPT },
    { role: "user", content: idea },
  ];

  let lastReason = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw: string;
    try {
      raw = await createChatCompletion(messages, {
        json: true,
        // Low temperature: this is a structured extraction task, not creative
        // writing, and it makes the schema far more stable.
        temperature: 0.3,
        maxTokens: 2048,
      });
    } catch (error) {
      await releaseDailySlot(supabase, user.id);

      if (error instanceof GroqError) {
        return NextResponse.json(
          { error: `${error.message} Please try again in a moment.` },
          { status: error.status },
        );
      }
      console.error("Unexpected project-builder failure:", error);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 },
      );
    }

    const result = parseProjectPlan(raw);
    if (result.ok) {
      return NextResponse.json({
        plan: result.plan,
        usage: { used: reservation.used, limit: DAILY_MESSAGE_LIMIT },
      });
    }

    lastReason = result.reason;
    console.error(
      `[project-builder] attempt ${attempt}/${MAX_ATTEMPTS} rejected: ${lastReason}\n` +
        `  raw (first 500 chars): ${raw.slice(0, 500)}`,
    );

    if (attempt < MAX_ATTEMPTS) {
      // Feed the bad output back with the specific complaint. A targeted
      // correction works far better than resending the same prompt blind.
      messages.push({ role: "assistant", content: raw.slice(0, 4000) });
      messages.push({
        role: "user",
        content: `That response was rejected: ${lastReason}. Return ONLY the corrected JSON object with every required key, arrays as arrays of plain strings, and difficulty exactly Easy, Medium, or Hard.`,
      });
    }
  }

  // Both attempts produced unusable output — the user got nothing, so give the
  // slot back rather than charging them for it.
  await releaseDailySlot(supabase, user.id);

  return NextResponse.json(
    {
      error:
        "The AI could not produce a valid project plan. Try rephrasing your idea with a bit more detail.",
    },
    { status: 502 },
  );
}
