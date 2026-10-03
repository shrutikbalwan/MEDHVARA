"use client";

import { useId, useState } from "react";

import type { ReportDetails } from "@/lib/report/project-report";
import type { Project } from "@/types/project";

import styles from "./ProjectReport.module.css";

/** Roll no. and class are not in the profile; remember them on this device only. */
const STORAGE_KEY = "medhvara.report-details";

type Fields = Required<Omit<ReportDetails, "includeAssessment">> & { includeAssessment: boolean };

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className={styles.input} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/**
 * "Download report (PDF)": a printable practical-journal-style project report.
 * Built entirely in the browser from the saved project — nothing is uploaded.
 */
export function ProjectReport({
  project,
  defaults,
}: {
  project: Project;
  /** Prefill from the student's profile. */
  defaults: { name: string; institute: string; department: string };
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({
    name: defaults.name,
    roll: "",
    className: "",
    institute: defaults.institute,
    department: defaults.department,
    includeAssessment: true,
  });

  /** Opens the form, restoring the remembered roll no./class (only ever on a click, so never during render). */
  function openForm() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Fields>;
      setFields((current) => ({
        ...current,
        roll: current.roll || (typeof saved.roll === "string" ? saved.roll : ""),
        className: current.className || (typeof saved.className === "string" ? saved.className : ""),
      }));
    } catch {
      // Storage blocked or corrupt: just start empty.
    }
    setOpen(true);
  }

  const set = <K extends keyof Fields>(key: K) => (value: Fields[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  async function download() {
    setBusy(true);
    setError(null);
    try {
      // Loaded on demand: the PDF writer is only needed when someone downloads.
      const { buildProjectReport, reportFileName } = await import("@/lib/report/project-report");
      const bytes = buildProjectReport(project, fields).toBytes();
      // Copy into a fresh ArrayBuffer-backed view for Blob.
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = reportFileName(project.title);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ roll: fields.roll, className: fields.className }));
      } catch {
        // Not remembering is fine.
      }
    } catch (cause) {
      console.error("[projects] FAILED stage=report.pdf (client)", cause);
      setError("Could not create the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className={styles.toggle} onClick={openForm}>
        📄 Download report (PDF)
      </button>
    );
  }

  return (
    <section className={styles.panel} aria-label="Project report">
      <div className={styles.header}>
        <h2 className={styles.title}>Project report (PDF)</h2>
        <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </div>
      <p className={styles.hint}>
        A printable report of the saved project, laid out like a practical journal. It is created on your
        device; nothing is uploaded.
      </p>
      <div className={styles.grid}>
        <Field label="Your name" value={fields.name} onChange={set("name")} />
        <Field label="Roll no." value={fields.roll} onChange={set("roll")} />
        <Field label="Class / Div." value={fields.className} onChange={set("className")} />
        <Field label="College" value={fields.institute} onChange={set("institute")} />
        <Field label="Department" value={fields.department} onChange={set("department")} />
      </div>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={fields.includeAssessment}
          onChange={(e) => set("includeAssessment")(e.target.checked)}
        />
        Include marks table and signature lines
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className={styles.primary} onClick={() => void download()} disabled={busy}>
        {busy ? "Creating PDF…" : "Download PDF"}
      </button>
    </section>
  );
}
