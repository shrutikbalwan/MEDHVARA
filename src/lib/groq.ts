import { getGroqApiKey } from "@/config/env.server";
import { logStageError } from "@/lib/log";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const REQUEST_TIMEOUT_MS = 30_000;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Thrown for any failure reaching or parsing Groq, with a status to map to. */
export class GroqError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GroqError";
  }
}

/**
 * Calls Groq's OpenAI-compatible chat completions endpoint.
 *
 * This module must only ever be imported from server code — it reads the API
 * key, and importing it from a Client Component would be a leak.
 */
export type CompletionOptions = {
  /**
   * Groq's JSON mode. Constrains decoding to syntactically valid JSON, which
   * removes prose and code fences at the source. Verified supported on
   * llama-3.3-70b-versatile. It does NOT guarantee the *shape* is right, so
   * callers must still validate fields.
   */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
};

export async function createChatCompletion(
  messages: ChatMessage[],
  options: CompletionOptions = {},
): Promise<string> {
  const apiKey = getGroqApiKey();
  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

  let response: Response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1024,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
      cache: "no-store",
      // Without this, a hung upstream request holds the route open indefinitely.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    logStageError("groq", timedOut ? "request.timeout" : "request.network", error, { model });
    throw new GroqError(
      timedOut ? "The AI request timed out." : "Could not reach the AI service.",
      504,
      true,
    );
  }

  if (!response.ok) {
    // Body is read for logging only. It can quote the request and is never
    // returned to the browser verbatim.
    const detail = await response.text().catch(() => "");
    logStageError(
      "groq",
      "request.http",
      { code: String(response.status), message: detail.slice(0, 500) },
      { model },
    );

    if (response.status === 429) {
      throw new GroqError("The AI service is rate limited right now.", 429, true);
    }
    if (response.status === 401 || response.status === 403) {
      // A bad key is a server misconfiguration, not something the user can fix.
      throw new GroqError("The AI service rejected our credentials.", 500, false);
    }
    throw new GroqError("The AI service returned an error.", 502, response.status >= 500);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    logStageError("groq", "response.parse", error, { model });
    throw new GroqError("The AI service returned an unreadable response.", 502, true);
  }

  const content = (payload as { choices?: { message?: { content?: string } }[] })
    ?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    logStageError("groq", "response.empty", { message: "no choices[0].message.content" }, { model });
    throw new GroqError("The AI service returned an empty response.", 502, true);
  }

  return content.trim();
}
