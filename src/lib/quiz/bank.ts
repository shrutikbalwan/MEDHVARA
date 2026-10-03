/**
 * Numeric quiz questions with exact, computed answers, tagged with the topic
 * keywords they fit. Most are OpenENTC Studio's Learning Hub questions
 * (packages/learning/src/courseware.mjs, same author) with their maths
 * unchanged; the LED, colour-code, 555 and battery-life questions are new and
 * use MEDHVARA's verified calculator engine.
 *
 * Every question draws fresh numbers per attempt (see engine.ts), so the
 * answer key is computed — never written by the AI.
 */
import * as calc from "@/lib/calculators/engine";
import { formatSI } from "@/lib/calculators/format";
import type { NumericQuestion } from "@/lib/quiz/engine";

export type BankQuestion = NumericQuestion & {
  /** Lower-case words or phrases; a topic matches when its title or description contains one. */
  keywords: string[];
};

/** Engineering notation for prompts, e.g. "4.7 kΩ". */
const E = (value: number, unit = "") => formatSI(value, unit);

const DIGIT_COLOURS = calc.COLOR_BANDS.filter((b) => b.digit !== null).map((b) => b.name);

export const QUESTION_BANK: BankQuestion[] = [
  // ---- Basic Electronics -------------------------------------------------
  {
    id: "ohm",
    keywords: ["ohm", "ohm's law", "ohms law", "resistance", "basic circuit", "kirchhoff"],
    params: { v: [5, 24, 1], r: [100, 4700, 100] },
    prompt: (p) => `A ${p.v} V supply drives a ${E(p.r, "Ω")} resistor. What current flows?`,
    answer: (p) => p.v / p.r,
    unit: "A",
    explain: (p, a) => `I = V/R = ${p.v}/${p.r} = ${E(a, "A")}.`,
  },
  {
    id: "parallel",
    keywords: ["parallel", "series", "resistor network", "resistors in", "kirchhoff"],
    params: { a: [1000, 10000, 100], b: [1000, 10000, 100] },
    prompt: (p) => `What is ${E(p.a, "Ω")} in parallel with ${E(p.b, "Ω")}?`,
    answer: (p) => (p.a * p.b) / (p.a + p.b),
    unit: "Ω",
    explain: (p, a) => `R = R1·R2/(R1 + R2) = ${E(a, "Ω")}.`,
  },
  {
    id: "vdiv",
    keywords: ["divider", "voltage divider", "potentiometer", "potential divider"],
    params: { vin: [5, 24, 1], r1: [1000, 10000, 1000], r2: [1000, 10000, 1000] },
    prompt: (p) =>
      `Vin = ${p.vin} V, R1 = ${E(p.r1, "Ω")} (top), R2 = ${E(p.r2, "Ω")} (bottom). Find Vout across R2.`,
    answer: (p) => (p.vin * p.r2) / (p.r1 + p.r2),
    unit: "V",
    explain: (p, a) => `Vout = ${p.vin}·${p.r2}/(${p.r1} + ${p.r2}) = ${E(a, "V")}.`,
  },
  {
    id: "loaded",
    keywords: ["divider", "voltage divider", "loading", "load"],
    params: { r: [1000, 10000, 1000], load: { choices: [1000, 2000, 5000, 10000] } },
    prompt: (p) =>
      `A 10 V source feeds two equal ${E(p.r, "Ω")} resistors. A ${E(p.load, "Ω")} load is connected across the bottom one. What is the output voltage now?`,
    answer: (p) => {
      const rp = (p.r * p.load) / (p.r + p.load);
      return (10 * rp) / (p.r + rp);
    },
    unit: "V",
    explain: (p, a) =>
      `The bottom resistor and load in parallel make ${E((p.r * p.load) / (p.r + p.load), "Ω")}, so Vout = ${E(a, "V")} instead of 5 V.`,
  },
  {
    id: "pmax",
    keywords: ["thevenin", "thévenin", "norton", "maximum power", "power transfer"],
    params: { vth: [5, 20, 1], rth: [10, 100, 5] },
    prompt: (p) =>
      `A source has Vth = ${p.vth} V and Rth = ${p.rth} Ω. What is the maximum power it can deliver to a load?`,
    answer: (p) => p.vth ** 2 / (4 * p.rth),
    unit: "W",
    explain: (p, a) => `Pmax = Vth²/(4Rth) = ${E(a, "W")} at RL = ${p.rth} Ω.`,
  },
  {
    id: "tau",
    keywords: ["rc", "time constant", "transient", "charging", "capacitor", "capacitors"],
    params: { r: [1000, 100000, 1000], c: { choices: [1e-9, 10e-9, 100e-9, 1e-6, 10e-6] } },
    prompt: (p) => `R = ${E(p.r, "Ω")}, C = ${E(p.c, "F")}. What is the time constant?`,
    answer: (p) => p.r * p.c,
    unit: "s",
    explain: (p, a) => `τ = RC = ${E(a, "s")}.`,
  },
  {
    id: "charge",
    keywords: ["rc", "time constant", "transient", "charging", "capacitor", "capacitors"],
    params: { v: [5, 15, 1], n: { choices: [1, 2, 3] } },
    prompt: (p) =>
      `A capacitor charges from 0 towards ${p.v} V. What is its voltage after ${p.n} time constant(s)?`,
    answer: (p) => p.v * (1 - Math.exp(-p.n)),
    unit: "V",
    explain: (p, a) => `v = V(1 − e^−${p.n}) = ${E(a, "V")}.`,
  },
  {
    id: "xc",
    keywords: ["reactance", "impedance", "ac circuit", "ac circuits", "phasor", "capacitor", "alternating current"],
    params: { f: [50, 5000, 50], c: { choices: [100e-9, 1e-6, 10e-6] } },
    prompt: (p) => `Find the reactance of a ${E(p.c, "F")} capacitor at ${p.f} Hz.`,
    answer: (p) => 1 / (2 * Math.PI * p.f * p.c),
    unit: "Ω",
    explain: (p, a) => `Xc = 1/(2πfC) = ${E(a, "Ω")}.`,
  },
  {
    id: "f0",
    keywords: ["resonance", "resonant", "rlc", "lc circuit", "tank circuit", "inductor"],
    params: { l: { choices: [1e-3, 10e-3, 100e-3] }, c: { choices: [10e-9, 100e-9, 1e-6] } },
    prompt: (p) => `L = ${E(p.l, "H")}, C = ${E(p.c, "F")}. Find the resonant frequency.`,
    answer: (p) => 1 / (2 * Math.PI * Math.sqrt(p.l * p.c)),
    unit: "Hz",
    explain: (p, a) => `f0 = 1/(2π√(LC)) = ${E(a, "Hz")}.`,
  },
  {
    id: "inv-gain",
    keywords: ["op-amp", "opamp", "op amp", "op-amps", "operational amplifier", "amplifier", "amplifiers"],
    params: { rf: [10000, 100000, 10000], rin: [1000, 10000, 1000], vin: [0.1, 1, 0.1] },
    prompt: (p) =>
      `An inverting amplifier has Rf = ${E(p.rf, "Ω")}, Rin = ${E(p.rin, "Ω")} and Vin = ${p.vin} V. Find Vout.`,
    answer: (p) => (-p.rf / p.rin) * p.vin,
    unit: "V",
    explain: (p, a) => `Vout = −(Rf/Rin)·Vin = ${E(a, "V")}.`,
  },
  {
    id: "ripple",
    keywords: ["rectifier", "rectifiers", "power supply", "smoothing", "ripple", "diode", "diodes"],
    params: { i: [0.1, 1, 0.1], c: { choices: [470e-6, 1000e-6, 2200e-6, 4700e-6] } },
    prompt: (p) =>
      `A 50 Hz full-wave rectifier supplies ${p.i} A from a ${E(p.c, "F")} capacitor. Estimate the peak-to-peak ripple.`,
    answer: (p) => p.i / (2 * 50 * p.c),
    unit: "V",
    explain: (p, a) => `ΔV ≈ I/(2fC) = ${E(a, "V")}.`,
  },
  {
    id: "led",
    keywords: ["led", "leds", "light emitting diode", "light-emitting diode"],
    params: {
      vs: { choices: [3.3, 5, 9, 12] },
      vf: { choices: [1.8, 2, 2.2, 3, 3.2] },
      ma: [5, 20, 5],
    },
    prompt: (p) =>
      `An LED with a ${p.vf} V forward voltage runs from ${p.vs} V at ${p.ma} mA. What series resistor is needed (exact value)?`,
    answer: (p) => calc.ledResistor({ supply: p.vs, forwardVoltage: p.vf, current: p.ma / 1000 }).resistance,
    unit: "Ω",
    explain: (p, a) =>
      `R = (Vs − Vf)/I = (${p.vs} − ${p.vf})/${p.ma} mA = ${E(a, "Ω")}; the next standard value up is ${E(calc.ledResistor({ supply: p.vs, forwardVoltage: p.vf, current: p.ma / 1000 }).standard, "Ω")}.`,
  },
  {
    id: "colour-code",
    keywords: ["colour code", "color code", "resistor", "resistors", "resistor colour", "resistor color"],
    params: { d1: [1, 9, 1], d2: [0, 9, 1], m: [0, 5, 1] },
    prompt: (p) =>
      `A resistor's bands read ${DIGIT_COLOURS[p.d1]}, ${DIGIT_COLOURS[p.d2]}, ${DIGIT_COLOURS[p.m]}, gold. What is its resistance?`,
    answer: (p) => calc.decodeResistorBands([DIGIT_COLOURS[p.d1], DIGIT_COLOURS[p.d2], DIGIT_COLOURS[p.m], "gold"]).value,
    unit: "Ω",
    tolerance: 0.001,
    explain: (p, a) => `Digits ${p.d1}${p.d2}, multiplier ×10^${p.m} → ${E(a, "Ω")}, gold = ±5 %.`,
  },
  {
    id: "555",
    keywords: ["555", "astable", "timer ic", "oscillator", "oscillators", "multivibrator"],
    params: {
      r1: { choices: [1000, 2200, 4700, 10000] },
      r2: { choices: [4700, 10000, 22000, 47000] },
      c: { choices: [10e-9, 100e-9, 1e-6] },
    },
    prompt: (p) =>
      `A 555 astable has R1 = ${E(p.r1, "Ω")}, R2 = ${E(p.r2, "Ω")} and C = ${E(p.c, "F")}. What is the output frequency?`,
    answer: (p) => calc.timer555Astable({ r1: p.r1, r2: p.r2, c: p.c }).frequency,
    unit: "Hz",
    explain: (p, a) => `f = 1/(ln2·(R1 + 2R2)·C) ≈ 1.44/((R1 + 2R2)·C) = ${E(a, "Hz")}.`,
  },

  // ---- Embedded Systems -------------------------------------------------
  {
    id: "pwm",
    keywords: ["pwm", "analogwrite", "pulse width", "duty cycle", "arduino", "gpio"],
    params: { n: [0, 255, 1] },
    prompt: (p) => `analogWrite(9, ${p.n}) on a 5 V Arduino. What is the average output voltage?`,
    answer: (p) => (5 * p.n) / 255,
    unit: "V",
    explain: (p, a) => `5 × ${p.n}/255 = ${E(a, "V")}.`,
  },
  {
    id: "fastpwm",
    keywords: ["pwm", "timers", "prescaler", "timer interrupt", "arduino timer"],
    params: { n: { choices: [1, 8, 64, 256] } },
    prompt: (p) => `Timer0 in fast PWM mode with prescaler ${p.n} on a 16 MHz Uno. What is the PWM frequency?`,
    answer: (p) => 16e6 / (p.n * 256),
    unit: "Hz",
    explain: (p, a) => `16 MHz/(${p.n}·256) = ${E(a, "Hz")}.`,
  },
  {
    id: "lsb",
    keywords: ["adc", "analog to digital", "analog-to-digital", "analogread", "resolution", "sensor", "sensors"],
    params: { bits: { choices: [8, 10, 12, 16] }, vref: { choices: [1.1, 2.5, 3.3, 5] } },
    prompt: (p) => `What is 1 LSB of a ${p.bits}-bit ADC with a ${p.vref} V reference?`,
    answer: (p) => p.vref / 2 ** p.bits,
    unit: "V",
    explain: (p, a) => `${p.vref}/2^${p.bits} = ${E(a, "V")}.`,
  },
  {
    id: "lm35",
    keywords: ["lm35", "temperature sensor", "temperature", "analogread", "sensor", "sensors"],
    params: { t: [5, 100, 1] },
    prompt: (p) =>
      `An LM35 gives 10 mV/°C. At ${p.t} °C, what does analogRead return with the 1.1 V internal reference (10-bit, code = Vin·1024/Vref rounded down)?`,
    answer: (p) => Math.floor((p.t * 0.01 * 1024) / 1.1),
    tolerance: 0.002,
    explain: (p, a) => `${p.t * 10} mV × 1024/1.1 V → ${a}.`,
  },
  {
    id: "uart",
    keywords: ["uart", "serial", "baud", "rs232", "serial communication"],
    params: { baud: { choices: [9600, 19200, 57600, 115200] } },
    prompt: (p) => `How long does one 8N1 UART character (start + 8 data + 1 stop) take at ${p.baud} baud?`,
    answer: (p) => 10 / p.baud,
    unit: "s",
    explain: (p, a) => `10 bits/${p.baud} = ${E(a, "s")}.`,
  },
  {
    id: "i2c",
    keywords: ["i2c", "i²c", "iic", "two-wire"],
    params: { address: { choices: [0x27, 0x3c, 0x48, 0x50, 0x68] } },
    prompt: (p) =>
      `A device has 7-bit I²C address 0x${p.address.toString(16)}. What byte (decimal) is sent first to WRITE to it?`,
    answer: (p) => p.address << 1,
    tolerance: 0,
    explain: (p, a) => `(0x${p.address.toString(16)} << 1) | 0 = 0x${a.toString(16)} = ${a}.`,
  },
  {
    id: "binary",
    keywords: ["binary", "number system", "number systems", "bits", "bit manipulation"],
    params: { n: [5, 250, 1] },
    prompt: (p) => `How many 1s are in the binary form of ${p.n}?`,
    answer: (p) => p.n.toString(2).split("").filter((c) => c === "1").length,
    tolerance: 0,
    explain: (p) => `${p.n} = ${p.n.toString(2)}₂.`,
  },
  {
    id: "twos",
    keywords: ["two's complement", "twos complement", "signed", "number system", "number systems"],
    params: { bits: { choices: [4, 8, 12, 16] } },
    prompt: (p) => `What is the most negative number in ${p.bits}-bit two's complement?`,
    answer: (p) => -(2 ** (p.bits - 1)),
    tolerance: 0,
    explain: (p, a) => `−2^(n−1) = ${a}.`,
  },
  {
    id: "counter",
    keywords: ["counter", "counters", "flip-flop", "flip-flops", "flip flop", "flipflop", "frequency divider"],
    params: { bits: [2, 10, 1], f: { choices: [1e6, 10e6, 32768, 50e6] } },
    prompt: (p) => `A ${p.bits}-bit binary ripple counter is clocked at ${E(p.f, "Hz")}. What frequency comes out of the last stage?`,
    answer: (p) => p.f / 2 ** p.bits,
    unit: "Hz",
    explain: (p, a) => `f/2^${p.bits} = ${E(a, "Hz")}.`,
  },
  {
    id: "8051-cycle",
    keywords: ["8051", "microcontroller architecture"],
    params: { f: { choices: [6e6, 11.0592e6, 12e6, 24e6] } },
    prompt: (p) => `What is the 8051 machine-cycle time with a ${E(p.f, "Hz")} crystal?`,
    answer: (p) => 12 / p.f,
    unit: "s",
    explain: (p, a) => `12/f = ${E(a, "s")}.`,
  },
  {
    id: "rtos-util",
    keywords: ["rtos", "scheduling", "real-time", "real time", "freertos"],
    params: { c1: [1, 3, 1], t1: [5, 10, 1], c2: [1, 4, 1], t2: [10, 20, 2] },
    prompt: (p) =>
      `Task 1: C = ${p.c1} ms, T = ${p.t1} ms. Task 2: C = ${p.c2} ms, T = ${p.t2} ms. What is the total CPU utilisation?`,
    answer: (p) => p.c1 / p.t1 + p.c2 / p.t2,
    tolerance: 0.005,
    explain: (p, a) => `U = ${p.c1}/${p.t1} + ${p.c2}/${p.t2} = ${a.toFixed(4)}.`,
  },

  // ---- IoT ---------------------------------------------------------------
  {
    id: "nyquist",
    keywords: ["sampling", "nyquist", "aliasing", "sample rate"],
    params: { fmax: [1000, 20000, 500] },
    prompt: (p) => `A signal contains frequencies up to ${E(p.fmax, "Hz")}. What is the minimum (Nyquist) sampling rate?`,
    answer: (p) => 2 * p.fmax,
    unit: "Hz",
    explain: (p, a) => `2·fmax = ${E(a, "Hz")}.`,
  },
  {
    id: "battery",
    keywords: ["battery", "battery life", "power consumption", "low power", "deep sleep", "sleep mode", "energy"],
    params: {
      mah: { choices: [1000, 2000, 2500, 3000] },
      active: [20, 200, 10],
      sleep: { choices: [10, 50, 100] },
      on: { choices: [5, 10, 30, 60] },
    },
    prompt: (p) =>
      `An IoT sensor node on a ${p.mah} mAh battery draws ${p.active} mA while awake for ${p.on} s every 10 minutes, and ${p.sleep} µA asleep the rest of the time. Roughly how many hours will the battery last?`,
    answer: (p) => {
      const average = (p.active * p.on + (p.sleep / 1000) * (600 - p.on)) / 600; // mA
      return p.mah / average;
    },
    unit: "h",
    explain: (p, a) => {
      const average = (p.active * p.on + (p.sleep / 1000) * (600 - p.on)) / 600;
      return `Average current = (${p.active} mA × ${p.on} s + ${p.sleep} µA × ${600 - p.on} s)/600 s = ${E(average / 1000, "A")}; life = ${p.mah} mAh ÷ ${Number(average.toPrecision(4))} mA ≈ ${Number(a.toPrecision(4))} h (${Number((a / 24).toPrecision(3))} days).`;
    },
  },
];
