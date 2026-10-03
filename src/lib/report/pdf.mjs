// Ported from OpenENTC Studio (packages/report/src/pdf.mjs,
// https://github.com/shrutikbalwan/OpenENTC-Studio, same author). Kept as
// JavaScript so the proven layout and PDF logic stay byte-for-byte the same;
// types are in the matching .d.mts file. MEDHVARA changes are marked
// "MEDHVARA:" below.
// Minimal PDF 1.4 writer: A4 pages, the standard Helvetica/Courier/Symbol fonts (no embedding),
// text, lines, rectangles and polylines. Unicode text is mapped to WinAnsi, with Greek letters
// and maths symbols drawn from the Symbol font.

const HELVETICA = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const HELVETICA_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

// Unicode → WinAnsi byte for characters outside ASCII.
const WIN_ANSI = new Map([
  ['€', 0x80], ['‚', 0x82], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87], ['‰', 0x89], ['‹', 0x8b], ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97], ['™', 0x99], ['›', 0x9b],
  ...Array.from({ length: 96 }, (_, k) => [String.fromCharCode(0xa0 + k), 0xa0 + k]),
]);
const WIN_ANSI_WIDTH = { 0x80: 556, 0x85: 1000, 0x89: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x99: 1000, 0xa0: 278, 0xb0: 400, 0xb1: 584, 0xb2: 333, 0xb3: 333, 0xb5: 556, 0xb7: 278, 0xb9: 333, 0xbc: 834, 0xbd: 834, 0xbe: 834, 0xd7: 584, 0xf7: 584 };

// Unicode → [Symbol font byte, width].
const SYMBOL = new Map(Object.entries({
  'α': [0x61, 631], 'β': [0x62, 549], 'γ': [0x67, 411], 'δ': [0x64, 494], 'ε': [0x65, 439], 'ζ': [0x7a, 494], 'η': [0x68, 603], 'θ': [0x71, 521], 'λ': [0x6c, 549], 'π': [0x70, 549], 'ρ': [0x72, 549], 'σ': [0x73, 603], 'τ': [0x74, 439], 'φ': [0x66, 521], 'ω': [0x77, 686],
  'Δ': [0x44, 612], 'Ω': [0x57, 768], 'Φ': [0x46, 763], 'Σ': [0x53, 592], 'Γ': [0x47, 603], 'Θ': [0x51, 741], 'Λ': [0x4c, 686], 'Π': [0x50, 768],
  '∞': [0xa5, 713], '≤': [0xa3, 549], '≥': [0xb3, 549], '≈': [0xbb, 549], '≠': [0xb9, 549], '→': [0xae, 987], '←': [0xac, 987], '↑': [0xad, 603], '↓': [0xaf, 603], '↔': [0xab, 1042], '√': [0xd6, 549], '∠': [0xd0, 768], '∂': [0xb6, 494], '∫': [0xf2, 274], '−': [0x2d, 549], '⋅': [0xd7, 250], '∝': [0xb5, 713], '∑': [0xe5, 713],
}));
// Characters with no glyph in either font are spelled out.
const FALLBACK = { '⁻': '-', '⁺': '+', '⁰': '^0', '⁴': '^4', '⁵': '^5', '⁶': '^6', '⁷': '^7', '⁸': '^8', '⁹': '^9', 'ⁿ': '^n', '₀': '0', '₁': '1', '₂': '2', '₃': '3', '⎓': '=', '⏚': 'GND', '✓': 'OK', '✗': 'x', '…': '...', '\t': '    ', '⌁': '~', '€': 'EUR' };

export const FONTS = Object.freeze({ regular: 'F1', bold: 'F2', italic: 'F3', mono: 'F4', symbol: 'F5', monoBold: 'F6' });

/** Split text into runs of { font: 'base' | 'symbol', bytes: number[] } with their widths in 1/1000 em. */
export function encodeText(text, font = 'regular') {
  const runs = [];
  const push = (kind, byte, width) => {
    const last = runs.at(-1);
    if (last && last.kind === kind) { last.bytes.push(byte); last.width += width; } else runs.push({ kind, bytes: [byte], width });
  };
  const widths = font === 'bold' ? HELVETICA_BOLD : HELVETICA;
  const mono = font === 'mono' || font === 'monoBold';
  for (const char of String(text).normalize('NFC')) {
    if (FALLBACK[char] !== undefined) { for (const c of FALLBACK[char]) push('base', c.charCodeAt(0), mono ? 600 : widths[c.charCodeAt(0) - 32] ?? 556); continue; }
    const code = char.codePointAt(0);
    if (code >= 32 && code < 127) push('base', code, mono ? 600 : widths[code - 32]);
    else if (SYMBOL.has(char)) { const [byte, width] = SYMBOL.get(char); push('symbol', byte, mono ? 600 : width); }
    else if (WIN_ANSI.has(char)) { const byte = WIN_ANSI.get(char); push('base', byte, mono ? 600 : WIN_ANSI_WIDTH[byte] ?? 556); }
    else push('base', 0x3f, mono ? 600 : 556); // '?'
  }
  return runs;
}

/** Width of `text` in points at `size`. */
export function textWidth(text, size, font = 'regular') {
  return encodeText(text, font).reduce((sum, run) => sum + run.width, 0) * size / 1000;
}

/** Greedy word wrap to `width` points; long words are broken. Keeps explicit newlines. */
export function wrapText(text, width, size, font = 'regular') {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    const words = paragraph.split(/(\s+)/).filter((word) => word !== '');
    let line = '';
    for (const word of words) {
      const candidate = line + word;
      if (textWidth(candidate.trimEnd(), size, font) <= width || !line.trim()) {
        if (textWidth(candidate.trimEnd(), size, font) > width && !line.trim()) {
          // A single word wider than the line: break it by characters.
          let piece = '';
          for (const char of word) { if (textWidth(piece + char, size, font) > width && piece) { lines.push(piece); piece = ''; } piece += char; }
          line = piece;
        } else line = candidate;
      } else { lines.push(line.trimEnd()); line = /^\s+$/.test(word) ? '' : word; }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

const number = (value) => (Math.abs(value) < 1e-6 ? '0' : Number(value.toFixed(3)).toString());
const literal = (bytes) => `(${bytes.map((b) => (b === 0x28 || b === 0x29 || b === 0x5c ? `\\${String.fromCharCode(b)}` : b < 32 || b > 126 ? `\\${b.toString(8).padStart(3, '0')}` : String.fromCharCode(b))).join('')})`;
const rgb = (color) => {
  const hex = String(color).replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return [0, 2, 4].map((k) => number(parseInt(full.slice(k, k + 2), 16) / 255)).join(' ');
};

export class PdfPage {
  constructor(width, height) { this.width = width; this.height = height; this.ops = []; }
  /** Draw text with its baseline at (x, y) measured from the top-left corner. */
  text(x, y, value, { size = 10, font = 'regular', color = '#000000', align = 'left' } = {}) {
    const runs = encodeText(value, font);
    const total = runs.reduce((sum, run) => sum + run.width, 0) * size / 1000;
    let cursor = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    this.ops.push(`${rgb(color)} rg`);
    for (const run of runs) {
      const name = run.kind === 'symbol' ? FONTS.symbol : FONTS[font];
      this.ops.push(`BT /${name} ${number(size)} Tf ${number(cursor)} ${number(this.height - y)} Td ${literal(run.bytes)} Tj ET`);
      cursor += run.width * size / 1000;
    }
    return total;
  }
  line(x1, y1, x2, y2, { color = '#000000', width = 0.5, dash = null } = {}) {
    this.ops.push(`q ${rgb(color)} RG ${number(width)} w ${dash ? `[${dash.join(' ')}] 0 d` : ''} ${number(x1)} ${number(this.height - y1)} m ${number(x2)} ${number(this.height - y2)} l S Q`);
  }
  rect(x, y, w, h, { fill = null, stroke = null, width = 0.5 } = {}) {
    const op = fill && stroke ? 'B' : fill ? 'f' : 'S';
    this.ops.push(`q ${fill ? `${rgb(fill)} rg` : ''} ${stroke ? `${rgb(stroke)} RG ${number(width)} w` : ''} ${number(x)} ${number(this.height - y - h)} ${number(w)} ${number(h)} re ${op} Q`);
  }
  polyline(points, { color = '#000000', width = 1, dash = null, clip = null } = {}) {
    if (points.length < 2) return;
    const clipOp = clip ? `${number(clip.x)} ${number(this.height - clip.y - clip.h)} ${number(clip.w)} ${number(clip.h)} re W n ` : '';
    const path = points.map(([x, y], index) => `${number(x)} ${number(this.height - y)} ${index ? 'l' : 'm'}`).join(' ');
    this.ops.push(`q ${clipOp}${rgb(color)} RG ${number(width)} w 1 j 1 J ${dash ? `[${dash.join(' ')}] 0 d` : ''} ${path} S Q`);
  }
  content() { return this.ops.join('\n'); }
}

export class PdfDocument {
  // MEDHVARA: `creator` replaces the hard-coded OpenENTC name in the document info.
  constructor({ title = '', author = '', subject = '', width = 595.28, height = 841.89, creationDate = new Date(), creator = 'MEDHVARA' } = {}) {
    Object.assign(this, { title, author, subject, width, height, creationDate, creator });
    this.pages = [];
  }
  addPage() { const page = new PdfPage(this.width, this.height); this.pages.push(page); return page; }

  /** Serialise to bytes (Uint8Array). Every string written is Latin-1, so one char = one byte. */
  toBytes() {
    const objects = [];
    const add = (body) => { objects.push(body); return objects.length; };
    const catalog = add(null), pagesId = add(null);
    const fontIds = {
      F1: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
      F2: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
      F3: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>'),
      F4: add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'),
      F5: add('<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>'),
      F6: add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>'),
    };
    const fonts = `<< ${Object.entries(fontIds).map(([name, id]) => `/${name} ${id} 0 R`).join(' ')} >>`;
    const pageIds = this.pages.map((page) => {
      const stream = page.content();
      const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${number(this.width)} ${number(this.height)}] /Resources << /Font ${fonts} >> /Contents ${contentId} 0 R >>`);
    });
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    const pad = (n) => String(n).padStart(2, '0');
    const d = this.creationDate;
    const date = `D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    const info = add(`<< /Title ${pdfString(this.title)} /Author ${pdfString(this.author)} /Subject ${pdfString(this.subject)} /Creator ${pdfString(this.creator)} /Producer (PDF writer from OpenENTC Studio) /CreationDate (${date}) >>`);
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets = [];
    objects.forEach((body, index) => { offsets.push(out.length); out += `${index + 1} 0 obj\n${body}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let k = 0; k < out.length; k += 1) bytes[k] = out.charCodeAt(k) & 0xff;
    return bytes;
  }
}

/** Document-information string: WinAnsi-compatible text as a literal, anything else as UTF-16BE hex. */
function pdfString(text) {
  const value = String(text ?? '');
  if ([...value].every((char) => char.charCodeAt(0) < 127)) return literal([...value].map((char) => char.charCodeAt(0)));
  let hex = 'FEFF';
  for (let k = 0; k < value.length; k += 1) hex += value.charCodeAt(k).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}
