// OpenENTC Studio's own calculator tests (tests/calculators.test.mjs, same
// author), run against MEDHVARA's TypeScript port so the port can never drift
// from the original's verified results. Only the import path and one type
// annotation changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adcResolution, convertLevel, dbToRatio, decodeCapacitorCode, decodeResistorBands, decodeSmdResistor, design555Astable, encodeResistorBands, ledResistor, nearestPreferred, opampStage, ratioToDb, rcFilter, rlcResonance, seriesParallel, solveOhm, timer555Astable, timer555Monostable, voltageDivider } from '@/lib/calculators/engine';

const near = (actual: number, expected: number, tolerance: number, message: string) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

test('resistor colour codes decode and encode', () => {
  assert.equal(decodeResistorBands(['yellow', 'violet', 'red', 'gold']).value, 4700);
  const six = decodeResistorBands(['brown', 'black', 'black', 'red', 'brown', 'red']);
  assert.deepEqual([six.value, six.tolerance, six.tempco], [10000, 1, 50]);
  assert.equal(decodeResistorBands(['brown', 'black', 'gold', 'gold']).value, 1);
  assert.equal(decodeResistorBands(['red', 'red', 'brown']).tolerance, 20);
  assert.deepEqual(encodeResistorBands(4700).bands, ['yellow', 'violet', 'red', 'gold']);
  assert.deepEqual(encodeResistorBands(0.47).bands, ['yellow', 'violet', 'silver', 'gold']);
  assert.deepEqual(encodeResistorBands(10000, { bands: 5 }).bands, ['brown', 'black', 'black', 'red', 'brown']);
  assert.equal(encodeResistorBands(12.34, { bands: 5 }).value, 12.3);
  for (const value of [1, 22, 330, 4700, 56000, 1e6]) assert.equal(decodeResistorBands(encodeResistorBands(value).bands).value, value);
  assert.throws(() => decodeResistorBands(['gold', 'red', 'red', 'gold']), /digit/);
});

test('E-series, SMD and capacitor markings', () => {
  assert.equal(nearestPreferred(5000, 'E12').value, 4700);
  assert.equal(nearestPreferred(1234, 'E96').value, 1240);
  assert.equal(nearestPreferred(9.5, 'E24').value, 9.1);
  assert.equal(decodeSmdResistor('472').value, 4700);
  assert.equal(decodeSmdResistor('4R7').value, 4.7);
  assert.equal(decodeSmdResistor('1002').value, 10000);
  assert.equal(decodeSmdResistor('01C').value, 10000);
  assert.equal(decodeSmdResistor('68X').value, 49.9);
  const cap = decodeCapacitorCode('104K');
  near(cap.farads, 100e-9, 1e-21, '104'); assert.equal(cap.tolerance, '±10 %');
  near(decodeCapacitorCode('229').picofarads, 2.2, 1e-12, '229 = 2.2 pF');
});

test('555 timer analysis and design', () => {
  const astable = timer555Astable({ r1: 1000, r2: 10000, c: 10e-9 });
  near(astable.frequency, 1 / (Math.LN2 * 21000 * 10e-9), 1e-9, 'f = 1/(ln2·(R1+2R2)C)');
  near(astable.duty, 11 / 21, 1e-12, 'duty');
  near(timer555Monostable({ r: 100000, c: 10e-6 }).width, 1.0986, 1e-4, '1.1RC');
  const design = design555Astable({ frequency: 1000, duty: 0.6, c: 10e-9 });
  const check = timer555Astable({ r1: design.r1, r2: design.r2, c: 10e-9 });
  near(check.frequency, 1000, 1e-9, 'designed frequency'); near(check.duty, 0.6, 1e-12, 'designed duty');
  near(design.standard.frequency, 1000, 30, 'E24 build');
  assert.throws(() => design555Astable({ duty: 0.4 }), /50 %/);
});

test('op-amp stages, decibels and power units', () => {
  const inverting = opampStage({ config: 'inverting', r1: 10000, r2: 100000, gbw: 1e6 });
  assert.equal(inverting.gain, -10); near(inverting.bandwidth, 1e6 / 11, 1e-6, 'GBW / noise gain');
  assert.equal(opampStage({ config: 'non-inverting', r1: 1000, r2: 9000 }).gain, 10);
  assert.equal(opampStage({ config: 'non-inverting', r1: 1000, r2: 99000, inputPeak: 0.2, supply: 15 }).clipping, true);
  near(ratioToDb(2), 3.0103, 1e-4, '3 dB'); near(ratioToDb(2, 'voltage'), 6.0206, 1e-4, '6 dB'); near(dbToRatio(20, 'voltage'), 10, 1e-12, '20 dB');
  const zero = convertLevel(0, 'dBm', 50);
  near(zero.Vrms, 0.2236, 1e-4, '0 dBm in 50 Ω'); near(zero.dBuV, 106.99, 0.01, 'dBµV');
  near(convertLevel(1, 'W').dBm, 30, 1e-12, '1 W'); near(convertLevel(1, 'Vrms', 50).dBm, 13.01, 0.01, '1 V rms');
});

test('circuit formulas', () => {
  assert.deepEqual(solveOhm({ V: 12, R: 4 }), { V: 12, R: 4, I: 3, P: 36 });
  near(solveOhm({ P: 100, R: 4 }).V, 20, 1e-12, 'V from P and R');
  assert.throws(() => solveOhm({ V: 1 }), /exactly two/);
  assert.deepEqual(seriesParallel([100, 100]), { series: 200, parallel: 50 });
  near(voltageDivider({ vin: 12, r1: 10000, r2: 10000, load: 10000 }).vout, 4, 1e-12, 'loaded divider');
  const rlc = rlcResonance({ resistance: 10, inductance: 1e-3, capacitance: 1e-6 });
  near(rlc.resonance, 5032.92, 0.01, 'f0'); near(rlc.q, Math.sqrt(10), 1e-12, 'Q');
  near(rcFilter({ resistance: 1000, capacitance: 1e-6 }).cutoff, 159.155, 1e-3, 'RC cutoff');
  const led = ledResistor({ supply: 5, forwardVoltage: 2, current: 0.02 });
  assert.equal(led.standard, 150);
  assert.ok(ledResistor({ supply: 9, forwardVoltage: 2, current: 0.02 }).actualCurrent <= 0.02);
  near(adcResolution({ bits: 10, reference: 5 }).lsb, 5 / 1024, 1e-15, 'LSB');
});
