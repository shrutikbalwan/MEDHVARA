// Types for record.mjs (from OpenENTC Studio's packages/report/src/index.d.ts,
// plus MEDHVARA's titleColumns and footer options).
import type { PdfDocument } from "./pdf.mjs";

export type RecordBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "table"; columns: string[]; rows: (string | number)[][]; caption?: string; align?: ("left" | "right")[] }
  | { type: "plot"; title?: string; xLabel?: string; yLabel?: string; logX?: boolean; height?: number; series: { name?: string; xs: ArrayLike<number>; ys: ArrayLike<number>; color?: string; dashed?: boolean }[] }
  | { type: "code"; title?: string; text: string }
  | { type: "keyvalue"; pairs: [string, string][] };

export interface LabRecord {
  institute?: string;
  department?: string;
  course?: string;
  student?: { name?: string; roll?: string; className?: string; batch?: string };
  experiment?: { number?: string; title?: string; date?: string };
  /** Title-block table as [label, value] pairs; defaults to the lab-journal columns. */
  titleColumns?: [string, string | undefined][];
  /** Footer text on every page; defaults to "Prepared with MEDHVARA". */
  footer?: string;
  blocks?: RecordBlock[];
  marks?: (string | [string, number])[];
  assessment?: boolean;
}
export declare function buildLabRecord(record: LabRecord, options?: { creationDate?: Date }): PdfDocument;
export declare function engineering(value: number, digits?: number): string;
export declare function niceTicks(min: number, max: number, count?: number): number[];
