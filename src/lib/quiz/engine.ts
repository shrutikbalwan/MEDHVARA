/**
 * Quiz engine for numeric questions whose parameters are drawn from a seed, so
 * every attempt gets fresh numbers while the checking stays exact.
 *
 * Ported from OpenENTC Studio (packages/learning/src/quiz.mjs,
 * https://github.com/shrutikbalwan/OpenENTC-Studio, same author). The logic is
 * unchanged — only TypeScript types were added (MCQ handling is left out:
 * MEDHVARA's multiple-choice questions come from the lesson API). Pure, so it
 * runs in the browser.
 */

const SUFFIX: Record<string, number> = {
  f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12,
};

/** Parse "4.7k", "2.2 µ", "1e-3", "-12.5 V" (trailing unit letters after the suffix are ignored). */
export function parseAnswer(text: unknown): number | null {
  const match =
    /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([fpnuµmkKMGT]?)([A-Za-zΩ°%/²³·]*)\s*$/.exec(
      String(text).replace(/,/g, ""),
    );
  if (!match) return null;
  let value = Number(match[1]);
  // "m" alone is milli; "M" mega; a bare unit such as "V" or "Hz" is ignored.
  if (match[2]) value *= SUFFIX[match[2]];
  return Number.isFinite(value) ? value : null;
}

/** Small seeded PRNG: the same seed always gives the same sequence. */
export function mulberry32(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [min, max, step] picks from a range; { choices } picks one item; anything else is a constant. */
export type ParamSpec = Record<string, [number, number, number] | { choices: readonly number[] } | number>;
export type Params = Record<string, number>;

/** Draw parameters for a seed. */
export function drawParameters(spec: ParamSpec, seed: number): Params {
  const random = mulberry32(seed);
  return Object.fromEntries(
    Object.entries(spec || {}).map(([name, range]) => {
      if (Array.isArray(range)) {
        const [lo, hi, step] = range;
        const count = Math.floor((hi - lo) / step + 1e-9) + 1;
        return [name, Number((lo + step * Math.floor(random() * count)).toPrecision(12))];
      }
      if (range && typeof range === "object" && Array.isArray(range.choices)) {
        return [name, range.choices[Math.floor(random() * range.choices.length)]];
      }
      return [name, range as number];
    }),
  );
}

/** Short engineering notation used in "expected" answers, e.g. "4.7 kΩ". */
export function engineering(value: number, unit = ""): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return `0 ${unit}`.trim();
  const prefixes: [number, string][] = [
    [1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"],
  ];
  const [scale, prefix] = prefixes.find(([s]) => Math.abs(value) >= s * 0.9999) ?? prefixes[prefixes.length - 1];
  return `${Number((value / scale).toPrecision(4))} ${prefix}${unit}`.trim();
}

export type NumericQuestion = {
  id: string;
  params: ParamSpec;
  prompt: (p: Params) => string;
  answer: (p: Params) => number;
  unit?: string;
  /** Relative tolerance; 0 means the answer must be exact (integers). */
  tolerance?: number;
  explain?: (p: Params, answer: number) => string;
};

export type NumericInstance = {
  kind: "numeric";
  id: string;
  prompt: string;
  params: Params;
  answer: number;
  unit: string;
  tolerance: number;
  explanation: string;
};

/** Instantiate a question for a seed. */
export function instantiate(question: NumericQuestion, seed = 1): NumericInstance {
  const params = drawParameters(question.params, seed);
  const answer = question.answer(params);
  return {
    kind: "numeric",
    id: question.id,
    prompt: question.prompt(params),
    params,
    answer,
    unit: question.unit ?? "",
    tolerance: question.tolerance ?? 0.02,
    explanation: question.explain ? question.explain(params, answer) : "",
  };
}

export type CheckResult = {
  correct: boolean;
  invalid?: boolean;
  value?: number;
  expected: string;
  explanation: string;
};

/** Check a typed response (or a number) against the exact answer, within the relative tolerance. */
export function checkAnswer(instance: NumericInstance, response: string | number): CheckResult {
  const value = typeof response === "number" ? response : parseAnswer(response);
  if (value === null) {
    return {
      correct: false,
      invalid: true,
      expected: engineering(instance.answer, instance.unit),
      explanation: "Enter a number, e.g. 4.7k or 0.0047.",
    };
  }
  const scale = Math.max(Math.abs(instance.answer), 1e-300);
  const correct =
    Math.abs(value - instance.answer) <= instance.tolerance * scale ||
    (instance.answer === 0 && Math.abs(value) < 1e-12);
  return { correct, value, expected: engineering(instance.answer, instance.unit), explanation: instance.explanation };
}
