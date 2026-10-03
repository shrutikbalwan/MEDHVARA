import { NextResponse } from "next/server";

import { DAILY_MESSAGE_LIMIT } from "@/config/prompts";
import { logStage } from "@/lib/log";
import { ensureProfileRow } from "@/lib/supabase/profile";
import type { createClient } from "@/lib/supabase/server";
import { releaseDailySlot, reserveDailySlot } from "@/lib/supabase/usage";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type QuotaClaim =
  | {
      ok: true;
      used: number;
      limit: number;
      /** Gives the slot back. Safe to call more than once; only the first counts. */
      release: () => Promise<void>;
    }
  | { ok: false; response: NextResponse };

/**
 * The one daily-allowance path shared by /api/chat and /api/project-builder.
 * Both draw from the same counter, so a student cannot get 30 chats *and* 30
 * plans out of a 30-message budget.
 *
 * On refusal it returns the finished response, so a route only has to return
 * it. On success the caller must call `release()` if the AI step fails, so a
 * provider outage does not eat the user's allowance.
 */
export async function claimDailyMessage(
  supabase: ServerClient,
  userId: string,
  /** Log prefix of the calling route, e.g. "chat". */
  scope: string,
): Promise<QuotaClaim> {
  logStage(scope, "quota.ensure-profile", { userId });
  // A brand-new account has no profiles row, and daily_usage references
  // profiles. Non-fatal: if this fails, the reservation below fails too and
  // logs the precise cause.
  await ensureProfileRow(supabase, userId);

  logStage(scope, "quota.reserve", { userId });
  const reservation = await reserveDailySlot(supabase, userId, DAILY_MESSAGE_LIMIT);

  if (!reservation.ok) {
    // The full Postgres detail is already on the server console. The client
    // gets a generic sentence plus the stage and code, which name the cause
    // without exposing database internals.
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Could not check your daily usage. Please try again.",
          stage: `quota:${reservation.stage}`,
          code: reservation.error.code,
        },
        { status: 500 },
      ),
    };
  }

  if (!reservation.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `You have reached your daily limit of ${DAILY_MESSAGE_LIMIT} messages. Please try again tomorrow.`,
          limit: DAILY_MESSAGE_LIMIT,
          used: reservation.used,
        },
        { status: 429 },
      ),
    };
  }

  let released = false;
  return {
    ok: true,
    used: reservation.used,
    limit: DAILY_MESSAGE_LIMIT,
    release: async () => {
      // A double release would hand the user a free message.
      if (released) return;
      released = true;
      logStage(scope, "quota.release", { userId });
      await releaseDailySlot(supabase, userId);
    },
  };
}
