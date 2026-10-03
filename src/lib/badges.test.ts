import assert from "node:assert/strict";
import test from "node:test";

import { activityDay } from "@/lib/activity";
import { checkAndAwardBadges } from "@/lib/badges";
import { fakeSupabase } from "@/test/fake-supabase";
import { BADGE_IDS } from "@/types/badge";

const U = "u1";
const catalogue = BADGE_IDS.map((id) => ({ id, name: id, description: "", icon: null }));
const ids = async (client: never) => (await checkAndAwardBadges(U, client)).map((b) => b.id).sort();
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return activityDay(d);
};

test("a brand-new user earns nothing and nothing throws", async () => {
  const { client } = fakeSupabase({ badges: catalogue });
  assert.deepEqual(await ids(client), []);
});

test("an active user earns exactly the badges their data supports, once", async () => {
  const topics = [
    { id: "t1", subject: "Basic Electronics" }, { id: "t2", subject: "iot" },
    { id: "t3", subject: "Embedded Systems" }, { id: "t4", subject: "Signals" }, { id: "t5", subject: "Signals" },
  ];
  const { client } = fakeSupabase({
    badges: catalogue,
    topics,
    profiles: [{ user_id: U, name: "Shrutik" }],
    topic_progress: [
      ...topics.map((t) => ({ user_id: U, topic_id: t.id, completed: true, quiz_score: 2 })),
      { user_id: "someone-else", topic_id: "t1", completed: true, quiz_score: 3 },
    ],
    projects: [
      { owner_id: U, status: "Building" }, { owner_id: U, status: "Completed" }, { owner_id: U, status: null },
    ],
    user_badges: [{ user_id: U, badge_id: "first_profile" }],
  });
  assert.deepEqual(await ids(client), [
    "circuit_explorer", "embedded_explorer", "first_lesson", "first_project", "first_quiz",
    "five_lessons", "iot_explorer", "project_builder", "project_finisher",
  ]);
  assert.deepEqual(await ids(client), [], "a second check awards nothing new");
});

test("streak_7 needs seven consecutive days", async () => {
  const { db, client } = fakeSupabase({
    badges: catalogue,
    activity_log: [0, 1, 2, 3, 4, 5].map((n) => ({ user_id: U, activity_date: daysAgo(n) })),
  });
  assert.deepEqual(await ids(client), []);
  db.activity_log.push({ user_id: U, activity_date: daysAgo(6) });
  assert.deepEqual(await ids(client), ["streak_7"]);
});

test("a badge missing from the catalogue is skipped, not fatal", async () => {
  const { client } = fakeSupabase({
    badges: catalogue.filter((b) => b.id !== "first_project"),
    projects: [{ owner_id: U, status: "Idea" }],
    profiles: [{ user_id: U, name: "A" }],
  });
  assert.deepEqual(await ids(client), ["first_profile"]);
});

test("a failed read skips only the badges that depend on it", async () => {
  const { client } = fakeSupabase(
    {
      badges: catalogue,
      projects: [{ owner_id: U, status: "Idea" }],
      topic_progress: [{ user_id: U, topic_id: "t1", completed: true, quiz_score: 1 }],
    },
    ["topic_progress", "activity_log"],
  );
  assert.deepEqual(await ids(client), ["first_project"]);
});
