import assert from "node:assert/strict";
import test from "node:test";

import { formatSI, parseEngineering } from "@/lib/calculators/format";

test("parseEngineering reads values the way students type them", () => {
  const cases: [string | number, number][] = [
    [4700, 4700], ["4.7k", 4700], ["4k7", 4700], ["4K7", 4700], ["100n", 1e-7], ["100nF", 1e-7],
    ["20 mA", 0.02], ["1.5MΩ", 1.5e6], ["2.2µF", 2.2e-6], ["2u2", 2.2e-6], ["4R7", 4.7],
    ["10 kohm", 1e4], ["1e3", 1000], ["-5V", -5], ["1kHz", 1000], ["10mH", 0.01], [".5", 0.5],
  ];
  for (const [input, expected] of cases) {
    const got = parseEngineering(input);
    assert.ok(Math.abs(got - expected) <= Math.abs(expected) * 1e-12, `${input} → ${got}, expected ${expected}`);
  }
});

test("parseEngineering rejects text that is not a number", () => {
  for (const bad of ["abc", "", "4.7x", "1k2k"]) assert.throws(() => parseEngineering(bad), RangeError, bad);
});

test("formatSI picks the right unit prefix, including at the boundaries", () => {
  const cases: [number, string, string][] = [
    [4700, "Ω", "4.7 kΩ"], [1e-7, "F", "100 nF"], [0.02, "A", "20 mA"], [1e6, "Ω", "1 MΩ"], [0, "V", "0 V"],
    [Infinity, "Ω", "∞ Ω"], [999.9, "Hz", "999.9 Hz"], [0.0009999, "s", "999.9 µs"], [999.96, "Hz", "1 kHz"],
    [-0.005, "V", "-5 mV"], [68.7, "", "68.7"],
  ];
  for (const [value, unit, expected] of cases) assert.equal(formatSI(value, unit), expected);
});
