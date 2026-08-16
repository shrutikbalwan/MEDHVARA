import type { PostgrestError } from "@supabase/supabase-js";

import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Logs every field PostgREST gives us. `error.message` alone frequently omits
 * the useful part — `code` and `details` are what identify a missing column, a
 * missing function, or an RLS refusal.
 */
export function logSupabaseError(context: string, error: PostgrestError | null) {
  if (!error) return;
  console.error(
    `[supabase] ${context}\n` +
      `  code:    ${error.code ?? "(none)"}\n` +
      `  message: ${error.message}\n` +
      `  details: ${error.details ?? "(none)"}\n` +
      `  hint:    ${error.hint ?? "(none)"}`,
  );
}

/** Today's date as YYYY-MM-DD in UTC, matching a Postgres `date` column. */
export function usageDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export type ReserveResult =
  | { ok: true; allowed: true; used: number }
  | { ok: true; allowed: false; used: number }
  | { ok: false; error: PostgrestError | { code: string; message: string } };

const MAX_ATTEMPTS = 3;

/**
 * Claims one message from today's allowance, creating the row if this is the
 * user's first message of the day.
 *
 * Two callers can race between the read and the write. The update is therefore
 * a compare-and-swap — it only matches while `message_count` is still the value
 * we read — and a concurrent insert is caught by the primary key as 23505. Both
 * cases retry, so a lost update cannot silently hand out a free message.
 *
 * A single atomic statement in the database would be better (see the note in
 * supabase/migrations/0003_usage_rpc.sql), but this needs no new SQL to work.
 */
export async function reserveDailySlot(
  supabase: ServerClient,
  userId: string,
  limit: number,
): Promise<ReserveResult> {
  const usageDate = usageDateToday();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: row, error: readError } = await supabase
      .from("daily_usage")
      .select("message_count")
      .eq("user_id", userId)
      .eq("usage_date", usageDate)
      .maybeSingle<{ message_count: number }>();

    if (readError) {
      logSupabaseError("daily_usage read failed", readError);
      return { ok: false, error: readError };
    }

    // First message today: create the row.
    if (!row) {
      const { error: insertError } = await supabase
        .from("daily_usage")
        .insert({ user_id: userId, usage_date: usageDate, message_count: 1 });

      if (!insertError) return { ok: true, allowed: true, used: 1 };

      // 23505 = unique_violation: a concurrent request inserted first. Re-read
      // and take the increment path instead.
      if (insertError.code === "23505") continue;

      logSupabaseError("daily_usage insert failed", insertError);
      return { ok: false, error: insertError };
    }

    if (row.message_count >= limit) {
      return { ok: true, allowed: false, used: row.message_count };
    }

    const { data: updated, error: updateError } = await supabase
      .from("daily_usage")
      .update({ message_count: row.message_count + 1 })
      .eq("user_id", userId)
      .eq("usage_date", usageDate)
      // Compare-and-swap: matches nothing if another request already bumped it.
      .eq("message_count", row.message_count)
      .select("message_count")
      .maybeSingle<{ message_count: number }>();

    if (updateError) {
      logSupabaseError("daily_usage increment failed", updateError);
      return { ok: false, error: updateError };
    }

    if (updated) return { ok: true, allowed: true, used: updated.message_count };
    // Zero rows matched — someone else incremented first. Retry.
  }

  const error = {
    code: "RESERVE_RETRY_EXHAUSTED",
    message: `Could not reserve a message slot after ${MAX_ATTEMPTS} attempts`,
  };
  console.error(`[usage] ${error.message} for user ${userId}`);
  return { ok: false, error };
}

/**
 * Gives back a slot after a failed AI call, so a provider outage does not eat
 * the user's daily allowance. Best effort: a failure here is logged, never
 * surfaced, since the user already has a more relevant error.
 */
export async function releaseDailySlot(
  supabase: ServerClient,
  userId: string,
): Promise<void> {
  const usageDate = usageDateToday();

  const { data: row, error: readError } = await supabase
    .from("daily_usage")
    .select("message_count")
    .eq("user_id", userId)
    .eq("usage_date", usageDate)
    .maybeSingle<{ message_count: number }>();

  if (readError) {
    logSupabaseError("daily_usage release read failed", readError);
    return;
  }
  if (!row || row.message_count <= 0) return;

  const { error: updateError } = await supabase
    .from("daily_usage")
    .update({ message_count: row.message_count - 1 })
    .eq("user_id", userId)
    .eq("usage_date", usageDate)
    .eq("message_count", row.message_count);

  if (updateError) logSupabaseError("daily_usage release failed", updateError);
}
