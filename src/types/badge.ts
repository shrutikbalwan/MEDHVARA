/**
 * Badge ids the app knows how to award. Each must also exist as a row in
 * public.badges (user_badges.badge_id references badges.id) — see
 * supabase/migrations/0006_badges.sql, which seeds them.
 */
export const BADGE_IDS = [
  "first_profile",
  "first_lesson",
  "first_quiz",
  "five_lessons",
  "circuit_explorer",
  "embedded_explorer",
  "iot_explorer",
  "first_project",
  "project_builder",
  "project_finisher",
  "streak_7",
] as const;

export type BadgeId = (typeof BADGE_IDS)[number];

/** A row of public.badges, as shown in the "Badge earned" toast. */
export type Badge = {
  id: string;
  name: string;
  description: string;
  icon: string | null;
};

/** Query-string key that carries newly earned badge ids across a navigation. */
export const BADGES_PARAM = "badges";

/** "?badges=a,b" for a list of earned badges, or "" when there are none. */
export function badgesQuery(badges: Pick<Badge, "id">[]): string {
  if (badges.length === 0) return "";
  return `?${BADGES_PARAM}=${encodeURIComponent(badges.map((b) => b.id).join(","))}`;
}
