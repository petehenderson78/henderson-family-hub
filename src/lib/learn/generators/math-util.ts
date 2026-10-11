/**
 * Shared helpers for the math generators (math-early.ts, math-upper.ts).
 *
 * Pure: no DOM, relative imports only, `import type` for types. Every SVG
 * builder returns a self-contained string with viewBox 0 0 100 100 and no
 * id="" attributes (several SVGs can render on one screen).
 */

import type { ChoiceQuestion, GeneratorContext, Option } from "../types";
import { int, pick, shuffle } from "../rng";

// ---------------------------------------------------------------------------
// params
// ---------------------------------------------------------------------------

export function numParam(ctx: GeneratorContext, key: string, fallback: number): number {
  const v = ctx.params?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function boolParam(ctx: GeneratorContext, key: string, fallback: boolean): boolean {
  const v = ctx.params?.[key];
  return typeof v === "boolean" ? v : fallback;
}

export function strParam(ctx: GeneratorContext, key: string, fallback: string): string {
  const v = ctx.params?.[key];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

export function numListParam(ctx: GeneratorContext, key: string, fallback: number[]): number[] {
  const v = ctx.params?.[key];
  if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number" && Number.isFinite(x))) return v as number[];
  return fallback;
}

export function strListParam(ctx: GeneratorContext, key: string, fallback: string[]): string[] {
  const v = ctx.params?.[key];
  if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string")) return v as string[];
  return fallback;
}

/** ctx.level, else params.level, else 1. */
export function levelOf(ctx: GeneratorContext): number {
  if (typeof ctx.level === "number") return ctx.level;
  return numParam(ctx, "level", 1);
}

// ---------------------------------------------------------------------------
// choice builders
// ---------------------------------------------------------------------------

type ChoiceBase = Omit<ChoiceQuestion, "type" | "options" | "answerIndex">;

/** 4 numeric options (unique, finite, non-negative unless the answer is). */
export function numericChoice(rng: () => number, answer: number, distractors: number[], base: ChoiceBase, format?: (n: number) => string): ChoiceQuestion {
  const fmt = format ?? ((n: number) => String(n));
  const uniq: number[] = [];
  for (const d of distractors) {
    if (!Number.isFinite(d) || d === answer || uniq.includes(d)) continue;
    if (d < 0 && answer >= 0) continue;
    uniq.push(d);
    if (uniq.length === 3) break;
  }
  let bump = 1;
  while (uniq.length < 3) {
    const sign = bump % 2 === 0 ? -1 : 1;
    const cand = answer + sign * Math.ceil(bump / 2);
    if (cand !== answer && !uniq.includes(cand) && (cand >= 0 || answer < 0)) uniq.push(cand);
    bump += 1;
  }
  const values = shuffle(rng, [answer, ...uniq]);
  return {
    type: "choice",
    ...base,
    options: values.map((v) => ({ label: fmt(v) })),
    answerIndex: values.indexOf(answer),
  };
}

/** 4 (or fewer, if the pool is small) labelled options; distractors must be unique strings. */
export function labelChoice(rng: () => number, answer: string, distractors: string[], base: ChoiceBase): ChoiceQuestion {
  const uniq: string[] = [];
  for (const d of distractors) {
    if (d !== answer && !uniq.includes(d) && d.length > 0) uniq.push(d);
    if (uniq.length === 3) break;
  }
  const values = shuffle(rng, [answer, ...uniq]);
  return {
    type: "choice",
    ...base,
    options: values.map((v) => ({ label: v })),
    answerIndex: values.indexOf(answer),
  };
}

/** Options with svg/emoji: `key` dedupes. */
export function optionChoice(rng: () => number, answer: Option, distractors: Option[], base: ChoiceBase): ChoiceQuestion {
  const key = (o: Option) => `${o.label ?? ""}|${o.emoji ?? ""}|${o.svg ?? ""}`;
  const seen = new Set<string>([key(answer)]);
  const uniq: Option[] = [];
  for (const d of distractors) {
    const k = key(d);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(d);
    if (uniq.length === 3) break;
  }
  const values = shuffle(rng, [answer, ...uniq]);
  return {
    type: "choice",
    ...base,
    options: values,
    answerIndex: values.indexOf(answer),
  };
}

// ---------------------------------------------------------------------------
// numbers and words
// ---------------------------------------------------------------------------

export function plural(n: number, word: string, pluralWord?: string): string {
  return `${n} ${n === 1 ? word : (pluralWord ?? word + "s")}`;
}

/** 1,234,567 */
export function fmt(n: number): string {
  const neg = n < 0;
  const s = String(Math.abs(n));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const fromEnd = s.length - i;
    out += s[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ",";
  }
  return (neg ? "-" : "") + out;
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h > 0) parts.push(`${ONES[h]} hundred`);
  if (r > 0) parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? "-" + ONES[r % 10] : ""}`);
  return parts.join(" ");
}

/** Number name for 0 .. 999,999,999. */
export function numberName(n: number): string {
  if (n === 0) return "zero";
  const m = Math.floor(n / 1000000);
  const th = Math.floor((n % 1000000) / 1000);
  const r = n % 1000;
  const parts: string[] = [];
  if (m > 0) parts.push(`${below1000(m)} million`);
  if (th > 0) parts.push(`${below1000(th)} thousand`);
  if (r > 0) parts.push(below1000(r));
  return parts.join(" ");
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** Digit at a place (1 = ones, 10 = tens, …). */
export function digitAt(n: number, place: number): number {
  return Math.floor(n / place) % 10;
}

export const PLACE_NAMES: Record<number, string> = {
  1: "ones",
  10: "tens",
  100: "hundreds",
  1000: "thousands",
  10000: "ten thousands",
  100000: "hundred thousands",
  1000000: "millions",
};

/** Fixed decimals without float noise. */
export function dec(n: number, places: number): string {
  return (Math.round(n * 10 ** places) / 10 ** places).toFixed(places);
}

/** Round half up to `places` decimals (avoids 1.005 style noise). */
export function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f + 1e-9) / f;
}

/** Shortest decimal string ("0.5", "2.25") — no trailing zeros. */
export function decShort(n: number): string {
  const s = dec(n, 4);
  return s.replace(/\.?0+$/, "");
}

/** Accept variants for a typed decimal answer. */
export function decAccept(n: number): string[] {
  const out = new Set<string>();
  for (let p = 0; p <= 3; p++) out.add(dec(n, p));
  out.add(decShort(n));
  if (n < 1 && n > 0) out.add(decShort(n).replace(/^0\./, "."));
  if (n < 1 && n > 0) for (let p = 1; p <= 3; p++) out.add(dec(n, p).replace(/^0\./, "."));
  return [...out].filter((s) => Math.abs(Number(s) - n) < 1e-9);
}

// ---------------------------------------------------------------------------
// fractions
// ---------------------------------------------------------------------------

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function simplify(n: number, d: number): [number, number] {
  const g = gcd(n, d);
  return [n / g, d / g];
}

export function frac(n: number, d: number): string {
  return `${n}/${d}`;
}

/** "1 3/4", "2", "3/4" */
export function mixed(n: number, d: number): string {
  const whole = Math.floor(n / d);
  const rem = n % d;
  if (rem === 0) return String(whole);
  if (whole === 0) return `${rem}/${d}`;
  return `${whole} ${rem}/${d}`;
}

export function fracEqual(n1: number, d1: number, n2: number, d2: number): boolean {
  return n1 * d2 === n2 * d1;
}

/** Accept variants for a typed fraction: "3/4", "3 / 4", and (optionally) equivalents. */
export function fracAccept(n: number, d: number, equivalents = true): string[] {
  const out = new Set<string>();
  const add = (a: number, b: number) => {
    out.add(`${a}/${b}`);
    out.add(`${a} / ${b}`);
  };
  add(n, d);
  if (equivalents) {
    const [sn, sd] = simplify(n, d);
    add(sn, sd);
    for (let k = 2; k <= 4; k++) add(sn * k, sd * k);
    if (sn % sd === 0) out.add(String(sn / sd));
    const whole = Math.floor(sn / sd);
    if (whole > 0 && sn % sd !== 0) {
      out.add(`${whole} ${sn - whole * sd}/${sd}`);
      out.add(`${whole} ${sn - whole * sd} / ${sd}`);
    }
  }
  return [...out];
}

export function fracWords(n: number, d: number): string {
  const dn: Record<number, [string, string]> = {
    2: ["half", "halves"],
    3: ["third", "thirds"],
    4: ["fourth", "fourths"],
    5: ["fifth", "fifths"],
    6: ["sixth", "sixths"],
    8: ["eighth", "eighths"],
    10: ["tenth", "tenths"],
    12: ["twelfth", "twelfths"],
    100: ["hundredth", "hundredths"],
    1000: ["thousandth", "thousandths"],
  };
  const w = dn[d] ?? [`${ordinal(d)}`, `${ordinal(d)}s`];
  return `${n} ${n === 1 ? w[0] : w[1]}`;
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

export const SVG_OPEN = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img">';

export function svgWrap(inner: string): string {
  return `${SVG_OPEN}${inner}</svg>`;
}

export function svgText(x: number, y: number, text: string, size = 7, extra = ""): string {
  return `<text x="${r1(x)}" y="${r1(y)}" text-anchor="middle" font-size="${size}" font-family="sans-serif" fill="#334155" ${extra}>${text}</text>`;
}

export function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

export const COLORS = {
  blue: "#2563eb",
  amber: "#f59e0b",
  green: "#16a34a",
  rose: "#e11d48",
  violet: "#7c3aed",
  slate: "#94a3b8",
  light: "#e2e8f0",
  ink: "#334155",
};

/** Single (10 cells) or double (20 cells) ten frame. `a` blue dots, then `b` amber dots. */
export function tenFrameSvg(a: number, b: number, frames: 1 | 2 = 1): string {
  const cells: string[] = [];
  const cellW = frames === 1 ? 18 : 17;
  const x0 = frames === 1 ? 5 : 7;
  for (let f = 0; f < frames; f++) {
    const y0 = frames === 1 ? 32 : 12 + f * 44;
    for (let i = 0; i < 10; i++) {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = x0 + col * cellW;
      const y = y0 + row * cellW;
      const idx = f * 10 + i;
      cells.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellW}" fill="#fff" stroke="#94a3b8" stroke-width="1.5"/>`);
      if (idx < a) cells.push(`<circle cx="${x + cellW / 2}" cy="${y + cellW / 2}" r="${cellW * 0.33}" fill="${COLORS.blue}"/>`);
      else if (idx < a + b) cells.push(`<circle cx="${x + cellW / 2}" cy="${y + cellW / 2}" r="${cellW * 0.33}" fill="${COLORS.amber}"/>`);
    }
  }
  return svgWrap(cells.join(""));
}

/** Base-ten blocks: hundreds flats, tens rods, ones cubes. */
export function baseTenSvg(h: number, t: number, o: number): string {
  const parts: string[] = [];
  let y = 4;
  if (h > 0) {
    const size = 16;
    for (let i = 0; i < h; i++) {
      const x = 4 + (i % 5) * (size + 3);
      const yy = y + Math.floor(i / 5) * (size + 3);
      parts.push(`<rect x="${x}" y="${yy}" width="${size}" height="${size}" fill="#bfdbfe" stroke="${COLORS.blue}" stroke-width="1"/>`);
      for (let k = 1; k < 4; k++) {
        parts.push(`<line x1="${x + (k * size) / 4}" y1="${yy}" x2="${x + (k * size) / 4}" y2="${yy + size}" stroke="${COLORS.blue}" stroke-width="0.5"/>`);
        parts.push(`<line x1="${x}" y1="${yy + (k * size) / 4}" x2="${x + size}" y2="${yy + (k * size) / 4}" stroke="${COLORS.blue}" stroke-width="0.5"/>`);
      }
    }
    y += (h > 5 ? 2 : 1) * (size + 3) + 4;
  }
  const rodH = h > 0 ? 24 : 40;
  const rodW = h > 0 ? 5 : 7;
  if (t > 0) {
    for (let i = 0; i < t; i++) {
      const x = 4 + i * (rodW + 4);
      parts.push(`<rect x="${x}" y="${y}" width="${rodW}" height="${rodH}" fill="#fde68a" stroke="${COLORS.amber}" stroke-width="1"/>`);
      for (let k = 1; k < 10; k++) {
        parts.push(`<line x1="${x}" y1="${y + (k * rodH) / 10}" x2="${x + rodW}" y2="${y + (k * rodH) / 10}" stroke="${COLORS.amber}" stroke-width="0.5"/>`);
      }
    }
    y += rodH + 6;
  }
  if (o > 0) {
    const cube = h > 0 ? 5 : 7;
    for (let i = 0; i < o; i++) {
      const x = 4 + (i % 5) * (cube + 3);
      const yy = y + Math.floor(i / 5) * (cube + 3);
      parts.push(`<rect x="${x}" y="${yy}" width="${cube}" height="${cube}" fill="#bbf7d0" stroke="${COLORS.green}" stroke-width="1"/>`);
    }
  }
  return svgWrap(parts.join(""));
}

/** Analog clock showing h:m. */
export function clockSvg(h: number, m: number): string {
  const parts: string[] = [];
  parts.push(`<circle cx="50" cy="50" r="46" fill="#fff" stroke="${COLORS.ink}" stroke-width="2"/>`);
  for (let i = 0; i < 60; i++) {
    const a = (i * 6 * Math.PI) / 180;
    const big = i % 5 === 0;
    const r0 = big ? 40 : 43;
    parts.push(
      `<line x1="${r1(50 + r0 * Math.sin(a))}" y1="${r1(50 - r0 * Math.cos(a))}" x2="${r1(50 + 46 * Math.sin(a))}" y2="${r1(50 - 46 * Math.cos(a))}" stroke="${COLORS.ink}" stroke-width="${big ? 1.5 : 0.6}"/>`
    );
  }
  for (let n = 1; n <= 12; n++) {
    const a = (n * 30 * Math.PI) / 180;
    parts.push(svgText(50 + 33 * Math.sin(a), 50 - 33 * Math.cos(a) + 2.5, String(n), 7, 'font-weight="700"'));
  }
  const ha = (((h % 12) + m / 60) * 30 * Math.PI) / 180;
  const ma = (m * 6 * Math.PI) / 180;
  parts.push(`<line x1="50" y1="50" x2="${r1(50 + 20 * Math.sin(ha))}" y2="${r1(50 - 20 * Math.cos(ha))}" stroke="${COLORS.ink}" stroke-width="4" stroke-linecap="round"/>`);
  parts.push(`<line x1="50" y1="50" x2="${r1(50 + 30 * Math.sin(ma))}" y2="${r1(50 - 30 * Math.cos(ma))}" stroke="${COLORS.blue}" stroke-width="2.5" stroke-linecap="round"/>`);
  parts.push(`<circle cx="50" cy="50" r="2.5" fill="${COLORS.ink}"/>`);
  return svgWrap(parts.join(""));
}

export function timeStr(h: number, m: number): string {
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Circle cut into `parts` equal sectors; `shaded` sector indexes filled. */
export function circleFractionSvg(parts: number, shaded: number[], color = COLORS.blue): string {
  const out: string[] = [];
  if (parts === 1) {
    out.push(`<circle cx="50" cy="50" r="44" fill="${shaded.length ? color : "#fff"}" stroke="${COLORS.ink}" stroke-width="2"/>`);
    return svgWrap(out.join(""));
  }
  for (let i = 0; i < parts; i++) {
    const a0 = (i * 2 * Math.PI) / parts - Math.PI / 2;
    const a1 = ((i + 1) * 2 * Math.PI) / parts - Math.PI / 2;
    const x0 = r1(50 + 44 * Math.cos(a0));
    const y0 = r1(50 + 44 * Math.sin(a0));
    const x1 = r1(50 + 44 * Math.cos(a1));
    const y1 = r1(50 + 44 * Math.sin(a1));
    out.push(
      `<path d="M50,50 L${x0},${y0} A44,44 0 0,1 ${x1},${y1} Z" fill="${shaded.includes(i) ? color : "#fff"}" stroke="${COLORS.ink}" stroke-width="2" stroke-linejoin="round"/>`
    );
  }
  return svgWrap(out.join(""));
}

/** Horizontal bar cut into `parts`; `shaded` indexes filled. Multiple bars stack when `rows` given. */
export function barFractionSvg(parts: number, shaded: number[], color = COLORS.blue, rows: { parts: number; shaded: number[]; color?: string }[] = []): string {
  const all = [{ parts, shaded, color }, ...rows];
  const barH = all.length === 1 ? 30 : Math.min(26, 80 / all.length);
  const gap = 8;
  const totalH = all.length * barH + (all.length - 1) * gap;
  const y0 = 50 - totalH / 2;
  const out: string[] = [];
  all.forEach((bar, idx) => {
    const y = y0 + idx * (barH + gap);
    const w = 92 / bar.parts;
    for (let i = 0; i < bar.parts; i++) {
      out.push(
        `<rect x="${r1(4 + i * w)}" y="${r1(y)}" width="${r1(w)}" height="${barH}" fill="${bar.shaded.includes(i) ? (bar.color ?? color) : "#fff"}" stroke="${COLORS.ink}" stroke-width="1.5"/>`
      );
    }
  });
  return svgWrap(out.join(""));
}

/** rows × cols array of dots. */
export function arraySvg(rows: number, cols: number, color = COLORS.blue): string {
  const cell = Math.min(14, 90 / Math.max(rows, cols));
  const w = cols * cell;
  const h = rows * cell;
  const x0 = 50 - w / 2;
  const y0 = 50 - h / 2;
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push(`<circle cx="${r1(x0 + c * cell + cell / 2)}" cy="${r1(y0 + r * cell + cell / 2)}" r="${r1(cell * 0.32)}" fill="${color}"/>`);
    }
  }
  return svgWrap(out.join(""));
}

/** rows × cols grid of squares (partitioned rectangle / area model). */
export function gridSvg(rows: number, cols: number, shaded = rows * cols, color = "#bfdbfe", labels?: { top?: string; left?: string }): string {
  const cell = Math.min(12, 80 / Math.max(rows, cols));
  const w = cols * cell;
  const h = rows * cell;
  const x0 = 50 - w / 2 + (labels?.left ? 4 : 0);
  const y0 = 50 - h / 2 + (labels?.top ? 4 : 0);
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      out.push(`<rect x="${r1(x0 + c * cell)}" y="${r1(y0 + r * cell)}" width="${cell}" height="${cell}" fill="${idx < shaded ? color : "#fff"}" stroke="${COLORS.ink}" stroke-width="1"/>`);
    }
  }
  if (labels?.top) out.push(svgText(x0 + w / 2, y0 - 3, labels.top, 7, 'font-weight="700"'));
  if (labels?.left) out.push(svgText(x0 - 6, y0 + h / 2 + 2.5, labels.left, 7, 'font-weight="700"'));
  return svgWrap(out.join(""));
}

/** 10×10 hundred grid with `shaded` cells filled (row by row). */
export function hundredGridSvg(shaded: number, color = COLORS.blue): string {
  const out: string[] = [];
  const cell = 8.6;
  for (let i = 0; i < 100; i++) {
    const r = Math.floor(i / 10);
    const c = i % 10;
    out.push(`<rect x="${r1(7 + c * cell)}" y="${r1(7 + r * cell)}" width="${cell}" height="${cell}" fill="${i < shaded ? color : "#fff"}" stroke="#94a3b8" stroke-width="0.6"/>`);
  }
  out.push(`<rect x="7" y="7" width="86" height="86" fill="none" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
  return svgWrap(out.join(""));
}

export interface NumberLineOpts {
  min: number;
  max: number;
  /** tick every `step` */
  step: number;
  /** label every `labelEvery` ticks */
  labelEvery?: number;
  labels?: Record<number, string>;
  dots?: { at: number; color?: string; label?: string }[];
  jumps?: { from: number; to: number; label?: string }[];
  y?: number;
}

/** Horizontal number line. */
export function numberLineSvg(o: NumberLineOpts): string {
  const y = o.y ?? 55;
  const x = (v: number) => 8 + ((v - o.min) / (o.max - o.min)) * 84;
  const out: string[] = [];
  out.push(`<line x1="4" y1="${y}" x2="96" y2="${y}" stroke="${COLORS.ink}" stroke-width="1.5"/>`);
  out.push(`<polygon points="96,${y - 2.5} 99,${y} 96,${y + 2.5}" fill="${COLORS.ink}"/>`);
  const every = o.labelEvery ?? 1;
  const n = Math.round((o.max - o.min) / o.step);
  for (let i = 0; i <= n; i++) {
    const v = o.min + i * o.step;
    const xx = r1(x(v));
    const major = i % every === 0;
    out.push(`<line x1="${xx}" y1="${y - (major ? 5 : 3)}" x2="${xx}" y2="${y + (major ? 5 : 3)}" stroke="${COLORS.ink}" stroke-width="${major ? 1.5 : 1}"/>`);
    if (major) {
      const label = o.labels ? (o.labels[v] ?? "") : String(v);
      if (label) out.push(svgText(xx, y + 13, label, n > 12 ? 5 : 6));
    }
  }
  for (const j of o.jumps ?? []) {
    const x0 = x(j.from);
    const x1 = x(j.to);
    const mid = (x0 + x1) / 2;
    const h = Math.min(22, Math.abs(x1 - x0) * 0.6 + 6);
    out.push(`<path d="M${r1(x0)},${y - 2} Q${r1(mid)},${r1(y - h)} ${r1(x1)},${y - 2}" fill="none" stroke="${COLORS.blue}" stroke-width="1.5"/>`);
    out.push(`<polygon points="${r1(x1)},${y - 1} ${r1(x1 + (x1 > x0 ? -3 : 3))},${y - 5} ${r1(x1 + (x1 > x0 ? -1 : 1))},${y - 7}" fill="${COLORS.blue}"/>`);
    if (j.label) out.push(svgText(mid, y - h / 2 - 3, j.label, 6, `fill="${COLORS.blue}"`));
  }
  for (const d of o.dots ?? []) {
    out.push(`<circle cx="${r1(x(d.at))}" cy="${y}" r="3.2" fill="${d.color ?? COLORS.rose}"/>`);
    if (d.label) out.push(svgText(x(d.at), y - 8, d.label, 7, `fill="${d.color ?? COLORS.rose}" font-weight="700"`));
  }
  return svgWrap(out.join(""));
}

/** Regular polygon points around (cx, cy). */
export function polygonPoints(sides: number, cx: number, cy: number, r: number, rotDeg = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((rotDeg + (i * 360) / sides - 90) * Math.PI) / 180;
    pts.push(`${r1(cx + r * Math.cos(a))},${r1(cy + r * Math.sin(a))}`);
  }
  return pts.join(" ");
}

// ---------------------------------------------------------------------------
// word problem banks (the kids' interests)
// ---------------------------------------------------------------------------

export const KID_NAMES = ["Lily", "Cole", "Maya", "Ava", "Jack", "Leo", "Zoe", "Mia", "Ethan", "Noah", "Emma", "Olivia", "Sam", "Ruby", "Grace", "Owen"];

export interface Scene {
  theme: string;
  /** singular, plural */
  item: [string, string];
  /** where the items are / come from */
  place: string;
  /** a verb for "gets more" and "gives away/uses" */
  more: string;
  fewer: string;
  emoji: string;
}

export const SCENES_EARLY: Scene[] = [
  { theme: "ponies", item: ["apple", "apples"], place: "the pony barn", more: "picks", fewer: "feeds the ponies", emoji: "🍎" },
  { theme: "ponies", item: ["ribbon", "ribbons"], place: "the pony show", more: "wins", fewer: "gives away", emoji: "🎀" },
  { theme: "ballet", item: ["sticker", "stickers"], place: "ballet class", more: "earns", fewer: "gives to friends", emoji: "⭐" },
  { theme: "ballet", item: ["flower", "flowers"], place: "the recital", more: "gets", fewer: "hands out", emoji: "🌸" },
  { theme: "cheer", item: ["pom-pom", "pom-poms"], place: "cheer practice", more: "finds", fewer: "lends out", emoji: "🎉" },
  { theme: "soccer", item: ["soccer ball", "soccer balls"], place: "the soccer field", more: "collects", fewer: "kicks into the net", emoji: "⚽" },
  { theme: "soccer", item: ["cone", "cones"], place: "soccer practice", more: "sets out", fewer: "puts away", emoji: "🔶" },
  { theme: "baseball", item: ["baseball card", "baseball cards"], place: "the card shop", more: "buys", fewer: "trades away", emoji: "⚾" },
  { theme: "basketball", item: ["basketball", "basketballs"], place: "the gym", more: "brings", fewer: "lends out", emoji: "🏀" },
  { theme: "treats", item: ["cookie", "cookies"], place: "the bake sale", more: "bakes", fewer: "sells", emoji: "🍪" },
];

export const SCENES_UPPER: Scene[] = [
  { theme: "baseball", item: ["baseball", "baseballs"], place: "the dugout", more: "buys", fewer: "uses", emoji: "⚾" },
  { theme: "baseball", item: ["baseball card", "baseball cards"], place: "a binder", more: "collects", fewer: "trades", emoji: "⚾" },
  { theme: "soccer", item: ["goal", "goals"], place: "the season", more: "scores", fewer: "misses", emoji: "⚽" },
  { theme: "soccer", item: ["water bottle", "water bottles"], place: "the team cooler", more: "packs", fewer: "hands out", emoji: "🧴" },
  { theme: "basketball", item: ["point", "points"], place: "the game", more: "scores", fewer: "loses", emoji: "🏀" },
  { theme: "basketball", item: ["free throw", "free throws"], place: "practice", more: "makes", fewer: "misses", emoji: "🏀" },
  { theme: "ponies", item: ["carrot", "carrots"], place: "the stable", more: "brings", fewer: "feeds to the ponies", emoji: "🥕" },
  { theme: "ballet", item: ["ticket", "tickets"], place: "the recital", more: "sells", fewer: "gives away", emoji: "🎟️" },
];

export function pickName(rng: () => number, not?: string): string {
  let n = pick(rng, KID_NAMES);
  let guard = 0;
  while (n === not && guard++ < 10) n = pick(rng, KID_NAMES);
  return n;
}

/** Uniform helper used by many generators: a random integer with the rng. */
export function rint(rng: () => number, min: number, max: number): number {
  return int(rng, min, max);
}

// ---------------------------------------------------------------------------
// column arithmetic explanations (standard algorithm, kid wording)
// ---------------------------------------------------------------------------

const PLACE_WORD = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands", "millions"];

/** Step-by-step standard-algorithm addition explanation. */
export function columnAddExplain(a: number, b: number): string {
  const sum = a + b;
  const len = String(Math.max(a, b)).length;
  const steps: string[] = [];
  let carry = 0;
  for (let i = 0; i < len; i++) {
    const da = digitAt(a, 10 ** i);
    const db = digitAt(b, 10 ** i);
    const s = da + db + carry;
    const write = s % 10;
    const newCarry = Math.floor(s / 10);
    const carryTxt = carry ? ` + ${carry} carried` : "";
    steps.push(`${PLACE_WORD[i]}: ${da} + ${db}${carryTxt} = ${s}${newCarry ? `, write ${write}, carry ${newCarry}` : ""}`);
    carry = newCarry;
  }
  if (carry) steps.push(`then the carried ${carry} goes in front`);
  return `Line up the places and add from the ones. ${steps.join("; ")}. ${fmt(a)} + ${fmt(b)} = ${fmt(sum)}.`;
}

/** Step-by-step standard-algorithm subtraction explanation (a >= b). */
export function columnSubExplain(a: number, b: number): string {
  const diff = a - b;
  const len = String(a).length;
  const steps: string[] = [];
  let borrow = 0;
  for (let i = 0; i < len; i++) {
    let da = digitAt(a, 10 ** i) - borrow;
    const db = digitAt(b, 10 ** i);
    if (i === len - 1 && da === 0 && db === 0) break;
    if (da < db) {
      steps.push(`${PLACE_WORD[i]}: ${da} is less than ${db}, so regroup 1 from the ${PLACE_WORD[i + 1] ?? "next place"} → ${da + 10} − ${db} = ${da + 10 - db}`);
      da += 10;
      borrow = 1;
    } else {
      steps.push(`${PLACE_WORD[i]}: ${da} − ${db} = ${da - db}`);
      borrow = 0;
    }
  }
  return `Line up the places and subtract from the ones. ${steps.join("; ")}. ${fmt(a)} − ${fmt(b)} = ${fmt(diff)}.`;
}
