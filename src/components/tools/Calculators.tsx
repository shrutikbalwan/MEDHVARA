"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import * as calc from "@/lib/calculators/engine";
import { formatPercent, formatSI, parseEngineering } from "@/lib/calculators/format";

import styles from "./Calculators.module.css";

/* ------------------------------------------------------------------------ */
/* Building blocks                                                           */
/* ------------------------------------------------------------------------ */

type Outcome = { ok: true; rows: [string, string][]; note?: ReactNode } | { ok: false; error: string };

/** Runs a calculation, turning any thrown error into a message instead of a crash. */
function compute(fn: () => Omit<Extract<Outcome, { ok: true }>, "ok">): Outcome {
  try {
    return { ok: true, ...fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  // Label linked by id (not wrapping), so the accessible name is just the
  // label text and the hint is announced as a description.
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <em id={`${id}-hint`} className={styles.hint}>
          {hint}
        </em>
      ) : null}
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <select id={id} className={styles.input} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function Result({ outcome, formula }: { outcome: Outcome; formula?: string }) {
  return (
    <div className={styles.result} aria-live="polite">
      {formula ? <p className={styles.formula}>{formula}</p> : null}
      {outcome.ok ? (
        <>
          <dl className={styles.rows}>
            {outcome.rows.map(([label, value]) => (
              <div key={label} className={styles.row}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {outcome.note ? <div className={styles.note}>{outcome.note}</div> : null}
        </>
      ) : (
        <p className={styles.error}>{outcome.error}</p>
      )}
    </div>
  );
}

const num = (text: string, label: string) => parseEngineering(text, label);
const optionalNum = (text: string, label: string) => (text.trim() ? num(text, label) : undefined);

/* ------------------------------------------------------------------------ */
/* Calculators                                                               */
/* ------------------------------------------------------------------------ */

function OhmsLaw() {
  const [v, setV] = useState("5");
  const [i, setI] = useState("20m");
  const [r, setR] = useState("");
  const [p, setP] = useState("");
  const outcome = compute(() => {
    const x = calc.solveOhm({
      V: optionalNum(v, "Voltage"),
      I: optionalNum(i, "Current"),
      R: optionalNum(r, "Resistance"),
      P: optionalNum(p, "Power"),
    });
    return {
      rows: [
        ["Voltage", formatSI(x.V, "V")],
        ["Current", formatSI(x.I, "A")],
        ["Resistance", formatSI(x.R, "Ω")],
        ["Power", formatSI(x.P, "W")],
      ],
    };
  });
  return (
    <>
      <p className={styles.intro}>Fill in any two; leave the other two empty.</p>
      <div className={styles.grid}>
        <Field label="Voltage V" value={v} onChange={setV} hint="e.g. 5" />
        <Field label="Current I" value={i} onChange={setI} hint="e.g. 20m" />
        <Field label="Resistance R" value={r} onChange={setR} hint="e.g. 4.7k" />
        <Field label="Power P" value={p} onChange={setP} hint="e.g. 0.25" />
      </div>
      <Result outcome={outcome} formula="V = I × R,  P = V × I" />
    </>
  );
}

function LedResistor() {
  const [vs, setVs] = useState("5");
  const [vf, setVf] = useState("2");
  const [i, setI] = useState("20m");
  const outcome = compute(() => {
    const x = calc.ledResistor({ supply: num(vs, "Supply"), forwardVoltage: num(vf, "Forward voltage"), current: num(i, "Current") });
    return {
      rows: [
        ["Exact resistor", formatSI(x.resistance, "Ω")],
        ["Use (E12, rounded up)", formatSI(x.standard, "Ω")],
        ["Actual LED current", formatSI(x.actualCurrent, "A")],
        ["Resistor power", formatSI(x.resistorPower, "W")],
        ["LED power", formatSI(x.ledPower, "W")],
      ],
      note:
        x.resistorPower > 0.25 ? "The resistor dissipates more than ¼ W — use a ½ W or larger part." : undefined,
    };
  });
  return (
    <>
      <div className={styles.grid}>
        <Field label="Supply voltage" value={vs} onChange={setVs} hint="V" />
        <Field label="LED forward voltage" value={vf} onChange={setVf} hint="red ≈ 2, blue/white ≈ 3" />
        <Field label="LED current" value={i} onChange={setI} hint="typ. 10m–20m" />
      </div>
      <Result outcome={outcome} formula="R = (Vsupply − Vf) ÷ I" />
    </>
  );
}

function VoltageDivider() {
  const [vin, setVin] = useState("12");
  const [r1, setR1] = useState("10k");
  const [r2, setR2] = useState("4.7k");
  const [load, setLoad] = useState("");
  const outcome = compute(() => {
    const l = optionalNum(load, "Load");
    const x = calc.voltageDivider({ vin: num(vin, "Vin"), r1: num(r1, "R1"), r2: num(r2, "R2"), load: l ?? Infinity });
    return {
      rows: [
        ["Vout (no load)", formatSI(x.unloaded, "V")],
        ...(l !== undefined ? ([["Vout (with load)", formatSI(x.vout, "V")]] as [string, string][]) : []),
        ["Divider current", formatSI(x.current, "A")],
        ["Thevenin resistance", formatSI(x.theveninResistance, "Ω")],
      ],
    };
  });
  return (
    <>
      <div className={styles.grid}>
        <Field label="Vin" value={vin} onChange={setVin} hint="V" />
        <Field label="R1 (top)" value={r1} onChange={setR1} />
        <Field label="R2 (bottom)" value={r2} onChange={setR2} />
        <Field label="Load across R2" value={load} onChange={setLoad} hint="optional" />
      </div>
      <Result outcome={outcome} formula="Vout = Vin × R2 ÷ (R1 + R2)" />
    </>
  );
}

const BAND_COLOURS = calc.COLOR_BANDS;
const hexOf = (name: string) => BAND_COLOURS.find((b) => b.name === name)?.hex ?? "transparent";

function ResistorDrawing({ bands }: { bands: string[] }) {
  return (
    <div className={styles.resistor} role="img" aria-label={`Resistor bands: ${bands.join(", ")}`}>
      <span className={styles.lead} />
      <span className={styles.body}>
        {bands.map((name, index) => (
          <span
            key={`${index}-${name}`}
            className={styles.band}
            style={{ background: hexOf(name), ...(name === "none" ? { outline: "1px dashed #999" } : {}) }}
            title={name}
          />
        ))}
      </span>
      <span className={styles.lead} />
    </div>
  );
}

const DIGITS = BAND_COLOURS.filter((b) => b.digit !== null).map((b) => b.name);
const MULTIPLIERS = BAND_COLOURS.filter((b) => b.multiplier !== null).map((b) => b.name);
const TOLERANCES = BAND_COLOURS.filter((b) => b.tolerance !== null).map((b) => b.name);
const TEMPCOS = BAND_COLOURS.filter((b) => b.tempco !== null).map((b) => b.name);

/** What each band position means for a 4-, 5- or 6-band resistor. */
function bandRoles(count: number): { label: string; options: string[] }[] {
  const digits = count >= 5 ? 3 : 2;
  return [
    ...Array.from({ length: digits }, (_, i) => ({ label: `Digit ${i + 1}`, options: DIGITS })),
    { label: "Multiplier", options: MULTIPLIERS },
    { label: "Tolerance", options: TOLERANCES },
    ...(count === 6 ? [{ label: "Temp. coefficient", options: TEMPCOS }] : []),
  ];
}

function ResistorColours() {
  const [mode, setMode] = useState<"decode" | "encode">("decode");
  const [count, setCount] = useState<"4" | "5" | "6">("4");
  const [bands, setBands] = useState<string[]>(["yellow", "violet", "red", "gold", "brown", "red"]);
  const [value, setValue] = useState("4.7k");

  const roles = bandRoles(Number(count));
  const chosen = roles.map(({ options }, index) => (options.includes(bands[index]) ? bands[index] : options[0]));

  const decoded = compute(() => {
    const x = calc.decodeResistorBands(chosen);
    return {
      rows: [
        ["Resistance", formatSI(x.value, "Ω")],
        ["Tolerance", `±${x.tolerance} %`],
        ["Range", `${formatSI(x.minimum, "Ω")} – ${formatSI(x.maximum, "Ω")}`],
        ...(x.tempco !== null ? ([["Temp. coefficient", `${x.tempco} ppm/K`]] as [string, string][]) : []),
      ],
    };
  });

  let encodedBands: string[] | null;
  try {
    encodedBands = calc.encodeResistorBands(num(value, "Resistance"), { bands: Number(count) }).bands;
  } catch {
    encodedBands = null;
  }
  const encoded = compute(() => {
    const x = calc.encodeResistorBands(num(value, "Resistance"), { bands: Number(count) });
    return {
      rows: [
        ["Bands", x.bands.join(", ")],
        ["Coded value", formatSI(x.value, "Ω")],
        ...(Math.abs(x.roundingError) > 1e-9
          ? ([["Rounded by", formatPercent(x.roundingError, 3)]] as [string, string][])
          : []),
      ],
    };
  });

  return (
    <>
      <div className={styles.grid}>
        <Select
          label="Direction"
          value={mode}
          onChange={setMode}
          options={[
            ["decode", "Colours → value"],
            ["encode", "Value → colours"],
          ] as const}
        />
        <Select
          label="Bands"
          value={count}
          onChange={setCount}
          options={[
            ["4", "4 bands"],
            ["5", "5 bands"],
            ["6", "6 bands"],
          ] as const}
        />
      </div>

      {mode === "decode" ? (
        <>
          <div className={styles.grid}>
            {roles.map(({ label, options }, index) => (
              <div key={label} className={styles.field}>
                <label htmlFor={`band-${index}`}>{label}</label>
                <span className={styles.colourPick}>
                  <span className={styles.swatch} style={{ background: hexOf(chosen[index]) }} />
                  <select
                    id={`band-${index}`}
                    className={styles.input}
                    value={chosen[index]}
                    onChange={(e) => {
                      const next = [...chosen];
                      next[index] = e.target.value;
                      setBands(next);
                    }}
                  >
                    {options.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </span>
              </div>
            ))}
          </div>
          <ResistorDrawing bands={chosen} />
          <Result outcome={decoded} />
        </>
      ) : (
        <>
          <div className={styles.grid}>
            <Field label="Resistance" value={value} onChange={setValue} hint="e.g. 4.7k, 220, 1M" />
          </div>
          {encodedBands ? <ResistorDrawing bands={encodedBands} /> : null}
          <Result outcome={encoded} />
        </>
      )}
    </>
  );
}

function SeriesParallel() {
  const [kind, setKind] = useState<"resistor" | "capacitor" | "inductor">("resistor");
  const [values, setValues] = useState("1k, 2.2k, 4.7k");
  const unit = kind === "capacitor" ? "F" : kind === "inductor" ? "H" : "Ω";
  const outcome = compute(() => {
    const list = values
      .split(/[,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t, i) => num(t, `Value ${i + 1}`));
    const x = calc.seriesParallel(list);
    const series = kind === "capacitor" ? x.parallel : x.series;
    const parallel = kind === "capacitor" ? x.series : x.parallel;
    return {
      rows: [
        ["In series", formatSI(series, unit)],
        ["In parallel", formatSI(parallel, unit)],
      ],
    };
  });
  return (
    <>
      <div className={styles.grid}>
        <Select
          label="Component"
          value={kind}
          onChange={setKind}
          options={[
            ["resistor", "Resistors"],
            ["capacitor", "Capacitors"],
            ["inductor", "Inductors"],
          ] as const}
        />
        <Field label="Values" value={values} onChange={setValues} hint="comma separated" />
      </div>
      <Result
        outcome={outcome}
        formula={kind === "capacitor" ? "Parallel: C1 + C2 + …   Series: 1 ÷ (1/C1 + 1/C2 + …)" : "Series: X1 + X2 + …   Parallel: 1 ÷ (1/X1 + 1/X2 + …)"}
      />
    </>
  );
}

function Timer555() {
  const [mode, setMode] = useState<"astable" | "design" | "monostable">("astable");
  const [r1, setR1] = useState("1k");
  const [r2, setR2] = useState("10k");
  const [c, setC] = useState("10n");
  const [f, setF] = useState("1k");
  const [duty, setDuty] = useState("60");
  const [r, setR] = useState("100k");
  const [cm, setCm] = useState("10u");

  const outcome =
    mode === "astable"
      ? compute(() => {
          const x = calc.timer555Astable({ r1: num(r1, "R1"), r2: num(r2, "R2"), c: num(c, "C") });
          return {
            rows: [
              ["Frequency", formatSI(x.frequency, "Hz")],
              ["Period", formatSI(x.period, "s")],
              ["High time", formatSI(x.high, "s")],
              ["Low time", formatSI(x.low, "s")],
              ["Duty cycle", formatPercent(x.duty, 3)],
            ],
          };
        })
      : mode === "design"
        ? compute(() => {
            const x = calc.design555Astable({ frequency: num(f, "Frequency"), duty: num(duty, "Duty") / 100, c: num(c, "C") });
            return {
              rows: [
                ["Exact R1", formatSI(x.r1, "Ω")],
                ["Exact R2", formatSI(x.r2, "Ω")],
                ["Build with (E24)", `R1 ${formatSI(x.standard.r1, "Ω")}, R2 ${formatSI(x.standard.r2, "Ω")}`],
                ["That gives", `${formatSI(x.standard.frequency, "Hz")}, ${formatPercent(x.standard.duty, 3)} duty`],
              ],
              note: x.warnings.length ? x.warnings.join(" ") : undefined,
            };
          })
        : compute(() => {
            const x = calc.timer555Monostable({ r: num(r, "R"), c: num(cm, "C") });
            return { rows: [["Pulse width", formatSI(x.width, "s")]] };
          });

  return (
    <>
      <div className={styles.grid}>
        <Select
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            ["astable", "Astable — analyse"],
            ["design", "Astable — design"],
            ["monostable", "Monostable"],
          ] as const}
        />
      </div>
      <div className={styles.grid}>
        {mode === "astable" ? (
          <>
            <Field label="R1" value={r1} onChange={setR1} />
            <Field label="R2" value={r2} onChange={setR2} />
            <Field label="C" value={c} onChange={setC} />
          </>
        ) : mode === "design" ? (
          <>
            <Field label="Frequency" value={f} onChange={setF} hint="Hz" />
            <Field label="Duty cycle" value={duty} onChange={setDuty} hint="% (above 50)" />
            <Field label="C" value={c} onChange={setC} />
          </>
        ) : (
          <>
            <Field label="R" value={r} onChange={setR} />
            <Field label="C" value={cm} onChange={setCm} />
          </>
        )}
      </div>
      <Result
        outcome={outcome}
        formula={mode === "monostable" ? "t = ln3 × R × C ≈ 1.1 RC" : "f = 1 ÷ (ln2 × (R1 + 2·R2) × C)"}
      />
    </>
  );
}

function RcCircuit() {
  const [r, setR] = useState("1k");
  const [c, setC] = useState("1u");
  const outcome = compute(() => {
    const x = calc.rcFilter({ resistance: num(r, "R"), capacitance: num(c, "C") });
    return {
      rows: [
        ["Time constant τ", formatSI(x.tau, "s")],
        ["Cutoff frequency", formatSI(x.cutoff, "Hz")],
        ["Rise time (10–90 %)", formatSI(x.riseTime, "s")],
        ["Settles (5τ)", formatSI(x.settle5Tau, "s")],
      ],
    };
  });
  return (
    <>
      <div className={styles.grid}>
        <Field label="R" value={r} onChange={setR} />
        <Field label="C" value={c} onChange={setC} />
      </div>
      <Result outcome={outcome} formula="τ = R × C,   fc = 1 ÷ (2π R C)" />
    </>
  );
}

function ComponentCodes() {
  const [cap, setCap] = useState("104K");
  const [smd, setSmd] = useState("472");
  const capOutcome = compute(() => {
    const x = calc.decodeCapacitorCode(cap);
    return {
      rows: [
        ["Capacitance", formatSI(x.farads, "F")],
        ["Tolerance", x.tolerance ?? "not marked"],
      ],
    };
  });
  const smdOutcome = compute(() => {
    const x = calc.decodeSmdResistor(smd);
    return {
      rows: [
        ["Resistance", formatSI(x.value, "Ω")],
        ["Marking system", x.system],
      ],
    };
  });
  return (
    <div className={styles.split}>
      <div>
        <div className={styles.grid}>
          <Field label="Capacitor code" value={cap} onChange={setCap} hint="104, 223J, 471K" />
        </div>
        <Result outcome={capOutcome} />
      </div>
      <div>
        <div className={styles.grid}>
          <Field label="SMD resistor code" value={smd} onChange={setSmd} hint="472, 1002, 4R7, 01C" />
        </div>
        <Result outcome={smdOutcome} />
      </div>
    </div>
  );
}

function OpAmp() {
  const [config, setConfig] = useState<"inverting" | "non-inverting" | "follower" | "difference">("non-inverting");
  const [r1, setR1] = useState("10k");
  const [r2, setR2] = useState("90k");
  const [vin, setVin] = useState("0.1");
  const [supply, setSupply] = useState("12");
  const [gbw, setGbw] = useState("1M");
  const outcome = compute(() => {
    const x = calc.opampStage({
      config,
      r1: num(r1, "R1"),
      r2: num(r2, "R2"),
      inputPeak: num(vin, "Input peak"),
      supply: num(supply, "Supply"),
      gbw: num(gbw, "GBW"),
    });
    return {
      rows: [
        ["Gain", `${formatSI(x.gain)}  (${formatSI(x.gainDb, "dB", 3)})`],
        ["Bandwidth", formatSI(x.bandwidth, "Hz")],
        ["Output peak", formatSI(x.outputPeak, "V")],
        ["Input impedance", formatSI(x.inputImpedance, "Ω")],
      ],
      note: x.clipping ? "⚠ The output exceeds the supply rail — the signal will clip." : undefined,
    };
  });
  return (
    <>
      <div className={styles.grid}>
        <Select
          label="Configuration"
          value={config}
          onChange={setConfig}
          options={[
            ["inverting", "Inverting"],
            ["non-inverting", "Non-inverting"],
            ["follower", "Voltage follower"],
            ["difference", "Difference"],
          ] as const}
        />
        <Field label="R1" value={r1} onChange={setR1} />
        <Field label="R2 (feedback)" value={r2} onChange={setR2} />
        <Field label="Input peak" value={vin} onChange={setVin} hint="V" />
        <Field label="Supply ±" value={supply} onChange={setSupply} hint="V" />
        <Field label="Gain-bandwidth" value={gbw} onChange={setGbw} hint="Hz" />
      </div>
      <Result
        outcome={outcome}
        formula={config === "inverting" ? "Gain = −R2 ÷ R1" : config === "non-inverting" ? "Gain = 1 + R2 ÷ R1" : config === "follower" ? "Gain = 1" : "Gain = R2 ÷ R1"}
      />
    </>
  );
}

function Adc() {
  const [bits, setBits] = useState("10");
  const [ref, setRef] = useState("5");
  const outcome = compute(() => {
    const x = calc.adcResolution({ bits: num(bits, "Bits"), reference: num(ref, "Reference") });
    return {
      rows: [
        ["Levels", String(x.levels)],
        ["Step size (LSB)", formatSI(x.lsb, "V")],
        ["Ideal SNR", formatSI(x.snrDb, "dB", 3)],
      ],
    };
  });
  return (
    <>
      <div className={styles.grid}>
        <Field label="Resolution" value={bits} onChange={setBits} hint="bits (Arduino Uno: 10)" />
        <Field label="Reference voltage" value={ref} onChange={setRef} hint="V" />
      </div>
      <Result outcome={outcome} formula="LSB = Vref ÷ 2ᴺ,   SNR ≈ 6.02 N + 1.76 dB" />
    </>
  );
}

function Resonance() {
  const [r, setR] = useState("10");
  const [l, setL] = useState("1m");
  const [c, setC] = useState("1u");
  const [f, setF] = useState("1k");
  const outcome = compute(() => {
    const x = calc.rlcResonance({ resistance: num(r, "R"), inductance: num(l, "L"), capacitance: num(c, "C") });
    const xr = calc.reactance({ frequency: num(f, "Frequency"), capacitance: num(c, "C"), inductance: num(l, "L") });
    return {
      rows: [
        ["Resonant frequency", formatSI(x.resonance, "Hz")],
        ["Q factor", formatSI(x.q)],
        ["Bandwidth", formatSI(x.bandwidth, "Hz")],
        ["Characteristic Z₀", formatSI(x.characteristicImpedance, "Ω")],
        [`Xc at ${formatSI(num(f, "Frequency"), "Hz")}`, formatSI(xr.capacitive, "Ω")],
        [`XL at ${formatSI(num(f, "Frequency"), "Hz")}`, formatSI(xr.inductive, "Ω")],
      ],
    };
  });
  return (
    <>
      <div className={styles.grid}>
        <Field label="R" value={r} onChange={setR} />
        <Field label="L" value={l} onChange={setL} hint="H" />
        <Field label="C" value={c} onChange={setC} hint="F" />
        <Field label="Frequency for X" value={f} onChange={setF} hint="Hz" />
      </div>
      <Result outcome={outcome} formula="f₀ = 1 ÷ (2π√(LC)),  Xc = 1 ÷ (2πfC),  XL = 2πfL" />
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Page                                                                      */
/* ------------------------------------------------------------------------ */

const CALCULATORS = [
  { id: "ohm", name: "Ohm's law", icon: "Ω", Component: OhmsLaw },
  { id: "led", name: "LED resistor", icon: "💡", Component: LedResistor },
  { id: "divider", name: "Voltage divider", icon: "➗", Component: VoltageDivider },
  { id: "colour", name: "Resistor colour code", icon: "🌈", Component: ResistorColours },
  { id: "combine", name: "Series / parallel", icon: "⧉", Component: SeriesParallel },
  { id: "555", name: "555 timer", icon: "⏱", Component: Timer555 },
  { id: "rc", name: "RC circuit", icon: "〰", Component: RcCircuit },
  { id: "codes", name: "Capacitor & SMD codes", icon: "🔤", Component: ComponentCodes },
  { id: "opamp", name: "Op-amp gain", icon: "▷", Component: OpAmp },
  { id: "adc", name: "ADC resolution", icon: "📶", Component: Adc },
  { id: "rlc", name: "RLC & reactance", icon: "🔁", Component: Resonance },
] as const;

type CalculatorId = (typeof CALCULATORS)[number]["id"];

export function Calculators() {
  const [active, setActive] = useState<CalculatorId>("ohm");

  // Deep links such as /tools#led open that calculator. Read after mount, so
  // the server render (which has no hash) and the first client render match.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (CALCULATORS.some((c) => c.id === id)) setActive(id as CalculatorId);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const current = CALCULATORS.find((c) => c.id === active) ?? CALCULATORS[0];
  const Active = current.Component;

  return (
    <div className={styles.layout}>
      <nav className={styles.picker} aria-label="Calculators">
        {CALCULATORS.map((c) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            className={`${styles.pick} ${c.id === active ? styles.pickActive : ""}`}
            aria-current={c.id === active ? "true" : undefined}
          >
            <span aria-hidden="true" className={styles.pickIcon}>
              {c.icon}
            </span>
            {c.name}
          </a>
        ))}
      </nav>

      <section className={styles.panel} aria-labelledby="calc-title">
        <h2 id="calc-title" className={styles.panelTitle}>
          {current.name}
        </h2>
        <Active />
      </section>
    </div>
  );
}
