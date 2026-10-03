import assert from "node:assert/strict";
import test from "node:test";

import { QUESTION_BANK } from "@/lib/quiz/bank";
import { checkAnswer, instantiate, parseAnswer } from "@/lib/quiz/engine";
import { matchQuestions, pickComputedQuestion } from "@/lib/quiz/pick";

test("every bank question gives a valid prompt and an exact, checkable answer", () => {
  for (const question of QUESTION_BANK) {
    for (let seed = 1; seed <= 200; seed++) {
      const instance = instantiate(question, seed);
      const where = `${question.id} seed ${seed}`;
      assert.ok(Number.isFinite(instance.answer), `${where}: answer is finite`);
      assert.doesNotMatch(instance.prompt, /NaN|undefined/, `${where}: prompt`);
      assert.ok(checkAnswer(instance, instance.answer).correct, `${where}: exact answer accepted`);
      assert.ok(checkAnswer(instance, String(instance.answer)).correct, `${where}: typed answer accepted`);
      const wrong = instance.answer === 0 ? 1 : instance.answer * (1 + Math.max(0.1, instance.tolerance * 3));
      assert.equal(checkAnswer(instance, wrong).correct, false, `${where}: wrong answer rejected`);
    }
  }
});

test("answers are parsed the way students type them", () => {
  assert.equal(parseAnswer("4.7k"), 4700);
  assert.ok(Math.abs(parseAnswer("2.2 µF")! - 2.2e-6) < 1e-18);
  assert.equal(parseAnswer("abc"), null);
  const led = instantiate(QUESTION_BANK.find((q) => q.id === "led")!, 7);
  assert.ok(checkAnswer(led, `${led.answer / 1000}k`).correct);
  assert.equal(checkAnswer(led, "abc").invalid, true);
});

test("each attempt gets fresh numbers; the same seed repeats exactly", () => {
  const topic = { title: "Ohm's law" };
  assert.equal(pickComputedQuestion(topic, 42)!.prompt, pickComputedQuestion(topic, 42)!.prompt);
  const prompts = new Set(Array.from({ length: 20 }, (_, i) => pickComputedQuestion(topic, i + 1)!.prompt));
  assert.ok(prompts.size > 5);
});

test("topics map to fitting questions, and to none when nothing fits", () => {
  const expectations: [string, string][] = [
    ["Ohm’s Law", "ohm"], ["Voltage divider", "vdiv"], ["RC circuits", "tau"], ["LED basics", "led"],
    ["Resistor colour codes", "colour-code"], ["555 timer", "555"], ["Op-amps", "inv-gain"],
    ["Rectifiers and power supplies", "ripple"], ["PWM with Arduino", "pwm"], ["ADC and sensors", "lsb"],
    ["UART communication", "uart"], ["I²C protocol", "i2c"], ["Flip-flops and counters", "counter"],
    ["Sampling and Nyquist", "nyquist"], ["Battery life of IoT devices", "battery"],
  ];
  for (const [title, id] of expectations) {
    assert.ok(matchQuestions({ title }).some((q) => q.id === id), `${title} should match ${id}`);
  }
  // Word boundaries: no false positives.
  assert.ok(!matchQuestions({ title: "Controlled sources" }).some((q) => q.id === "led"));
  assert.ok(!matchQuestions({ title: "Source transformation" }).some((q) => q.id === "tau"));
  assert.deepEqual(matchQuestions({ title: "555 timer" }).map((q) => q.id), ["555"]);
  // No numeric fit → the AI quiz is left alone.
  for (const title of ["MQTT basics", "Wi-Fi with ESP32", "Cloud dashboards"]) {
    assert.equal(pickComputedQuestion({ title }, 1), null, title);
  }
});
