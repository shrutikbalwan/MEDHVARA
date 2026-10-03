/**
 * Engineering-notation formatting and parsing shared by the tutor tools and
 * the /tools page. Pure, so it runs on the server and in the browser.
 */

const PREFIXES: [number, string][] = [
  [1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""],
  [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"], [1e-15, "f"],
];

/** 4700 Ω → "4.7 kΩ", 1e-7 F → "100 nF". `digits` = significant digits. */
export function formatSI(value: number, unit = "", digits = 4): string {
  if (Number.isNaN(value)) return "—";
  if (!Number.isFinite(value)) return `∞${unit ? ` ${unit}` : ""}`;
  if (value === 0) return `0${unit ? ` ${unit}` : ""}`;
  const magnitude = Math.abs(value);
  let index = PREFIXES.findIndex(([s]) => magnitude >= s);
  if (index === -1) index = PREFIXES.length - 1;
  let scaled = Number((value / PREFIXES[index][0]).toPrecision(digits));
  // 999.96 rounds to 1000 at 4 digits: show it as 1 k, not 1000.
  if (Math.abs(scaled) >= 1000 && index > 0) {
    index -= 1;
    scaled = Number((value / PREFIXES[index][0]).toPrecision(digits));
  }
  const prefix = PREFIXES[index][1];
  return `${scaled}${unit || prefix ? " " : ""}${prefix}${unit}`;
}

/** 0.6123 → "61.23 %". */
export function formatPercent(fraction: number, digits = 4): string {
  return `${Number((fraction * 100).toPrecision(digits))} %`;
}

const PREFIX_VALUES: Record<string, number> = {
  T: 1e12, G: 1e9, M: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, µ: 1e-6, μ: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15,
};
const UNITS = ["ohms", "ohm", "Ω", "Ohm", "R", "F", "H", "Hz", "V", "A", "W", "s", "S"];

/**
 * Reads values the way students write them: 4700, "4.7k", "4k7", "100n",
 * "100nF", "20 mA", "1.5MΩ", "2.2µF", "4R7". Throws on anything else, naming
 * the input. A trailing unit is accepted and ignored, so callers pass
 * quantities in SI base units.
 */
export function parseEngineering(input: unknown, label = "Value"): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new RangeError(`${label} must be a finite number.`);
    return input;
  }
  let text = String(input ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (!text) throw new RangeError(`${label} is required.`);

  // Strip a trailing unit, longest first ("Hz" before "H"), but never the
  // "R"/"k"-style infix of 4R7 / 4k7.
  for (const unit of [...UNITS].sort((a, b) => b.length - a.length)) {
    if (text.endsWith(unit) && text.length > unit.length && !/^\d+[Rr]\d+$/.test(text)) {
      text = text.slice(0, -unit.length);
      break;
    }
  }

  // Infix notation: 4k7 = 4.7k, 4R7 = 4.7, 2u2 = 2.2u.
  const infix = text.match(/^(\d+)([TGMkKmuµμnpfRr])(\d+)$/);
  if (infix) {
    const scale = /[Rr]/.test(infix[2]) ? 1 : PREFIX_VALUES[infix[2]];
    return Number(`${infix[1]}.${infix[3]}`) * scale;
  }

  const plain = text.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([TGMkKmuµμnpf])?$/i);
  if (!plain) throw new RangeError(`${label} "${String(input)}" is not a number like 4.7k, 100n or 0.02.`);
  const scale = plain[2] ? PREFIX_VALUES[plain[2]] ?? PREFIX_VALUES[plain[2].toLowerCase()] : 1;
  return Number(plain[1]) * scale;
}
