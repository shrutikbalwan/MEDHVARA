// Ported from OpenENTC Studio (packages/report/src/record.mjs,
// https://github.com/shrutikbalwan/OpenENTC-Studio, same author). Kept as
// JavaScript so the proven layout and PDF logic stay byte-for-byte the same;
// types are in the matching .d.mts file. MEDHVARA changes are marked
// "MEDHVARA:" below.
// Lab record (practical journal) layout: title block, sections of text, lists, tables, graphs,
// program listings and a marks/signature block, flowed over A4 pages with headers and footers.
import { PdfDocument, textWidth, wrapText } from './pdf.mjs';

const MARGIN = { left: 56, right: 56, top: 64, bottom: 62 };
const COLORS = { ink: '#111827', muted: '#4b5563', rule: '#9ca3af', light: '#e5e7eb', accent: '#1d4ed8', head: '#f3f4f6' };
const SERIES_COLORS = ['#1d4ed8', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2'];

const PREFIX = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
/** Short engineering notation for axis labels, e.g. 4.7k, 250µ. */
export function engineering(value, digits = 3) {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  const [scale, prefix] = PREFIX.find(([s]) => magnitude >= s * 0.9995) ?? PREFIX.at(-1);
  return `${Number((value / scale).toPrecision(digits))}${prefix}`;
}

/** About `count` round tick values spanning [min, max]. */
export function niceTicks(min, max, count = 6) {
  if (!(max > min)) { const pad = Math.abs(min) * 0.1 || 1; min -= pad; max += pad; }
  const raw = (max - min) / Math.max(1, count - 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw * 0.999);
  const first = Math.floor(min / step + 1e-9) * step, last = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = first; v <= last + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return ticks;
}

class Flow {
  constructor(doc, header) {
    this.doc = doc; this.header = header;
    this.width = doc.width - MARGIN.left - MARGIN.right;
    this.newPage();
  }
  newPage() { this.page = this.doc.addPage(); this.y = MARGIN.top; }
  get bottom() { return this.doc.height - MARGIN.bottom; }
  /** Make sure `height` fits on the current page, else start a new one. */
  need(height) { if (this.y + height > this.bottom) this.newPage(); }
  paragraph(text, { size = 10.5, font = 'regular', color = COLORS.ink, indent = 0, leading = 1.42, after = 6 } = {}) {
    const lines = wrapText(text, this.width - indent, size, font);
    for (const line of lines) { this.need(size * leading); this.y += size * leading; this.page.text(MARGIN.left + indent, this.y - size * 0.3, line, { size, font, color }); }
    this.y += after;
  }
}

function heading(flow, text) {
  flow.need(84); // keep a heading together with the start of its section
  flow.y += 12;
  flow.page.text(MARGIN.left, flow.y + 11, text.toUpperCase(), { size: 11.5, font: 'bold', color: COLORS.accent });
  flow.y += 16;
  flow.page.line(MARGIN.left, flow.y, MARGIN.left + flow.width, flow.y, { color: COLORS.light, width: 0.8 });
  flow.y += 6;
}

function list(flow, items, ordered) {
  items.forEach((item, index) => {
    const marker = ordered ? `${index + 1}.` : '•';
    const lines = wrapText(item, flow.width - 22, 10.5);
    lines.forEach((line, k) => {
      flow.need(15); flow.y += 15;
      if (k === 0) flow.page.text(MARGIN.left + 4, flow.y - 3, marker, { size: 10.5 });
      flow.page.text(MARGIN.left + 22, flow.y - 3, line, { size: 10.5 });
    });
  });
  flow.y += 6;
}

function table(flow, { columns, rows, caption, align = [] }) {
  const size = 9.5, pad = 5, lineHeight = 12.5;
  const ideal = columns.map((column, c) => Math.max(textWidth(column, size, 'bold'), ...rows.map((row) => textWidth(String(row[c] ?? ''), size))) + pad * 2);
  const total = ideal.reduce((a, b) => a + b, 0);
  const widths = total <= flow.width ? ideal.map((w) => w * flow.width / total) : ideal.map((w) => Math.max(40, w * flow.width / total));
  const scale = flow.width / widths.reduce((a, b) => a + b, 0);
  for (let k = 0; k < widths.length; k += 1) widths[k] *= scale;
  const cellLines = (row, font) => row.map((cell, c) => wrapText(String(cell ?? ''), widths[c] - pad * 2, size, font));
  const drawRow = (cells, font, fill) => {
    const height = Math.max(...cells.map((lines) => lines.length)) * lineHeight + pad * 1.2;
    let x = MARGIN.left;
    if (fill) flow.page.rect(MARGIN.left, flow.y, flow.width, height, { fill });
    cells.forEach((lines, c) => {
      flow.page.rect(x, flow.y, widths[c], height, { stroke: COLORS.rule, width: 0.6 });
      lines.forEach((line, k) => {
        const baseline = flow.y + pad * 0.6 + (k + 1) * lineHeight - 3;
        const right = align[c] === 'right';
        flow.page.text(right ? x + widths[c] - pad : x + pad, baseline, line, { size, font, align: right ? 'right' : 'left' });
      });
      x += widths[c];
    });
    flow.y += height;
    return height;
  };
  if (caption) { flow.need(18 + 2 * lineHeight); flow.y += 4; flow.page.text(MARGIN.left + flow.width / 2, flow.y + 9, caption, { size: 9.5, font: 'italic', color: COLORS.muted, align: 'center' }); flow.y += 14; }
  const headerCells = cellLines(columns, 'bold');
  const headerHeight = Math.max(...headerCells.map((lines) => lines.length)) * lineHeight + pad * 1.2;
  flow.need(headerHeight + lineHeight * 2);
  drawRow(headerCells, 'bold', COLORS.head);
  for (const row of rows) {
    const cells = cellLines(row, 'regular');
    const height = Math.max(...cells.map((lines) => lines.length)) * lineHeight + pad * 1.2;
    if (flow.y + height > flow.bottom) { flow.newPage(); drawRow(headerCells, 'bold', COLORS.head); }
    drawRow(cells, 'regular', null);
  }
  flow.y += 10;
}

function plot(flow, { title, xLabel = '', yLabel = '', series, logX = false, height = 210 }) {
  const box = { x: MARGIN.left + 52, w: flow.width - 62, h: height };
  flow.need(height + 74);
  flow.y += 6;
  if (title) { flow.page.text(MARGIN.left + flow.width / 2, flow.y + 10, title, { size: 10, font: 'bold', align: 'center' }); flow.y += 18; }
  box.y = flow.y;
  const finite = (values) => values.filter(Number.isFinite);
  const xsAll = finite(series.flatMap((entry) => entry.xs).filter((x) => !logX || x > 0));
  const ysAll = finite(series.flatMap((entry) => entry.ys));
  if (!xsAll.length || !ysAll.length) { flow.paragraph('(no data to plot)', { font: 'italic' }); return; }
  let xMin = Math.min(...xsAll), xMax = Math.max(...xsAll);
  const yTicks = niceTicks(Math.min(...ysAll), Math.max(...ysAll), 6);
  const yMin = yTicks[0], yMax = yTicks.at(-1);
  let xTicks;
  if (logX) {
    const lo = Math.floor(Math.log10(xMin)), hi = Math.ceil(Math.log10(xMax));
    xTicks = Array.from({ length: hi - lo + 1 }, (_, k) => 10 ** (lo + k));
    xMin = 10 ** lo; xMax = 10 ** hi;
  } else { xTicks = niceTicks(xMin, xMax, 7); xMin = xTicks[0]; xMax = xTicks.at(-1); }
  const px = (x) => box.x + (logX ? (Math.log10(x) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin)) : (x - xMin) / (xMax - xMin)) * box.w;
  const py = (y) => box.y + (1 - (y - yMin) / (yMax - yMin)) * box.h;
  const page = flow.page;
  for (const tick of yTicks) { page.line(box.x, py(tick), box.x + box.w, py(tick), { color: COLORS.light, width: 0.5 }); page.text(box.x - 4, py(tick) + 3, engineering(tick), { size: 8, align: 'right', color: COLORS.muted }); }
  for (const tick of xTicks) { page.line(px(tick), box.y, px(tick), box.y + box.h, { color: COLORS.light, width: 0.5 }); page.text(px(tick), box.y + box.h + 11, engineering(tick), { size: 8, align: 'center', color: COLORS.muted }); }
  if (logX) for (let decade = xMin; decade < xMax; decade *= 10) for (let m = 2; m < 10; m += 1) page.line(px(decade * m), box.y, px(decade * m), box.y + box.h, { color: '#f3f4f6', width: 0.4 });
  page.rect(box.x, box.y, box.w, box.h, { stroke: COLORS.rule, width: 0.8 });
  const clip = { x: box.x, y: box.y, w: box.w, h: box.h };
  series.forEach((entry, index) => {
    const color = entry.color ?? SERIES_COLORS[index % SERIES_COLORS.length];
    const points = [];
    // At most ~2 points per horizontal point of the plot (min/max per column keeps peaks).
    const columns = new Map();
    entry.xs.forEach((x, k) => {
      const y = entry.ys[k];
      if (!Number.isFinite(x) || !Number.isFinite(y) || (logX && x <= 0)) return;
      const column = Math.round(px(x) * 2);
      const slot = columns.get(column);
      if (!slot) columns.set(column, { first: [px(x), py(y)], min: [px(x), py(y)], max: [px(x), py(y)], last: [px(x), py(y)] });
      else { if (py(y) < slot.min[1]) slot.min = [px(x), py(y)]; if (py(y) > slot.max[1]) slot.max = [px(x), py(y)]; slot.last = [px(x), py(y)]; }
    });
    for (const slot of columns.values()) { points.push(slot.first); if (slot.min !== slot.first) points.push(slot.min); if (slot.max !== slot.first && slot.max !== slot.min) points.push(slot.max); points.push(slot.last); }
    page.polyline(points, { color, width: 1.2, dash: entry.dashed ? [4, 2] : null, clip });
  });
  page.text(box.x + box.w / 2, box.y + box.h + 25, xLabel, { size: 9, align: 'center' });
  // Rotated text is not supported by the writer: put the y label above the axis instead.
  page.text(box.x - 4, box.y - 5, yLabel, { size: 9, align: 'left' });
  flow.y = box.y + box.h + 30;
  if (series.length > 1 || series[0]?.name) {
    let x = box.x;
    flow.need(14);
    series.forEach((entry, index) => {
      const color = entry.color ?? SERIES_COLORS[index % SERIES_COLORS.length];
      flow.page.line(x, flow.y + 4, x + 18, flow.y + 4, { color, width: 2 });
      x += 22 + flow.page.text(x + 22, flow.y + 7, entry.name ?? `Series ${index + 1}`, { size: 8.5 }) + 14;
    });
    flow.y += 16;
  }
  flow.y += 6;
}

function code(flow, { title, text }) {
  const size = 8.4, lineHeight = 10.4;
  if (title) { flow.need(30); flow.page.text(MARGIN.left, flow.y + 10, title, { size: 9.5, font: 'bold', color: COLORS.muted }); flow.y += 15; }
  const lines = String(text).replace(/\r/g, '').split('\n');
  const numberWidth = 26;
  const maxWidth = flow.width - numberWidth - 8;
  lines.forEach((line, index) => {
    const wrapped = wrapText(line.replace(/\t/g, '    ') || ' ', maxWidth, size, 'mono');
    wrapped.forEach((piece, k) => {
      flow.need(lineHeight);
      flow.page.rect(MARGIN.left, flow.y, flow.width, lineHeight, { fill: '#f8fafc' });
      flow.y += lineHeight;
      if (k === 0) flow.page.text(MARGIN.left + numberWidth - 6, flow.y - 2.6, String(index + 1), { size: 7.5, font: 'mono', color: '#9ca3af', align: 'right' });
      flow.page.text(MARGIN.left + numberWidth, flow.y - 2.6, piece, { size, font: 'mono' });
    });
  });
  flow.y += 10;
}

function keyValue(flow, pairs) {
  const keyWidth = Math.min(flow.width * 0.42, Math.max(...pairs.map(([key]) => textWidth(key, 10, 'bold'))) + 16);
  for (const [key, value] of pairs) {
    const lines = wrapText(String(value), flow.width - keyWidth, 10);
    lines.forEach((line, k) => {
      flow.need(14); flow.y += 14;
      if (k === 0) flow.page.text(MARGIN.left, flow.y - 3, key, { size: 10, font: 'bold' });
      flow.page.text(MARGIN.left + keyWidth, flow.y - 3, line, { size: 10 });
    });
  }
  flow.y += 6;
}

function titleBlock(flow, record) {
  const { student = {}, experiment = {} } = record;
  const page = flow.page;
  if (record.institute) { page.text(MARGIN.left + flow.width / 2, flow.y + 12, record.institute, { size: 13, font: 'bold', align: 'center' }); flow.y += 18; }
  if (record.department) { page.text(MARGIN.left + flow.width / 2, flow.y + 10, record.department, { size: 10.5, align: 'center', color: COLORS.muted }); flow.y += 15; }
  if (record.course) { page.text(MARGIN.left + flow.width / 2, flow.y + 10, record.course, { size: 10.5, font: 'italic', align: 'center', color: COLORS.muted }); flow.y += 15; }
  flow.y += 6;
  // MEDHVARA: `record.titleColumns` ([label, value] pairs) replaces the lab-journal
  // columns, so a project report can show its own details.
  const titleColumns = record.titleColumns ?? [['Name', student.name], ['Roll no.', student.roll], ['Class / Div.', student.className], ['Batch', student.batch], ['Expt. no.', experiment.number], ['Date', experiment.date]];
  table(flow, { columns: titleColumns.map(([label]) => label), rows: [titleColumns.map(([, value]) => value || '')] });
  flow.need(40);
  const lines = wrapText(experiment.title || 'Untitled experiment', flow.width, 16, 'bold');
  for (const line of lines) { flow.y += 21; flow.page.text(MARGIN.left + flow.width / 2, flow.y - 4, line, { size: 16, font: 'bold', align: 'center' }); }
  flow.y += 8;
}

function marksBlock(flow, record) {
  heading(flow, 'Assessment');
  table(flow, { columns: (record.marks ?? ['Performance', 'Journal', 'Viva', 'Attendance', 'Total']).map((item) => (Array.isArray(item) ? `${item[0]} (${item[1]})` : item)), rows: [Array((record.marks ?? [1, 2, 3, 4, 5]).length).fill(' ')] });
  flow.need(60);
  flow.y += 34;
  flow.page.line(MARGIN.left, flow.y, MARGIN.left + 160, flow.y, { color: COLORS.ink, width: 0.6 });
  flow.page.line(MARGIN.left + flow.width - 160, flow.y, MARGIN.left + flow.width, flow.y, { color: COLORS.ink, width: 0.6 });
  flow.page.text(MARGIN.left, flow.y + 12, 'Signature of student', { size: 9, color: COLORS.muted });
  flow.page.text(MARGIN.left + flow.width, flow.y + 12, 'Signature of faculty with date', { size: 9, color: COLORS.muted, align: 'right' });
  flow.y += 20;
}

/**
 * Lay out a lab record. `record.blocks` is a list of
 * { type: 'heading', text } · { type: 'paragraph', text } · { type: 'list', items, ordered } ·
 * { type: 'table', columns, rows, caption, align } · { type: 'plot', title, xLabel, yLabel, series: [{ name, xs, ys, color, dashed }], logX } ·
 * { type: 'code', title, text } · { type: 'keyvalue', pairs: [[key, value]] }.
 */
export function buildLabRecord(record, { creationDate = new Date() } = {}) {
  const experiment = record.experiment ?? {};
  const doc = new PdfDocument({ title: `${experiment.number ? `Experiment ${experiment.number}: ` : ''}${experiment.title ?? 'Lab record'}`, author: record.student?.name ?? '', subject: record.course ?? 'Lab record', creationDate });
  // MEDHVARA: the header falls back to the course, not the generic 'Lab record'.
  const flow = new Flow(doc);
  titleBlock(flow, record);
  for (const block of record.blocks ?? []) {
    if (block.type === 'heading') heading(flow, block.text);
    else if (block.type === 'paragraph') { if (String(block.text ?? '').trim()) flow.paragraph(block.text); }
    else if (block.type === 'list') list(flow, block.items.filter((item) => String(item).trim()), block.ordered);
    else if (block.type === 'table') table(flow, block);
    else if (block.type === 'plot') plot(flow, block);
    else if (block.type === 'code') code(flow, block);
    else if (block.type === 'keyvalue') keyValue(flow, block.pairs);
    else throw new RangeError(`Unknown lab-record block type "${block.type}".`);
  }
  if (record.assessment !== false) marksBlock(flow, record);
  // Headers and footers now that the page count is known.
  doc.pages.forEach((page, index) => {
    const left = record.institute || record.course || 'Lab record';
    page.text(MARGIN.left, 34, left, { size: 8, color: COLORS.muted });
    page.text(doc.width - MARGIN.right, 34, `${experiment.number ? `Expt. ${experiment.number} · ` : ''}${experiment.title ?? ''}`.slice(0, 80), { size: 8, color: COLORS.muted, align: 'right' });
    page.line(MARGIN.left, 40, doc.width - MARGIN.right, 40, { color: COLORS.light, width: 0.6 });
    page.line(MARGIN.left, doc.height - 42, doc.width - MARGIN.right, doc.height - 42, { color: COLORS.light, width: 0.6 });
    // MEDHVARA: footer text is configurable.
    page.text(MARGIN.left, doc.height - 30, record.footer ?? 'Prepared with MEDHVARA', { size: 7.5, color: '#9ca3af' });
    page.text(doc.width - MARGIN.right, doc.height - 30, `Page ${index + 1} of ${doc.pages.length}`, { size: 8, color: COLORS.muted, align: 'right' });
  });
  return doc;
}
