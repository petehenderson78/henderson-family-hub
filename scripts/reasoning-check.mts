/**
 * Reasoning generators self-check: `node scripts/reasoning-check.mts`.
 *
 * Plain Node 22+ (built-in TypeScript type stripping) with the repo's resolve
 * hook (./ts-resolve-hooks.mjs) for extension-less relative imports.
 *
 * For every generator in src/lib/learn/generators/reasoning.ts × levels 1 and 3
 * × 300 seeds: prompt/explain/hint present, options unique (label/emoji/svg),
 * answerIndex in range, no id= in SVG, SVG tags balanced, answer position
 * roughly uniform (no position > 45%), same seed → identical JSON, level-1
 * speak text present, paper-folding answers geometrically correct (independent
 * mirror calculation), verbal banks never repeat an item within a window of
 * consecutive attempts, and the reasoning catalog is consistent.
 *
 * Adversarial guards (each re-solves the item without the generator's own logic):
 *   - shape table vs geometry: outlines sampled from the SVG markup; figureKey-equal ⇔ drawn
 *     alike, chiral ⇔ the mirror image is not a turn, period matches, no two shapes look alike
 *   - figure options: no two options a child could not tell apart; mental rotation answer is a
 *     turn and no distractor is (almost) a turn; figure classification has exactly one option
 *     sharing every feature the examples share (odd-one-out: exactly one option is odd on any
 *     feature); figure series / matrix attributes have one forced continuation
 *   - number series: every natural continuation rule that fits agrees with the answer
 *   - number analogies: every simple reading of the example pairs gives the answer and only it
 *   - number puzzles: equations re-solved by substitution / brute force; no grade-1 balance or
 *     train item at level 3; every catalog `kinds` value is implemented
 *   - pattern completion (repeat period), sudoku (row + column alone fix the ?), logic grid
 *     (premise names everyone, exactly one assignment fits, every clue needed, level 1 = 2 clues
 *     with one "has"), odd one out (the odd one never also fits the group's name)
 *   - verbal banks: option counts, explain names the answer, level-1 emoji for every option,
 *     emoji that picture the word, no Unicode 15+ emoji, US spelling / no brands, no specialized
 *     jargon, known "second right answer" distractors; catalog intros never give away a bank item
 */

import { register } from "node:module";
import type { ChoiceQuestion, Option, Question } from "../src/lib/learn/types";
import type { VerbalItem } from "../src/lib/learn/content/types";

register("./ts-resolve-hooks.mjs", import.meta.url);

const reasoningMod = await import("../src/lib/learn/generators/reasoning");
const rngMod = await import("../src/lib/learn/rng");
const catalogMod = await import("../src/lib/learn/catalog-reasoning");
const banksMod = await import("../src/lib/learn/content/verbal-banks");
const svgMod = await import("../src/lib/learn/generators/reasoning-svg");

const { generators, NUMBER_PUZZLE_KINDS, SERIES_KINDS } = reasoningMod;
const { SHAPE_INFO } = svgMod;
const { mulberry32, hashString } = rngMod;
const { REASONING_SKILLS } = catalogMod;
const { VERBAL_BANKS } = banksMod;

const SEEDS = Number(process.env.REASONING_SEEDS) || 300; // REASONING_SEEDS=3000 for a deeper run
const LEVELS = [1, 3];
const MAX_POSITION_SHARE = 0.45;

interface Failure {
  where: string;
  message: string;
}
const failures: Failure[] = [];
let checks = 0;
const seenMessages = new Map<string, number>();

function fail(where: string, message: string) {
  // collapse identical messages per generator so the report stays readable
  const key = `${where.replace(/ seed \d+/, "")}|${message}`;
  const n = (seenMessages.get(key) ?? 0) + 1;
  seenMessages.set(key, n);
  if (n <= 3) failures.push({ where, message: n === 3 ? `${message} (further identical failures suppressed)` : message });
}

function assert(cond: unknown, where: string, message: string) {
  checks += 1;
  if (!cond) fail(where, message);
}

function svgTagsBalanced(svg: string): boolean {
  const stack: string[] = [];
  const tagRe = /<\/?([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(svg))) {
    const full = m[0];
    const name = m[1];
    if (full.startsWith("</")) {
      if (stack.pop() !== name) return false;
    } else if (!m[2]) {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

function hasBadString(s: string): boolean {
  return /\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b/.test(s);
}

function optionKey(o: { label?: string; svg?: string; emoji?: string }): string {
  return JSON.stringify([o.label ?? "", o.emoji ?? "", o.svg ?? ""]);
}

function checkSvg(svg: string, tag: string, what: string) {
  assert(svg.startsWith("<svg"), tag, `${what}: does not start with <svg`);
  assert(svg.includes('viewBox="0 0 100 100"'), tag, `${what}: viewBox is not 0 0 100 100`);
  assert(!/\bid=/.test(svg), tag, `${what}: contains an id= attribute`);
  assert(!/\brole=/.test(svg), tag, `${what}: contains a role attribute`);
  assert(svgTagsBalanced(svg), tag, `${what}: tags not balanced`);
  assert(!hasBadString(svg), tag, `${what}: contains NaN/undefined/null`);
  assert(!/<(script|foreignObject|image|use)\b/i.test(svg), tag, `${what}: contains a disallowed element`);
}

// ---------------------------------------------------------------------------
// independent paper-folding mirror calculation
// ---------------------------------------------------------------------------

interface P {
  x: number;
  y: number;
}
interface F {
  axis: string;
  at: number;
  keep: string;
}

function parseFolds(s: string): F[] {
  return s.split(";").map((part) => {
    const m = /^([xyd])([0-9.]+)(hi|lo)$/.exec(part);
    if (!m) throw new Error(`bad fold spec "${part}"`);
    return { axis: m[1], at: Number(m[2]), keep: m[3] };
  });
}

function parsePoints(s: string): P[] {
  if (!s) return [];
  return s.split(";").map((part) => {
    const [x, y] = part.split(",").map(Number);
    return { x, y };
  });
}

/** Mirror a point across a fold line, written independently of the generator. */
function mirror(p: P, f: F): P {
  if (f.axis === "x") return { x: f.at + (f.at - p.x), y: p.y };
  if (f.axis === "y") return { x: p.x, y: f.at + (f.at - p.y) };
  return { x: p.y, y: p.x }; // diagonal y = x
}

function onKeptSide(p: P, f: F): boolean {
  const v = f.axis === "x" ? p.x - f.at : f.axis === "y" ? p.y - f.at : p.y - p.x;
  return f.keep === "hi" ? v > 1e-9 : v < -1e-9;
}

function keyOf(pts: P[]): string {
  return pts
    .map((p) => `${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000}`)
    .sort()
    .join(";");
}

/** Unfold by undoing the folds in reverse order; each undo adds the mirror image of every hole so far. */
function expectedHoles(punches: P[], folds: F[]): P[] {
  let pts = punches.slice();
  for (let i = folds.length - 1; i >= 0; i--) {
    const extra = pts.map((p) => mirror(p, folds[i]));
    const all = [...pts, ...extra];
    const byKey = new Map<string, P>();
    for (const p of all) byKey.set(keyOf([p]), p);
    pts = [...byKey.values()];
  }
  return pts;
}

function circlesIn(svg: string): P[] {
  const out: P[] = [];
  const re = /<circle[^>]*cx="([0-9.]+)"[^>]*cy="([0-9.]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) out.push({ x: (Number(m[1]) - 10) / 80, y: (Number(m[2]) - 10) / 80 });
  return out;
}

function checkPaperFolding(q: ChoiceQuestion, tag: string) {
  const svg: string = q.display?.svg ?? "";
  const foldsAttr = /data-folds="([^"]*)"/.exec(svg)?.[1];
  const punchAttr = /data-punches="([^"]*)"/.exec(svg)?.[1];
  assert(!!foldsAttr && punchAttr !== undefined, tag, "paper folding: display svg lacks data-folds/data-punches");
  if (!foldsAttr || punchAttr === undefined) return;
  const folds = parseFolds(foldsAttr);
  const punches = parsePoints(punchAttr);
  assert(punches.length >= 1, tag, "paper folding: no punches");
  // every punch must lie inside the folded stack (the kept side of every fold)
  for (const p of punches) assert(folds.every((f) => onKeptSide(p, f)), tag, `paper folding: punch ${keyOf([p])} is outside the folded stack`);
  const expected = expectedHoles(punches, folds);
  assert(expected.length === punches.length * 2 ** folds.length, tag, `paper folding: expected ${punches.length * 2 ** folds.length} holes, mirror calc gives ${expected.length}`);
  for (const h of expected) assert(h.x > 0 && h.x < 1 && h.y > 0 && h.y < 1, tag, "paper folding: a hole lands off the paper");
  const answer = q.options[q.answerIndex];
  const answerAttr = /data-holes="([^"]*)"/.exec(answer.svg ?? "")?.[1] ?? "";
  assert(answerAttr === keyOf(expected), tag, `paper folding: answer holes ${answerAttr} ≠ independent mirror calc ${keyOf(expected)}`);
  const drawn = circlesIn(answer.svg ?? "");
  assert(keyOf(drawn) === keyOf(expected), tag, `paper folding: drawn circles ${keyOf(drawn)} ≠ expected ${keyOf(expected)}`);
  q.options.forEach((o: Option, i: number) => {
    if (i === q.answerIndex) return;
    const k = /data-holes="([^"]*)"/.exec(o.svg ?? "")?.[1] ?? "";
    assert(k !== keyOf(expected), tag, `paper folding: distractor ${i} is also geometrically correct`);
    assert(keyOf(circlesIn(o.svg ?? "")) === k, tag, `paper folding: distractor ${i} drawing does not match its data-holes`);
  });
}

// ---------------------------------------------------------------------------
// figure geometry: outlines sampled from the raw shape markup, compared with Hausdorff distance
// (independent of figureKey, so a shape whose mirror image is secretly a turn — the old staircase —
// or two "different" options that look the same are caught)
// ---------------------------------------------------------------------------

type V = [number, number];
const SAME_DIST = 2.5; // ≤ this (in the 100-unit box) = the same picture
const DIFF_DIST = 6; // ≥ this = clearly different; anything in between is "looks almost the same"

function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function sampleSeg(a: V, b: V, out: V[]) {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
  for (let i = 0; i < n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
}

/** SVG arc (endpoint form) → points, per the SVG spec's center conversion. */
function sampleArc(p1: V, rx: number, ry: number, phiDeg: number, fa: number, fs: number, p2: V, out: V[]) {
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p1[0] - p2[0]) / 2;
  const dy = (p1[1] - p2[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1) / ry;
  const cyp = (-coef * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (p1[0] + p2[0]) / 2;
  const cy = sin * cxp + cos * cyp + (p1[1] + p2[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(8, Math.ceil((Math.abs(dt) * Math.max(rx, ry)) / 2));
  for (let i = 0; i < n; i++) {
    const t = t1 + (dt * i) / n;
    out.push([cos * rx * Math.cos(t) - sin * ry * Math.sin(t) + cx, sin * rx * Math.cos(t) + cos * ry * Math.sin(t) + cy]);
  }
}

function samplePath(d: string, out: V[]) {
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  let i = 0;
  let cmd = "";
  let cur: V = [0, 0];
  let start: V = [0, 0];
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const at = (x: number, y: number): V => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    if (C === "Z") {
      sampleSeg(cur, start, out);
      cur = start;
      continue;
    }
    if (C === "M") {
      cur = at(num(), num());
      start = cur;
      cmd = rel ? "l" : "L";
    } else if (C === "L") {
      const nxt = at(num(), num());
      sampleSeg(cur, nxt, out);
      cur = nxt;
    } else if (C === "H") {
      const x = num();
      const nxt: V = [rel ? cur[0] + x : x, cur[1]];
      sampleSeg(cur, nxt, out);
      cur = nxt;
    } else if (C === "V") {
      const y = num();
      const nxt: V = [cur[0], rel ? cur[1] + y : y];
      sampleSeg(cur, nxt, out);
      cur = nxt;
    } else if (C === "C") {
      const c1 = at(num(), num());
      const c2 = at(num(), num());
      const e = at(num(), num());
      for (let k = 0; k < 24; k++) {
        const t = k / 24;
        const u = 1 - t;
        out.push([u * u * u * cur[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0], u * u * u * cur[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1]]);
      }
      cur = e;
    } else if (C === "A") {
      const rx = num();
      const ry = num();
      const phi = num();
      const fa = num();
      const fs = num();
      const e = at(num(), num());
      sampleArc(cur, rx, ry, phi, fa, fs, e, out);
      cur = e;
    } else throw new Error(`path command ${cmd} not supported by the check`);
  }
}

/** Outline points of raw shape markup (polygon / path / rect / circle / ellipse). */
function outlineOf(markup: string): V[] {
  const out: V[] = [];
  for (const m of markup.matchAll(/<(polygon|path|rect|circle|ellipse)\b([^>]*?)\/?>/g)) {
    const a = attrsOf(m[2]);
    if (m[1] === "polygon") {
      const n = a.points.trim().split(/[\s,]+/).map(Number);
      const pts: V[] = [];
      for (let k = 0; k < n.length; k += 2) pts.push([n[k], n[k + 1]]);
      pts.forEach((p, k) => sampleSeg(p, pts[(k + 1) % pts.length], out));
    } else if (m[1] === "rect") {
      const [x, y, w, h] = [a.x, a.y, a.width, a.height].map(Number);
      const pts: V[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      pts.forEach((p, k) => sampleSeg(p, pts[(k + 1) % 4], out));
    } else if (m[1] === "circle" || m[1] === "ellipse") {
      const rx = Number(a.r ?? a.rx);
      const ry = Number(a.r ?? a.ry);
      for (let k = 0; k < 90; k++) out.push([Number(a.cx) + rx * Math.cos((k * Math.PI) / 45), Number(a.cy) + ry * Math.sin((k * Math.PI) / 45)]);
    } else samplePath(a.d, out);
  }
  return out;
}

const outlineCache = new Map<string, V[]>();
/** The outline as drawn: centered, mirrored (scale(flip 1)) then turned (rotate(deg)) — the order figureInner uses. */
function drawnOutline(markup: string, deg: number, flip: number): V[] {
  const key = `${markup}|${deg}|${flip}`;
  let pts = outlineCache.get(key);
  if (!pts) {
    const r = (deg * Math.PI) / 180;
    const c = Math.round(Math.cos(r) * 1e9) / 1e9;
    const s = Math.round(Math.sin(r) * 1e9) / 1e9;
    pts = outlineOf(markup).map(([x, y]) => {
      const fx = (x - 50) * flip;
      const fy = y - 50;
      return [fx * c - fy * s, fx * s + fy * c] as V;
    });
    outlineCache.set(key, pts);
  }
  return pts;
}

const distCache = new Map<string, number>();
function hausdorff(a: V[], b: V[]): number {
  const directed = (p: V[], q: V[]) => {
    let worst = 0;
    for (const u of p) {
      let best = Infinity;
      for (const w of q) {
        const dd = (u[0] - w[0]) ** 2 + (u[1] - w[1]) ** 2;
        if (dd < best) best = dd;
      }
      if (best > worst) worst = best;
    }
    return Math.sqrt(worst);
  };
  return Math.max(directed(a, b), directed(b, a));
}

interface Drawn {
  markup: string;
  deg: number;
  flip: number;
}
function drawnDist(x: Drawn, y: Drawn): number {
  const key = [x.markup, x.deg, x.flip, y.markup, y.deg, y.flip].join("|");
  let d = distCache.get(key);
  if (d === undefined) {
    d = hausdorff(drawnOutline(x.markup, x.deg, x.flip), drawnOutline(y.markup, y.deg, y.flip));
    distCache.set(key, d);
  }
  return d;
}

// ---------------------------------------------------------------------------
// figure decoding (from the SVG strings the child actually sees)
// ---------------------------------------------------------------------------

interface Copy extends Drawn {
  s: number;
  fill: string;
  stroke: string;
}
interface Fig {
  shape: string;
  copies: Copy[];
  /** quarter turns as drawn, normalized by the shape's symmetry period */
  rot: number;
  flip: number;
  fill: number;
  hue: number;
  size: number;
  count: number;
}
const HUE_COLORS = ["#4f46e5", "#d97706", "#db2777"];
const HUE_TINTS = ["#c7d2fe", "#fde68a", "#fbcfe8"];
const PER_COPY_SCALE = [0, 1, 0.5, 0.34]; // the layout scale of 1, 2 or 3 copies side by side
const MARKUP_TO_SHAPE = new Map(Object.entries(SHAPE_INFO).map(([k, v]) => [v.markup, k]));

const INNER_RE = /<g transform="translate\(([\d.]+) 50\) scale\(([\d.]+)\) rotate\((-?[\d.]+)\) scale\((-?1) 1\) translate\(-50 -50\)" fill="([^"]+)" stroke="([^"]+)"[^>]*>(.*?)<\/g>/g;
const OUTER_RE = /<g transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)">/g;

function toFig(copies: Copy[]): Fig {
  const c0 = copies[0];
  const shape = MARKUP_TO_SHAPE.get(c0.markup) ?? "?";
  const period = SHAPE_INFO[shape as keyof typeof SHAPE_INFO]?.period ?? 4;
  const count = copies.length;
  const hue = HUE_COLORS.indexOf(c0.stroke);
  return {
    shape,
    copies,
    rot: (((Math.round(c0.deg / 90) % 4) + 4) % 4) % period,
    flip: c0.flip,
    fill: c0.fill === "#ffffff" ? 0 : HUE_TINTS.includes(c0.fill) ? 1 : 2,
    hue,
    size: c0.s / (PER_COPY_SCALE[count] ?? 1) > 0.8 ? 1 : 0,
    count,
  };
}

/** Every figure in an SVG, in drawing order (row / matrix cells, or the single figure of an option). */
function decodeFigures(svg: string): Fig[] {
  const events: { at: number; outer?: true; copy?: Copy }[] = [];
  for (const m of svg.matchAll(OUTER_RE)) events.push({ at: m.index ?? 0, outer: true });
  for (const m of svg.matchAll(INNER_RE)) events.push({ at: m.index ?? 0, copy: { s: Number(m[2]), deg: Number(m[3]), flip: Number(m[4]), fill: m[5], stroke: m[6], markup: m[7] } });
  events.sort((a, b) => a.at - b.at);
  const groups: Copy[][] = [];
  let open = false;
  for (const e of events) {
    if (e.outer) {
      groups.push([]);
      open = true;
    } else if (e.copy) {
      if (!open) {
        groups.push([]);
        open = true;
      }
      groups[groups.length - 1].push(e.copy);
    }
  }
  return groups.filter((g) => g.length > 0).map(toFig);
}

/** Outline distance between two option figures a child could confuse (same colors, size and count), else null. */
function looksAlike(a: Fig, b: Fig): number | null {
  if (a.count !== b.count || a.copies[0].fill !== b.copies[0].fill || a.copies[0].stroke !== b.copies[0].stroke) return null;
  if (Math.abs(a.copies[0].s - b.copies[0].s) > 0.01) return null;
  return drawnDist(a.copies[0], b.copies[0]);
}
/** Same shape turned/flipped must differ by DIFF_DIST; different shapes by CROSS_SHAPE_DIST (corners tell a pentagon from a circle). */
const CROSS_SHAPE_DIST = 4;

// independent features for figure classification (no generator code)
const CURVED_CLASS: Record<string, string> = { half: "yes", heart: "yes", circle: "yes", oval: "yes", pee: "mixed" };
const POINTERS = new Set(["arrow", "triangle"]);
function feats(f: Fig): Record<string, string> {
  return {
    shape: f.shape,
    fill: String(f.fill),
    hue: String(f.hue),
    size: String(f.size),
    count: String(f.count),
    curved: CURVED_CLASS[f.shape] ?? "no",
    orient: POINTERS.has(f.shape) ? `points:${f.rot}` : `${f.shape}:${f.rot}:${f.flip}`,
  };
}
const FEAT_NAMES = ["shape", "fill", "hue", "size", "count", "curved", "orient"];
/** visual attributes a series / matrix rule can change */
function attrs(f: Fig): Record<string, string> {
  return { shape: f.shape, rot: String(f.rot), flip: String(SHAPE_INFO[f.shape as keyof typeof SHAPE_INFO]?.chiral ? f.flip : 1), fill: String(f.fill), hue: String(f.hue), size: String(f.size), count: String(f.count) };
}
const ATTR_NAMES = ["shape", "rot", "flip", "fill", "hue", "size", "count"];

// ---------------------------------------------------------------------------
// shape table vs geometry: figureKey equal ⇔ drawn outlines equal; different ⇒ clearly different
// ---------------------------------------------------------------------------

let minDiff = Infinity;
let minDiffWhat = "";
for (const shape of Object.keys(SHAPE_INFO) as (keyof typeof SHAPE_INFO)[]) {
  const info = SHAPE_INFO[shape];
  const combos: { key: string; drawn: Drawn; what: string }[] = [];
  for (let rot = 0; rot < 4; rot++)
    for (const flip of [false, true]) {
      const f = { shape, rot, flip, fill: 0 as const, size: 1 as const, count: 1 as const, hue: 0 as const };
      const fig = decodeFigures(svgMod.figureSvg(f))[0];
      combos.push({ key: svgMod.figureKey(f), drawn: fig.copies[0], what: `rot ${rot}${flip ? " flipped" : ""}` });
    }
  for (let i = 0; i < combos.length; i++)
    for (let j = i + 1; j < combos.length; j++) {
      const d = drawnDist(combos[i].drawn, combos[j].drawn);
      const where = `shape ${shape}`;
      if (combos[i].key === combos[j].key) assert(d <= SAME_DIST, where, `${combos[i].what} and ${combos[j].what} share a figureKey but are drawn differently (distance ${d.toFixed(1)})`);
      else {
        assert(d >= DIFF_DIST, where, `${combos[i].what} and ${combos[j].what} have different figureKeys but look the same (distance ${d.toFixed(1)}) — check period/chiral in SHAPE_INFO`);
        if (d < minDiff) {
          minDiff = d;
          minDiffWhat = `${shape} ${combos[i].what} vs ${combos[j].what}`;
        }
      }
    }
  // chiral ⇔ the mirror image is not a turn
  const mirrorIsTurn = [0, 90, 180, 270].some((deg) => drawnDist({ markup: info.markup, deg: 0, flip: -1 }, { markup: info.markup, deg, flip: 1 }) <= SAME_DIST);
  assert(info.chiral === !mirrorIsTurn, `shape ${shape}`, `SHAPE_INFO says chiral=${info.chiral} but the mirror image ${mirrorIsTurn ? "IS" : "is NOT"} a turn of the shape`);
  const turns = [90, 180, 270].map((deg) => drawnDist({ markup: info.markup, deg: 0, flip: 1 }, { markup: info.markup, deg, flip: 1 }));
  if (info.period === 4) assert(turns.every((d) => d >= DIFF_DIST), `shape ${shape}`, `period 4 but some quarter turn looks the same (${turns.map((d) => d.toFixed(1)).join(", ")})`);
  if (info.period === 2) assert(turns[0] >= DIFF_DIST && turns[1] <= SAME_DIST, `shape ${shape}`, `period 2 but turns give ${turns.map((d) => d.toFixed(1)).join(", ")}`);
}
// different shapes never look alike
{
  const shapes = Object.keys(SHAPE_INFO) as (keyof typeof SHAPE_INFO)[];
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++)
      for (const deg of [0, 90, 180, 270])
        for (const flip of [1, -1]) {
          // outlines of different shapes may sit closer than DIFF_DIST when corners tell them apart
          // (a pentagon inside a circle is ~5 units away at its flat sides); 4 still catches look-alikes
          const d = drawnDist({ markup: SHAPE_INFO[shapes[i]].markup, deg: 0, flip: 1 }, { markup: SHAPE_INFO[shapes[j]].markup, deg, flip });
          assert(d >= CROSS_SHAPE_DIST, `shapes ${shapes[i]}/${shapes[j]}`, `look alike (distance ${d.toFixed(1)})`);
        }
}

// ---------------------------------------------------------------------------
// semantic checks: re-solve every generated item independently
// ---------------------------------------------------------------------------

const graphemes = (s: string) => [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)].length;

/** Natural continuations of a number list; every rule that fits all terms must predict the same next number. */
function seriesPredictions(t: number[]): Map<string, number> {
  const out = new Map<string, number>();
  const n = t.length;
  const d = t.slice(1).map((x, i) => x - t[i]);
  if (d.every((x) => x === d[0])) out.set("same jump", t[n - 1] + d[0]);
  if (t.every((x) => x !== 0)) {
    const r = t.slice(1).map((x, i) => x / t[i]);
    if (r.every((x) => x === r[0]) && Number.isInteger(t[n - 1] * r[0])) out.set("same ratio", t[n - 1] * r[0]);
  }
  if (d.length >= 3) {
    const dd = d.slice(1).map((x, i) => x - d[i]);
    if (dd.every((x) => x === dd[0])) out.set("jumps change evenly", t[n - 1] + d[d.length - 1] + dd[0]);
  }
  if (d.length >= 4 && d.every((x, i) => i < 2 || x === d[i - 2]) && d[0] !== d[1]) out.set("two jumps take turns", t[n - 1] + d[d.length - 2]);
  const odd = t.filter((_, i) => i % 2 === 0);
  const even = t.filter((_, i) => i % 2 === 1);
  const arith = (a: number[]) => a.length >= 3 && a.slice(1).every((x, i) => x - a[i] === a[1] - a[0]);
  if (arith(odd) && arith(even) && !out.has("same jump")) {
    const next = n % 2 === 0 ? odd : even;
    out.set("two lists take turns", next[next.length - 1] + (next[1] - next[0]));
  }
  if (n >= 4 && t.every((x, i) => i < 2 || x === t[i - 1] + t[i - 2])) out.set("add the two before", t[n - 1] + t[n - 2]);
  return out;
}

/** a → b rules for [a → b] number analogies (level 3). */
const L3_RULES: [string, (x: number) => number][] = [
  ...Array.from({ length: 20 }, (_, k) => [`+${k + 1}`, (x: number) => x + k + 1] as [string, (x: number) => number]),
  ...Array.from({ length: 20 }, (_, k) => [`-${k + 1}`, (x: number) => x - k - 1] as [string, (x: number) => number]),
  ...Array.from({ length: 9 }, (_, k) => [`×${k + 2}`, (x: number) => x * (k + 2)] as [string, (x: number) => number]),
  ...Array.from({ length: 9 }, (_, k) => [`÷${k + 2}`, (x: number) => x / (k + 2)] as [string, (x: number) => number]),
  ["square", (x) => x * x],
  ["2x+1", (x) => 2 * x + 1],
  ["2x-1", (x) => 2 * x - 1],
  ["3x+1", (x) => 3 * x + 1],
  ["3x-1", (x) => 3 * x - 1],
];
/** a → b readings a grade-1 child might see in "3 apples turn into 5 apples". */
const L1_RULES: [string, (x: number) => number][] = [
  ...[1, 2, 3, 4, 5].map((k) => [`${k} more`, (x: number) => x + k] as [string, (x: number) => number]),
  ...[1, 2, 3, 4, 5].map((k) => [`${k} less`, (x: number) => x - k] as [string, (x: number) => number]),
  ["double", (x) => 2 * x],
  ["triple", (x) => 3 * x],
  ["half", (x) => x / 2],
  ["a third", (x) => x / 3],
];
function ruleAnswers(rules: [string, (x: number) => number][], pairs: number[][], c: number): Map<number, string> {
  const out = new Map<number, string>();
  for (const [name, f] of rules) {
    if (!pairs.every(([x, y]) => f(x) === y)) continue;
    const v = f(c);
    if (Number.isInteger(v) && v >= 0) out.set(v, name);
  }
  return out;
}

/** Evaluate an arithmetic expression written with × ÷ − and digits only. */
function evalExpr(e: string): number {
  const js = e.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!/^[\d\s+\-*/().]+$/.test(js)) throw new Error(`cannot evaluate "${e}"`);
  return Function(`"use strict"; return (${js});`)() as number;
}

/** An expression in ■ and ● as a function (× ÷ − written the way the prompt shows them). */
function compileShapes(e: string): (sq: number, ci: number) => number {
  const js = e.replace(/■/g, "sq").replace(/●/g, "ci").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!/^[\dsqci\s+\-*/().]+$/.test(js)) throw new Error(`cannot compile "${e}"`);
  return Function("sq", "ci", `"use strict"; return (${js});`) as (sq: number, ci: number) => number;
}

/** Brute-force ■ and ● (0..120) in "eq   and   eq" puzzles. */
function shapeSolutions(eqs: string[]): { sq: number; ci: number }[] {
  const sides = eqs.map((eq) => eq.split("=").map(compileShapes));
  const sols: { sq: number; ci: number }[] = [];
  for (let sq = 0; sq <= 120; sq++)
    for (let ci = 0; ci <= 120; ci++) if (sides.every(([l, r]) => Math.abs(l(sq, ci) - r(sq, ci)) < 1e-9)) sols.push({ sq, ci });
  return sols;
}

// odd one out: things that ALSO fit a group's name (never a fair "odd one" against that group)
const ALSO_FITS: Record<string, string[]> = {
  "farm animals": ["duck", "dog", "cat", "rabbit", "chicken", "turkey", "goose", "horse", "goat", "donkey"],
  birds: ["chicken", "turkey", "duck", "penguin", "parrot", "owl", "eagle", "swan", "robin", "flamingo", "goose"],
  "wild animals": ["owl", "eagle", "robin", "swan", "flamingo", "duck", "parrot", "penguin", "turkey", "octopus", "crab", "dolphin", "shark", "whale", "lobster", "blowfish", "bee", "ladybug", "butterfly", "ant", "cricket", "beetle", "turtle", "rabbit", "fox", "deer", "frog", "snake"],
  "sea animals": ["turtle", "goldfish", "fish", "penguin", "seal", "walrus"],
  pets: ["parrot", "goldfish", "turtle", "rabbit", "hamster", "dog", "cat", "fish"],
  "flying machines": ["rocket", "satellite", "hot-air balloon", "drone", "jet"],
  "things that fly in the sky": ["owl", "eagle", "duck", "parrot", "swan", "robin", "flamingo", "bee", "ladybug", "butterfly", "cricket", "beetle", "rocket", "satellite"],
  "things in space": ["rocket", "sun", "satellite", "astronaut"],
  "kinds of weather": ["sun", "wind", "fog", "lightning", "cloud"],
  "kitchen things": ["knife", "scissors"],
  tools: ["knife", "scissors", "ruler", "pencil", "pen", "spoon", "fork", "set square"],
  "tools for building and fixing": ["knife", "scissors", "ruler"],
  "school things": ["scissors", "ruler", "glue", "set square"],
  "sweet treats": ["watermelon", "strawberry", "cherries", "grapes", "banana", "apple", "orange", "pear", "honey"],
  furniture: ["mirror", "lamp"],
};

const IDS_WITH_FIGURE_OPTIONS = new Set(["r.figureMatrix", "r.figureClassification", "r.figureSeries", "r.mentalRotation"]);

function semanticCheck(id: string, level: number, q: Question, tag: string) {
  if (q.type !== "choice") return;
  const answer = q.options[q.answerIndex];
  const labels = q.options.map((o) => o.label ?? "");

  // figure options: no two options a child could not tell apart
  if (IDS_WITH_FIGURE_OPTIONS.has(id)) {
    const figs = q.options.map((o) => decodeFigures(o.svg ?? "")[0]);
    assert(figs.every((f) => f && f.shape !== "?" && f.hue >= 0), tag, "could not decode a figure option");
    if (!figs.every((f) => f && f.shape !== "?")) return;
    for (let i = 0; i < figs.length; i++)
      for (let j = i + 1; j < figs.length; j++) {
        const d = looksAlike(figs[i], figs[j]);
        const need = figs[i].shape === figs[j].shape ? DIFF_DIST : CROSS_SHAPE_DIST;
        assert(d === null || d >= need, tag, `options ${i} and ${j} look the same or almost the same (outline distance ${d?.toFixed(1)})`);
      }
    const ans = figs[q.answerIndex];

    if (id === "r.mentalRotation") {
      const base = decodeFigures(q.display?.svg ?? "")[0];
      const turnOf = (f: Fig) => [0, 90, 180, 270].map((deg) => drawnDist({ markup: base.copies[0].markup, deg: base.copies[0].deg + deg, flip: base.copies[0].flip }, f.copies[0]));
      assert(turnOf(ans).some((d) => d <= SAME_DIST), tag, "mental rotation: the answer is not a turn of the shape");
      assert(turnOf(ans)[0] > SAME_DIST, tag, "mental rotation: the answer is the shape not turned at all");
      figs.forEach((f, i) => {
        if (i !== q.answerIndex) assert(turnOf(f).every((d) => d >= DIFF_DIST), tag, `mental rotation: distractor ${i} is (almost) a plain turn of the shape — a second right answer`);
      });
    }

    if (id === "r.figureClassification") {
      const fs = figs.map(feats);
      if (q.display?.svg) {
        const ex = decodeFigures(q.display.svg).map(feats);
        assert(ex.length === 3, tag, "classification: expected three example figures");
        const common = FEAT_NAMES.filter((k) => ex.every((e) => e[k] === ex[0][k]));
        const fitting = fs.map((f, i) => (common.every((k) => f[k] === ex[0][k]) ? i : -1)).filter((i) => i >= 0);
        assert(fitting.length === 1 && fitting[0] === q.answerIndex, tag, `classification (belongs): options sharing everything the examples share: [${fitting.join(",")}], answer ${q.answerIndex}; shared: ${common.join(",")}`);
      } else {
        const odd = fs.map((f, i) => {
          const rest = fs.filter((_, j) => j !== i);
          return FEAT_NAMES.some((k) => rest.every((r) => r[k] === rest[0][k]) && f[k] !== rest[0][k]) ? i : -1;
        }).filter((i) => i >= 0);
        assert(odd.length === 1 && odd[0] === q.answerIndex, tag, `classification (odd one out): options that are each "the odd one" on some feature: [${odd.join(",")}], answer ${q.answerIndex}`);
      }
    }

    if (id === "r.figureSeries") {
      const shown = decodeFigures(q.display?.svg ?? "");
      assert(shown.length === 4, tag, "series: expected four shown figures");
      if (shown.length === 4) {
        const predicted: Record<string, string> = {};
        for (const k of ATTR_NAMES) {
          const v = shown.map((f) => attrs(f)[k]);
          const preds = new Set<string>();
          // the shortest repeat (1, 2 or 3 pictures long) that fits all four
          const period = [1, 2, 3].find((p) => v.every((x, i) => i < p || x === v[i - p]));
          if (period) preds.add(v[4 - period]);
          if (k === "rot") {
            const r = v.map(Number);
            const steps = r.slice(1).map((x, i) => (((x - r[i]) % 4) + 4) % 4);
            if (steps.every((s) => s === steps[0])) preds.add(String((r[3] + steps[0]) % 4));
          }
          assert(preds.size === 1, tag, `series: attribute ${k} (${v.join(",")}) has ${preds.size} natural continuations`);
          predicted[k] = [...preds][0];
        }
        const matches = figs.map((f) => ATTR_NAMES.every((k) => attrs(f)[k] === predicted[k]));
        assert(matches[q.answerIndex], tag, `series: the answer is not the continuation ${JSON.stringify(predicted)}`);
        assert(matches.filter(Boolean).length === 1, tag, "series: more than one option continues the series");
      }
    }

    if (id === "r.figureMatrix") {
      const cells = decodeFigures(q.display?.svg ?? "");
      const n = Math.round(Math.sqrt(cells.length + 1));
      assert(n * n === cells.length + 1, tag, `matrix: ${cells.length} cells shown`);
      if (n * n === cells.length + 1) {
        const at = (r: number, c: number) => attrs(cells[r * n + c]);
        const predicted: Record<string, string> = {};
        for (const k of ATTR_NAMES) {
          // each attribute changes along rows only or along columns only, so the gap is forced
          const rowsAlike = Array.from({ length: n }, (_, r) => r).every((r) => Array.from({ length: n }, (_, c) => c).every((c) => (r === n - 1 && c === n - 1) || at(r, c)[k] === at(0, c)[k]));
          const colsAlike = Array.from({ length: n }, (_, c) => c).every((c) => Array.from({ length: n }, (_, r) => r).every((r) => (r === n - 1 && c === n - 1) || at(r, c)[k] === at(r, 0)[k]));
          assert(rowsAlike || colsAlike, tag, `matrix: attribute ${k} changes along both rows and columns`);
          const p = rowsAlike && colsAlike ? (at(0, n - 1)[k] === at(n - 1, 0)[k] ? at(0, n - 1)[k] : "?") : rowsAlike ? at(0, n - 1)[k] : at(n - 1, 0)[k];
          assert(p !== "?", tag, `matrix: attribute ${k} is ambiguous`);
          predicted[k] = p;
        }
        const matches = figs.map((f) => ATTR_NAMES.every((k) => attrs(f)[k] === predicted[k]));
        assert(matches[q.answerIndex], tag, `matrix: the answer does not complete the rows and columns ${JSON.stringify(predicted)}`);
        assert(matches.filter(Boolean).length === 1, tag, "matrix: more than one option completes the matrix");
      }
    }
  }

  if (id === "r.numberSeries") {
    const m = /comes next\?\s+([\d, ]+), ___/.exec(q.prompt);
    assert(!!m, tag, "number series: prompt not parsed");
    if (m) {
      const t = m[1].split(",").map((x) => Number(x.trim()));
      const preds = seriesPredictions(t);
      const values = new Set(preds.values());
      assert(values.size === 1 && values.has(Number(answer.label)), tag, `number series ${t.join(", ")}: natural continuations ${JSON.stringify([...preds])} vs answer ${answer.label}`);
    }
  }

  if (id === "r.numberAnalogies") {
    if (q.display?.grid) {
      const rows = q.display.grid.map((r) => r.map((cell) => (cell === "?" ? -1 : graphemes(cell))));
      const pairs = rows.slice(0, -1);
      const c = rows[rows.length - 1][0];
      const ans = ruleAnswers(L1_RULES, pairs, c);
      const counts = q.options.map((o) => graphemes(o.emoji ?? ""));
      assert(ans.size === 1 && ans.has(counts[q.answerIndex]), tag, `number analogy (level 1) ${JSON.stringify(rows)}: readings give ${JSON.stringify([...ans])}, answer ${counts[q.answerIndex]}`);
      counts.forEach((v, i) => i !== q.answerIndex && assert(!ans.has(v), tag, `number analogy: distractor ${v} fits the reading "${ans.get(v)}"`));
      assert(!/\b1 [a-z]+s\b/.test(q.prompt.replace(/\b1 fish\b/g, "")), tag, `number analogy: plural after 1 in "${q.prompt}"`);
    } else {
      const nums = [...q.prompt.matchAll(/\[(\d+) → (\d+|\?)\]/g)].map((m) => [Number(m[1]), m[2] === "?" ? NaN : Number(m[2])]);
      assert(nums.length === 3, tag, "number analogy (level 3): prompt not parsed");
      const ans = ruleAnswers(L3_RULES, nums.slice(0, 2), nums[2][0]);
      assert(ans.size === 1 && ans.has(Number(answer.label)), tag, `number analogy ${q.prompt}: rules give ${JSON.stringify([...ans])}, answer ${answer.label}`);
    }
  }

  if (id === "r.numberPuzzles") {
    const p = q.prompt;
    if (level >= 3) assert(!/^The scale is balanced|^The first train/.test(p), tag, `level-3 number puzzle is a grade-1 balance/train item: ${p}`);
    let ok: boolean[] | null = null;
    let m: RegExpExecArray | null;
    if ((m = /makes this true\?\s+(.+) = (.+)$/.exec(p))) {
      const [l, r] = [m[1], m[2]];
      ok = labels.map((v) => evalExpr(l.replace("?", v)) === evalExpr(r.replace("?", v)));
    } else if ((m = /^The scale is balanced\. (.+) = (\d+)\./.exec(p))) {
      const [l, r] = [m[1], m[2]];
      ok = labels.map((v) => evalExpr(l.replace("?", v)) === Number(r));
    } else if ((m = /carries (\d+) blocks\. The second train has (\d+) block/.exec(p))) {
      const [t, k] = [Number(m[1]), Number(m[2])];
      ok = labels.map((v) => Number(v) + k === t);
    } else if ((m = /both blanks:\s+(\d+) × ___ = ___ \+ (\d+)\./.exec(p))) {
      const [mm, c] = [Number(m[1]), Number(m[2])];
      ok = labels.map((v) => mm * Number(v) === Number(v) + c);
    } else if ((m = /^(.+?)\s+and\s+(.+?)\.\s+What is (.+)\?$/.exec(p))) {
      const sols = shapeSolutions([m[1], m[2]]);
      const asked = m[3].trim();
      const askedFn = compileShapes(asked);
      const vals = new Set(sols.map((s) => askedFn(s.sq, s.ci)));
      assert(vals.size === 1, tag, `shape puzzle "${p}" has ${vals.size} possible answers`);
      ok = labels.map((v) => vals.size === 1 && vals.has(Number(v)));
    }
    assert(ok !== null, tag, `number puzzle format not recognized by the check: ${p}`);
    if (ok) assert(ok[q.answerIndex] && ok.filter(Boolean).length === 1, tag, `number puzzle "${p}": options that work ${JSON.stringify(ok)}, answer ${q.answerIndex}`);
  }

  if (id === "r.patternCompletion") {
    const seq = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment((q.display?.emoji ?? "").replace(/❓/, ""))].map((g) => g.segment).filter((g) => g.trim());
    let period = 1;
    while (period < seq.length && !seq.every((x, i) => i < period || x === seq[i - period])) period++;
    assert(seq.length >= 2 * period, tag, `pattern shows fewer than two full repeats (period ${period}, length ${seq.length})`);
    const next = seq[seq.length - period];
    assert(answer.emoji === next, tag, `pattern: answer ${answer.emoji} but the repeat gives ${next}`);
  }

  if (id === "r.oddOneOut") {
    const m = /The other three are ([^:]+):/.exec(q.explain);
    assert(!!m, tag, "odd one out: explain not parsed");
    if (m) assert(!(ALSO_FITS[m[1]] ?? []).includes(answer.label ?? ""), tag, `odd one out: "${answer.label}" is also one of the ${m[1]} — no right answer`);
  }

  if (id === "r.sudoku4") {
    const g = q.display?.grid ?? [];
    let tr = -1;
    let tc = -1;
    g.forEach((row, r) => row.forEach((cell, c) => cell === "?" && ((tr = r), (tc = c))));
    const syms = q.options.map((o) => o.label ?? o.emoji ?? "");
    // visible cells never repeat in a row, column or 2×2 box
    for (let i = 0; i < 4; i++) {
      const row = g[i].filter((x) => x && x !== "?");
      const col = g.map((r) => r[i]).filter((x) => x && x !== "?");
      const box = [0, 1, 2, 3].map((k) => g[Math.floor(i / 2) * 2 + Math.floor(k / 2)][(i % 2) * 2 + (k % 2)]).filter((x) => x && x !== "?");
      assert(new Set(row).size === row.length && new Set(col).size === col.length && new Set(box).size === box.length, tag, "sudoku: a visible symbol repeats");
    }
    // the row and column alone (the grid has no box borders; Lily's rule is rows and columns) leave one symbol
    const seen = new Set([...g[tr], ...g.map((r) => r[tc])].filter((x) => x && x !== "?"));
    const left = syms.filter((s) => !seen.has(s));
    assert(left.length === 1 && left[0] === syms[q.answerIndex], tag, `sudoku: row + column leave ${JSON.stringify(left)}, answer ${syms[q.answerIndex]}`);
  }

  if (id === "r.logicGrid") {
    const prem = /^([A-Z][a-z]+), ([A-Z][a-z]+) and ([A-Z][a-z]+) each (?:have|picked) a different (?:pet|fruit|sport): (?:the )?([a-z ]+), (?:the )?([a-z ]+) or (?:the )?([a-z ]+)\./.exec(q.prompt);
    assert(!!prem, tag, `logic grid: no premise naming the three kids and the three choices: ${q.prompt}`);
    if (prem) {
      const kids = prem.slice(1, 4);
      const items = prem.slice(4, 7);
      assert([...items].sort().join() === [...labels].sort().join(), tag, "logic grid: premise items differ from the options");
      const clues = [...q.prompt.matchAll(/\d\) ([^.]+)\./g)].map((c) => c[1]);
      if (level < 3) {
        assert(clues.length === 2, tag, `logic grid level 1: expected 2 clues, got ${clues.length}`);
        assert(clues.some((c) => !/not|Neither/.test(c)), tag, "logic grid level 1: no clue says who has what for sure");
      }
      const holds = (c: string, perm: string[]) => {
        let mm: RegExpExecArray | null;
        if ((mm = /^Neither (\w+) nor (\w+) (?:has|picked) (?:the )?(.+)$/.exec(c))) return perm[kids.indexOf(mm[1])] !== mm[3] && perm[kids.indexOf(mm[2])] !== mm[3];
        if ((mm = /^(\w+) (?:does not have|did not pick) (?:the )?(.+)$/.exec(c))) return perm[kids.indexOf(mm[1])] !== mm[2];
        if ((mm = /^(\w+) (?:has|picked) (?:the )?(.+)$/.exec(c))) return perm[kids.indexOf(mm[1])] === mm[2];
        throw new Error(`clue not parsed: ${c}`);
      };
      const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].map((p) => p.map((i) => items[i]));
      const fits = perms.filter((perm) => clues.every((c) => holds(c, perm)));
      const who = /(?:does|did) (\w+) (?:have|pick)\?$/.exec(q.prompt)?.[1] ?? "";
      assert(kids.includes(who), tag, `logic grid: asks about "${who}", who is not in the premise`);
      assert(fits.length === 1, tag, `logic grid: ${fits.length} assignments fit the clues`);
      if (fits.length === 1) assert(fits[0][kids.indexOf(who)] === answer.label, tag, `logic grid: solution gives ${fits[0][kids.indexOf(who)]}, answer ${answer.label}`);
      clues.forEach((c, i) => assert(perms.filter((perm) => clues.every((d, j) => j === i || holds(d, perm))).length > 1, tag, `logic grid: clue ${i + 1} is not needed`));
    }
  }
}

// ---------------------------------------------------------------------------
// generators
// ---------------------------------------------------------------------------

const ids = Object.keys(generators);
const EXPECTED_IDS = [
  "r.numberSeries",
  "r.numberAnalogies",
  "r.numberPuzzles",
  "r.figureMatrix",
  "r.figureClassification",
  "r.figureSeries",
  "r.paperFolding",
  "r.patternCompletion",
  "r.verbalAnalogies",
  "r.verbalClassification",
  "r.sentenceCompletion",
  "r.mentalRotation",
  "r.oddOneOut",
  "r.sudoku4",
  "r.logicGrid",
];
for (const id of EXPECTED_IDS) assert(ids.includes(id), "registry", `missing generator ${id}`);

console.log(`Checking ${ids.length} reasoning generator(s) × ${LEVELS.length} level(s) × ${SEEDS} seeds…`);

const summary: string[] = [];

for (const id of ids) {
  const gen = generators[id];
  for (const level of LEVELS) {
    const where = `${id} (level ${level})`;
    const positions = new Map<number, number>();
    const prompts = new Set<string>();
    const answers = new Set<string>();
    const optionCounts = new Set<number>();
    for (let i = 0; i < SEEDS; i++) {
      const seed = hashString(`reasoning-check:${id}:${level}:${i}`);
      let q: Question;
      try {
        q = gen({ rng: mulberry32(seed), level });
      } catch (err) {
        fail(where, `seed ${seed} threw: ${(err as Error).stack ?? (err as Error).message}`);
        continue;
      }
      const tag = `${where} seed ${seed}`;
      assert(q.type === "choice", tag, `expected a choice question, got ${q.type}`);
      assert(typeof q.prompt === "string" && q.prompt.trim().length > 0, tag, "prompt is empty");
      assert(typeof q.explain === "string" && q.explain.trim().length > 0, tag, "explain missing");
      assert(typeof q.hint === "string" && q.hint.trim().length > 0, tag, "hint missing");
      for (const [k, v] of [["prompt", q.prompt], ["explain", q.explain], ["hint", q.hint]] as const) assert(!hasBadString(v), tag, `${k} contains NaN/undefined/null: ${v}`);
      if (level === 1) assert(typeof q.display?.speak === "string" && q.display.speak.trim().length > 0, tag, "level-1 question has no display.speak");
      if (q.display?.speak) assert(!hasBadString(q.display.speak), tag, "speak text bad");
      if (q.display?.svg) checkSvg(q.display.svg, tag, "display svg");
      if (q.display?.emoji) assert(!hasBadString(q.display.emoji), tag, "display emoji bad");
      if (q.display?.grid) {
        assert(Array.isArray(q.display.grid) && q.display.grid.every((r) => Array.isArray(r)), tag, "display.grid is not string[][]");
        assert(q.display.grid.some((r) => r.includes("?")), tag, "display.grid has no ? cell");
      }
      if (q.type !== "choice") continue;
      assert(Array.isArray(q.options) && q.options.length >= 2, tag, "fewer than 2 options");
      assert(Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.options.length, tag, `answerIndex out of range: ${q.answerIndex}`);
      const keys = q.options.map(optionKey);
      assert(new Set(keys).size === keys.length, tag, "options are not unique");
      for (const o of q.options) {
        assert(!!(o.label || o.svg || o.emoji), tag, "option has no label/svg/emoji");
        if (o.svg) checkSvg(o.svg, tag, "option svg");
        if (o.label) assert(!hasBadString(o.label), tag, `option label bad: ${o.label}`);
        if (o.emoji) assert(!hasBadString(o.emoji), tag, `option emoji bad: ${o.emoji}`);
        if (level === 1 && (id === "r.verbalAnalogies" || id === "r.verbalClassification" || id === "r.sentenceCompletion")) assert(!!o.emoji, tag, "level-1 verbal option has no emoji");
      }
      optionCounts.add(q.options.length);
      positions.set(q.answerIndex, (positions.get(q.answerIndex) ?? 0) + 1);
      prompts.add(q.prompt + (q.display?.svg ?? "") + (q.display?.emoji ?? "") + JSON.stringify(q.display?.grid ?? null) + keys.join("|"));
      answers.add(keys[q.answerIndex]);
      if (id === "r.paperFolding") checkPaperFolding(q, tag);
      semanticCheck(id, level, q, tag);
      // determinism
      const again = JSON.stringify(gen({ rng: mulberry32(seed), level }));
      assert(again === JSON.stringify(q), tag, "not deterministic for the same seed");
    }
    const total = [...positions.values()].reduce((a, b) => a + b, 0);
    const maxShare = Math.max(...[...positions.values()].map((v) => v / Math.max(1, total)));
    assert(maxShare <= MAX_POSITION_SHARE, where, `answer position skew: one position holds ${(maxShare * 100).toFixed(0)}% of items`);
    const minOptions = Math.min(...optionCounts);
    assert(positions.size >= minOptions, where, `answers never land on some positions (${positions.size} of ${minOptions})`);
    assert(prompts.size > Math.min(SEEDS, 300) / 10, where, `low variety: only ${prompts.size} distinct items`);
    assert(answers.size > 1, where, "all answers identical");
    const expectedN = level === 3 ? 4 : 3;
    const okCount = id === "r.oddOneOut" || id === "r.sudoku4" || id === "r.figureMatrix" ? 4 : id === "r.logicGrid" ? 3 : expectedN;
    const sortedCounts = [...optionCounts].sort().join(",");
    const verbal = id === "r.verbalAnalogies" || id === "r.verbalClassification" || id === "r.sentenceCompletion";
    if (!verbal) assert(sortedCounts === String(okCount), where, `expected ${okCount} options, got ${sortedCounts}`);
    summary.push(`${id.padEnd(24)} L${level}  options=${sortedCounts.padEnd(4)} distinct items=${String(prompts.size).padStart(3)}  max position share=${(maxShare * 100).toFixed(0)}%`);
  }
}

// ---------------------------------------------------------------------------
// paper folding: param variants (diagonal single fold at level 3, two punches at level 1, parallel/perpendicular doubles)
// ---------------------------------------------------------------------------

{
  const gen = generators["r.paperFolding"];
  const variants: [number, Record<string, number>][] = [
    [3, { folds: 1, punches: 1 }],
    [3, { folds: 1, punches: 2 }],
    [1, { folds: 1, punches: 2 }],
    [1, { folds: 2, punches: 1 }],
    [3, { folds: 2, punches: 2 }],
  ];
  let diagonals = 0;
  for (const [level, params] of variants) {
    const where = `r.paperFolding (level ${level}) ${JSON.stringify(params)}`;
    const keysSeen = new Set<string>();
    for (let i = 0; i < 150; i++) {
      const seed = hashString(`fold-variant:${level}:${JSON.stringify(params)}:${i}`);
      const q = gen({ rng: mulberry32(seed), level, params });
      const tag = `${where} seed ${seed}`;
      if (q.type !== "choice" || !q.display?.svg) {
        fail(tag, "paper folding must be a choice question with a display svg");
        continue;
      }
      const keys = q.options.map(optionKey);
      assert(new Set(keys).size === keys.length, tag, "options are not unique");
      checkSvg(q.display.svg, tag, "display svg");
      for (const o of q.options) checkSvg(o.svg ?? "", tag, "option svg");
      checkPaperFolding(q, tag);
      const foldsAttr = /data-folds="([^"]*)"/.exec(q.display.svg)?.[1] ?? "";
      assert(foldsAttr.split(";").length === params.folds, tag, `expected ${params.folds} folds, got ${foldsAttr}`);
      const punchAttr = /data-punches="([^"]*)"/.exec(q.display.svg)?.[1] ?? "";
      assert(punchAttr.split(";").length === params.punches, tag, `expected ${params.punches} punches, got ${punchAttr}`);
      if (foldsAttr.startsWith("d")) diagonals += 1;
      keysSeen.add(foldsAttr + "|" + punchAttr);
    }
    summary.push(`r.paperFolding variant L${level} ${JSON.stringify(params)}: ${keysSeen.size} distinct fold/punch layouts`);
  }
  assert(diagonals > 0, "r.paperFolding diagonal", "no diagonal folds generated at level 3 with folds: 1");
  summary.push(`r.paperFolding diagonal folds exercised: ${diagonals}`);
}

// ---------------------------------------------------------------------------
// verbal banks: no repeats across consecutive attempts; `seen` is honoured
// ---------------------------------------------------------------------------

const VERBAL: [string, "analogies" | "classification" | "completion"][] = [
  ["r.verbalAnalogies", "analogies"],
  ["r.verbalClassification", "classification"],
  ["r.sentenceCompletion", "completion"],
];
const WINDOW = 50;
for (const [id, kind] of VERBAL) {
  const gen = generators[id];
  for (const level of LEVELS) {
    const bank = VERBAL_BANKS[kind][level as 1 | 3];
    const window = Math.min(WINDOW, bank.length);
    const where = `${id} (level ${level}) no-repeat`;
    // identify an item by its explain + sorted options (prompts repeat in one bank)
    const itemKey = (q: Question) => q.explain + "|" + (q.type === "choice" ? q.options.map((o) => o.label ?? "").sort().join("|") : "");
    // (a) params.attempt walks a permutation: no repeats within bank.length consecutive attempts
    const seq: string[] = [];
    for (let i = 0; i < 3 * bank.length; i++) {
      const q = gen({ rng: mulberry32(hashString(`attempt:${id}:${level}:${i}`)), level, params: { attempt: i } });
      seq.push(itemKey(q));
    }
    for (let i = 0; i + window <= seq.length; i++) {
      const slice = seq.slice(i, i + window);
      if (new Set(slice).size !== slice.length) {
        fail(where, `attempt walk repeats an item within ${window} consecutive attempts (starting at ${i})`);
        break;
      }
      checks += 1;
    }
    assert(new Set(seq.slice(0, bank.length)).size === bank.length, where, `attempt walk does not cover the whole bank (${new Set(seq.slice(0, bank.length)).size} of ${bank.length})`);
    // (b) params.seen excludes prompts already shown while any item is unseen
    const seen: string[] = [];
    for (let i = 0; i < Math.min(window, bank.length - 1); i++) {
      const q = gen({ rng: mulberry32(hashString(`seen:${id}:${level}:${i}`)), level, params: { seen } });
      const bankPrompt = bank.find((it) => it.explain === q.explain)?.prompt ?? "";
      assert(!seen.includes(bankPrompt), where, `seen-list item repeated: ${bankPrompt}`);
      seen.push(bankPrompt);
    }
    // (c) a plain rng pick touches most of the bank over 300 seeds
    const touched = new Set<string>();
    for (let i = 0; i < SEEDS; i++) touched.add(itemKey(gen({ rng: mulberry32(hashString(`plain:${id}:${level}:${i}`)), level })));
    assert(touched.size >= Math.min(bank.length, 30), where, `plain rng pick reaches only ${touched.size} items`);
    summary.push(`${id.padEnd(24)} L${level}  bank=${String(bank.length).padStart(3)}  no-repeat window=${window}  rng reach=${touched.size}/${bank.length}`);
  }
}

// ---------------------------------------------------------------------------
// catalog
// ---------------------------------------------------------------------------

{
  const idSet = new Set<string>();
  const perTrack: Record<string, number> = { lily: 0, cole: 0 };
  const batteries: Record<string, Set<string>> = { lily: new Set(), cole: new Set() };
  for (const s of REASONING_SKILLS) {
    const where = `catalog ${s.id}`;
    assert(!idSet.has(s.id), where, "duplicate skill id");
    idSet.add(s.id);
    assert(s.subject === "reasoning", where, `subject is ${s.subject}`);
    assert(!!generators[s.generator], where, `generator "${s.generator}" not in reasoning.ts`);
    assert(s.track === "lily" || s.track === "cole", where, `track must be lily or cole, got ${s.track}`);
    const level = s.params?.level;
    assert(level === (s.track === "lily" ? 1 : 3), where, `params.level ${level} does not match track ${s.track}`);
    assert(s.grade === (s.track === "lily" ? 1 : 3), where, `grade ${s.grade} does not match track`);
    assert(s.id.startsWith(s.track === "lily" ? "r1." : "r3."), where, "id prefix does not match level");
    assert(s.standards.some((st) => st.startsWith("CogAT:")), where, "no CogAT battery label in standards");
    assert(Array.isArray(s.intro) && s.intro.length >= 2 && s.intro.length <= 3, where, "intro must have 2-3 lines");
    assert(s.parentTip.length > 0 && s.kidTitle.length > 0 && s.title.length > 0, where, "titles/parentTip missing");
    assert(s.estMinutes === 6 && s.testOut === false, where, "estMinutes must be 6 and testOut false");
    for (const pre of s.prereqs) {
      const p = REASONING_SKILLS.find((x) => x.id === pre);
      assert(!!p, where, `prereq "${pre}" not in REASONING_SKILLS`);
      if (p) assert(p.track === s.track, where, `prereq "${pre}" is on another track`);
      if (p) assert(REASONING_SKILLS.indexOf(p) < REASONING_SKILLS.indexOf(s), where, `prereq "${pre}" is listed after the skill`);
    }
    perTrack[s.track] += 1;
    for (const st of s.standards) {
      const m = /^CogAT:(\w+):/.exec(st);
      if (m) batteries[s.track].add(m[1]);
    }
    // the skill's own params must produce valid questions
    for (let i = 0; i < 40; i++) {
      try {
        const q = generators[s.generator]({ rng: mulberry32(hashString(`${s.id}:${i}`)), level: level as number, params: s.params });
        assert(q.type === "choice" && q.options.length >= 2 && q.answerIndex >= 0 && q.answerIndex < q.options.length, where, "skill params produce an invalid question");
        semanticCheck(s.generator, level as number, q, `${where} #${i}`);
      } catch (err) {
        fail(where, `generator threw with skill params: ${(err as Error).message}`);
        break;
      }
    }
  }
  for (const track of ["lily", "cole"]) {
    assert(perTrack[track] >= 12, `catalog ${track}`, `only ${perTrack[track]} skills`);
    for (const b of ["Verbal", "Quantitative", "Nonverbal"]) assert(batteries[track].has(b), `catalog ${track}`, `no ${b} battery skill`);
    summary.push(`catalog ${track}: ${perTrack[track]} skills, batteries ${[...batteries[track]].join("/")}`);
  }
}


// ---------------------------------------------------------------------------
// verbal banks: structure, emoji support, spelling, and known "second right answer" regressions
// ---------------------------------------------------------------------------

const UNICODE_15_PLUS = /[\u{1FA75}-\u{1FA77}\u{1FA87}-\u{1FA89}\u{1FA8F}\u{1FAAD}-\u{1FAAF}\u{1FABB}-\u{1FABF}\u{1FAC6}\u{1FACE}\u{1FACF}\u{1FADA}-\u{1FADC}\u{1FADF}\u{1FAE8}\u{1FAE9}\u{1FAF7}\u{1FAF8}\u{1F6DC}]/u;
const BRITISH_OR_BRAND = /\b(colour|favourite|centre|metre|litre|neighbour|grey|mum|set square|lego|play-doh|band-aid|kleenex|popsicle|velcro|jell-o|frisbee|oreo|crayola|ziploc|post-it|q-tip|disney|xbox|ipad|nintendo)s?\b/i;
const TOO_SPECIALIZED = /\b(plie|pirouette|arabesque|pointe|torrents?|gale)\b/i;
/** emoji that do not picture the word they are paired with */
const EMOJI_MISMATCH: [string, RegExp][] = [["🧻", /napkin/], ["🧽", /eraser/], ["🧶", /rug|blanket/], ["👔", /belt/], ["🎪", /swing/], ["🥎", /mitt/], ["🪑", /table/], ["🦭", /walrus/], ["🩴", /slipper/], ["🧤", /mitten/], ["🎈", /hot-air/], ["🐝", /hive/]];
/** distractors that were also defensible answers (part of a flowering plant, fluid ounces, spider silk …) */
const DEFENSIBLE: [RegExp, string][] = [
  [/^Petal is to flower as leaf is to/, "flower"],
  [/^Branch is to tree as arm is to/, "chair"],
  [/^petal : flower :: feather/, "wing"],
  [/^letter : word :: word/, "book"],
  [/^drizzle : downpour :: breeze/, "wind"],
  [/^scissors : cut :: ruler/, "draw"],
  [/^practice : improvement :: exercise/, "sweat"],
  [/^practice : improvement :: exercise/, "tired"],
  [/^study : knowledge :: planting/, "garden"],
  [/^sun : sunburn :: germs/, "sneeze"],
  [/^inch : foot :: ounce/, "cup"],
  [/^dancer : stage :: swimmer/, "water"],
  [/^clock : time :: compass/, "north"],
  [/^wool : sheep :: silk/, "spider"],
  [/^milk : cow :: honey/, "flower"],
  [/^leaf : green :: snow/, "cold"],
  [/^leaf : green :: snow/, "soft"],
  [/^lemon : sour :: sugar/, "white"],
  [/^cheetah : fast :: tortoise/, "old"],
  [/^gallon, liter, cup$/, "ounce"],
  [/^helmet, seatbelt, life jacket$/, "sunglasses"],
  [/^canoe, kayak, raft$/, "surfboard"],
  [/^teacher, coach, tutor$/, "parent"],
  [/^enormous, gigantic, massive$/, "heavy"],
  [/^Although the water was/, "shallow"],
  [/^Since the bakery ___ at six, we got there early/, "closes"],
];
/** stems whose obvious grouping has no answer among the options (primary colors; pumpkin as a "fruit") */
const BANNED_STEMS = [/^red, yellow, blue$/, /^pumpkin, lemon, orange$/, /^plie, pirouette, arabesque$/];

{
  let items = 0;
  for (const [kind, byLevel] of Object.entries(VERBAL_BANKS) as [string, Record<1 | 3, VerbalItem[]>][]) {
    for (const level of [1, 3] as const) {
      byLevel[level].forEach((it, i) => {
        items += 1;
        const where = `bank ${kind} L${level} #${i} "${it.prompt}"`;
        const ans = it.options[it.answerIndex] ?? "";
        const odd = /^Which one does NOT belong/i.test(it.prompt);
        assert(it.options.length === (level === 1 && !odd ? 3 : 4), where, `has ${it.options.length} options`);
        assert(new Set(it.options.map((o) => o.toLowerCase())).size === it.options.length, where, "repeated option");
        const ex = it.explain.toLowerCase();
        const a = ans.toLowerCase();
        assert([a, a.replace(/(es|s)$/, ""), a.replace(/(e|y)$/, "")].some((w) => ex.includes(w)), where, `explain never names the answer "${ans}" (answerIndex slip?)`);
        if (level === 1) {
          assert(Array.isArray(it.emojis) && it.emojis.length === it.options.length && it.emojis.every((e) => e.trim().length > 0), where, "level-1 item without an emoji for every option");
          assert(new Set(it.emojis ?? []).size === (it.emojis ?? []).length, where, "two options share a picture");
        }
        (it.emojis ?? []).forEach((e, k) => {
          for (const [emoji, word] of EMOJI_MISMATCH) assert(!(e === emoji && word.test(it.options[k])), where, `${emoji} does not picture "${it.options[k]}"`);
        });
        const text = [it.prompt, ...it.options, it.explain, it.hint, ...(it.emojis ?? [])].join(" ");
        assert(!UNICODE_15_PLUS.test(text), where, "uses an emoji too new for older tablets (Unicode 15+)");
        assert(!BRITISH_OR_BRAND.test(text), where, `British spelling or brand name: ${BRITISH_OR_BRAND.exec(text)?.[0]}`);
        assert(!TOO_SPECIALIZED.test([it.prompt, ans].join(" ")), where, `specialized vocabulary: ${TOO_SPECIALIZED.exec([it.prompt, ans].join(" "))?.[0]}`);
        for (const [re, word] of DEFENSIBLE) if (re.test(it.prompt)) assert(!it.options.includes(word), where, `"${word}" is also a defensible answer`);
        for (const re of BANNED_STEMS) assert(!re.test(it.prompt), where, "stem has a more exact grouping with no matching option");
      });
    }
  }
  summary.push(`verbal banks: ${items} items checked for structure, emoji support, spelling and known ambiguities`);
}

// generated text (all generators, both levels) — spelling, brands, emoji age
{
  for (const id of ids)
    for (const level of LEVELS)
      for (let i = 0; i < 60; i++) {
        const q = generators[id]({ rng: mulberry32(hashString(`text:${id}:${level}:${i}`)), level });
        const text = [q.prompt, q.explain, q.hint, q.display?.speak ?? "", q.display?.emoji ?? "", ...(q.type === "choice" ? q.options.map((o) => `${o.label ?? ""} ${o.emoji ?? ""}`) : [])].join(" ");
        assert(!BRITISH_OR_BRAND.test(text), `${id} L${level}`, `British spelling or brand name: ${BRITISH_OR_BRAND.exec(text)?.[0]}`);
        assert(!UNICODE_15_PLUS.test(text), `${id} L${level}`, "uses an emoji too new for older tablets (Unicode 15+)");
        if (q.type === "choice") q.options.forEach((o) => {
          for (const [emoji, word] of EMOJI_MISMATCH) assert(!(o.emoji === emoji && word.test(o.label ?? "")), `${id} L${level}`, `${emoji} does not picture "${o.label}"`);
        });
      }
}

// ---------------------------------------------------------------------------
// catalog text: no verbatim bank item (with its answer) in an intro or parent tip; US spelling;
// every `kinds` a skill lists is one the generator implements
// ---------------------------------------------------------------------------

{
  const STOP = new Set("the and is to as of an which one you use do does did what with for in on at it are was were be that this these those from your his her their our but not so because although even though unless if she he they we me my there who how why when where can could would will has have had all three four them belong other others together goes go some most very".split(" "));
  const content = (s: string) => (s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w));
  const bankItems = Object.values(VERBAL_BANKS).flatMap((byLevel) => [...byLevel[1], ...byLevel[3]]);
  for (const s of REASONING_SKILLS) {
    const text = [...(s.intro ?? []), s.parentTip ?? ""].join(" ").toLowerCase();
    const words = new Set(content(text));
    assert(!BRITISH_OR_BRAND.test(text), `catalog ${s.id}`, `British spelling or brand name: ${BRITISH_OR_BRAND.exec(text)?.[0]}`);
    for (const it of bankItems) {
      const toks = content(it.prompt);
      const ans = content(it.options[it.answerIndex]);
      if (toks.length >= 3 && ans.length > 0 && [...toks, ...ans].every((w) => words.has(w))) fail(`catalog ${s.id}`, `intro/parent tip gives away bank item "${it.prompt}" → ${it.options[it.answerIndex]}`);
      checks += 1;
    }
    const kinds = s.params?.kinds;
    if (Array.isArray(kinds)) {
      const known = s.generator === "r.numberPuzzles" ? NUMBER_PUZZLE_KINDS : s.generator === "r.numberSeries" ? SERIES_KINDS : null;
      if (known) for (const k of kinds) assert(known.includes(k as string), `catalog ${s.id}`, `kind "${k}" is not implemented by ${s.generator}`);
    }
  }
  // every implemented number-puzzle kind really is its own format (an unknown kind used to fall through to the balance scale)
  for (const k of NUMBER_PUZZLE_KINDS) {
    if (k === "balance") continue;
    for (let i = 0; i < 20; i++) {
      const q = generators["r.numberPuzzles"]({ rng: mulberry32(hashString(`kind:${k}:${i}`)), level: 3, params: { kinds: [k] } });
      assert(!/^The scale is balanced/.test(q.prompt), `r.numberPuzzles kind ${k}`, "falls through to the balance-scale format");
    }
  }
}

summary.push(`shapes: closest pair of different-looking figures = ${minDiff.toFixed(1)} units (${minDiffWhat}); "same" ≤ ${SAME_DIST}, "different" ≥ ${DIFF_DIST}`);

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

console.log(summary.map((s) => "  " + s).join("\n"));
if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} failure(s) out of ${checks} checks:\n`);
  for (const f of failures.slice(0, 60)) console.error(`  - [${f.where}] ${f.message}`);
  if (failures.length > 60) console.error(`  … and ${failures.length - 60} more`);
  process.exit(1);
} else {
  console.log(`\n✓ All ${checks} checks passed (${ids.length} reasoning generators, ${REASONING_SKILLS.length} skills).`);
}
