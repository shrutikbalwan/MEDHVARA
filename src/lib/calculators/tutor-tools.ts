/**
 * The calculators exposed to the chat tutor as Groq (OpenAI-compatible) tools.
 *
 * The model decides WHEN to calculate and with WHICH inputs; the numbers come
 * from the verified engine, never from the model. Each successful run returns
 * a one-line `summary` that the chat route appends to the reply verbatim, so
 * the student sees the real working even if the model paraphrases it badly.
 */
import * as calc from "@/lib/calculators/engine";
import { formatPercent, formatSI, parseEngineering } from "@/lib/calculators/format";

/** Number or engineering string ("4.7k", "100n", "20mA"). */
const quantity = (description: string) => ({
  type: ["number", "string"],
  description: `${description} Number in SI base units, or a string like "4.7k", "100n", "20mA".`,
});

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): ToolDefinition => ({
  type: "function",
  function: {
    name,
    description,
    parameters: { type: "object", properties, required, additionalProperties: false },
  },
});

const COLOURS = calc.COLOR_BANDS.map((b) => b.name);

export const TUTOR_TOOLS: ToolDefinition[] = [
  tool(
    "ohms_law",
    "Ohm's law and power. Give exactly two of voltage (V), current (A), resistance (Ω), power (W); returns all four.",
    {
      voltage: quantity("Voltage in volts."),
      current: quantity("Current in amps."),
      resistance: quantity("Resistance in ohms."),
      power: quantity("Power in watts."),
    },
    [],
  ),
  tool(
    "led_resistor",
    "Series resistor for an LED: exact value, nearest standard E12 value (rounded up), actual current and power.",
    {
      supply: quantity("Supply voltage in volts."),
      forward_voltage: quantity("LED forward voltage in volts (red ≈ 2, blue/white ≈ 3)."),
      current: quantity("Target LED current in amps (typical 0.01–0.02)."),
    },
    ["supply", "forward_voltage", "current"],
  ),
  tool(
    "voltage_divider",
    "Two-resistor voltage divider: Vout = Vin·R2/(R1+R2), optionally with a load across R2.",
    {
      vin: quantity("Input voltage in volts."),
      r1: quantity("Top resistor in ohms."),
      r2: quantity("Bottom resistor (output side) in ohms."),
      load: quantity("Optional load resistance across R2, in ohms."),
    },
    ["vin", "r1", "r2"],
  ),
  tool(
    "series_parallel",
    "Combine components in series and in parallel. Resistors/inductors add in series; capacitors add in parallel.",
    {
      kind: { type: "string", enum: ["resistor", "capacitor", "inductor"] },
      values: { type: "array", items: quantity("One component value."), minItems: 1, maxItems: 20 },
    },
    ["kind", "values"],
  ),
  tool(
    "resistor_color_decode",
    "Value of a resistor from its colour bands (3–6 bands, first band first).",
    { bands: { type: "array", items: { type: "string", enum: COLOURS }, minItems: 3, maxItems: 6 } },
    ["bands"],
  ),
  tool(
    "resistor_color_encode",
    "Colour bands for a resistance value.",
    {
      resistance: quantity("Resistance in ohms."),
      bands: { type: "integer", enum: [4, 5, 6], description: "Number of bands (default 4)." },
    },
    ["resistance"],
  ),
  tool(
    "nearest_standard_value",
    "Nearest preferred (E-series) component value, with the neighbours either side.",
    {
      value: quantity("The ideal value."),
      series: { type: "string", enum: ["E6", "E12", "E24", "E48", "E96"], description: "Default E24." },
    },
    ["value"],
  ),
  tool(
    "capacitor_code",
    'Decode a ceramic/film capacitor marking such as "104", "223J", "471K".',
    { code: { type: "string" } },
    ["code"],
  ),
  tool(
    "smd_resistor_code",
    'Decode an SMD resistor marking such as "472", "1002", "4R7" or EIA-96 "01C".',
    { code: { type: "string" } },
    ["code"],
  ),
  tool(
    "timer_555_astable",
    "555 timer in astable mode: frequency, period, high/low times and duty cycle from R1, R2, C.",
    { r1: quantity("R1 in ohms."), r2: quantity("R2 in ohms."), c: quantity("Timing capacitor in farads.") },
    ["r1", "r2", "c"],
  ),
  tool(
    "timer_555_monostable",
    "555 timer in monostable mode: output pulse width (1.1·R·C).",
    { r: quantity("Timing resistor in ohms."), c: quantity("Timing capacitor in farads.") },
    ["r", "c"],
  ),
  tool(
    "design_555_astable",
    "Design a 555 astable: R1 and R2 for a target frequency and duty cycle (> 50 %) with a chosen capacitor, plus the nearest E24 build.",
    {
      frequency: quantity("Target frequency in hertz."),
      duty: { type: "number", description: "Duty cycle as a fraction, 0.5–1 (e.g. 0.6)." },
      c: quantity("Timing capacitor in farads."),
    },
    ["frequency", "duty", "c"],
  ),
  tool(
    "rc_circuit",
    "RC circuit: time constant τ = RC, low-pass/high-pass cutoff frequency, 10–90 % rise time and 5τ settling.",
    { resistance: quantity("Resistance in ohms."), capacitance: quantity("Capacitance in farads.") },
    ["resistance", "capacitance"],
  ),
  tool(
    "reactance",
    "Capacitive and inductive reactance at a frequency.",
    {
      frequency: quantity("Frequency in hertz."),
      capacitance: quantity("Capacitance in farads."),
      inductance: quantity("Inductance in henries."),
    },
    ["frequency", "capacitance", "inductance"],
  ),
  tool(
    "rlc_resonance",
    "Series RLC: resonant frequency, Q factor, bandwidth and characteristic impedance.",
    {
      resistance: quantity("Resistance in ohms."),
      inductance: quantity("Inductance in henries."),
      capacitance: quantity("Capacitance in farads."),
    },
    ["resistance", "inductance", "capacitance"],
  ),
  tool(
    "opamp_gain",
    "Op-amp stage gain (inverting, non-inverting, follower, difference), bandwidth from GBW, and clipping check.",
    {
      config: { type: "string", enum: ["inverting", "non-inverting", "follower", "difference"] },
      r1: quantity("Input/ground resistor R1 in ohms."),
      r2: quantity("Feedback resistor R2 in ohms."),
      gbw: quantity("Gain-bandwidth product in hertz (default 1 MHz)."),
      input_peak: quantity("Input signal peak in volts (default 0.1)."),
      supply: quantity("Supply rail ± in volts (default 15)."),
    },
    ["config"],
  ),
  tool(
    "adc_resolution",
    "ADC resolution: number of levels, LSB size (step voltage) and ideal SNR for N bits and a reference voltage.",
    {
      bits: { type: "integer", minimum: 1, maximum: 32 },
      reference: quantity("Reference voltage in volts."),
    },
    ["bits", "reference"],
  ),
];

export type ToolRun =
  | { name: string; ok: true; summary: string; result: unknown }
  | { name: string; ok: false; error: string };

type Args = Record<string, unknown>;

const q = (args: Args, key: string, label: string) => parseEngineering(args[key], label);
const optional = (args: Args, key: string, label: string) =>
  args[key] === undefined || args[key] === null || args[key] === "" ? undefined : q(args, key, label);

const RUNNERS: Record<string, (args: Args) => { summary: string; result: unknown }> = {
  ohms_law(args) {
    const known = {
      V: optional(args, "voltage", "Voltage"),
      I: optional(args, "current", "Current"),
      R: optional(args, "resistance", "Resistance"),
      P: optional(args, "power", "Power"),
    };
    const r = calc.solveOhm(known);
    const given = (Object.keys(known) as calc.OhmKey[]).filter((k) => known[k] !== undefined);
    const units: Record<calc.OhmKey, string> = { V: "V", I: "A", R: "Ω", P: "W" };
    const show = (k: calc.OhmKey) => `${k} = ${formatSI(r[k], units[k])}`;
    const found = (["V", "I", "R", "P"] as calc.OhmKey[]).filter((k) => !given.includes(k));
    return { result: r, summary: `Ohm's law: ${given.map(show).join(", ")} → ${found.map(show).join(", ")}` };
  },
  led_resistor(args) {
    const supply = q(args, "supply", "Supply");
    const vf = q(args, "forward_voltage", "Forward voltage");
    const current = q(args, "current", "Current");
    const r = calc.ledResistor({ supply, forwardVoltage: vf, current });
    return {
      result: r,
      summary:
        `LED resistor: (${formatSI(supply, "V")} − ${formatSI(vf, "V")}) ÷ ${formatSI(current, "A")} = ${formatSI(r.resistance, "Ω")}` +
        ` → use ${formatSI(r.standard, "Ω")} (E12, rounded up): ${formatSI(r.actualCurrent, "A")} through the LED,` +
        ` resistor dissipates ${formatSI(r.resistorPower, "W")}`,
    };
  },
  voltage_divider(args) {
    const vin = q(args, "vin", "Vin");
    const r1 = q(args, "r1", "R1");
    const r2 = q(args, "r2", "R2");
    const load = optional(args, "load", "Load");
    const r = calc.voltageDivider({ vin, r1, r2, load: load ?? Infinity });
    const base = `Voltage divider: ${formatSI(vin, "V")} × ${formatSI(r2, "Ω")} ÷ (${formatSI(r1, "Ω")} + ${formatSI(r2, "Ω")}) = ${formatSI(r.unloaded, "V")}`;
    return {
      result: r,
      summary:
        load === undefined
          ? `${base} (no load); divider current ${formatSI(r.current, "A")}`
          : `${base} unloaded; with a ${formatSI(load, "Ω")} load Vout = ${formatSI(r.vout, "V")}`,
    };
  },
  series_parallel(args) {
    const kind = String(args.kind ?? "resistor");
    const unit = kind === "capacitor" ? "F" : kind === "inductor" ? "H" : "Ω";
    const values = (Array.isArray(args.values) ? args.values : []).map((v, i) =>
      parseEngineering(v, `Value ${i + 1}`),
    );
    const r = calc.seriesParallel(values);
    // Capacitors combine the opposite way to resistors and inductors.
    const series = kind === "capacitor" ? r.parallel : r.series;
    const parallel = kind === "capacitor" ? r.series : r.parallel;
    const list = values.map((v) => formatSI(v, unit)).join(", ");
    return {
      result: { series, parallel },
      summary: `${kind[0].toUpperCase()}${kind.slice(1)}s ${list}: series = ${formatSI(series, unit)}, parallel = ${formatSI(parallel, unit)}`,
    };
  },
  resistor_color_decode(args) {
    const bands = (Array.isArray(args.bands) ? args.bands : []).map((b) => String(b).toLowerCase());
    const r = calc.decodeResistorBands(bands);
    return {
      result: r,
      summary: `Colour code ${bands.join("-")} = ${formatSI(r.value, "Ω")} ±${r.tolerance} % (${formatSI(r.minimum, "Ω")} to ${formatSI(r.maximum, "Ω")})${r.tempco !== null ? `, ${r.tempco} ppm/K` : ""}`,
    };
  },
  resistor_color_encode(args) {
    const resistance = q(args, "resistance", "Resistance");
    const bands = Number(args.bands ?? 4);
    const r = calc.encodeResistorBands(resistance, { bands });
    const rounded = Math.abs(r.roundingError) > 1e-9 ? ` (rounded from ${formatSI(resistance, "Ω")})` : "";
    return {
      result: r,
      summary: `${formatSI(r.value, "Ω")}${rounded} → ${r.bands.join(", ")} (${bands}-band)`,
    };
  },
  nearest_standard_value(args) {
    const value = q(args, "value", "Value");
    const series = String(args.series ?? "E24");
    const r = calc.nearestPreferred(value, series);
    return {
      result: r,
      summary: `Nearest ${series} value to ${formatSI(value)}: ${formatSI(r.value)} (${formatPercent(r.error, 3)} off; neighbours ${formatSI(r.below)} and ${formatSI(r.above)})`,
    };
  },
  capacitor_code(args) {
    const r = calc.decodeCapacitorCode(String(args.code ?? ""));
    return {
      result: r,
      summary: `Capacitor code ${String(args.code).toUpperCase()} = ${formatSI(r.farads, "F")}${r.tolerance ? ` ${r.tolerance}` : ""}`,
    };
  },
  smd_resistor_code(args) {
    const r = calc.decodeSmdResistor(String(args.code ?? ""));
    return { result: r, summary: `SMD code ${r.code} = ${formatSI(r.value, "Ω")} (${r.system})` };
  },
  timer_555_astable(args) {
    const r1 = q(args, "r1", "R1");
    const r2 = q(args, "r2", "R2");
    const c = q(args, "c", "C");
    const r = calc.timer555Astable({ r1, r2, c });
    return {
      result: r,
      summary:
        `555 astable (R1 ${formatSI(r1, "Ω")}, R2 ${formatSI(r2, "Ω")}, C ${formatSI(c, "F")}): f = 1/(ln2·(R1+2R2)·C) = ${formatSI(r.frequency, "Hz")},` +
        ` high ${formatSI(r.high, "s")}, low ${formatSI(r.low, "s")}, duty ${formatPercent(r.duty, 3)}`,
    };
  },
  timer_555_monostable(args) {
    const res = q(args, "r", "R");
    const c = q(args, "c", "C");
    const r = calc.timer555Monostable({ r: res, c });
    return {
      result: r,
      summary: `555 monostable: pulse width = ln3·R·C ≈ 1.1 × ${formatSI(res, "Ω")} × ${formatSI(c, "F")} = ${formatSI(r.width, "s")}`,
    };
  },
  design_555_astable(args) {
    const frequency = q(args, "frequency", "Frequency");
    const duty = Number(args.duty);
    const c = q(args, "c", "C");
    const r = calc.design555Astable({ frequency, duty, c });
    return {
      result: r,
      summary:
        `555 astable design for ${formatSI(frequency, "Hz")} at ${formatPercent(duty, 3)} duty with C ${formatSI(c, "F")}: ` +
        `R1 = ${formatSI(r.r1, "Ω")}, R2 = ${formatSI(r.r2, "Ω")}; with E24 parts R1 ${formatSI(r.standard.r1, "Ω")}, R2 ${formatSI(r.standard.r2, "Ω")} → ` +
        `${formatSI(r.standard.frequency, "Hz")}, duty ${formatPercent(r.standard.duty, 3)}` +
        (r.warnings.length ? ` (warning: ${r.warnings.join(" ")})` : ""),
    };
  },
  rc_circuit(args) {
    const resistance = q(args, "resistance", "Resistance");
    const capacitance = q(args, "capacitance", "Capacitance");
    const r = calc.rcFilter({ resistance, capacitance });
    return {
      result: r,
      summary:
        `RC (${formatSI(resistance, "Ω")}, ${formatSI(capacitance, "F")}): τ = RC = ${formatSI(r.tau, "s")}, ` +
        `cutoff f = 1/(2πRC) = ${formatSI(r.cutoff, "Hz")}, rise time ${formatSI(r.riseTime, "s")}, 5τ = ${formatSI(r.settle5Tau, "s")}`,
    };
  },
  reactance(args) {
    const frequency = q(args, "frequency", "Frequency");
    const capacitance = q(args, "capacitance", "Capacitance");
    const inductance = q(args, "inductance", "Inductance");
    const r = calc.reactance({ frequency, capacitance, inductance });
    return {
      result: r,
      summary: `At ${formatSI(frequency, "Hz")}: Xc = 1/(2πfC) = ${formatSI(r.capacitive, "Ω")} for ${formatSI(capacitance, "F")}; XL = 2πfL = ${formatSI(r.inductive, "Ω")} for ${formatSI(inductance, "H")}`,
    };
  },
  rlc_resonance(args) {
    const resistance = q(args, "resistance", "Resistance");
    const inductance = q(args, "inductance", "Inductance");
    const capacitance = q(args, "capacitance", "Capacitance");
    const r = calc.rlcResonance({ resistance, inductance, capacitance });
    return {
      result: r,
      summary: `Series RLC: f0 = 1/(2π√(LC)) = ${formatSI(r.resonance, "Hz")}, Q = ${formatSI(r.q)}, bandwidth ${formatSI(r.bandwidth, "Hz")}, Z0 = ${formatSI(r.characteristicImpedance, "Ω")}`,
    };
  },
  opamp_gain(args) {
    const config = String(args.config ?? "inverting");
    const r = calc.opampStage({
      config,
      r1: optional(args, "r1", "R1") ?? 10000,
      r2: optional(args, "r2", "R2") ?? 100000,
      gbw: optional(args, "gbw", "GBW") ?? 1e6,
      inputPeak: optional(args, "input_peak", "Input peak") ?? 0.1,
      supply: optional(args, "supply", "Supply") ?? 15,
    });
    return {
      result: r,
      summary:
        `${calc.OPAMP_CONFIGS[config]} op-amp: gain = ${formatSI(r.gain)} (${formatSI(r.gainDb, "dB", 3)}), bandwidth ≈ ${formatSI(r.bandwidth, "Hz")}, ` +
        `output peak ${formatSI(r.outputPeak, "V")}${r.clipping ? " (CLIPS at the supply rail)" : ""}`,
    };
  },
  adc_resolution(args) {
    const bits = Number(args.bits);
    const reference = q(args, "reference", "Reference");
    const r = calc.adcResolution({ bits, reference });
    return {
      result: r,
      summary: `${bits}-bit ADC, ${formatSI(reference, "V")} reference: ${r.levels} levels, LSB = Vref/2^N = ${formatSI(r.lsb, "V")}, ideal SNR ${formatSI(r.snrDb, "dB", 3)}`,
    };
  },
};

/** Runs one tool call. Never throws: bad input comes back as a readable error for the model. */
export function runTutorTool(name: string, rawArguments: string): ToolRun {
  const runner = RUNNERS[name];
  if (!runner) return { name, ok: false, error: `Unknown tool "${name}".` };
  let args: Args;
  try {
    args = rawArguments ? (JSON.parse(rawArguments) as Args) : {};
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("not an object");
  } catch {
    return { name, ok: false, error: "Arguments were not a JSON object." };
  }
  try {
    const { summary, result } = runner(args);
    return { name, ok: true, summary, result };
  } catch (error) {
    return { name, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
