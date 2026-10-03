// Types for pdf.mjs (from OpenENTC Studio's packages/report/src/index.d.ts).
export type FontName = "regular" | "bold" | "italic" | "mono" | "monoBold";
export declare const FONTS: Readonly<Record<FontName | "symbol", string>>;
export declare function encodeText(text: string, font?: FontName): { kind: "base" | "symbol"; bytes: number[]; width: number }[];
export declare function textWidth(text: string, size: number, font?: FontName): number;
export declare function wrapText(text: string, width: number, size: number, font?: FontName): string[];
export declare class PdfPage {
  constructor(width: number, height: number);
  width: number;
  height: number;
  ops: string[];
  text(x: number, y: number, value: string, options?: { size?: number; font?: FontName; color?: string; align?: "left" | "center" | "right" }): number;
  line(x1: number, y1: number, x2: number, y2: number, options?: { color?: string; width?: number; dash?: number[] | null }): void;
  rect(x: number, y: number, w: number, h: number, options?: { fill?: string | null; stroke?: string | null; width?: number }): void;
  polyline(points: [number, number][], options?: { color?: string; width?: number; dash?: number[] | null; clip?: { x: number; y: number; w: number; h: number } | null }): void;
  content(): string;
}
export declare class PdfDocument {
  constructor(options?: { title?: string; author?: string; subject?: string; width?: number; height?: number; creationDate?: Date; creator?: string });
  pages: PdfPage[];
  addPage(): PdfPage;
  toBytes(): Uint8Array;
}
