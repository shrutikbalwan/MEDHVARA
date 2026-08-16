import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PLACEHOLDER_MARKERS = ["your-project-ref", "your-supabase-anon-key"];

/**
 * Connection check for the Supabase setup: GET /api/health/supabase
 *
 * Reports only booleans, status codes, and error messages — never the key
 * itself. Safe to leave in place, but it is unauthenticated, so do not extend
 * it to echo configuration values.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      {
        ok: false,
        stage: "env",
        error: "NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in .env.local",
      },
      { status: 500 },
    );
  }

  if (PLACEHOLDER_MARKERS.some((marker) => url.includes(marker) || anonKey.includes(marker))) {
    return NextResponse.json(
      {
        ok: false,
        stage: "env",
        error: "Supabase env values are still the .env.example placeholders",
      },
      { status: 500 },
    );
  }

  // 1. Does the project URL resolve and does GoTrue accept the anon key?
  //    Note: the PostgREST root (`/rest/v1/`) is NOT usable here — Supabase
  //    restricts it to the service_role key and returns 401 for anon.
  let authStatus: number;
  try {
    const health = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      cache: "no-store",
    });
    authStatus = health.status;
    if (!health.ok) {
      return NextResponse.json(
        { ok: false, stage: "auth-health", status: health.status, error: await health.text() },
        { status: 502 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        stage: "auth-health",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }

  // 2. Does the cookie-backed server client construct and read auth state?
  //    No session is expected before sign-in; the point is that it does not throw.
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.getUser();
    const authReachable = !error || error.name === "AuthSessionMissingError";
    if (!authReachable) {
      return NextResponse.json(
        { ok: false, stage: "auth", error: error.message },
        { status: 502 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, stage: "auth", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }

  // 3. Is the profiles table present, with the columns the app queries?
  //    A missing table surfaces here as PGRST205 rather than as a 500 deep
  //    inside a page render.
  //
  //    Deliberately NOT `head: true`: a HEAD response carries no body, so
  //    PostgREST's error payload is lost and supabase-js reports success for a
  //    table that does not exist. Ask for real rows instead. RLS returns zero
  //    rows for an unauthenticated caller, which is fine — a missing table or
  //    column still errors, and that is what this checks.
  const supabase = await createClient();
  const { error: tableError } = await supabase
    .from("profiles")
    .select(
      "id, username, full_name, avatar_url, college, branch, year, interests, skills, bio, created_at, updated_at",
    )
    .limit(1);

  return NextResponse.json({
    ok: !tableError,
    authStatus,
    project: new URL(url).host,
    profilesTable: tableError
      ? { present: false, code: tableError.code, error: tableError.message }
      : { present: true },
  });
}
