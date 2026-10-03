import assert from "node:assert/strict";
import test from "node:test";

import { activityDay } from "@/lib/activity";
import { getUserStats } from "@/lib/user-stats";
import { fakeSupabase } from "@/test/fake-supabase";

const U = "u1";

test("a brand-new user gets all zeros and no errors", async () => {
  const { client } = fakeSupabase();
  assert.deepEqual(await getUserStats(U, client), {
    topics_completed: 0, quizzes_taken: 0, projects_created: 0, projects_completed: 0, badges_earned: 0,
    current_streak: 0, community_questions: 0, community_answers: 0, projects_shared: 0, unavailable: [],
  });
});

test("counts only this user's rows", async () => {
  const { client } = fakeSupabase({
    topic_progress: [
      { user_id: U, completed: true, quiz_score: 3 }, { user_id: U, completed: true, quiz_score: 2 },
      { user_id: U, completed: false, quiz_score: null }, { user_id: "other", completed: true, quiz_score: 3 },
    ],
    projects: [{ owner_id: U, status: "Completed" }, { owner_id: U, status: "Building" }, { owner_id: "other", status: "Completed" }],
    user_badges: [{ user_id: U, badge_id: "a" }, { user_id: U, badge_id: "b" }, { user_id: "other", badge_id: "c" }],
    activity_log: [{ user_id: U, activity_date: activityDay() }],
  });
  const s = await getUserStats(U, client);
  assert.deepEqual(
    [s.topics_completed, s.quizzes_taken, s.projects_created, s.projects_completed, s.badges_earned, s.current_streak],
    [2, 2, 2, 1, 2, 1],
  );
});

test("a failed source zeroes only itself and is reported", async () => {
  const { client } = fakeSupabase({ projects: [{ owner_id: U, status: "Completed" }] }, ["user_badges", "activity_log"]);
  const s = await getUserStats(U, client);
  assert.equal(s.projects_completed, 1);
  assert.deepEqual(s.unavailable, ["badges", "streak"]);
});
