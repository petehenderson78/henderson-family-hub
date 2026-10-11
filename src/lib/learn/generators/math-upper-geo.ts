/**
 * Math generators, grades 3-5, part C: measurement, geometry and data
 * (3.M, 4.M, 5.M, 4.G, 5.G, 3.DL/4.DL/5.DL line plots). Pictures: labelled
 * rectangles, angles with a tick-marked arc, unit-cube prisms, a first-quadrant
 * grid, line plots.
 *
 * Rules: pure functions of ctx.rng, relative imports, `import type`, no DOM.
 * `hint` never states the answer. SVGs: viewBox 0 0 100 100, no id="".
 */

import type { Generator } from "../types";
import { int, pick, shuffle, sample } from "../rng";
import {
  COLORS,
  decAccept,
  decShort,
  frac,
  gridSvg,
  labelChoice,
  levelOf,
  mixed,
  numListParam,
  numParam,
  pickName,
  r1,
  simplify,
  strParam,
  svgText,
  svgWrap,
  timeStr,
} from "./math-util";

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function rectSvg(w: number, h: number, labels: { top?: string; left?: string; bottom?: string; right?: string } = {}): string {
  const maxSide = Math.max(w, h);
  const scale = 60 / maxSide;
  const pw = Math.max(18, w * scale);
  const ph = Math.max(18, h * scale);
  const x0 = 50 - pw / 2 + 4;
  const y0 = 50 - ph / 2 + 2;
  const out: string[] = [];
  out.push(`<rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(pw)}" height="${r1(ph)}" fill="#dbeafe" stroke="${COLORS.ink}" stroke-width="2"/>`);
  if (labels.top) out.push(svgText(x0 + pw / 2, y0 - 4, labels.top, 7, 'font-weight="700"'));
  if (labels.bottom) out.push(svgText(x0 + pw / 2, y0 + ph + 9, labels.bottom, 7, 'font-weight="700"'));
  if (labels.left) out.push(svgText(x0 - 9, y0 + ph / 2 + 2.5, labels.left, 7, 'font-weight="700"'));
  if (labels.right) out.push(svgText(x0 + pw + 9, y0 + ph / 2 + 2.5, labels.right, 7, 'font-weight="700"'));
  return svgWrap(out.join(""));
}

/** L-shape: a big (W × H) rectangle with a (cw × ch) corner cut out at the top right. */
function lShapeSvg(W: number, H: number, cw: number, ch: number): string {
  const scale = 60 / Math.max(W, H);
  const x0 = 20;
  const y0 = 18;
  const X = (v: number) => r1(x0 + v * scale);
  const Y = (v: number) => r1(y0 + v * scale);
  const pts = `${X(0)},${Y(0)} ${X(W - cw)},${Y(0)} ${X(W - cw)},${Y(ch)} ${X(W)},${Y(ch)} ${X(W)},${Y(H)} ${X(0)},${Y(H)}`;
  const out: string[] = [];
  out.push(`<polygon points="${pts}" fill="#dbeafe" stroke="${COLORS.ink}" stroke-width="2" stroke-linejoin="round"/>`);
  out.push(`<line x1="${X(W - cw)}" y1="${Y(ch)}" x2="${X(W - cw)}" y2="${Y(H)}" stroke="${COLORS.ink}" stroke-width="1" stroke-dasharray="3 2"/>`);
  out.push(svgText((x0 + X(W - cw)) / 2, y0 - 4, String(W - cw), 6, 'font-weight="700"'));
  out.push(svgText((X(W - cw) + X(W)) / 2, Y(ch) - 3, String(cw), 6, 'font-weight="700"'));
  out.push(svgText(X(W) + 7, (Y(ch) + Y(H)) / 2 + 2, String(H - ch), 6, 'font-weight="700"'));
  out.push(svgText(X(W - cw) + 7, (y0 + Y(ch)) / 2 + 2, String(ch), 6, 'font-weight="700"'));
  out.push(svgText((x0 + X(W)) / 2, Y(H) + 9, String(W), 6, 'font-weight="700"'));
  out.push(svgText(x0 - 7, (y0 + Y(H)) / 2 + 2, String(H), 6, 'font-weight="700"'));
  return svgWrap(out.join(""));
}

function angleSvg(deg: number, protractor: boolean, second?: number): string {
  const cx = 50;
  const cy = 72;
  const L = 40;
  const out: string[] = [];
  const end = (a: number) => [r1(cx + L * Math.cos((a * Math.PI) / 180)), r1(cy - L * Math.sin((a * Math.PI) / 180))];
  if (protractor) {
    out.push(`<path d="M${cx - 42},${cy} A42,42 0 0,1 ${cx + 42},${cy}" fill="none" stroke="#94a3b8" stroke-width="1"/>`);
    for (let a = 0; a <= 180; a += 10) {
      const major = a % 30 === 0;
      const r0 = major ? 36 : 39;
      out.push(`<line x1="${r1(cx + r0 * Math.cos((a * Math.PI) / 180))}" y1="${r1(cy - r0 * Math.sin((a * Math.PI) / 180))}" x2="${r1(cx + 42 * Math.cos((a * Math.PI) / 180))}" y2="${r1(cy - 42 * Math.sin((a * Math.PI) / 180))}" stroke="#64748b" stroke-width="${major ? 1 : 0.6}"/>`);
      if (major) out.push(svgText(cx + 31 * Math.cos((a * Math.PI) / 180), cy - 31 * Math.sin((a * Math.PI) / 180) + 1.8, String(a), 4.5, 'fill="#475569"'));
    }
  }
  const [x1, y1] = end(0);
  const [x2, y2] = end(deg);
  out.push(`<line x1="${cx}" y1="${cy}" x2="${x1}" y2="${y1}" stroke="${COLORS.ink}" stroke-width="2.5" stroke-linecap="round"/>`);
  out.push(`<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="${COLORS.blue}" stroke-width="2.5" stroke-linecap="round"/>`);
  if (deg === 90) {
    out.push(`<polyline points="${cx + 7},${cy} ${cx + 7},${cy - 7} ${cx},${cy - 7}" fill="none" stroke="${COLORS.rose}" stroke-width="1.5"/>`);
  } else {
    const ra = 11;
    out.push(`<path d="M${cx + ra},${cy} A${ra},${ra} 0 ${deg > 180 ? 1 : 0},0 ${r1(cx + ra * Math.cos((deg * Math.PI) / 180))},${r1(cy - ra * Math.sin((deg * Math.PI) / 180))}" fill="none" stroke="${COLORS.rose}" stroke-width="1.5"/>`);
  }
  if (typeof second === "number") {
    const [x3, y3] = end(second);
    out.push(`<line x1="${cx}" y1="${cy}" x2="${x3}" y2="${y3}" stroke="${COLORS.green}" stroke-width="2.5" stroke-linecap="round"/>`);
    const rb = 16;
    out.push(`<path d="M${r1(cx + rb * Math.cos((deg * Math.PI) / 180))},${r1(cy - rb * Math.sin((deg * Math.PI) / 180))} A${rb},${rb} 0 0,0 ${r1(cx + rb * Math.cos((second * Math.PI) / 180))},${r1(cy - rb * Math.sin((second * Math.PI) / 180))}" fill="none" stroke="${COLORS.green}" stroke-width="1.5"/>`);
  }
  out.push(`<circle cx="${cx}" cy="${cy}" r="2" fill="${COLORS.ink}"/>`);
  return svgWrap(out.join(""));
}

/** Rectangular prism l × w × h drawn in oblique projection with unit-cube lines. */
function prismSvg(l: number, w: number, h: number, showCubes = true): string {
  const s = Math.min(11, 60 / Math.max(l + w * 0.5, h + w * 0.5));
  const x0 = 50 - (l * s + w * s * 0.5) / 2;
  const y0 = 50 + (h * s + w * s * 0.5) / 2;
  const dx = s * 0.5;
  const dy = -s * 0.5;
  const P = (x: number, y: number, z: number) => `${r1(x0 + x * s + z * dx)},${r1(y0 - y * s + z * dy)}`;
  const out: string[] = [];
  out.push(`<polygon points="${P(0, 0, 0)} ${P(l, 0, 0)} ${P(l, h, 0)} ${P(0, h, 0)}" fill="#bfdbfe" stroke="${COLORS.ink}" stroke-width="1.2"/>`);
  out.push(`<polygon points="${P(0, h, 0)} ${P(l, h, 0)} ${P(l, h, w)} ${P(0, h, w)}" fill="#dbeafe" stroke="${COLORS.ink}" stroke-width="1.2"/>`);
  out.push(`<polygon points="${P(l, 0, 0)} ${P(l, 0, w)} ${P(l, h, w)} ${P(l, h, 0)}" fill="#93c5fd" stroke="${COLORS.ink}" stroke-width="1.2"/>`);
  if (showCubes) {
    const thin = `stroke="${COLORS.ink}" stroke-width="0.5"`;
    for (let i = 1; i < l; i++) {
      out.push(`<line x1="${P(i, 0, 0).split(",")[0]}" y1="${P(i, 0, 0).split(",")[1]}" x2="${P(i, h, 0).split(",")[0]}" y2="${P(i, h, 0).split(",")[1]}" ${thin}/>`);
      out.push(`<line x1="${P(i, h, 0).split(",")[0]}" y1="${P(i, h, 0).split(",")[1]}" x2="${P(i, h, w).split(",")[0]}" y2="${P(i, h, w).split(",")[1]}" ${thin}/>`);
    }
    for (let j = 1; j < h; j++) {
      out.push(`<line x1="${P(0, j, 0).split(",")[0]}" y1="${P(0, j, 0).split(",")[1]}" x2="${P(l, j, 0).split(",")[0]}" y2="${P(l, j, 0).split(",")[1]}" ${thin}/>`);
      out.push(`<line x1="${P(l, j, 0).split(",")[0]}" y1="${P(l, j, 0).split(",")[1]}" x2="${P(l, j, w).split(",")[0]}" y2="${P(l, j, w).split(",")[1]}" ${thin}/>`);
    }
    for (let k = 1; k < w; k++) {
      out.push(`<line x1="${P(0, h, k).split(",")[0]}" y1="${P(0, h, k).split(",")[1]}" x2="${P(l, h, k).split(",")[0]}" y2="${P(l, h, k).split(",")[1]}" ${thin}/>`);
      out.push(`<line x1="${P(l, 0, k).split(",")[0]}" y1="${P(l, 0, k).split(",")[1]}" x2="${P(l, h, k).split(",")[0]}" y2="${P(l, h, k).split(",")[1]}" ${thin}/>`);
    }
  }
  return svgWrap(out.join(""));
}

function coordSvg(points: { x: number; y: number; label?: string; color?: string }[], max = 10): string {
  const out: string[] = [];
  const x0 = 14;
  const y0 = 88;
  const unit = 76 / max;
  for (let i = 0; i <= max; i++) {
    const x = r1(x0 + i * unit);
    const y = r1(y0 - i * unit);
    out.push(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${r1(y0 - max * unit)}" stroke="#e2e8f0" stroke-width="0.6"/>`);
    out.push(`<line x1="${x0}" y1="${y}" x2="${r1(x0 + max * unit)}" y2="${y}" stroke="#e2e8f0" stroke-width="0.6"/>`);
    if (i % (max > 10 ? 2 : 1) === 0) {
      out.push(svgText(x, y0 + 6, String(i), 4.2));
      out.push(svgText(x0 - 4, y + 1.5, String(i), 4.2));
    }
  }
  out.push(`<line x1="${x0}" y1="${y0}" x2="${r1(x0 + max * unit)}" y2="${y0}" stroke="${COLORS.ink}" stroke-width="1.2"/>`);
  out.push(`<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${r1(y0 - max * unit)}" stroke="${COLORS.ink}" stroke-width="1.2"/>`);
  out.push(svgText(x0 + max * unit + 4, y0 + 1.5, "x", 5, 'font-style="italic"'));
  out.push(svgText(x0, y0 - max * unit - 4, "y", 5, 'font-style="italic"'));
  for (const p of points) {
    const px = r1(x0 + p.x * unit);
    const py = r1(y0 - p.y * unit);
    out.push(`<circle cx="${px}" cy="${py}" r="2.6" fill="${p.color ?? COLORS.rose}"/>`);
    if (p.label) out.push(svgText(px + 4, py - 3, p.label, 5, `fill="${p.color ?? COLORS.rose}" font-weight="700"`));
  }
  return svgWrap(out.join(""));
}

function linePlotSvg(labels: string[], counts: number[], title: string): string {
  const out: string[] = [];
  const n = labels.length;
  const x = (i: number) => 10 + (i * 80) / (n - 1);
  out.push(`<line x1="6" y1="80" x2="94" y2="80" stroke="${COLORS.ink}" stroke-width="1.2"/>`);
  labels.forEach((l, i) => {
    out.push(`<line x1="${r1(x(i))}" y1="77" x2="${r1(x(i))}" y2="83" stroke="${COLORS.ink}" stroke-width="1"/>`);
    out.push(svgText(x(i), 91, l, 5));
    for (let k = 0; k < counts[i]; k++) {
      out.push(svgText(x(i), 74 - k * 8, "✕", 7, `fill="${COLORS.blue}" font-weight="700"`));
    }
  });
  out.push(svgText(50, 99, title, 4.5));
  return svgWrap(out.join(""));
}

// ---------------------------------------------------------------------------
// areaPerimeter — 3.M.B.3-5, 3.M.C.6, 4.M.A.3
// ---------------------------------------------------------------------------

const areaPerimeter: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "mixed");
  const m = mode === "mixed" ? pick(rng, ["countSquares", "area", "perimeter", "distributive", "composite", "formula"]) : mode;
  const unit = pick(rng, ["cm", "m", "in", "ft"]);
  let w = int(rng, 2, 9);
  let h = int(rng, 2, 9);
  if (m === "countSquares") {
    w = int(rng, 2, 7);
    h = int(rng, 2, 6);
    return {
      type: "numeric",
      prompt: "Each small square is 1 square unit. What is the area of the rectangle?",
      answer: w * h,
      display: { svg: gridSvg(h, w, w * h), speak: "Each small square is one square unit. What is the area of the rectangle?" },
      explain: `Area is the number of unit squares that cover the shape. There are ${h} rows of ${w} squares: ${h} × ${w} = ${w * h} square units.`,
      hint: "Count the squares in one row, then multiply by the number of rows (or count them all).",
    };
  }
  if (m === "area") {
    return {
      type: "numeric",
      prompt: `A rectangle is ${w} ${unit} long and ${h} ${unit} wide. What is its area in square ${unit}?`,
      answer: w * h,
      display: { svg: rectSvg(w, h, { top: `${w} ${unit}`, left: `${h} ${unit}` }), speak: `A rectangle is ${w} ${unit} long and ${h} ${unit} wide. What is its area in square ${unit}?` },
      explain: `Area = length × width = ${w} × ${h} = ${w * h} square ${unit}. Tiling with 1-${unit} squares gives ${h} rows of ${w}.`,
      hint: "Area is length times width — the number of unit squares that would tile it.",
    };
  }
  if (m === "perimeter") {
    const variant = int(rng, 0, 2);
    if (variant === 0) {
      return {
        type: "numeric",
        prompt: `A rectangle is ${w} ${unit} by ${h} ${unit}. What is its perimeter?`,
        answer: 2 * (w + h),
        display: { svg: rectSvg(w, h, { top: `${w} ${unit}`, left: `${h} ${unit}`, bottom: `${w} ${unit}`, right: `${h} ${unit}` }), speak: `A rectangle is ${w} ${unit} by ${h} ${unit}. What is its perimeter?` },
        explain: `Perimeter is the distance around: ${w} + ${h} + ${w} + ${h} = 2 × (${w} + ${h}) = ${2 * (w + h)} ${unit}.`,
        hint: "Add all four sides. Opposite sides of a rectangle are equal.",
      };
    }
    if (variant === 1) {
      const side = int(rng, 3, 12);
      return {
        type: "numeric",
        prompt: `A square has a perimeter of ${4 * side} ${unit}. How long is one side?`,
        answer: side,
        display: { svg: rectSvg(5, 5, { bottom: `perimeter ${4 * side} ${unit}` }), speak: `A square has a perimeter of ${4 * side} ${unit}. How long is one side?` },
        explain: `A square has 4 equal sides, so one side is the perimeter ÷ 4: ${4 * side} ÷ 4 = ${side} ${unit}.`,
        hint: "Four equal sides add up to the perimeter. Divide by 4.",
      };
    }
    const p = 2 * (w + h);
    const missing = p / 2 - h;
    return {
      type: "numeric",
      prompt: `A rectangle has a perimeter of ${p} ${unit}. One side is ${h} ${unit}. How long is the other side?`,
      answer: missing,
      display: { svg: rectSvg(w, h, { left: `${h} ${unit}`, top: "?" }), speak: `A rectangle has a perimeter of ${p} ${unit}. One side is ${h} ${unit}. How long is the other side?` },
      explain: `Half the perimeter is one length plus one width: ${p} ÷ 2 = ${p / 2}. Then ${p / 2} − ${h} = ${missing} ${unit}.`,
      hint: "Half of the perimeter equals length + width. Subtract the side you know.",
    };
  }
  if (m === "distributive") {
    const a = int(rng, 3, 9);
    const b1 = pick(rng, [10, 5]);
    const b2 = int(rng, 2, 7);
    const x0 = 14;
    const total = b1 + b2;
    const wTotal = 76;
    const w1 = (b1 / total) * wTotal;
    const hh = 34;
    const svg = svgWrap(
      `<rect x="${x0}" y="33" width="${r1(w1)}" height="${hh}" fill="#bfdbfe" stroke="${COLORS.ink}" stroke-width="1.5"/>` +
        `<rect x="${r1(x0 + w1)}" y="33" width="${r1(wTotal - w1)}" height="${hh}" fill="#fde68a" stroke="${COLORS.ink}" stroke-width="1.5"/>` +
        svgText(x0 + w1 / 2, 29, String(b1), 7, 'font-weight="700"') +
        svgText(x0 + w1 + (wTotal - w1) / 2, 29, String(b2), 7, 'font-weight="700"') +
        svgText(x0 - 6, 52, String(a), 7, 'font-weight="700"')
    );
    if (rng() < 0.5) {
      return {
        type: "numeric",
        prompt: `The rectangle is ${a} by ${b1 + b2}. Its area is ${a} × ${b1} + ${a} × ___. What goes in the blank?`,
        answer: b2,
        display: { svg, speak: `The rectangle is ${a} by ${b1 + b2}. Its area is ${a} times ${b1} plus ${a} times what?` },
        explain: `The side ${b1 + b2} is split into ${b1} + ${b2}, so the area splits too: ${a} × ${b1 + b2} = ${a} × ${b1} + ${a} × ${b2} = ${a * b1} + ${a * b2} = ${a * (b1 + b2)}.`,
        hint: `The long side is cut into ${b1} and another piece. ${b1 + b2} − ${b1} = ?`,
      };
    }
    return {
      type: "numeric",
      prompt: `Use the two parts to find the area of the whole rectangle (${a} by ${b1 + b2}).`,
      answer: a * (b1 + b2),
      display: { svg, speak: `Use the two parts to find the area of the whole rectangle, ${a} by ${b1 + b2}.` },
      explain: `Area of the blue part: ${a} × ${b1} = ${a * b1}. Yellow part: ${a} × ${b2} = ${a * b2}. Whole: ${a * b1} + ${a * b2} = ${a * (b1 + b2)}. That is the distributive property: ${a} × (${b1} + ${b2}) = ${a} × ${b1} + ${a} × ${b2}.`,
      hint: "Find the area of each colored part, then add them.",
    };
  }
  if (m === "composite") {
    const W = int(rng, 6, 10);
    const H = int(rng, 5, 9);
    const cw = int(rng, 2, W - 3);
    const ch = int(rng, 2, H - 2);
    const area = W * H - cw * ch;
    return {
      type: "numeric",
      prompt: `Find the area of the L-shaped figure (lengths in ${unit}).`,
      answer: area,
      display: { svg: lShapeSvg(W, H, cw, ch), speak: `Find the area of the L shaped figure.` },
      explain: `Split it along the dashed line into two rectangles: ${W - cw} × ${H} = ${(W - cw) * H} and ${cw} × ${H - ch} = ${cw * (H - ch)}. Add: ${(W - cw) * H} + ${cw * (H - ch)} = ${area} square ${unit}. (Or: whole ${W} × ${H} = ${W * H} minus the cut-out ${cw} × ${ch} = ${cw * ch}.)`,
      hint: "Cut the L into two rectangles along the dashed line. Find each area and add.",
    };
  }
  const variant = int(rng, 0, 2);
  if (variant === 0) {
    return {
      type: "numeric",
      prompt: `A rectangle has an area of ${w * h} square ${unit} and a width of ${h} ${unit}. What is its length?`,
      answer: w,
      display: { svg: rectSvg(w, h, { left: `${h} ${unit}`, top: "?", bottom: `area ${w * h}` }), speak: `A rectangle has an area of ${w * h} square ${unit} and a width of ${h} ${unit}. What is its length?` },
      explain: `Area = length × width, so length = area ÷ width: ${w * h} ÷ ${h} = ${w} ${unit}.`,
      hint: "Work the area formula backwards: divide the area by the side you know.",
    };
  }
  if (variant === 1) {
    const answer = `${w + 1} by ${h - 1}`;
    const wrong = [`${w} by ${h + 1}`, `${w + 2} by ${h}`, `${w - 1} by ${h - 1}`].filter((x) => x !== answer);
    if (h - 1 < 1) return areaPerimeter({ ...ctx, params: { ...(ctx.params ?? {}), mode: "area" } });
    return labelChoice(rng, answer, wrong, {
      prompt: `A rectangle is ${w} by ${h} (perimeter ${2 * (w + h)}). Which rectangle has the SAME perimeter but a DIFFERENT area?`,
      display: { svg: rectSvg(w, h, { top: String(w), left: String(h) }), speak: `A rectangle is ${w} by ${h}. Which rectangle has the same perimeter but a different area?` },
      explain: `Same perimeter means the two sides add to the same total: ${w} + ${h} = ${w + h}, and ${w + 1} + ${h - 1} = ${w + h} too. The areas differ: ${w * h} vs ${(w + 1) * (h - 1)}.`,
      hint: "Keep length + width the same, but change the two numbers.",
    });
  }
  const name = pickName(rng);
  const field = pick(rng, [["soccer field", 100, 60], ["baseball infield", 90, 90], ["dance floor", 12, 8], ["pony paddock", 30, 20]] as const);
  const askArea = rng() < 0.5;
  return {
    type: "numeric",
    prompt: `${name} measures a ${field[0]}: ${field[1]} ${unit} by ${field[2]} ${unit}. What is its ${askArea ? `area in square ${unit}` : "perimeter"}?`,
    answer: askArea ? field[1] * field[2] : 2 * (field[1] + field[2]),
    display: { svg: rectSvg(field[1], field[2], { top: `${field[1]} ${unit}`, left: `${field[2]} ${unit}` }), speak: `A ${field[0]} is ${field[1]} by ${field[2]} ${unit}. What is its ${askArea ? "area" : "perimeter"}?` },
    explain: askArea ? `Area = ${field[1]} × ${field[2]} = ${(field[1] * field[2]).toLocaleString("en-US")} square ${unit}.` : `Perimeter = 2 × (${field[1]} + ${field[2]}) = 2 × ${field[1] + field[2]} = ${2 * (field[1] + field[2])} ${unit}.`,
    hint: askArea ? "Area = length × width." : "Perimeter = 2 × (length + width).",
  };
};

// ---------------------------------------------------------------------------
// angles — 4.M.B.4-6 (concept, measure, additive), 4.G.A.1 classify
// ---------------------------------------------------------------------------

function angleKind(deg: number): string {
  if (deg === 90) return "right";
  if (deg === 180) return "straight";
  return deg < 90 ? "acute" : "obtuse";
}

const angles: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "mixed");
  const m = mode === "mixed" ? pick(rng, ["classify", "measure", "additive", "concept"]) : mode;
  if (m === "classify") {
    const deg = pick(rng, [20, 30, 45, 60, 70, 90, 90, 110, 120, 135, 150, 180]);
    const kind = angleKind(deg);
    return labelChoice(rng, kind, ["acute", "right", "obtuse", "straight"].filter((k) => k !== kind), {
      prompt: "What kind of angle is this?",
      display: { svg: angleSvg(deg, false), speak: "What kind of angle is this? Acute, right, obtuse or straight?" },
      explain: `${kind === "right" ? "A right angle is exactly 90° — a square corner (marked with a little square)." : kind === "acute" ? `This angle is smaller than a square corner (less than 90°), so it is acute.` : kind === "obtuse" ? `This angle opens wider than a square corner (more than 90° but less than 180°), so it is obtuse.` : "The two rays make a straight line: 180°, a straight angle."} This one is ${deg}°.`,
      hint: "Compare it to a square corner (90°). Smaller is acute, bigger is obtuse, a straight line is 180°.",
    });
  }
  if (m === "measure") {
    const level = levelOf(ctx);
    const deg = level >= 3 ? pick(rng, [10, 20, 30, 40, 50, 60, 70, 80, 100, 110, 120, 130, 140, 150, 160, 170, 45, 135, 25, 65]) : 10 * int(rng, 1, 17);
    return {
      type: "numeric",
      prompt: "Use the scale to measure the angle between the black ray and the blue ray. How many degrees?",
      answer: deg,
      display: { svg: angleSvg(deg, true), speak: "Use the scale to measure the angle between the black ray and the blue ray, in degrees." },
      explain: `The black ray sits on 0. Follow the scale around to the blue ray: it crosses at ${deg}. The angle is ${deg}° (${angleKind(deg)}). Each small tick is 10°.`,
      hint: "Start at 0 on the black ray and count the tick marks (each small tick is ten degrees) until you reach the blue ray.",
    };
  }
  if (m === "additive") {
    const total = pick(rng, [90, 180, 120, 150, 160, 140]);
    const part = 10 * int(rng, 2, total / 10 - 2);
    const other = total - part;
    if (other === part) return angles({ ...ctx, params: { ...(ctx.params ?? {}), mode: "measure" } });
    return {
      type: "numeric",
      prompt: `The whole angle is ${total}°. The red part is ${part}°. How many degrees is the green part?`,
      answer: other,
      display: { svg: angleSvg(part, false, total), speak: `The whole angle is ${total} degrees. The red part is ${part} degrees. How many degrees is the green part?` },
      explain: `Angles add: red + green = whole. ${part} + ? = ${total}, so the green part is ${total} − ${part} = ${other}°.`,
      hint: "The two parts add up to the whole angle. Subtract the part you know.",
    };
  }
  const facts = [
    ["How many degrees are in a full turn (a whole circle)?", 360, "A full turn is 360°. One degree is 1/360 of a turn."],
    ["How many degrees are in a quarter turn (a right angle)?", 90, "A quarter of 360° is 90°: the right angle."],
    ["How many degrees are in a half turn (a straight angle)?", 180, "Half of 360° is 180°."],
    ["An angle is 1/4 of a full turn. How many degrees?", 90, "1/4 of 360° = 360 ÷ 4 = 90°."],
    ["An angle is 1/3 of a full turn. How many degrees?", 120, "1/3 of 360° = 360 ÷ 3 = 120°."],
    ["An angle is 1/6 of a full turn. How many degrees?", 60, "1/6 of 360° = 360 ÷ 6 = 60°."],
  ] as const;
  const f = pick(rng, facts);
  return {
    type: "numeric",
    prompt: f[0],
    answer: f[1],
    display: { speak: f[0] },
    explain: f[2],
    hint: "Think about what fraction of a whole turn this is, and how many degrees a whole turn has.",
  };
};

// ---------------------------------------------------------------------------
// elapsedTime — 3.M.A.1 (minutes), 4.M.A.2 (across hours)
// ---------------------------------------------------------------------------

function addMinutes(h: number, m: number, delta: number): [number, number] {
  let total = h * 60 + m + delta;
  total = ((total % 720) + 720) % 720;
  const hh = Math.floor(total / 60) || 12;
  return [hh, total % 60];
}

const elapsedTime: Generator = (ctx) => {
  const { rng } = ctx;
  const hours = ctx.params?.hours === true;
  const name = pickName(rng);
  const activity = pick(rng, ["soccer practice", "ballet class", "the baseball game", "cheer practice", "the pony ride", "homework"]);
  const h = int(rng, 1, 11);
  const m = 5 * int(rng, 0, 11);
  const variant = int(rng, 0, 2);
  if (variant === 0) {
    // Start off the hour: when the start is :00 the end minutes would restate the duration.
    const ms = m === 0 ? 5 * int(rng, 1, 11) : m;
    let dur = hours ? 5 * int(rng, 13, 30) : 5 * int(rng, 2, 11);
    let [eh, em] = addMinutes(h, ms, dur);
    for (let guard = 0; guard < 6 && [ms, em, h, eh].includes(dur); guard++) {
      dur += 5;
      [eh, em] = addMinutes(h, ms, dur);
    }
    return {
      type: "numeric",
      prompt: `${activity[0].toUpperCase() + activity.slice(1)} starts at ${timeStr(h, ms)} and ends at ${timeStr(eh, em)}. How many minutes does it last?`,
      answer: dur,
      display: { speak: `${activity} starts at ${timeStr(h, ms)} and ends at ${timeStr(eh, em)}. How many minutes does it last?` },
      explain: hours
        ? `Jump in steps: from ${timeStr(h, ms)} to the next hour is ${60 - ms} min, then whole hours, then the rest. Total ${dur} minutes (${Math.floor(dur / 60)} h ${dur % 60} min).`
        : `Count up from ${timeStr(h, ms)}: ${ms + dur >= 60 ? `to ${timeStr((h % 12) + 1, 0)} is ${60 - ms} min, then ${dur - (60 - ms)} more` : `by 5s to ${timeStr(eh, em)}`}. That is ${dur} minutes.`,
      hint: "Use a number line of time: jump to the next whole hour first, then count the rest.",
    };
  }
  if (variant === 1) {
    const dur = hours ? 5 * int(rng, 13, 30) : 5 * int(rng, 2, 11);
    const [eh, em] = addMinutes(h, m, dur);
    const answer = timeStr(eh, em);
    const durText = hours ? `${Math.floor(dur / 60)} hour${Math.floor(dur / 60) > 1 ? "s" : ""}${dur % 60 ? ` ${dur % 60} minutes` : ""}` : `${dur} minutes`;
    const wrong = [timeStr(...addMinutes(h, m, dur + 10)), timeStr(...addMinutes(h, m, dur - 15)), timeStr(...addMinutes(h, m, dur + 60)), timeStr(...addMinutes(h, m, 60))].filter((w) => w !== answer);
    return labelChoice(rng, answer, wrong, {
      prompt: `${name} starts ${activity} at ${timeStr(h, m)}. It lasts ${durText}. What time does it end?`,
      display: { speak: `${name} starts ${activity} at ${timeStr(h, m)}. It lasts ${durText}. What time does it end?` },
      explain: `Add the time in pieces: ${hours ? `${timeStr(h, m)} + ${Math.floor(dur / 60)} h = ${timeStr(...addMinutes(h, m, 60 * Math.floor(dur / 60)))}, then + ${dur % 60} min = ${answer}.` : `${timeStr(h, m)} + ${dur} min: count by 5s (or jump to the hour first) → ${answer}.`}`,
      hint: "Add the hours first, then the minutes. If the minutes pass 60, move to the next hour.",
    });
  }
  const dur = hours ? 5 * int(rng, 13, 30) : 5 * int(rng, 2, 11);
  const [sh, sm] = addMinutes(h, m, -dur);
  const answer = timeStr(sh, sm);
  const durText = hours ? `${Math.floor(dur / 60)} hour${Math.floor(dur / 60) > 1 ? "s" : ""}${dur % 60 ? ` ${dur % 60} minutes` : ""}` : `${dur} minutes`;
  const wrong = [timeStr(...addMinutes(h, m, -dur + 10)), timeStr(...addMinutes(h, m, dur)), timeStr(...addMinutes(h, m, -dur - 30))].filter((w) => w !== answer);
  return labelChoice(rng, answer, wrong, {
    prompt: `${activity[0].toUpperCase() + activity.slice(1)} ends at ${timeStr(h, m)} after ${durText}. What time did it start?`,
    display: { speak: `${activity} ends at ${timeStr(h, m)} after ${durText}. What time did it start?` },
    explain: `Go backwards from ${timeStr(h, m)} by ${durText}: ${answer}. (Check by adding ${durText} to ${answer}.)`,
    hint: "Count backwards: take away the hours first, then the minutes.",
  });
};

// ---------------------------------------------------------------------------
// unitConversions — 4.M.A.1 (larger → smaller), 5.M.A.1 (both ways, decimals)
// ---------------------------------------------------------------------------

interface Conv {
  big: string;
  small: string;
  factor: number;
  bigPl: string;
  smallPl: string;
}

const CONVS: Conv[] = [
  { big: "km", small: "m", factor: 1000, bigPl: "kilometers", smallPl: "meters" },
  { big: "m", small: "cm", factor: 100, bigPl: "meters", smallPl: "centimeters" },
  { big: "kg", small: "g", factor: 1000, bigPl: "kilograms", smallPl: "grams" },
  { big: "L", small: "mL", factor: 1000, bigPl: "liters", smallPl: "milliliters" },
  { big: "ft", small: "in", factor: 12, bigPl: "feet", smallPl: "inches" },
  { big: "yd", small: "ft", factor: 3, bigPl: "yards", smallPl: "feet" },
  { big: "lb", small: "oz", factor: 16, bigPl: "pounds", smallPl: "ounces" },
  { big: "min", small: "s", factor: 60, bigPl: "minutes", smallPl: "seconds" },
  { big: "hr", small: "min", factor: 60, bigPl: "hours", smallPl: "minutes" },
];

const unitConversions: Generator = (ctx) => {
  const { rng } = ctx;
  const level = Math.max(levelOf(ctx), numParam(ctx, "grade", 4));
  const c = pick(rng, CONVS);
  const variant = level >= 5 ? int(rng, 0, 3) : int(rng, 0, 1);
  if (variant === 0) {
    const n = int(rng, 2, 9);
    return {
      type: "numeric",
      prompt: `${n} ${c.big} = ? ${c.small}`,
      answer: n * c.factor,
      display: { speak: `${n} ${c.bigPl} is how many ${c.smallPl}?` },
      explain: `1 ${c.big} = ${c.factor} ${c.small}. Larger unit → smaller unit means more of them: multiply. ${n} × ${c.factor} = ${(n * c.factor).toLocaleString("en-US")} ${c.small}.`,
      hint: `How many ${c.smallPl} are in one ${c.big}? Multiply by ${n}.`,
    };
  }
  if (variant === 1) {
    const rows = [1, 2, 3, 4].map((k) => [`${k} ${c.big}`, k === 4 ? "?" : `${k * c.factor} ${c.small}`]);
    return {
      type: "numeric",
      prompt: `Complete the table: 4 ${c.big} = ? ${c.small}`,
      answer: 4 * c.factor,
      display: { grid: rows, speak: `Complete the table. 4 ${c.bigPl} is how many ${c.smallPl}?` },
      explain: `Each row adds ${c.factor} ${c.small}: ${c.factor}, ${2 * c.factor}, ${3 * c.factor}, ${4 * c.factor}. So 4 ${c.big} = ${4 * c.factor} ${c.small}.`,
      hint: "Look at how the right column grows from row to row. Keep the pattern going.",
    };
  }
  if (variant === 2) {
    const n = int(rng, 1, 9) + 0.5 * int(rng, 0, 1);
    const small = n * c.factor;
    const q = small / c.factor;
    return {
      type: "text",
      prompt: `${small.toLocaleString("en-US")} ${c.small} = ? ${c.big}  (type the number, decimals allowed)`,
      answer: decShort(q),
      accept: decAccept(q),
      display: { speak: `${small} ${c.smallPl} is how many ${c.bigPl}?` },
      explain: `Smaller unit → larger unit: divide. ${small.toLocaleString("en-US")} ÷ ${c.factor} = ${decShort(q)} ${c.big}.`,
      hint: `There are ${c.factor} ${c.smallPl} in a ${c.big}. Divide.`,
    };
  }
  const name = pickName(rng);
  const whole = int(rng, 2, 5);
  const cut = int(rng, 1, c.factor - 1) * (c.factor >= 100 ? 1 : 1);
  let cutVal = c.factor >= 100 ? Math.round(cut / 5) * 5 || 5 : cut;
  let total = whole * c.factor - cutVal;
  if (total === cutVal) {
    cutVal += 1;
    total -= 1;
  }
  return {
    type: "numeric",
    prompt: `${name} has ${whole} ${c.big} of ${pick(rng, ["ribbon", "rope", "pony-feed", "water", "practice time"])} and uses ${cutVal} ${c.small}. How many ${c.small} are left?`,
    answer: total,
    display: { speak: `${name} has ${whole} ${c.bigPl} and uses ${cutVal} ${c.smallPl}. How many ${c.smallPl} are left?` },
    explain: `Convert to the smaller unit first: ${whole} ${c.big} = ${whole * c.factor} ${c.small}. Then subtract: ${whole * c.factor} − ${cutVal} = ${total} ${c.small}.`,
    hint: "Put both amounts in the same unit before subtracting.",
  };
};

// ---------------------------------------------------------------------------
// volume — 5.M.B.2-4
// ---------------------------------------------------------------------------

const volume: Generator = (ctx) => {
  const { rng } = ctx;
  const mode = strParam(ctx, "mode", "mixed");
  const m = mode === "mixed" ? pick(rng, ["count", "formula", "composite"]) : mode;
  const unit = pick(rng, ["cm", "in", "ft"]);
  const l = int(rng, 2, 5);
  const w = int(rng, 2, 4);
  const h = int(rng, 2, 4);
  if (m === "count") {
    if (rng() < 0.6) {
      return {
        type: "numeric",
        prompt: "The box is built from unit cubes. How many cubes is its volume?",
        answer: l * w * h,
        display: { svg: prismSvg(l, w, h), speak: "The box is built from unit cubes. How many cubes is its volume?" },
        explain: `Count one layer: ${l} × ${w} = ${l * w} cubes. There are ${h} layers: ${l * w} × ${h} = ${l * w * h} cubic units.`,
        hint: "Count the cubes in the bottom layer, then multiply by the number of layers.",
      };
    }
    return {
      type: "numeric",
      prompt: `A box is packed with 1-${unit} cubes: ${l} along, ${w} back, ${h} high. What is its volume in cubic ${unit}?`,
      answer: l * w * h,
      display: { svg: prismSvg(l, w, h), speak: `A box is packed with one ${unit} cubes: ${l} along, ${w} back, ${h} high. What is its volume in cubic ${unit}?` },
      explain: `Volume is the number of unit cubes that fill the box: ${l} × ${w} × ${h} = ${l * w * h} cubic ${unit}.`,
      hint: "Multiply the three dimensions, or count a layer and multiply by the height.",
    };
  }
  if (m === "formula") {
    const variant = int(rng, 0, 2);
    const L = int(rng, 3, 12);
    const W = int(rng, 2, 9);
    const H = int(rng, 2, 9);
    if (variant === 0) {
      return {
        type: "numeric",
        prompt: `A box is ${L} ${unit} long, ${W} ${unit} wide and ${H} ${unit} tall. What is its volume in cubic ${unit}?`,
        answer: L * W * H,
        display: { svg: prismSvg(Math.min(L, 6), Math.min(W, 4), Math.min(H, 4), false), speak: `A box is ${L} ${unit} long, ${W} ${unit} wide and ${H} ${unit} tall. What is its volume?` },
        explain: `V = l × w × h = ${L} × ${W} × ${H} = ${L * W * H} cubic ${unit}. (Base area ${L} × ${W} = ${L * W}, times height ${H}.)`,
        hint: "Volume = length × width × height.",
      };
    }
    if (variant === 1) {
      return {
        type: "numeric",
        prompt: `A box has a base area of ${L * W} square ${unit} and a height of ${H} ${unit}. What is its volume?`,
        answer: L * W * H,
        display: { speak: `A box has a base area of ${L * W} square ${unit} and a height of ${H} ${unit}. What is its volume?` },
        explain: `V = B × h, where B is the area of the base: ${L * W} × ${H} = ${L * W * H} cubic ${unit}.`,
        hint: "Volume = base area × height.",
      };
    }
    return {
      type: "numeric",
      prompt: `A box has a volume of ${L * W * H} cubic ${unit}. Its base is ${L} ${unit} by ${W} ${unit}. How tall is it?`,
      answer: H,
      display: { speak: `A box has a volume of ${L * W * H} cubic ${unit}. Its base is ${L} by ${W} ${unit}. How tall is it?` },
      explain: `Base area: ${L} × ${W} = ${L * W}. Height = volume ÷ base area = ${L * W * H} ÷ ${L * W} = ${H} ${unit}.`,
      hint: "Find the base area first, then divide the volume by it.",
    };
  }
  const l2 = int(rng, 2, 6);
  const w2 = w;
  const h2 = int(rng, 1, 3);
  const v1 = l * w * h;
  const v2 = l2 * w2 * h2;
  return {
    type: "numeric",
    prompt: `A figure is made of two boxes: one ${l} × ${w} × ${h} ${unit} and one ${l2} × ${w2} × ${h2} ${unit}, stacked without overlapping. What is the total volume in cubic ${unit}?`,
    answer: v1 + v2,
    display: { svg: prismSvg(l, w, h, false), speak: `A figure is made of two boxes, ${l} by ${w} by ${h} and ${l2} by ${w2} by ${h2} ${unit}. What is the total volume?` },
    explain: `Volume adds for non-overlapping parts. Box 1: ${l} × ${w} × ${h} = ${v1}. Box 2: ${l2} × ${w2} × ${h2} = ${v2}. Total: ${v1} + ${v2} = ${v1 + v2} cubic ${unit}.`,
    hint: "Find each box's volume separately, then add.",
  };
};

// ---------------------------------------------------------------------------
// coordinatePlane — 5.G.A.1-2
// ---------------------------------------------------------------------------

const coordinatePlane: Generator = (ctx) => {
  const { rng } = ctx;
  const x = int(rng, 1, 9);
  let y = int(rng, 1, 9);
  if (y === x) y = x === 9 ? 8 : x + 1;
  const variant = int(rng, 0, 3);
  if (variant === 0) {
    const answer = `(${x}, ${y})`;
    return labelChoice(rng, answer, [`(${y}, ${x})`, `(${x}, ${x})`, `(${y}, ${y})`], {
      prompt: "What are the coordinates of the point?",
      display: { svg: coordSvg([{ x, y }]), speak: "What are the coordinates of the point?" },
      explain: `Start at the origin (0, 0). Go ${x} to the right along the x-axis, then ${y} up: the point is (${x}, ${y}). The x-coordinate always comes first.`,
      hint: "Count across first (x), then up (y). Write (across, up).",
    });
  }
  if (variant === 1) {
    const letters = ["A", "B", "C", "D"];
    const pts = [{ x, y }, { x: y, y: x }, { x, y: (y + 3) % 10 || 1 }, { x: (x + 4) % 10 || 1, y }];
    const uniq = pts.filter((p, i) => pts.findIndex((q) => q.x === p.x && q.y === p.y) === i);
    const labelled = uniq.map((p, i) => ({ ...p, label: letters[i], color: COLORS.blue }));
    return labelChoice(rng, "A", letters.slice(1, labelled.length), {
      prompt: `Which point is at (${x}, ${y})?`,
      display: { svg: coordSvg(labelled), speak: `Which point is at ${x} comma ${y}?` },
      explain: `(${x}, ${y}) means ${x} across and ${y} up. Point A is there. Point B is at (${y}, ${x}) — the order matters!`,
      hint: "First number: how far right. Second number: how far up.",
    });
  }
  if (variant === 2) {
    const dx = int(rng, 1, 9 - x);
    return {
      type: "numeric",
      prompt: `A point is at (${x}, ${y}). It moves ${dx} units to the right. What is its new x-coordinate?`,
      answer: x + dx,
      display: { svg: coordSvg([{ x, y }]), speak: `A point is at ${x} comma ${y}. It moves ${dx} units to the right. What is its new x coordinate?` },
      explain: `Moving right changes only x: ${x} + ${dx} = ${x + dx}. The new point is (${x + dx}, ${y}).`,
      hint: "Right and left change the first number; up and down change the second.",
    };
  }
  const name = pickName(rng);
  const laps = int(rng, 2, 5);
  const minutes = laps * 2;
  return labelChoice(rng, `${name} ran ${laps} laps in ${minutes} minutes`, [`${name} ran ${minutes} laps in ${laps} minutes`, `${name} ran ${laps} laps in ${laps} minutes`, `${name} ran ${minutes + laps} laps`], {
    prompt: `On a graph, the x-axis is minutes and the y-axis is laps. What does the point (${minutes}, ${laps}) mean?`,
    display: { svg: coordSvg([{ x: minutes, y: laps }]), speak: `On a graph, x is minutes and y is laps. What does the point ${minutes} comma ${laps} mean?` },
    explain: `The first coordinate is on the x-axis (minutes): ${minutes}. The second is on the y-axis (laps): ${laps}. So: ${laps} laps in ${minutes} minutes.`,
    hint: "Match each number to its axis: first number → x-axis, second → y-axis.",
  });
};

// ---------------------------------------------------------------------------
// dataLinePlot — 2.DL.B.3 (whole), 3.DL.B.4, 4.DL.B.5, 5.DL.B.5 (fractions)
// ---------------------------------------------------------------------------

const dataLinePlot: Generator = (ctx) => {
  const { rng } = ctx;
  const fractions = ctx.params?.fractions !== false && numParam(ctx, "grade", 3) >= 3;
  const denoms = numListParam(ctx, "denoms", [2, 4]);
  const ops = ctx.params?.ops === true;
  const d = fractions ? pick(rng, denoms) : 1;
  const thing = pick(rng, [["pencil", "inches", "pencils"], ["ribbon", "inches", "ribbons"], ["worm", "inches", "worms"], ["leaf", "inches", "leaves"]]);
  const nTicks = fractions ? d + 1 + (d <= 4 ? d : 0) : 6;
  const labels: string[] = [];
  for (let i = 0; i < nTicks; i++) {
    if (fractions) {
      const whole = Math.floor(i / d);
      const rem = i % d;
      labels.push(rem === 0 ? String(whole) : `${whole > 0 ? whole + " " : ""}${frac(...simplify(rem, d))}`);
    } else labels.push(String(i + 3));
  }
  const counts = labels.map(() => int(rng, 0, 4));
  if (counts.reduce((s, c) => s + c, 0) === 0) counts[1] = 2;
  const svg = linePlotSvg(labels, counts, `${thing[0]} lengths (${thing[1]})`);
  const total = counts.reduce((s, c) => s + c, 0);
  const variant = int(rng, 0, ops ? 3 : 2);
  const idx = counts.findIndex((c) => c > 0);
  const iPick = pick(rng, counts.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0));
  if (variant === 0) {
    return {
      type: "numeric",
      prompt: `Each ✕ is one ${thing[0]}. How many ${thing[2]} measured ${labels[iPick]} ${labels[iPick] === "1" ? "inch" : thing[1]}?`,
      answer: counts[iPick],
      display: { svg, speak: `Each X is one ${thing[0]}. How many measured ${labels[iPick]} ${thing[1]}?` },
      explain: `Find ${labels[iPick]} on the number line and count the ✕ marks above it: ${counts[iPick]}.`,
      hint: `Find the tick labelled ${labels[iPick]}. Count the X marks stacked above it.`,
    };
  }
  if (variant === 1) {
    return {
      type: "numeric",
      prompt: `Each ✕ is one ${thing[0]}. How many ${thing[2]} were measured in all?`,
      answer: total,
      display: { svg, speak: `Each X is one ${thing[0]}. How many were measured in all?` },
      explain: `Count every ✕: ${counts.filter((c) => c > 0).join(" + ")} = ${total}.`,
      hint: "Add up the X marks above every tick.",
    };
  }
  const maxIdx = counts.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0).pop() as number;
  const minIdx = idx;
  if (variant === 2 || !fractions) {
    const diff = maxIdx - minIdx;
    if (!fractions) {
      return {
        type: "numeric",
        prompt: `What is the difference between the longest and shortest ${thing[0]} (in ${thing[1]})?`,
        answer: diff,
        display: { svg, speak: `What is the difference between the longest and shortest ${thing[0]}?` },
        explain: `Longest: ${labels[maxIdx]}. Shortest: ${labels[minIdx]}. Difference: ${labels[maxIdx]} − ${labels[minIdx]} = ${diff} ${thing[1]}.`,
        hint: "Find the right-most and left-most X marks. Subtract their values.",
      };
    }
    const wrongs: [number, number][] = [[diff + 1, d], [diff, d * 2], [maxIdx + minIdx, d], [Math.max(1, diff - 1), d]];
    const answerLabel = mixed(diff, d);
    const seen = new Set([answerLabel]);
    const wrongLabels = wrongs.map(([n, dd]) => mixed(n, dd)).filter((w) => {
      if (seen.has(w)) return false;
      seen.add(w);
      return true;
    });
    return labelChoice(rng, answerLabel, wrongLabels, {
      prompt: `What is the difference between the longest and shortest ${thing[0]} (in ${thing[1]})?`,
      display: { svg, speak: `What is the difference between the longest and shortest ${thing[0]}?` },
      explain: `Longest: ${labels[maxIdx]}. Shortest: ${labels[minIdx]}. Subtract (same denominator ${d}): ${maxIdx}/${d} − ${minIdx}/${d} = ${diff}/${d} = ${answerLabel} ${thing[1]}.`,
      hint: "Find the right-most and left-most X. Write both as fractions with the same denominator and subtract.",
    });
  }
  const totalLen = counts[iPick] * iPick;
  const answerLabel = mixed(totalLen, d);
  const wrongs = [mixed(totalLen + 1, d), mixed(counts[iPick] + iPick, d), mixed(totalLen, d * 2 === d ? d + 1 : d * 2)].filter((w) => w !== answerLabel);
  return labelChoice(rng, answerLabel, [...new Set(wrongs)], {
    prompt: `If you laid all the ${thing[2]} that measure ${labels[iPick]} ${thing[1]} end to end, how long would they be (in ${thing[1]})?`,
    display: { svg, speak: `If you laid all the ${thing[0]}s that measure ${labels[iPick]} ${thing[1]} end to end, how long would they be?` },
    explain: `There are ${counts[iPick]} of them, each ${labels[iPick]}: ${counts[iPick]} × ${iPick}/${d} = ${totalLen}/${d} = ${answerLabel} ${thing[1]}.`,
    hint: "Count the X marks at that length, then multiply by the length (or add it that many times).",
  });
};

// ---------------------------------------------------------------------------
// geometryClassify — 4.G.A.1-3, 5.G.B.3-4
// ---------------------------------------------------------------------------

function linesSvg(kind: "parallel" | "perpendicular" | "intersecting", rot: number): string {
  const g = (inner: string) => svgWrap(`<g transform="rotate(${rot} 50 50)">${inner}</g>`);
  const style = `stroke="${COLORS.ink}" stroke-width="2.5" stroke-linecap="round"`;
  if (kind === "parallel") return g(`<line x1="15" y1="38" x2="85" y2="38" ${style}/><line x1="15" y1="62" x2="85" y2="62" ${style}/>`);
  if (kind === "perpendicular") return g(`<line x1="15" y1="50" x2="85" y2="50" ${style}/><line x1="50" y1="15" x2="50" y2="85" ${style}/><polyline points="57,50 57,43 50,43" fill="none" stroke="${COLORS.rose}" stroke-width="1.5"/>`);
  return g(`<line x1="15" y1="60" x2="85" y2="40" ${style}/><line x1="25" y1="20" x2="70" y2="85" ${style}/>`);
}

function figureSvg(kind: "line" | "segment" | "ray", rot: number): string {
  const style = `stroke="${COLORS.ink}" stroke-width="2.5" stroke-linecap="round"`;
  const arrow = (x: number, dir: 1 | -1) => `<polygon points="${x},50 ${x - 6 * dir},45 ${x - 6 * dir},55" fill="${COLORS.ink}"/>`;
  const dot = (x: number) => `<circle cx="${x}" cy="50" r="3" fill="${COLORS.blue}"/>`;
  let inner = `<line x1="18" y1="50" x2="82" y2="50" ${style}/>`;
  if (kind === "line") inner += arrow(88, 1) + arrow(12, -1);
  else if (kind === "ray") inner += dot(18) + arrow(88, 1);
  else inner += dot(18) + dot(82);
  return svgWrap(`<g transform="rotate(${rot} 50 50)">${inner}</g>`);
}

function triangleSvg(kind: "right" | "acute" | "obtuse", rot: number): string {
  const pts = kind === "right" ? "20,80 80,80 20,25" : kind === "acute" ? "20,80 80,80 50,22" : "15,75 85,75 70,40";
  return svgWrap(`<g transform="rotate(${rot} 50 50)"><polygon points="${pts}" fill="#c7d2fe" stroke="#4338ca" stroke-width="2.5" stroke-linejoin="round"/></g>`);
}

function symmetrySvg(shape: "square" | "rectangle" | "triangle" | "heart", axis: "v" | "h" | "d", correct: boolean): string {
  const base =
    shape === "square"
      ? `<rect x="25" y="25" width="50" height="50" fill="#c7d2fe" stroke="#4338ca" stroke-width="2"/>`
      : shape === "rectangle"
        ? `<rect x="15" y="32" width="70" height="36" fill="#c7d2fe" stroke="#4338ca" stroke-width="2"/>`
        : shape === "triangle"
          ? `<polygon points="50,20 80,78 20,78" fill="#c7d2fe" stroke="#4338ca" stroke-width="2"/>`
          : `<path d="M50,80 L20,48 A14,14 0 0,1 50,30 A14,14 0 0,1 80,48 Z" fill="#fecdd3" stroke="#e11d48" stroke-width="2"/>`;
  const line = axis === "v" ? `<line x1="50" y1="10" x2="50" y2="90"` : axis === "h" ? `<line x1="10" y1="50" x2="90" y2="50"` : `<line x1="15" y1="85" x2="85" y2="15"`;
  void correct;
  return svgWrap(`${base}${line} stroke="${COLORS.rose}" stroke-width="1.5" stroke-dasharray="4 3"/>`);
}

const geometryClassify: Generator = (ctx) => {
  const { rng } = ctx;
  const level = Math.max(levelOf(ctx), numParam(ctx, "grade", 4));
  const rot = int(rng, 0, 11) * 15;
  const variant = level >= 5 ? int(rng, 5, 6) : int(rng, 0, 4);
  if (variant === 0) {
    const kind = pick(rng, ["parallel", "perpendicular", "intersecting"] as const);
    return labelChoice(rng, kind, ["parallel", "perpendicular", "intersecting"].filter((k) => k !== kind), {
      prompt: "How would you describe these two lines?",
      display: { svg: linesSvg(kind, rot), speak: "Are these lines parallel, perpendicular, or just intersecting?" },
      explain: kind === "parallel" ? "Parallel lines stay the same distance apart and never meet, like train tracks." : kind === "perpendicular" ? "Perpendicular lines cross at a right angle (90°), marked with the little square." : "These lines cross, but not at a right angle: they are intersecting but not perpendicular.",
      hint: "Do they ever meet? If they cross, is the corner a square corner?",
    });
  }
  if (variant === 1) {
    const kind = pick(rng, ["line", "segment", "ray"] as const);
    const names: Record<string, string> = { line: "line", segment: "line segment", ray: "ray" };
    return labelChoice(rng, names[kind], ["line", "line segment", "ray", "angle"].filter((k) => k !== names[kind]), {
      prompt: "What is this figure called?",
      display: { svg: figureSvg(kind, rot), speak: "What is this figure called?" },
      explain: kind === "line" ? "Arrows on both ends: it goes on forever both ways — a line." : kind === "segment" ? "Two endpoints: it stops at both ends — a line segment." : "One endpoint and one arrow: it starts at a point and goes on forever one way — a ray.",
      hint: "Look at the ends: dots are endpoints, arrows mean it keeps going.",
    });
  }
  if (variant === 2) {
    const kind = pick(rng, ["right", "acute", "obtuse"] as const);
    const answer = `${kind} triangle`;
    return labelChoice(rng, answer, ["right triangle", "acute triangle", "obtuse triangle"].filter((k) => k !== answer), {
      prompt: "Classify this triangle by its angles.",
      display: { svg: triangleSvg(kind, rot), speak: "Classify this triangle by its angles: right, acute, or obtuse?" },
      explain: kind === "right" ? "One angle is a square corner (90°): a right triangle." : kind === "acute" ? "All three angles are smaller than 90°: an acute triangle." : "One angle is wider than 90°: an obtuse triangle.",
      hint: "Find the biggest angle. Is it a square corner, smaller, or wider?",
    });
  }
  if (variant === 3) {
    const shape = pick(rng, ["square", "rectangle", "triangle", "heart"] as const);
    const axis = pick(rng, ["v", "h", "d"] as const);
    const isSym = shape === "square" ? true : shape === "rectangle" ? axis !== "d" : axis === "v";
    const options = shuffle(rng, ["yes", "no"]);
    const extra = { svg: symmetrySvg(shape, axis, isSym) };
    return {
      type: "choice",
      prompt: "Is the dashed line a line of symmetry?",
      display: { ...extra, speak: "Is the dashed line a line of symmetry?" },
      options: options.map((o) => ({ label: o })),
      answerIndex: options.indexOf(isSym ? "yes" : "no"),
      explain: isSym ? "Yes: folding along the dashed line, the two halves match exactly." : "No: if you fold along the dashed line, the two halves do not match up.",
      hint: "Imagine folding the shape on the dashed line. Would the two halves land exactly on each other?",
    };
  }
  if (variant === 4) {
    const q = pick(rng, [
      ["square", 4],
      ["rectangle (not a square)", 2],
      ["equilateral triangle", 3],
      ["regular hexagon", 6],
      ["circle", 100],
      ["scalene triangle", 0],
    ] as const);
    if (q[1] === 100) {
      return labelChoice(rng, "more than you can count", ["1", "2", "4"], {
        prompt: "How many lines of symmetry does a circle have?",
        display: { speak: "How many lines of symmetry does a circle have?" },
        explain: "Every line through the center of a circle is a line of symmetry — there are infinitely many.",
        hint: "Try any line through the middle. Does it work? Now try another.",
      });
    }
    return {
      type: "numeric",
      prompt: `How many lines of symmetry does a ${q[0]} have?`,
      answer: q[1],
      display: { speak: `How many lines of symmetry does a ${q[0]} have?` },
      explain: q[1] === 4 ? "A square has 4: vertical, horizontal and both diagonals." : q[1] === 2 ? "A rectangle has 2: vertical and horizontal. The diagonals do not work (the halves do not match)." : q[1] === 3 ? "An equilateral triangle has 3: one through each corner to the middle of the opposite side." : q[1] === 6 ? "A regular hexagon has 6." : "A scalene triangle (all sides different) has no line of symmetry.",
      hint: "Picture folding the shape so the halves match. Count every fold line that works.",
    };
  }
  if (variant === 5) {
    const qs = [
      ["Every square is also a …", "rectangle", ["triangle", "trapezoid", "pentagon"]],
      ["Every rectangle is also a …", "parallelogram", ["square", "rhombus", "triangle"]],
      ["Every rhombus is also a …", "parallelogram", ["rectangle", "square", "trapezoid"]],
      ["Every parallelogram is also a …", "quadrilateral", ["rectangle", "rhombus", "square"]],
    ] as const;
    const q = pick(rng, qs);
    return labelChoice(rng, q[1], [...q[2]], {
      prompt: q[0],
      display: { speak: q[0] },
      explain: `Attributes pass down the hierarchy: ${q[1] === "rectangle" ? "a square has 4 right angles, which is all a rectangle needs" : q[1] === "parallelogram" ? "it has two pairs of parallel sides, which is what makes a parallelogram" : "it has 4 sides, so it is a quadrilateral"}. So every ${q[0].split(" ")[1]} is a ${q[1]} (but not the other way around).`,
      hint: "Which category's rule does this shape always satisfy?",
    });
  }
  const statements = [
    ["All squares are rhombuses.", true],
    ["All rectangles are squares.", false],
    ["All rhombuses are squares.", false],
    ["All squares are rectangles.", true],
    ["All quadrilaterals are rectangles.", false],
    ["All rectangles are parallelograms.", true],
    ["All parallelograms are rectangles.", false],
  ] as const;
  const trues = statements.filter((s) => s[1]).map((s) => s[0]);
  const falses = statements.filter((s) => !s[1]).map((s) => s[0]);
  const answer = pick(rng, trues);
  return labelChoice(rng, answer, sample(rng, falses, 3), {
    prompt: "Which statement is TRUE?",
    display: { speak: "Which statement is true?" },
    explain: `${answer} ${answer.includes("rhombuses") ? "A square has 4 equal sides, which is the rule for a rhombus." : answer.includes("rectangles") && answer.startsWith("All squares") ? "A square has 4 right angles, the rule for a rectangle." : "A rectangle has two pairs of parallel sides, the rule for a parallelogram."} The others go backwards up the hierarchy — a special shape belongs to the bigger group, not the reverse.`,
    hint: "A special shape (like a square) belongs to every bigger group it fits. The reverse is usually false.",
  });
};

// ---------------------------------------------------------------------------

export const generators: Record<string, Generator> = {
  areaPerimeter,
  angles,
  elapsedTime,
  unitConversions,
  volume,
  coordinatePlane,
  dataLinePlot,
  geometryClassify,
};

