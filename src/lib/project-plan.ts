import {
  DIFFICULTIES,
  PROJECT_PLAN_ARRAY_FIELDS,
  PROJECT_PLAN_STRING_FIELDS,
  type Difficulty,
  type ProjectPlan,
} from "@/types/project-plan";

export type ParseResult =
  | { ok: true; plan: ProjectPlan }
  | { ok: false; reason: string };

/**
 * Pulls a JSON object out of a model response.
 *
 * JSON mode should make this unnecessary, but a model can still wrap output in
 * a ```json fence or add a sentence before it, and that must not be a hard
 * failure. Falls back to the outermost balanced {...}, tracking string state so
 * a brace inside a quoted value does not end the scan early.
 */
export function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();

  if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;

  const start = candidate.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i++) {
    const char = candidate[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }

  return null;
}

/** Trimmed non-empty string, or null. */
function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Coerces a value into a string array.
 *
 * Models routinely return a newline- or comma-separated string where an array
 * was asked for, or an array of {step: "..."} objects. Those are the model
 * being sloppy about format, not about content, so they are normalised rather
 * than rejected.
 */
function asStringArray(value: unknown): string[] | null {
  if (typeof value === "string") {
    const parts = value
      .split(/\r?\n|,/)
      .map((part) => part.replace(/^[\s\-*\d.)]+/, "").trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : null;
  }

  if (!Array.isArray(value)) return null;

  const items = value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        // e.g. {step: "..."} / {name: "..."} / {description: "..."}
        for (const key of ["step", "name", "title", "description", "value"]) {
          const nested = (item as Record<string, unknown>)[key];
          if (typeof nested === "string" && nested.trim()) return nested.trim();
        }
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));

  return items.length > 0 ? items : null;
}

function asDifficulty(value: unknown): Difficulty | null {
  const text = asString(value);
  if (!text) return null;
  const match = DIFFICULTIES.find(
    (level) => level.toLowerCase() === text.toLowerCase(),
  );
  return match ?? null;
}

/**
 * Parses and validates a model response into a ProjectPlan.
 *
 * Never throws: every failure is a described reason the caller can log and act
 * on. Validation is strict about required fields being present and non-empty,
 * because a plan missing its components list is not a usable plan.
 */
export function parseProjectPlan(raw: string): ParseResult {
  const json = extractJsonObject(raw);
  if (!json) return { ok: false, reason: "no JSON object found in response" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      reason: `JSON.parse failed: ${error instanceof Error ? error.message : "unknown"}`,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "parsed value is not a JSON object" };
  }

  const source = parsed as Record<string, unknown>;
  const missing: string[] = [];

  const strings: Partial<Record<(typeof PROJECT_PLAN_STRING_FIELDS)[number], string>> = {};
  for (const field of PROJECT_PLAN_STRING_FIELDS) {
    const value = asString(source[field]);
    if (!value) missing.push(field);
    else strings[field] = value;
  }

  const arrays: Partial<Record<(typeof PROJECT_PLAN_ARRAY_FIELDS)[number], string[]>> = {};
  for (const field of PROJECT_PLAN_ARRAY_FIELDS) {
    const value = asStringArray(source[field]);
    if (!value) missing.push(field);
    else arrays[field] = value;
  }

  const difficulty = asDifficulty(source.difficulty);
  if (!difficulty) missing.push("difficulty");

  if (missing.length > 0) {
    return { ok: false, reason: `missing or invalid fields: ${missing.join(", ")}` };
  }

  return {
    ok: true,
    plan: {
      title: strings.title!,
      problem_statement: strings.problem_statement!,
      objectives: arrays.objectives!,
      components: arrays.components!,
      technologies: arrays.technologies!,
      architecture_overview: strings.architecture_overview!,
      development_steps: arrays.development_steps!,
      difficulty: difficulty!,
      subjects_to_learn_first: arrays.subjects_to_learn_first!,
    },
  };
}
