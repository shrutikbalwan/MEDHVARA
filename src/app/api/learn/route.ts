import { NextResponse, type NextRequest } from "next/server";

import { LEARN_SYSTEM_PROMPT } from "@/config/prompts";
import { claimDailyMessage } from "@/lib/daily-quota";
import { createChatCompletion, GroqError, type ChatMessage } from "@/lib/groq";
import { parseLesson } from "@/lib/lesson";
import { logStage, logStageError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { LESSON_LEVELS, type LessonLevel } from "@/types/lesson";

export const dynamic = "force-dynamic";

const MAX_TOPIC_LENGTH = 200;
/** One retry only. Each attempt costs a Groq call but not a second quota slot. */
const MAX_ATTEMPTS = 2;

/**
 * POST /api/learn  { topic: string, level: "beginner" | "intermediate", subject?: string }
 *   → { lesson: { explanation, example, quiz: [{ question, options, correct_answer }] }, usage }
 *
 * Same shape as /api/project-builder: auth, input, the shared daily allowance,
 * then generate → validate → one targeted retry.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 1. Identity — getUser() revalidates against the auth server rather than
  //    trusting the cookie.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    logStageError("learn", "auth", authError ?? { message: "no user in session" });
    return NextResponse.json(
      { error: "You need to be signed in to start a lesson.", stage: "auth" },
      { status: 401 },
    );
  }

  // 2. Input.
  let topic: string;
  let rawLevel: string;
  let subject: string;
  try {
    const body = await request.json();
    topic = String(body?.topic ?? body?.title ?? "").trim();
    rawLevel = String(body?.level ?? "").trim().toLowerCase();
    // Optional context: the same title can mean different things in
    // different subjects ("Filters" in Signals vs. in Electronics).
    subject = String(body?.subject ?? "").trim().slice(0, MAX_TOPIC_LENGTH);
  } catch (error) {
    logStageError("learn", "input.parse", error, { userId: user.id });
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!topic) {
    return NextResponse.json({ error: "Choose a topic first." }, { status: 400 });
  }
  if (topic.length > MAX_TOPIC_LENGTH) {
    return NextResponse.json(
      { error: `Topic is too long (limit ${MAX_TOPIC_LENGTH} characters).` },
      { status: 400 },
    );
  }
  if (!LESSON_LEVELS.includes(rawLevel as LessonLevel)) {
    return NextResponse.json(
      { error: `Level must be one of: ${LESSON_LEVELS.join(", ")}.` },
      { status: 400 },
    );
  }
  const level = rawLevel as LessonLevel;

  // 3. Quota — the same daily allowance as /api/chat, through the same helper.
  logStage("learn", "start", { userId: user.id, topic, level });
  const quota = await claimDailyMessage(supabase, user.id, "learn");
  if (!quota.ok) return quota.response;

  // 4. Generate, validate, and retry once if the shape is wrong.
  const messages: ChatMessage[] = [
    { role: "system", content: LEARN_SYSTEM_PROMPT },
    {
      role: "user",
      content: `${subject ? `Subject: ${subject}\n` : ""}Topic: ${topic}\nStudent level: ${level}`,
    },
  ];

  let lastReason = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    logStage("learn", "ai.request", { userId: user.id, attempt });
    let raw: string;
    try {
      raw = await createChatCompletion(messages, {
        json: true,
        // Low temperature: accuracy matters more than variety for teaching.
        temperature: 0.3,
        maxTokens: 2048,
      });
    } catch (error) {
      await quota.release();

      if (error instanceof GroqError) {
        logStageError("learn", "ai.request", error, {
          userId: user.id,
          attempt,
          status: error.status,
        });
        return NextResponse.json(
          { error: `${error.message} Please try again in a moment.`, stage: "ai.request" },
          { status: error.status },
        );
      }
      // Includes a missing GROQ_API_KEY, which getGroqApiKey() throws as a plain Error.
      logStageError("learn", "ai.unexpected", error, { userId: user.id, attempt });
      return NextResponse.json(
        { error: "Something went wrong. Please try again.", stage: "ai.unexpected" },
        { status: 500 },
      );
    }

    const result = parseLesson(raw);
    if (result.ok) {
      logStage("learn", "done", { userId: user.id, attempt, used: quota.used });
      return NextResponse.json({
        lesson: result.lesson,
        usage: { used: quota.used, limit: quota.limit },
      });
    }

    lastReason = result.reason;
    logStageError(
      "learn",
      "lesson.validate",
      { message: lastReason, details: `raw (first 500 chars): ${raw.slice(0, 500)}` },
      { userId: user.id, attempt: `${attempt}/${MAX_ATTEMPTS}` },
    );

    if (attempt < MAX_ATTEMPTS) {
      // Feed the bad output back with the specific complaint. A targeted
      // correction works far better than resending the same prompt blind.
      messages.push({ role: "assistant", content: raw.slice(0, 4000) });
      messages.push({
        role: "user",
        content: `That response was rejected: ${lastReason}. Return ONLY the corrected JSON object with "explanation", "example", and "quiz" holding exactly 3 questions, each with 4 plain-string options and a correct_answer copied exactly from its options.`,
      });
    }
  }

  // Both attempts produced unusable output — the user got nothing, so give the
  // slot back rather than charging them for it.
  await quota.release();

  return NextResponse.json(
    {
      error: "The AI could not produce a valid lesson. Try rephrasing the topic.",
      stage: "lesson.validate",
    },
    { status: 502 },
  );
}
