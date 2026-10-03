"use server";

import { getOwnedBadges } from "@/lib/badges";
import { createClient } from "@/lib/supabase/server";
import type { Badge } from "@/types/badge";

/**
 * Resolves badge ids from the URL into the signed-in user's own badges, for
 * the "Badge earned" toast. Ids the user does not hold are dropped.
 */
export async function loadEarnedBadges(ids: string[]): Promise<Badge[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !Array.isArray(ids)) return [];
  return getOwnedBadges(user.id, ids.map(String).slice(0, 20));
}
