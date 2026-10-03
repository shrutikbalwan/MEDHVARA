/**
 * Everyday electronics calculators: resistor colour codes and E-series,
 * component markings, 555 timer, op-amp stages, decibels and power units, and
 * circuit formulas.
 *
 * Ported from OpenENTC Studio (packages/calculators/src/index.mjs,
 * https://github.com/shrutikbalwan/OpenENTC-Studio, same author). The logic is
 * unchanged — only TypeScript types were added — and the port is checked
 * against OpenENTC's own calculators test suite. Pure functions with no I/O,
 * so they run identically on the server (tutor tools) and in the browser
 * (/tools). Every input is in SI base units: ohms, volts, amps, farads,
 * henries, hertz, seconds.
 */

function bounded(value: unknown, minimum: number, maximum: number, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}
const positive = (value: unknown, label: string) => bounded(value, 1e-15, 1e15, label);

// ---------------------------------------------------------------------------
// Resistor colour code (IEC 60062).

export type ColorBand = {
  name: string;
  digit: number | null;
  multiplier: number | null;
  tolerance: number | null;
  tempco: number | null;
  hex: string;
};

export const COLOR_BANDS: readonly ColorBand[] = Object.freeze([
  { name: "black", digit: 0, multiplier: 1, tolerance: null, tempco: 250, hex: "#111111" },
  { name: "brown", digit: 1, multiplier: 10, tolerance: 1, tempco: 100, hex: "#7c4a1e" },
  { name: "red", digit: 2, multiplier: 100, tolerance: 2, tempco: 50, hex: "#dc2626" },
  { name: "orange", digit: 3, multiplier: 1e3, tolerance: 0.05, tempco: 15, hex: "#f97316" },
  { name: "yellow", digit: 4, multiplier: 1e4, tolerance: 0.02, tempco: 25, hex: "#facc15" },
  { name: "green", digit: 5, multiplier: 1e5, tolerance: 0.5, tempco: 20, hex: "#16a34a" },
  { name: "blue", digit: 6, multiplier: 1e6, tolerance: 0.25, tempco: 10, hex: "#2563eb" },
  { name: "violet", digit: 7, multiplier: 1e7, tolerance: 0.1, tempco: 5, hex: "#7c3aed" },
  { name: "grey", digit: 8, multiplier: 1e8, tolerance: 0.05, tempco: 1, hex: "#9ca3af" },
  { name: "white", digit: 9, multiplier: 1e9, tolerance: null, tempco: null, hex: "#f8fafc" },
  { name: "gold", digit: null, multiplier: 0.1, tolerance: 5, tempco: null, hex: "#d4a017" },
  { name: "silver", digit: null, multiplier: 0.01, tolerance: 10, tempco: null, hex: "#c0c0c0" },
  { name: "none", digit: null, multiplier: null, tolerance: 20, tempco: null, hex: "transparent" },
]);

const band = (name: string): ColorBand => {
  const found = COLOR_BANDS.find((entry) => entry.name === name);
  if (!found) throw new RangeError(`Unknown colour "${name}".`);
  return found;
};

/** Decode 3-, 4-, 5- or 6-band resistor colours (digits, multiplier, tolerance, tempco). */
export function decodeResistorBands(names: string[]) {
  if (!Array.isArray(names) || names.length < 3 || names.length > 6) {
    throw new RangeError("Use 3 to 6 colour bands.");
  }
  const digitsCount = names.length >= 5 ? 3 : 2;
  const digits = names.slice(0, digitsCount).map((name) => {
    const entry = band(name);
    if (entry.digit === null) throw new RangeError(`${name} cannot be a digit band.`);
    return entry.digit;
  });
  const multiplier = band(names[digitsCount]).multiplier;
  if (multiplier === null) throw new RangeError(`${names[digitsCount]} cannot be a multiplier band.`);
  const toleranceBand = names.length === 3 ? band("none") : band(names[digitsCount + 1]);
  if (toleranceBand.tolerance === null) {
    throw new RangeError(`${toleranceBand.name} is not a tolerance colour.`);
  }
  const tempco = names.length === 6 ? band(names[5]).tempco : null;
  if (names.length === 6 && tempco === null) {
    throw new RangeError(`${names[5]} is not a temperature-coefficient colour.`);
  }
  const value = Number((digits.reduce((total, digit) => total * 10 + digit, 0) * multiplier).toPrecision(12));
  const tolerance = toleranceBand.tolerance;
  return {
    value,
    tolerance,
    tempco,
    minimum: value * (1 - tolerance / 100),
    maximum: value * (1 + tolerance / 100),
  };
}

/** Colour bands for a resistance; rounds to the band's significant digits and reports the rounding. */
export function encodeResistorBands(
  value: number,
  {
    bands = 4,
    tolerance = bands >= 5 ? 1 : 5,
    tempco = 100,
  }: { bands?: number; tolerance?: number; tempco?: number } = {},
) {
  const resistance = bounded(value, 0.1, 999e9, "Resistance");
  if (![4, 5, 6].includes(bands)) throw new RangeError("Choose 4, 5 or 6 bands.");
  const digitsCount = bands === 4 ? 2 : 3;
  let exponent = Math.floor(Math.log10(resistance)) - (digitsCount - 1);
  let significand = Math.round(resistance / 10 ** exponent);
  if (significand >= 10 ** digitsCount) {
    significand /= 10;
    exponent += 1;
  }
  if (exponent < -2) throw new RangeError("The value is too small for a colour code.");
  if (exponent > 9) throw new RangeError("The value is too large for a colour code.");
  const multiplierName = exponent === -1 ? "gold" : exponent === -2 ? "silver" : COLOR_BANDS[exponent].name;
  const digitNames = String(significand)
    .padStart(digitsCount, "0")
    .split("")
    .map((digit) => COLOR_BANDS[Number(digit)].name);
  const toleranceEntry =
    COLOR_BANDS.find(
      (entry) => entry.tolerance === tolerance && entry.name !== "orange" && entry.name !== "yellow",
    ) || COLOR_BANDS.find((entry) => entry.tolerance === tolerance);
  if (!toleranceEntry) throw new RangeError(`No colour for ±${tolerance} % tolerance.`);
  const names = [...digitNames, multiplierName, toleranceEntry.name];
  if (bands === 6) {
    const tempcoEntry = COLOR_BANDS.find((entry) => entry.tempco === tempco);
    if (!tempcoEntry) throw new RangeError(`No colour for ${tempco} ppm/K.`);
    names.push(tempcoEntry.name);
  }
  const coded = Number((significand * 10 ** exponent).toPrecision(12));
  return { bands: names, value: coded, requested: resistance, roundingError: (coded - resistance) / resistance };
}

const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
const E96 = Array.from({ length: 96 }, (_, i) => Math.round(10 ** (i / 96) * 100) / 100);

export type ESeries = "E6" | "E12" | "E24" | "E48" | "E96";

export const E_SERIES: Readonly<Record<ESeries, number[]>> = Object.freeze({
  E6: E24.filter((_, i) => i % 4 === 0),
  E12: E24.filter((_, i) => i % 2 === 0),
  E24,
  E48: E96.filter((_, i) => i % 2 === 0),
  E96,
});

/** Nearest preferred value in an E-series, with the error and the neighbours either side. */
export function nearestPreferred(value: number, series: string = "E24") {
  const target = bounded(value, 1e-15, 1e15, "Value");
  const list = E_SERIES[series as ESeries];
  if (!list) throw new RangeError(`Series must be one of ${Object.keys(E_SERIES).join(", ")}.`);
  const decade = 10 ** Math.floor(Math.log10(target));
  const candidates = [
    ...list.map((v) => (v * decade) / 10),
    ...list.map((v) => v * decade),
    ...list.map((v) => v * decade * 10),
  ].map((v) => Number(v.toPrecision(6)));
  const below = Math.max(...candidates.filter((v) => v <= target * (1 + 1e-12)));
  const above = Math.min(...candidates.filter((v) => v >= target * (1 - 1e-12)));
  const nearest = Math.abs(Math.log(below / target)) <= Math.abs(Math.log(above / target)) ? below : above;
  return { series, value: nearest, error: (nearest - target) / target, below, above };
}

/** Three-digit / four-digit / R-notation / EIA-96 SMD resistor markings. */
export function decodeSmdResistor(code: string) {
  const text = String(code).trim().toUpperCase();
  const eia96: Record<string, number> = {
    Z: 0.001, Y: 0.01, R: 0.01, X: 0.1, S: 0.1, A: 1, B: 10, H: 10, C: 100, D: 1e3, E: 1e4, F: 1e5,
  };
  let value: number;
  let system: string;
  if (/^\d{2}[ZYRXSABHCDEF]$/.test(text)) {
    const index = Number(text.slice(0, 2));
    if (index < 1 || index > 96) throw new RangeError("EIA-96 codes run from 01 to 96.");
    value = E96[index - 1] * 100 * eia96[text[2]];
    system = "EIA-96 (1 %)";
  } else if (/^\d*R\d*$/.test(text) && text.length >= 2) {
    value = Number(text.replace("R", "."));
    system = "R notation";
  } else if (/^\d{3}$/.test(text)) {
    value = Number(text.slice(0, 2)) * 10 ** Number(text[2]);
    system = "3-digit (E24, 5 %)";
  } else if (/^\d{4}$/.test(text)) {
    value = Number(text.slice(0, 3)) * 10 ** Number(text[3]);
    system = "4-digit (E96, 1 %)";
  } else {
    throw new SyntaxError("Enter an SMD code such as 472, 1002, 4R7 or 01C.");
  }
  return { code: text, value: Number(value.toPrecision(10)), system };
}

/** Ceramic/film capacitor code such as "104K" → 100 nF ±10 %. */
export function decodeCapacitorCode(code: string) {
  const match = String(code).trim().toUpperCase().match(/^(\d{2})(\d)([BCDFGJKMZ])?$/);
  if (!match) throw new SyntaxError("Enter a capacitor code such as 104, 223J or 471K.");
  const picofarads =
    Number(match[1]) * 10 ** (match[2] === "8" ? -2 : match[2] === "9" ? -1 : Number(match[2]));
  const tolerances: Record<string, string> = {
    B: "±0.1 pF", C: "±0.25 pF", D: "±0.5 pF", F: "±1 %", G: "±2 %", J: "±5 %", K: "±10 %", M: "±20 %", Z: "+80 / −20 %",
  };
  return { farads: picofarads * 1e-12, picofarads, tolerance: match[3] ? tolerances[match[3]] : null };
}

// ---------------------------------------------------------------------------
// 555 timer.

const LN2 = Math.LN2;
const LN3 = Math.log(3);

export function timer555Astable({ r1 = 1000, r2 = 10000, c = 10e-9 }: { r1?: number; r2?: number; c?: number } = {}) {
  const a = positive(r1, "R1");
  const b = positive(r2, "R2");
  const cap = positive(c, "C");
  const high = LN2 * (a + b) * cap;
  const low = LN2 * b * cap;
  return { mode: "astable" as const, high, low, period: high + low, frequency: 1 / (high + low), duty: high / (high + low) };
}

export function timer555Monostable({ r = 100000, c = 10e-6 }: { r?: number; c?: number } = {}) {
  const width = LN3 * positive(r, "R") * positive(c, "C");
  return { mode: "monostable" as const, width };
}

/** Choose R1 and R2 for a target frequency and duty (> 50 %) with a given capacitor; also the nearest E24 build. */
export function design555Astable({
  frequency = 1000,
  duty = 0.6,
  c = 10e-9,
}: { frequency?: number; duty?: number; c?: number } = {}) {
  const f = positive(frequency, "Frequency");
  const d = bounded(duty, 0.5001, 0.9999, "Duty cycle (above 50 % for the basic circuit)");
  const cap = positive(c, "C");
  const r2 = (1 - d) / (f * cap * LN2);
  const r1 = (2 * d - 1) / (f * cap * LN2);
  const built = { r1: nearestPreferred(r1, "E24").value, r2: nearestPreferred(r2, "E24").value };
  return {
    r1,
    r2,
    standard: { ...built, ...timer555Astable({ ...built, c: cap }) },
    warnings: r1 < 1000 ? ["R1 below 1 kΩ draws large discharge current; choose a smaller capacitor."] : [],
  };
}

// ---------------------------------------------------------------------------
// Op-amp stages.

export const OPAMP_CONFIGS: Readonly<Record<string, string>> = Object.freeze({
  inverting: "Inverting",
  "non-inverting": "Non-inverting",
  follower: "Voltage follower",
  difference: "Difference (R2/R1 matched)",
});

export function opampStage({
  config = "inverting",
  r1 = 10000,
  r2 = 100000,
  gbw = 1e6,
  slewRate = 0.5e6,
  inputPeak = 0.1,
  supply = 15,
}: {
  config?: string;
  r1?: number;
  r2?: number;
  gbw?: number;
  slewRate?: number;
  inputPeak?: number;
  supply?: number;
} = {}) {
  if (!OPAMP_CONFIGS[config]) {
    throw new RangeError(`Configuration must be one of ${Object.keys(OPAMP_CONFIGS).join(", ")}.`);
  }
  const a = positive(r1, "R1");
  const b = positive(r2, "R2");
  const unity = positive(gbw, "Gain-bandwidth product");
  const slew = positive(slewRate, "Slew rate");
  const vin = bounded(inputPeak, 0, 1e4, "Input peak");
  const rail = bounded(supply, 0.1, 1e4, "Supply (±)");
  const gain =
    config === "inverting" ? -b / a : config === "non-inverting" ? 1 + b / a : config === "follower" ? 1 : b / a;
  const noiseGain = config === "follower" ? 1 : 1 + b / a;
  const inputImpedance = config === "inverting" ? a : config === "difference" ? 2 * a : Infinity;
  const outputPeak = Math.abs(gain) * vin;
  const bandwidth = unity / noiseGain;
  return {
    config,
    gain,
    gainDb: 20 * Math.log10(Math.abs(gain)),
    noiseGain,
    bandwidth,
    inputImpedance,
    outputPeak,
    clipping: outputPeak > rail,
    fullPowerBandwidth: outputPeak > 0 ? slew / (2 * Math.PI * outputPeak) : Infinity,
  };
}

// ---------------------------------------------------------------------------
// Decibels and power units.

export function ratioToDb(ratio: number, kind: "power" | "voltage" = "power") {
  const value = positive(ratio, "Ratio");
  return (kind === "voltage" ? 20 : 10) * Math.log10(value);
}

export const dbToRatio = (decibels: number, kind: "power" | "voltage" = "power") =>
  10 ** (bounded(decibels, -1000, 1000, "Decibels") / (kind === "voltage" ? 20 : 10));

export const POWER_UNITS: Readonly<Record<string, string>> = Object.freeze({
  W: "watt", mW: "milliwatt", dBm: "dBm", dBW: "dBW", Vrms: "V rms", dBuV: "dBµV", dBV: "dBV",
});

/** Convert a power or voltage level to every unit across a resistive impedance (default 50 Ω). */
export function convertLevel(value: number, unit: string = "dBm", impedance: number = 50) {
  const number = bounded(value, -1e6, 1e6, "Level");
  const r = positive(impedance, "Impedance");
  const toWatts: Record<string, () => number> = {
    W: () => number,
    mW: () => number / 1e3,
    dBm: () => 1e-3 * 10 ** (number / 10),
    dBW: () => 10 ** (number / 10),
    Vrms: () => (number * number) / r,
    dBuV: () => (1e-6 * 10 ** (number / 20)) ** 2 / r,
    dBV: () => (10 ** (number / 20)) ** 2 / r,
  };
  if (!toWatts[unit]) throw new RangeError(`Unit must be one of ${Object.keys(POWER_UNITS).join(", ")}.`);
  if (["W", "mW", "Vrms"].includes(unit) && number <= 0) throw new RangeError(`${unit} must be positive.`);
  const watts = toWatts[unit]();
  const volts = Math.sqrt(watts * r);
  return {
    W: watts,
    mW: watts * 1e3,
    dBm: 10 * Math.log10(watts / 1e-3),
    dBW: 10 * Math.log10(watts),
    Vrms: volts,
    Vpeak: volts * Math.SQRT2,
    Vpp: 2 * volts * Math.SQRT2,
    dBuV: 20 * Math.log10(volts / 1e-6),
    dBV: 20 * Math.log10(volts),
    impedance: r,
  };
}

// ---------------------------------------------------------------------------
// Circuit formulas.

export type OhmKey = "V" | "I" | "R" | "P";

/** Ohm's law and power from any two of V, I, R, P. */
export function solveOhm(known: Partial<Record<OhmKey, number | string | null>>) {
  const given = Object.entries(known)
    .filter(
      ([, value]) =>
        value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value)),
    )
    .map(([key, value]) => [key, Number(value)] as const);
  if (given.length !== 2) throw new RangeError("Enter exactly two of V, I, R and P.");
  const v = Object.fromEntries(given) as Record<OhmKey, number>;
  const keys = Object.keys(v).sort().join("");
  const pairs: Record<string, () => Record<OhmKey, number>> = {
    IV: () => ({ V: v.V, I: v.I, R: v.V / v.I, P: v.V * v.I }),
    RV: () => ({ V: v.V, R: v.R, I: v.V / v.R, P: (v.V * v.V) / v.R }),
    PV: () => ({ V: v.V, P: v.P, I: v.P / v.V, R: (v.V * v.V) / v.P }),
    IR: () => ({ I: v.I, R: v.R, V: v.I * v.R, P: v.I * v.I * v.R }),
    IP: () => ({ I: v.I, P: v.P, V: v.P / v.I, R: v.P / (v.I * v.I) }),
    PR: () => ({ P: v.P, R: v.R, V: Math.sqrt(v.P * v.R), I: Math.sqrt(v.P / v.R) }),
  };
  if (!pairs[keys]) throw new RangeError("Use the keys V, I, R and P.");
  const result = pairs[keys]();
  if (Object.values(result).some((value) => !Number.isFinite(value))) {
    throw new RangeError("These values give a division by zero.");
  }
  return result;
}

export function seriesParallel(values: number[]) {
  const list = values.map((value) => positive(value, "Each value"));
  if (!list.length) throw new RangeError("Enter at least one value.");
  return {
    series: list.reduce((sum, value) => sum + value, 0),
    parallel: 1 / list.reduce((sum, value) => sum + 1 / value, 0),
  };
}

export function voltageDivider({
  vin = 12,
  r1 = 10000,
  r2 = 10000,
  load = Infinity,
}: { vin?: number; r1?: number; r2?: number; load?: number | string | null } = {}) {
  const v = bounded(vin, -1e6, 1e6, "Input voltage");
  const a = positive(r1, "R1");
  const b = positive(r2, "R2");
  const rl =
    load === "" || load === null || load === undefined || !Number.isFinite(Number(load))
      ? Infinity
      : positive(load, "Load");
  const bottom = Number.isFinite(rl) ? (b * rl) / (b + rl) : b;
  return {
    vout: (v * bottom) / (a + bottom),
    unloaded: (v * b) / (a + b),
    current: v / (a + bottom),
    theveninResistance: (a * b) / (a + b),
  };
}

export function reactance({
  frequency = 1000,
  capacitance = 1e-6,
  inductance = 1e-3,
}: { frequency?: number; capacitance?: number; inductance?: number } = {}) {
  const w = 2 * Math.PI * positive(frequency, "Frequency");
  return {
    capacitive: 1 / (w * positive(capacitance, "Capacitance")),
    inductive: w * positive(inductance, "Inductance"),
  };
}

export function rlcResonance({
  resistance = 10,
  inductance = 1e-3,
  capacitance = 1e-6,
}: { resistance?: number; inductance?: number; capacitance?: number } = {}) {
  const r = positive(resistance, "Resistance");
  const l = positive(inductance, "Inductance");
  const c = positive(capacitance, "Capacitance");
  const f0 = 1 / (2 * Math.PI * Math.sqrt(l * c));
  const q = Math.sqrt(l / c) / r;
  return { resonance: f0, q, bandwidth: f0 / q, characteristicImpedance: Math.sqrt(l / c), damping: 1 / (2 * q) };
}

export function rcFilter({ resistance = 1000, capacitance = 1e-6 }: { resistance?: number; capacitance?: number } = {}) {
  const tau = positive(resistance, "Resistance") * positive(capacitance, "Capacitance");
  return { tau, cutoff: 1 / (2 * Math.PI * tau), riseTime: tau * Math.log(9), settle5Tau: 5 * tau };
}

export function ledResistor({
  supply = 5,
  forwardVoltage = 2,
  current = 0.02,
}: { supply?: number; forwardVoltage?: number; current?: number } = {}) {
  const vs = bounded(supply, 0, 1e4, "Supply");
  const vf = bounded(forwardVoltage, 0, 1e3, "LED forward voltage");
  const i = positive(current, "LED current");
  if (!(vs > vf)) throw new RangeError("The supply must exceed the LED forward voltage.");
  const exact = (vs - vf) / i;
  // Round up so the current stays at or below the target.
  const standard = nearestPreferred(exact, "E12").above;
  return {
    resistance: exact,
    standard,
    actualCurrent: (vs - vf) / standard,
    resistorPower: (vs - vf) ** 2 / standard,
    ledPower: (vf * (vs - vf)) / standard,
  };
}

export function adcResolution({ bits = 10, reference = 5 }: { bits?: number; reference?: number } = {}) {
  const n = Math.trunc(bounded(bits, 1, 32, "Bits"));
  const v = positive(reference, "Reference voltage");
  return { levels: 2 ** n, lsb: v / 2 ** n, snrDb: 6.02 * n + 1.76, dynamicRangeDb: 20 * Math.log10(2 ** n) };
}
