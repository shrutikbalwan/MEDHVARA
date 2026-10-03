import assert from "node:assert/strict";
import test from "node:test";

import { parseLesson } from "@/lib/lesson";

const q = (n: number, answer: unknown, options: unknown = ["Volt", "Ampere", "Ohm", "Watt"]) => ({
  question: `Q${n}?`,
  options,
  correct_answer: answer,
});
const lesson = (quiz: unknown[], extra: object = {}) => JSON.stringify({ explanation: "e", example: "x", quiz, ...extra });

test("accepts clean, fenced and loosely formatted lessons", () => {
  const cases: [string, string, string[]][] = [
    ["clean", lesson([q(1, "Ohm"), q(2, "Volt"), q(3, "Watt")]), ["Ohm", "Volt", "Watt"]],
    ["fenced with prose", `Here you go:\n\`\`\`json\n${lesson([q(1, "C"), q(2, "b)"), q(3, 0)])}\n\`\`\``, ["Ohm", "Ampere", "Volt"]],
    ["A) prefixes", lesson([q(1, "C) Ohm", ["A) Volt", "B) Ampere", "C) Ohm", "D) Watt"]), q(2, "Volt"), q(3, "Watt")]), ["Ohm", "Volt", "Watt"]],
    ["extra broken question dropped", lesson([q(1, "Ohm"), q(2, "Henry"), q(3, "Volt"), q(4, "Watt")]), ["Ohm", "Volt", "Watt"]],
  ];
  for (const [name, raw, answers] of cases) {
    const result = parseLesson(raw);
    assert.ok(result.ok, name);
    if (result.ok) assert.deepEqual(result.lesson.quiz.map((x) => x.correct_answer), answers, name);
  }
});

test("rejects lessons that would give a wrong or incomplete quiz", () => {
  const cases: [string, string][] = [
    ["answer not among options", lesson([q(1, "Ohm"), q(2, "Henry"), q(3, "Volt")])],
    ["letter and text disagree", lesson([q(1, "A) Ohm"), q(2, "Volt"), q(3, "Watt")])],
    ["only two questions", lesson([q(1, "Ohm"), q(2, "Volt")])],
    ["missing example", JSON.stringify({ explanation: "e", quiz: [q(1, "Ohm"), q(2, "Volt"), q(3, "Watt")] })],
    ["not JSON", "Sorry, I can't."],
  ];
  for (const [name, raw] of cases) assert.equal(parseLesson(raw).ok, false, name);
});
