/**
 * Stage logging for server code.
 *
 * Every line names the area (`[chat]`, `[usage]`, ...) and the stage that ran,
 * so a failure in the server console reads as "this step, for this reason"
 * rather than a bare message. Server-only: these lines can carry user ids and
 * database detail that never belong in a browser.
 */

type ErrorLike = {
  code?: string | null;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

/** Plain-English causes for the codes this app actually meets. */
const KNOWN_CAUSES: Record<string, string> = {
  "42P01": "table does not exist",
  PGRST205: "table not found in the PostgREST schema cache (missing table, or schema not reloaded)",
  "42703": "column does not exist (a migration has not been run)",
  PGRST204: "column not found in the PostgREST schema cache (missing column, or schema not reloaded)",
  PGRST202: "database function not found in the PostgREST schema cache",
  PGRST116: "expected exactly one row but got zero or several",
  "42501": "row-level security refused the operation (missing or mismatched policy)",
  "23503": "foreign key violation: a row this one references does not exist (e.g. no profiles row)",
  "23505": "unique violation: the row already exists",
  "23502": "NOT NULL violation: a required column was left empty",
  "23514": "check constraint rejected a value",
  "22P02": "invalid input syntax (e.g. a malformed uuid)",
  "428C9": "tried to write a GENERATED ALWAYS column",
  "28000": "not authenticated in the database (no session reached Postgres)",
};

function describe(error: unknown): {
  code: string;
  cause: string;
  message: string;
  details: string;
  hint: string;
} {
  if (error && typeof error === "object") {
    const e = error as ErrorLike;
    const code = e.code ?? "";
    return {
      code: code || "(none)",
      cause: KNOWN_CAUSES[code] ?? (error instanceof Error ? error.name : "unrecognised error"),
      message: e.message ?? String(error),
      details: e.details ?? "(none)",
      hint: e.hint ?? "(none)",
    };
  }
  return {
    code: "(none)",
    cause: "non-object thrown",
    message: String(error),
    details: "(none)",
    hint: "(none)",
  };
}

function formatInfo(info?: Record<string, unknown>): string {
  if (!info) return "";
  return Object.entries(info)
    .map(([key, value]) => ` ${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("");
}

/** A stage that started or finished normally. */
export function logStage(scope: string, stage: string, info?: Record<string, unknown>) {
  console.info(`[${scope}] stage=${stage}${formatInfo(info)}`);
}

/** A stage that failed, with the code, a plain-English cause, and every field PostgREST gives. */
export function logStageError(
  scope: string,
  stage: string,
  error: unknown,
  info?: Record<string, unknown>,
) {
  const d = describe(error);
  console.error(
    `[${scope}] FAILED stage=${stage}${formatInfo(info)}\n` +
      `  cause:   ${d.cause}\n` +
      `  code:    ${d.code}\n` +
      `  message: ${d.message}\n` +
      `  details: ${d.details}\n` +
      `  hint:    ${d.hint}`,
  );
}
