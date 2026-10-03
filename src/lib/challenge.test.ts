import assert from "node:assert/strict";
import test from "node:test";

import { activityDay } from "@/lib/activity";
import { challengeForDay, challengeQuestionIndex, dayNumber } from "@/lib/challenge";
import { QUESTION_BANK } from "@/lib/quiz/bank";
import { checkAnswer } from "@/lib/quiz/engine";
import { getDailyChallenge, resultFor } from "@/lib/supabase/challenge";
import { fakeSupabase } from "@/test/fake-supabase";

/** YYYY-MM-DD `n` days after 2026-01-01. */
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);

test("dayNumber counts calendar days", () => {
  assert.equal(dayNumber("1970-01-02"), 1);
  assert.equal(dayNumber(day(1)) - dayNumber(day(0)), 1);
  assert.equal(dayNumber("2026-03-01") - dayNumber("2026-02-28"), 1);
});

test("everyone gets the same question and numbers on the same day", () => {
  const a = challengeForDay("2026-10-03");
  const b = challengeForDay("2026-10-03");
  assert.deepEqual(a, b);
  assert.ok(a.prompt.length > 0);
});

test("every bank question comes up once per pass, and never two days running", () => {
  const length = QUESTION_BANK.length;
  const start = dayNumber(day(0));
  // Align to a pass boundary, then walk three whole passes.
  const first = Math.ceil(start / length) * length - start;
  const ids: number[] = [];
  for (let n = first; n < first + 3 * length; n++) ids.push(challengeQuestionIndex(day(n), length));
  for (let pass = 0; pass < 3; pass++) {
    const slice = ids.slice(pass * length, (pass + 1) * length);
    assert.equal(new Set(slice).size, length, `pass ${pass} repeats a question`);
  }
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1], `repeat on day ${i}`);
});

test("the computed answer checks as correct, and a wrong one does not", () => {
  for (let n = 0; n < 60; n++) {
    const challenge = challengeForDay(day(n));
    assert.ok(Number.isFinite(challenge.answer), `${challenge.id} has a finite answer`);
    assert.equal(checkAnswer(challenge, challenge.answer).correct, true, challenge.id);
    assert.equal(checkAnswer(challenge, challenge.answer * 3 + 1).correct, false, challenge.id);
  }
});

test("resultFor keeps the stored verdict and recomputes the key", () => {
  const challenge = challengeForDay(day(5));
  const result = resultFor(day(5), "1", false);
  assert.equal(result.correct, false);
  assert.equal(result.answer, "1");
  assert.equal(result.expected, checkAnswer(challenge, 0).expected);
});

test("getDailyChallenge: open today, then answered, and counts solved", async () => {
  const today = activityDay();
  const { db, client } = fakeSupabase({
    daily_challenge_attempts: [
      { user_id: "u1", challenge_date: "2026-01-01", correct: true, answer: "1" },
      { user_id: "u1", challenge_date: "2026-01-02", correct: false, answer: "1" },
      { user_id: "u2", challenge_date: today, correct: true, answer: "1" },
    ],
  });

  const open = await getDailyChallenge("u1", client);
  assert.ok(open.ok);
  assert.equal(open.day, today);
  assert.equal(open.attempt, null, "another user's answer is not ours");
  assert.equal(open.solved, 1);
  assert.ok(!("answer" in open), "the answer key is not sent before answering");

  db.daily_challenge_attempts.push({ user_id: "u1", challenge_date: today, correct: true, answer: "42" });
  const answered = await getDailyChallenge("u1", client);
  assert.ok(answered.ok && answered.attempt);
  assert.equal(answered.attempt.correct, true);
  assert.equal(answered.attempt.answer, "42");
  assert.equal(answered.solved, 2);
});

test("getDailyChallenge reports a missing table instead of throwing", async () => {
  const { client } = fakeSupabase({}, ["daily_challenge_attempts"]);
  assert.deepEqual(await getDailyChallenge("u1", client), { ok: false });
});
