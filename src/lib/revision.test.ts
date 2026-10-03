import assert from "node:assert/strict";
import test from "node:test";

import { pickRevisionTopics, STALE_AFTER_DAYS, type ProgressRow } from "@/lib/revision";
import type { Topic } from "@/types/topic";

const now = new Date("2026-10-03T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const topic = (id: string): Topic => ({ id, subject: "Basic Electronics", title: id, description: null, order_index: null });
const row = (topic_id: string, quiz_score: number | null, days: number, completed = true): ProgressRow => ({
  topic_id, completed, quiz_score, updated_at: ago(days),
});

test("a new student, or one doing well recently, has nothing to revise", () => {
  const topics = ["a", "b"].map(topic);
  assert.deepEqual(pickRevisionTopics(topics, [], now), []);
  assert.deepEqual(pickRevisionTopics(topics, [row("a", 3, 1), row("b", 2, STALE_AFTER_DAYS - 1)], now), []);
});

test("low scores come first (lowest, then oldest), then stale topics (oldest first)", () => {
  const topics = ["s1", "s2", "low1", "low0", "low1old", "fine"].map(topic);
  const picked = pickRevisionTopics(
    topics,
    [
      row("s1", 3, 20),
      row("s2", 2, 40),
      row("low1", 1, 1),
      row("low0", 0, 2),
      row("low1old", 1, 9),
      row("fine", 3, 2),
    ],
    now,
    10,
  );
  assert.deepEqual(picked.map((i) => i.topic.id), ["low0", "low1old", "low1", "s2", "s1"]);
  assert.deepEqual(
    picked.map((i) => i.reason),
    ["low_score", "low_score", "low_score", "stale", "stale"],
  );
  assert.equal(picked[3].daysSince, 40);
});

test("limits to three by default and ignores unfinished or deleted topics", () => {
  const topics = ["a", "b", "c", "d", "e"].map(topic);
  const picked = pickRevisionTopics(
    topics,
    [
      row("a", 0, 1), row("b", 0, 1), row("c", 0, 1), row("d", 0, 1),
      row("e", 0, 1, false),
      row("gone", 0, 1),
    ],
    now,
  );
  assert.equal(picked.length, 3);
  assert.ok(picked.every((i) => i.topic.id !== "e" && i.topic.id !== "gone"));
});

test("a missing date or score never crashes", () => {
  const picked = pickRevisionTopics(
    [topic("a"), topic("b")],
    [
      { topic_id: "a", completed: true, quiz_score: 0, updated_at: null },
      { topic_id: "b", completed: true, quiz_score: null, updated_at: "not a date" },
    ],
    now,
  );
  assert.deepEqual(picked.map((i) => [i.topic.id, i.daysSince]), [["a", null]]);
});
