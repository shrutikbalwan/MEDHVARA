import assert from "node:assert/strict";
import test from "node:test";

import { runTutorTool, TUTOR_TOOLS } from "@/lib/calculators/tutor-tools";

const run = (name: string, args: object) => runTutorTool(name, JSON.stringify(args));

test("every declared tool has a runner", () => {
  for (const tool of TUTOR_TOOLS) {
    const result = runTutorTool(tool.function.name, "{}");
    assert.ok(result.ok || !/Unknown tool/.test(result.error), tool.function.name);
  }
});

test("tool summaries carry the engine's numbers and working", () => {
  const led = run("led_resistor", { supply: 5, forward_voltage: 2, current: "20mA" });
  assert.ok(led.ok);
  assert.match(led.summary, /\(5 V − 2 V\) ÷ 20 mA = 150 Ω/);
  assert.match(led.summary, /dissipates 60 mW/);

  const timer = run("timer_555_astable", { r1: "1k", r2: "10k", c: "10n" });
  assert.ok(timer.ok);
  assert.match(timer.summary, /6\.87 kHz/);

  const rc = run("rc_circuit", { resistance: "1k", capacitance: "1u" });
  assert.ok(rc.ok);
  assert.match(rc.summary, /159\.2 Hz/);
});

test("capacitors combine the opposite way to resistors", () => {
  const caps = run("series_parallel", { kind: "capacitor", values: ["100n", "100n"] });
  assert.ok(caps.ok);
  assert.match(caps.summary, /series = 50 nF, parallel = 200 nF/);
});

test("bad input comes back as a message for the model, never a throw", () => {
  const cases: [string, object | string, RegExp][] = [
    ["ohms_law", { voltage: 5 }, /exactly two/],
    ["led_resistor", { supply: 2, forward_voltage: 3, current: 0.02 }, /must exceed/],
    ["resistor_color_decode", { bands: ["gold", "red", "red", "gold"] }, /digit band/],
    ["timer_555_astable", { r1: "abc", r2: 1, c: 1 }, /not a number/],
    ["no_such_tool", {}, /Unknown tool/],
  ];
  for (const [name, args, message] of cases) {
    const result = run(name, args as object);
    assert.equal(result.ok, false, name);
    if (!result.ok) assert.match(result.error, message);
  }
  const badJson = runTutorTool("ohms_law", "{oops");
  assert.equal(badJson.ok, false);
});
