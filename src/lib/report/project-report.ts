import { buildLabRecord, type RecordBlock } from "@/lib/report/record.mjs";
import type { Project } from "@/types/project";

export type ReportDetails = {
  name?: string;
  roll?: string;
  className?: string;
  institute?: string;
  department?: string;
  /** Adds the marks table and student/faculty signature lines. */
  includeAssessment?: boolean;
};

const listed = (values: string[] | null | undefined) => (values ?? []).map((v) => v.trim()).filter(Boolean);

/**
 * Lays out a saved project as a printable A4 report in the practical-journal
 * style colleges expect: title block, problem statement, objectives,
 * components table, technologies, architecture, development steps, subjects
 * to learn first, notes, and an optional marks/signature block.
 *
 * Pure and dependency-free (see pdf.mjs), so it runs in the browser: the
 * report is generated on the student's device and never uploaded. Text uses
 * the standard PDF fonts, which cover English, Greek letters and engineering
 * symbols (Ω, µ, °, ±); other scripts such as Devanagari print as "?".
 */
export function buildProjectReport(project: Project, details: ReportDetails, creationDate = new Date()) {
  const date = creationDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const objectives = listed(project.objectives);
  const components = listed(project.components);
  const technologies = listed(project.technologies);
  const steps = listed(project.development_steps);
  const subjects = listed(project.subjects_to_learn_first);

  const blocks: RecordBlock[] = [];
  const facts: [string, string][] = [];
  if (project.status) facts.push(["Status", project.status]);
  if (project.difficulty) facts.push(["Difficulty", project.difficulty]);
  if (facts.length) blocks.push({ type: "keyvalue", pairs: facts });

  if (project.problem_statement?.trim()) {
    blocks.push({ type: "heading", text: "Problem statement" }, { type: "paragraph", text: project.problem_statement.trim() });
  }
  if (objectives.length) blocks.push({ type: "heading", text: "Objectives" }, { type: "list", items: objectives, ordered: true });
  if (components.length) {
    blocks.push(
      { type: "heading", text: "Components required" },
      { type: "table", columns: ["No.", "Component", "Qty"], rows: components.map((c, i) => [String(i + 1), c, ""]) },
    );
  }
  if (technologies.length) blocks.push({ type: "heading", text: "Technologies and tools" }, { type: "list", items: technologies });
  if (project.architecture_overview?.trim()) {
    blocks.push({ type: "heading", text: "System architecture" }, { type: "paragraph", text: project.architecture_overview.trim() });
  }
  if (steps.length) blocks.push({ type: "heading", text: "Development steps" }, { type: "list", items: steps, ordered: true });
  if (subjects.length) blocks.push({ type: "heading", text: "Subjects to learn first" }, { type: "list", items: subjects });
  if (project.notes?.trim()) blocks.push({ type: "heading", text: "Notes" }, { type: "paragraph", text: project.notes.trim() });
  if (blocks.length === 0) blocks.push({ type: "paragraph", text: "This project has no details yet." });

  return buildLabRecord(
    {
      institute: details.institute?.trim() || undefined,
      department: details.department?.trim() || undefined,
      course: "Project report",
      student: { name: details.name?.trim() },
      experiment: { title: project.title, date },
      titleColumns: [
        ["Name", details.name?.trim()],
        ["Roll no.", details.roll?.trim()],
        ["Class / Div.", details.className?.trim()],
        ["Date", date],
      ],
      footer: "Prepared with MEDHVARA",
      blocks,
      marks: [["Design", 10], ["Implementation", 10], ["Report", 5], ["Viva", 5], "Total"],
      assessment: Boolean(details.includeAssessment),
    },
    { creationDate },
  );
}

/** "Smart plant watering!" → "smart-plant-watering-report.pdf" */
export function reportFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "project"}-report.pdf`;
}
