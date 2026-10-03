import assert from "node:assert/strict";
import { afterEach } from "node:test";
import test from "node:test";

import { runTutorTool, TUTOR_TOOLS } from "@/lib/calculators/tutor-tools";
import { createToolChatCompletion, GroqError, type ToolCall } from "@/lib/groq";

type Request = { messages: { role: string; tool_call_id?: string; content: string | null }[]; tools?: unknown[]; tool_choice?: string };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replaces fetch with a scripted Groq; returns the requests it received. */
function fakeGroq(reply: (request: Request, index: number) => Response) {
  const seen: Request[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body)) as Request;
    seen.push(request);
    return reply(request, seen.length - 1);
  }) as typeof fetch;
  return seen;
}
const ok = (message: object) => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
const call = (id: string, name: string, args: object): ToolCall => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const runTool = (c: ToolCall) => {
  const r = runTutorTool(c.function.name, c.function.arguments);
  return { content: JSON.stringify(r.ok ? { result: r.result } : { error: r.error }) };
};
const messages = [{ role: "system" as const, content: "sys" }, { role: "user" as const, content: "q" }];

test("runs the requested tool and returns the model's final answer", async () => {
  const seen = fakeGroq((_, i) =>
    i === 0
      ? ok({ content: null, reasoning: "…", tool_calls: [call("c1", "led_resistor", { supply: 5, forward_voltage: 2, current: "20mA" })] })
      : ok({ content: "Use 150 Ω." }),
  );
  assert.equal(await createToolChatCompletion(messages, { tools: TUTOR_TOOLS, runTool }), "Use 150 Ω.");
  assert.equal(seen[0].tool_choice, "auto");
  const toolMessage = seen[1].messages.find((m) => m.role === "tool")!;
  assert.equal(toolMessage.tool_call_id, "c1");
  assert.equal(JSON.parse(toolMessage.content!).result.standard, 150);
  assert.ok(!seen[1].messages.some((m) => "reasoning" in m), "provider extras are not echoed back");
});

test("stops after three tool rounds and forces an answer", async () => {
  const seen = fakeGroq((request) =>
    request.tool_choice === "none"
      ? ok({ content: "Final." })
      : ok({ content: null, tool_calls: [call(`x${Math.random()}`, "adc_resolution", { bits: 10, reference: 5 })] }),
  );
  assert.equal(await createToolChatCompletion(messages, { tools: TUTOR_TOOLS, runTool, maxToolRounds: 3 }), "Final.");
  assert.equal(seen.length, 4);
  assert.ok(Array.isArray(seen[3].tools), "tools stay declared on the forced round");
});

test("falls back to a plain answer when the model rejects tools", async () => {
  const seen = fakeGroq((request) => (request.tools ? new Response("{}", { status: 400 }) : ok({ content: "Plain." })));
  assert.equal(await createToolChatCompletion(messages, { tools: TUTOR_TOOLS, runTool }), "Plain.");
  assert.equal(seen.length, 2);
});

test("rate limits surface as a GroqError with status 429", async () => {
  fakeGroq(() => new Response("busy", { status: 429 }));
  await assert.rejects(createToolChatCompletion(messages, { tools: TUTOR_TOOLS, runTool }), (error: unknown) => {
    return error instanceof GroqError && error.status === 429;
  });
});
