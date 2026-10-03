import assert from "node:assert/strict";
import test from "node:test";

import { activityDay, computeStreak, recordActivity } from "@/lib/activity";
import { fakeSupabase } from "@/test/fake-supabase";

test("streak counting", () => {
  const today = "2026-10-03";
  assert.equal(computeStreak([], today), 0);
  assert.equal(computeStreak([today], today), 1);
  assert.equal(computeStreak(["2026-10-01", "2026-10-02", today], today), 3);
  assert.equal(computeStreak(["2026-09-29", "2026-10-01", "2026-10-02", today], today), 3, "a gap breaks it");
  assert.equal(computeStreak(["2026-10-01", "2026-10-02"], today), 2, "still alive from yesterday");
  assert.equal(computeStreak(["2026-09-30", "2026-10-01"], today), 0, "dead after a missed day");
  assert.equal(computeStreak(["2025-12-30", "2025-12-31", "2026-01-01"], "2026-01-01"), 3, "across a year end");
  assert.equal(computeStreak(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-03-01"), 3, "across a leap day");
});

test("days are counted in India time, not UTC", () => {
  // 23:59 UTC on 2 Oct is already 3 Oct in India (UTC+5:30).
  assert.equal(activityDay(new Date("2026-10-02T23:59:00Z")), "2026-10-03");
  assert.equal(activityDay(new Date("2026-10-02T18:00:00Z")), "2026-10-02");
});

test("recordActivity keeps one row per day however often it runs", async () => {
  const { db, client } = fakeSupabase();
  await recordActivity("u1", client);
  await recordActivity("u1", client);
  await recordActivity("u1", client);
  assert.deepEqual(db.activity_log, [{ user_id: "u1", activity_date: activityDay() }]);
});

test("recordActivity never throws, even if the table is missing", async () => {
  const { client } = fakeSupabase({}, ["activity_log"]);
  await assert.doesNotReject(recordActivity("u1", client));
});
