import { getGroqApiKey } from "@/config/env.server";
import { logStageError } from "@/lib/log";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const REQUEST_TIMEOUT_MS = 30_000;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** A function call the model asked for (OpenAI-compatible shape). */
export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/** Messages that only appear inside a tool-calling exchange. */
export type ToolLoopMessage =
  | ChatMessage
  | { role: "assistant"; content: string | null; tool_calls: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** Thrown for any failure reaching or parsing Groq, with a status to map to. */
export class GroqError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    /** Groq's own HTTP status, when the failure was an HTTP error response. */
    readonly upstreamStatus?: number,
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

type CompletionMessage = { content?: string | null; tool_calls?: ToolCall[] };

/** One request to Groq. Maps every failure to a GroqError; returns the first choice's message. */
async function requestCompletion(body: Record<string, unknown>): Promise<CompletionMessage> {
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
      body: JSON.stringify({ model, ...body }),
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
      throw new GroqError("The AI service is rate limited right now.", 429, true, 429);
    }
    if (response.status === 401 || response.status === 403) {
      // A bad key is a server misconfiguration, not something the user can fix.
      throw new GroqError("The AI service rejected our credentials.", 500, false, response.status);
    }
    throw new GroqError(
      "The AI service returned an error.",
      502,
      response.status >= 500,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    logStageError("groq", "response.parse", error, { model });
    throw new GroqError("The AI service returned an unreadable response.", 502, true);
  }

  return (payload as { choices?: { message?: CompletionMessage }[] })?.choices?.[0]?.message ?? {};
}

function requireContent(message: CompletionMessage): string {
  const content = message.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    logStageError("groq", "response.empty", { message: "no choices[0].message.content" }, {
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
    });
    throw new GroqError("The AI service returned an empty response.", 502, true);
  }
  return content.trim();
}

export async function createChatCompletion(
  messages: ChatMessage[],
  options: CompletionOptions = {},
): Promise<string> {
  const message = await requestCompletion({
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 1024,
    ...(options.json ? { response_format: { type: "json_object" } } : {}),
  });
  return requireContent(message);
}

export type ToolResult = { content: string };

export type ToolCompletionOptions = {
  tools: unknown[];
  /** Runs one requested call; its return value is sent back to the model as the tool result. */
  runTool: (call: ToolCall) => ToolResult;
  /** Model round trips that may request tools before a final answer is forced. */
  maxToolRounds?: number;
  temperature?: number;
  maxTokens?: number;
};

/**
 * A chat completion in which the model may call tools. Each round, any calls
 * it makes are run locally and their results sent back; when it stops asking
 * (or after maxToolRounds), its text answer is returned.
 *
 * If Groq rejects the request because the configured model does not support
 * tools (HTTP 400), falls back to a plain completion so chat keeps working.
 */
export async function createToolChatCompletion(
  messages: ChatMessage[],
  options: ToolCompletionOptions,
): Promise<string> {
  const { tools, runTool, maxToolRounds = 3, temperature = 0.4, maxTokens = 2048 } = options;
  const conversation: ToolLoopMessage[] = [...messages];

  for (let round = 0; ; round++) {
    // On the last round tool_choice "none" forces a text answer. The tool list
    // stays in the request: some providers reject tool results in the history
    // when no tools are declared.
    const allowTools = round < maxToolRounds;
    let message: CompletionMessage;
    try {
      message = await requestCompletion({
        messages: conversation,
        temperature,
        max_tokens: maxTokens,
        tools,
        tool_choice: allowTools ? "auto" : "none",
      });
    } catch (error) {
      if (round === 0 && error instanceof GroqError && error.upstreamStatus === 400) {
        logStageError("groq", "tools.unsupported", error, {
          model: process.env.GROQ_MODEL || DEFAULT_MODEL,
          fallback: "plain completion",
        });
        return createChatCompletion(messages, { temperature, maxTokens });
      }
      throw error;
    }

    const calls = allowTools ? (message.tool_calls ?? []) : [];
    if (calls.length === 0) return requireContent(message);

    // Echo only content + tool_calls back (not provider extras like reasoning).
    conversation.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
    for (const call of calls) {
      conversation.push({ role: "tool", tool_call_id: call.id, content: runTool(call).content });
    }
  }
}
