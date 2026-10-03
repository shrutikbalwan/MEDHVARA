import assert from "node:assert/strict";
import test from "node:test";

import { isProfileComplete, normaliseProfile } from "@/lib/supabase/profile";
import type { Profile } from "@/types/database";

// Regression: the bare row ensureProfileRow() creates for a new account has
// NULL interests/skills, and /profile/edit crashed on `.join` (HTTP 500).
test("a bare auto-created profile row is safe to render", () => {
  const bare = { id: "u1", user_id: "u1", name: null, college: null, branch: null, year: null, interests: null, skills: null, bio: null, photo_url: null, created_at: "" } as unknown as Profile;
  const profile = normaliseProfile(bare)!;
  assert.deepEqual(profile.interests, []);
  assert.deepEqual(profile.skills, []);
  assert.equal(profile.interests.join(", "), "");
  assert.equal(isProfileComplete(profile), false, "a nameless row still reads as a profile to create");
});

test("real values pass through untouched", () => {
  const full = { id: "p", user_id: "u", name: "Asha", college: null, branch: null, year: null, interests: ["IoT"], skills: ["C"], bio: null, photo_url: null, created_at: "" } as Profile;
  assert.deepEqual(normaliseProfile(full), full);
  assert.equal(normaliseProfile(null), null);
});
