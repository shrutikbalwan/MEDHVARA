import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectReport, reportFileName } from "@/lib/report/project-report";
import type { Project } from "@/types/project";

const project: Project = {
  id: "p1",
  owner_id: "u",
  title: "Smart Plant Watering (ESP32)",
  created_at: "2026-10-01",
  problem_statement: "Water plants automatically — at 3.3 V, about 80 mA (±5 %), with a 10 kΩ pull-up.",
  architecture_overview: "Sensor → ESP32 ADC → relay → pump.",
  objectives: ["Measure moisture", "Water below 30 %"],
  components: ["ESP32 DevKit", "Soil sensor", "Relay"],
  technologies: ["Arduino IDE"],
  development_steps: Array.from({ length: 40 }, (_, i) => `Step ${i + 1}: do something useful`),
  subjects_to_learn_first: ["ADC"],
  difficulty: "Medium",
  status: "Building",
  notes: null,
};
const text = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

test("builds a valid multi-page PDF with the student's details", () => {
  const bytes = buildProjectReport(project, { name: "Shrutik", roll: "ENTC-42", includeAssessment: true }, new Date("2026-10-03T10:00:00Z")).toBytes();
  const pdf = text(bytes);
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.ok(pdf.trimEnd().endsWith("%%EOF"));
  assert.match(pdf, /\/Count [2-9]/, "40 steps flow onto more than one page");
  assert.match(pdf, /\(ENTC-42\)/);
  assert.match(pdf, /\/Creator \(MEDHVARA\)/);
  assert.match(pdf, /\(Signature of student\)/, "assessment block included");
});

test("the assessment block is optional, and an empty project still renders", () => {
  assert.doesNotMatch(text(buildProjectReport(project, { includeAssessment: false }).toBytes()), /Signature of student/);
  const empty = { ...project, title: "Empty", problem_statement: null, architecture_overview: null, objectives: [], components: [], technologies: [], development_steps: [], subjects_to_learn_first: [], status: null, difficulty: null };
  const pdf = text(buildProjectReport(empty, {}).toBytes());
  assert.match(pdf, /\/Count 1/);
  assert.match(pdf, /no details yet/);
});

test("file names are safe slugs", () => {
  assert.equal(reportFileName("Smart Plant Watering (ESP32)"), "smart-plant-watering-esp32-report.pdf");
  assert.equal(reportFileName("Pump & Relay — v2"), "pump-relay-v2-report.pdf");
  assert.equal(reportFileName("!!!"), "project-report.pdf");
});
