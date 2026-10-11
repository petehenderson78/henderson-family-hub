/**
 * Figure model + SVG string builders for the reasoning ("Brain") generators.
 *
 * Pure string builders: every SVG is self-contained, viewBox 0 0 100 100, no
 * id="" attributes (several render on one screen), no role attribute, no DOM.
 * Relative imports only, `import type` for types, no enums.
 */

// ---------------------------------------------------------------------------
// shapes
// ---------------------------------------------------------------------------

export type ShapeName =
  | "arrow"
  | "triangle"
  | "half"
  | "tee"
  | "heart"
  | "ell"
  | "flag"
  | "seven"
  | "pee"
  | "step"
  | "square"
  | "circle"
  | "star"
  | "diamond"
  | "pentagon"
  | "oval";

export interface ShapeInfo {
  /** how many quarter turns before the shape looks the same again (1 = never changes, 2 = 180°, 4 = all four turns differ) */
  period: 1 | 2 | 4;
  /** true when the mirror image cannot be made by turning (so a flip is always visible) */
  chiral: boolean;
  /** "yes" curved outline, "no" straight sides only, "mixed" both */
  curved: "yes" | "no" | "mixed";
  word: string;
  plural: string;
  /** raw SVG elements, centered in the 100×100 box, no style attributes */
  markup: string;
}

export const SHAPE_INFO: Record<ShapeName, ShapeInfo> = {
  arrow: { period: 4, chiral: false, curved: "no", word: "arrow", plural: "arrows", markup: '<polygon points="50,12 84,50 62,50 62,88 38,88 38,50 16,50"/>' },
  triangle: { period: 4, chiral: false, curved: "no", word: "triangle", plural: "triangles", markup: '<polygon points="50,14 86,82 14,82"/>' },
  half: { period: 4, chiral: false, curved: "yes", word: "half-circle", plural: "half-circles", markup: '<path d="M14 64 A36 36 0 0 1 86 64 Z"/>' },
  tee: { period: 4, chiral: false, curved: "no", word: "T-shape", plural: "T-shapes", markup: '<path d="M16 14 h68 v18 h-25 v54 h-18 v-54 h-25 z"/>' },
  heart: { period: 4, chiral: false, curved: "yes", word: "heart", plural: "hearts", markup: '<path d="M50 86 C22 64 10 46 22 32 C32 20 46 24 50 34 C54 24 68 20 78 32 C90 46 78 64 50 86 Z"/>' },
  ell: { period: 4, chiral: true, curved: "no", word: "L-shape", plural: "L-shapes", markup: '<path d="M30 14 h20 v52 h22 v20 h-42 z"/>' },
  flag: { period: 4, chiral: true, curved: "no", word: "flag", plural: "flags", markup: '<path d="M26 12 h8 v76 h-8 z"/><path d="M34 16 l46 16 l-46 16 z"/>' },
  seven: { period: 4, chiral: true, curved: "no", word: "seven-shape", plural: "seven-shapes", markup: '<path d="M20 14 h60 v16 l-30 56 h-20 l30 -56 h-40 z"/>' },
  pee: { period: 4, chiral: true, curved: "mixed", word: "P-shape", plural: "P-shapes", markup: '<path d="M30 14 h30 a18 18 0 0 1 0 36 h-12 v36 h-18 z"/>' },
  step: { period: 4, chiral: true, curved: "no", word: "staircase", plural: "staircases", markup: '<path d="M14 86 v-24 h24 v-24 h24 v-24 h24 v72 z"/>' },
  square: { period: 1, chiral: false, curved: "no", word: "square", plural: "squares", markup: '<rect x="18" y="18" width="64" height="64"/>' },
  circle: { period: 1, chiral: false, curved: "yes", word: "circle", plural: "circles", markup: '<circle cx="50" cy="50" r="34"/>' },
  star: { period: 1, chiral: false, curved: "no", word: "star", plural: "stars", markup: '<polygon points="50,12 59.4,37.1 86.1,38.3 65.2,54.9 72.3,80.7 50,66 27.7,80.7 34.8,54.9 13.9,38.3 40.6,37.1"/>' },
  diamond: { period: 2, chiral: false, curved: "no", word: "diamond", plural: "diamonds", markup: '<polygon points="50,10 78,50 50,90 22,50"/>' },
  pentagon: { period: 1, chiral: false, curved: "no", word: "pentagon", plural: "pentagons", markup: '<polygon points="50,14 84.2,38.9 71.2,79.1 28.8,79.1 15.8,38.9"/>' },
  oval: { period: 2, chiral: false, curved: "yes", word: "oval", plural: "ovals", markup: '<ellipse cx="50" cy="50" rx="36" ry="22"/>' },
};

export const ALL_SHAPES: readonly ShapeName[] = Object.keys(SHAPE_INFO) as ShapeName[];
/** shapes whose four quarter turns all look different (safe for rotate rules) */
export const TURN_SHAPES: readonly ShapeName[] = ALL_SHAPES.filter((s) => SHAPE_INFO[s].period === 4);
/** shapes whose mirror image is never a rotation (safe for flip rules) */
export const CHIRAL_SHAPES: readonly ShapeName[] = ALL_SHAPES.filter((s) => SHAPE_INFO[s].chiral);
export const CURVED_SHAPES: readonly ShapeName[] = ALL_SHAPES.filter((s) => SHAPE_INFO[s].curved === "yes");
export const STRAIGHT_SHAPES: readonly ShapeName[] = ALL_SHAPES.filter((s) => SHAPE_INFO[s].curved === "no");
/** friendly, easily named shapes for the youngest items */
export const SIMPLE_SHAPES: readonly ShapeName[] = ["arrow", "triangle", "heart", "square", "circle", "star", "diamond", "half"];

// ---------------------------------------------------------------------------
// figures
// ---------------------------------------------------------------------------

export interface Figure {
  shape: ShapeName;
  /** quarter turns clockwise, 0..3 */
  rot: number;
  /** mirrored left-right (applied before the turn) */
  flip: boolean;
  /** 0 = empty outline, 1 = light tint, 2 = solid */
  fill: 0 | 1 | 2;
  /** 0 = small, 1 = big */
  size: 0 | 1;
  /** copies drawn side by side */
  count: 1 | 2 | 3;
  /** colour index */
  hue: 0 | 1 | 2;
}

export const HUE_WORD: readonly string[] = ["blue", "orange", "pink"];
export const FILL_WORD: readonly string[] = ["empty", "light", "solid"];
export const SIZE_WORD: readonly string[] = ["small", "big"];
export const COUNT_WORD: readonly string[] = ["", "one", "two", "three"];
export const TURN_WORD: readonly string[] = ["", "turned a quarter turn", "turned upside down", "turned three quarter turns"];

const HUE_COLOR: readonly string[] = ["#4f46e5", "#d97706", "#db2777"];
const HUE_TINT: readonly string[] = ["#c7d2fe", "#fde68a", "#fbcfe8"];
const COUNT_SCALE: readonly number[] = [0, 1, 0.5, 0.34];
const COUNT_X: readonly number[][] = [[], [50], [26, 74], [17, 50, 83]];

export const SVG_OPEN = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">';

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function svgWrap(inner: string, attrs = ""): string {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"${attrs ? " " + attrs : ""}>${inner}</svg>`;
}

/** Visual identity: two figures with the same key look identical (symmetry-aware). */
export function figureKey(f: Figure): string {
  const info = SHAPE_INFO[f.shape];
  const rot = info.period === 1 ? 0 : ((f.rot % info.period) + info.period) % info.period;
  const flip = info.chiral && f.flip ? 1 : 0;
  return `${f.shape}:${rot}:${flip}:${f.fill}:${f.size}:${f.count}:${f.hue}`;
}

export function sameFigure(a: Figure, b: Figure): boolean {
  return figureKey(a) === figureKey(b);
}

/** Kid-readable description, e.g. "a big solid blue arrow, turned a quarter turn". */
export function describeFigure(f: Figure): string {
  const info = SHAPE_INFO[f.shape];
  const noun = f.count === 1 ? info.word : info.plural;
  const article = f.count === 1 ? (/^[aeiou]/i.test(SIZE_WORD[f.size]) ? "an" : "a") : COUNT_WORD[f.count];
  let s = `${article} ${SIZE_WORD[f.size]} ${FILL_WORD[f.fill]} ${HUE_WORD[f.hue]} ${noun}`;
  const rot = info.period === 1 ? 0 : f.rot % info.period;
  if (info.period === 4 && rot !== 0) s += `, ${TURN_WORD[rot]}`;
  if (info.chiral && f.flip) s += " (mirrored)";
  return s;
}

/** The figure's elements positioned inside a 100×100 box (no <svg> wrapper). */
export function figureInner(f: Figure): string {
  const info = SHAPE_INFO[f.shape];
  const s = r2((f.size === 1 ? 1 : 0.62) * COUNT_SCALE[f.count]);
  const color = HUE_COLOR[f.hue];
  const fill = f.fill === 2 ? color : f.fill === 1 ? HUE_TINT[f.hue] : "#ffffff";
  const sw = r2(Math.min(9, 5 / Math.sqrt(s)));
  const style = `fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"`;
  const flip = f.flip ? "-1" : "1";
  return COUNT_X[f.count]
    .map((x) => `<g transform="translate(${x} 50) scale(${s}) rotate(${(f.rot % 4) * 90}) scale(${flip} 1) translate(-50 -50)" ${style}>${info.markup}</g>`)
    .join("");
}

/** A standalone option-sized SVG of one figure. */
export function figureSvg(f: Figure, attrs = ""): string {
  return svgWrap(figureInner(f), attrs);
}

/** Place a figure's inner markup at (x, y) scaled by s (its 100×100 box becomes s×100). */
export function placeFigure(f: Figure, x: number, y: number, s: number): string {
  return `<g transform="translate(${r2(x)} ${r2(y)}) scale(${r2(s)})">${figureInner(f)}</g>`;
}

function questionMark(cx: number, cy: number, size: number): string {
  return `<text x="${r2(cx)}" y="${r2(cy + size * 0.36)}" text-anchor="middle" font-size="${r2(size)}" font-weight="700" fill="#94a3b8" font-family="sans-serif">?</text>`;
}

/** n×n matrix with grid lines; null cells show a "?". */
export function matrixSvg(cells: readonly (Figure | null)[], n: number): string {
  const c = 100 / n;
  const parts: string[] = [`<rect x="1" y="1" width="98" height="98" rx="4" fill="#fff" stroke="#cbd5e1" stroke-width="1.5"/>`];
  for (let i = 1; i < n; i++) {
    const p = r2(i * c);
    parts.push(`<line x1="${p}" y1="1" x2="${p}" y2="99" stroke="#cbd5e1" stroke-width="1.5"/>`);
    parts.push(`<line x1="1" y1="${p}" x2="99" y2="${p}" stroke="#cbd5e1" stroke-width="1.5"/>`);
  }
  cells.forEach((cell, idx) => {
    const row = Math.floor(idx / n);
    const col = idx % n;
    const x = col * c;
    const y = row * c;
    if (cell) parts.push(placeFigure(cell, x + 2, y + 2, (c - 4) / 100));
    else parts.push(questionMark(x + c / 2, y + c / 2, c * 0.55));
  });
  return svgWrap(parts.join(""));
}

/** A horizontal row of figures (null = "?"), square cells, vertically centred. */
export function rowSvg(cells: readonly (Figure | null)[], boxed = true): string {
  const k = Math.max(1, cells.length);
  const w = 100 / k;
  const y0 = 50 - w / 2;
  const parts: string[] = [];
  cells.forEach((cell, i) => {
    const x = i * w;
    if (boxed) parts.push(`<rect x="${r2(x + 1)}" y="${r2(y0 + 1)}" width="${r2(w - 2)}" height="${r2(w - 2)}" rx="3" fill="#fff" stroke="#cbd5e1" stroke-width="1.2"/>`);
    if (cell) parts.push(placeFigure(cell, x + 2, y0 + 2, (w - 4) / 100));
    else parts.push(questionMark(x + w / 2, 50, w * 0.55));
  });
  return svgWrap(parts.join(""));
}

// ---------------------------------------------------------------------------
// quantitative pictures
// ---------------------------------------------------------------------------

/** Strings of beads, one row per term; the last row is a "?" (number series, K-2 style). */
export function beadStringsSvg(terms: readonly number[]): string {
  const rows = terms.length + 1;
  const gap = 100 / (rows + 1);
  const parts: string[] = [];
  terms.forEach((n, i) => {
    const y = r2(gap * (i + 1));
    parts.push(`<line x1="6" y1="${y}" x2="94" y2="${y}" stroke="#cbd5e1" stroke-width="1.5"/>`);
    for (let b = 0; b < n; b++) {
      parts.push(`<circle cx="${r2(10 + b * 8.5)}" cy="${y}" r="3.6" fill="${b % 2 === 0 ? "#4f46e5" : "#f59e0b"}" stroke="#1e293b" stroke-width="0.6"/>`);
    }
  });
  const yq = r2(gap * rows);
  parts.push(`<line x1="6" y1="${yq}" x2="94" y2="${yq}" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="3 2"/>`);
  parts.push(questionMark(50, yq, 14));
  return svgWrap(parts.join(""));
}

/** A balance scale with text on each pan (both pans level = equal). */
export function balanceSvg(left: string, right: string): string {
  const pan = (cx: number, text: string) =>
    `<line x1="${cx}" y1="34" x2="${cx}" y2="52" stroke="#475569" stroke-width="2"/>` +
    `<path d="M${cx - 20} 52 Q${cx} 68 ${cx + 20} 52 Z" fill="#e2e8f0" stroke="#475569" stroke-width="2"/>` +
    `<text x="${cx}" y="48" text-anchor="middle" font-size="12" font-weight="700" fill="#1e293b" font-family="sans-serif">${text}</text>`;
  return svgWrap(
    `<polygon points="38,86 62,86 50,66" fill="#94a3b8"/>` +
      `<rect x="48" y="34" width="4" height="34" fill="#64748b"/>` +
      `<rect x="10" y="31" width="80" height="4" rx="2" fill="#475569"/>` +
      pan(24, left) +
      pan(76, right) +
      `<text x="50" y="97" text-anchor="middle" font-size="8" fill="#64748b" font-family="sans-serif">same on both sides</text>`
  );
}

// ---------------------------------------------------------------------------
// paper folding
// ---------------------------------------------------------------------------

export interface Fold {
  /** "x": vertical fold line at x = at; "y": horizontal line at y = at; "d": the diagonal from top-left to bottom-right */
  axis: "x" | "y" | "d";
  /** 0..1 paper coordinate of the line (ignored for "d") */
  at: number;
  /** which side stays on the table: "hi" = larger coordinate (x > at, y > at, or y > x for "d") */
  keep: "hi" | "lo";
}

export interface Pt {
  x: number;
  y: number;
}

/** Signed distance-like value: positive on the kept side of the fold. */
export function foldSide(p: Pt, f: Fold): number {
  const v = f.axis === "x" ? p.x - f.at : f.axis === "y" ? p.y - f.at : p.y - p.x;
  return f.keep === "hi" ? v : -v;
}

export function reflectPoint(p: Pt, f: Fold): Pt {
  if (f.axis === "x") return { x: 2 * f.at - p.x, y: p.y };
  if (f.axis === "y") return { x: p.x, y: 2 * f.at - p.y };
  return { x: p.y, y: p.x };
}

export function ptKey(p: Pt): string {
  return `${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000}`;
}

export function holesKey(holes: readonly Pt[]): string {
  return holes
    .map(ptKey)
    .sort()
    .join(";");
}

/** Unfold: undo the LAST fold first, mirroring every hole across it, then the one before, … */
export function unfoldHoles(punches: readonly Pt[], folds: readonly Fold[]): Pt[] {
  let set = new Map<string, Pt>();
  for (const p of punches) set.set(ptKey(p), p);
  for (let i = folds.length - 1; i >= 0; i--) {
    const next = new Map<string, Pt>(set);
    for (const p of set.values()) {
      const m = reflectPoint(p, folds[i]);
      next.set(ptKey(m), m);
    }
    set = next;
  }
  return [...set.values()].sort((a, b) => a.x - b.x || a.y - b.y);
}

/** Clip a polygon (paper coords) to the kept side of a fold (Sutherland–Hodgman for one half-plane). */
export function clipPolygon(poly: readonly Pt[], f: Fold): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = foldSide(a, f);
    const sb = foldSide(b, f);
    if (sa >= 0) out.push(a);
    if ((sa >= 0 && sb < 0) || (sa < 0 && sb >= 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

export const UNIT_SQUARE: readonly Pt[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** The two end points of a fold line clipped to the unit square. */
function foldSegment(f: Fold): [Pt, Pt] {
  if (f.axis === "x") return [{ x: f.at, y: 0 }, { x: f.at, y: 1 }];
  if (f.axis === "y") return [{ x: 0, y: f.at }, { x: 1, y: f.at }];
  return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
}

function arrowMarkup(from: Pt, to: Pt): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const hx = to.x - ux * 2.6;
  const hy = to.y - uy * 2.6;
  const px = -uy * 2;
  const py = ux * 2;
  return (
    `<line x1="${r2(from.x)}" y1="${r2(from.y)}" x2="${r2(hx)}" y2="${r2(hy)}" stroke="#ef4444" stroke-width="1.4"/>` +
    `<polygon points="${r2(to.x)},${r2(to.y)} ${r2(hx + px)},${r2(hy + py)} ${r2(hx - px)},${r2(hy - py)}" fill="#ef4444"/>`
  );
}

/**
 * The folding story as side-by-side panels: for each fold, the paper so far with the
 * fold line and an arrow showing which part folds over; the last panel shows the
 * folded stack with the punched holes. Extra attributes land on the <svg>.
 */
export function foldingSvg(folds: readonly Fold[], punches: readonly Pt[], attrs = ""): string {
  const panels = folds.length + 1;
  const size = panels === 2 ? 36 : 28;
  const gapTotal = 100 - panels * size;
  const gap = gapTotal / (panels + 1);
  const y0 = 50 - size / 2;
  const parts: string[] = [];
  let poly: Pt[] = UNIT_SQUARE.slice();
  const toPanel = (p: Pt, x0: number): Pt => ({ x: x0 + p.x * size, y: y0 + p.y * size });
  const polyMarkup = (pts: readonly Pt[], x0: number, extra: string) =>
    `<polygon points="${pts.map((p) => `${r2(toPanel(p, x0).x)},${r2(toPanel(p, x0).y)}`).join(" ")}" ${extra}/>`;
  for (let k = 0; k < panels; k++) {
    const x0 = gap + k * (size + gap);
    parts.push(polyMarkup(UNIT_SQUARE, x0, 'fill="none" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="2 1.5"'));
    parts.push(polyMarkup(poly, x0, 'fill="#fff7ed" stroke="#334155" stroke-width="1.6" stroke-linejoin="round"'));
    if (k < folds.length) {
      const f = folds[k];
      const [a, b] = foldSegment(f);
      const pa = toPanel(a, x0);
      const pb = toPanel(b, x0);
      parts.push(`<line x1="${r2(pa.x)}" y1="${r2(pa.y)}" x2="${r2(pb.x)}" y2="${r2(pb.y)}" stroke="#ef4444" stroke-width="1.2" stroke-dasharray="2.5 1.5"/>`);
      // arrow from the moving side toward the kept side, through the middle of the current paper
      const kept = clipPolygon(poly, f);
      const moving = clipPolygon(poly, { ...f, keep: f.keep === "hi" ? "lo" : "hi" });
      const centroid = (pts: readonly Pt[]): Pt => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
      if (kept.length && moving.length) {
        const cm = centroid(moving);
        const ck = centroid(kept);
        const from = toPanel({ x: cm.x + (ck.x - cm.x) * 0.1, y: cm.y + (ck.y - cm.y) * 0.1 }, x0);
        const to = toPanel({ x: cm.x + (ck.x - cm.x) * 0.9, y: cm.y + (ck.y - cm.y) * 0.9 }, x0);
        parts.push(arrowMarkup(from, to));
      }
      poly = kept;
      // chevron between panels
      const cx = x0 + size + gap / 2;
      parts.push(`<polyline points="${r2(cx - 1.5)},46 ${r2(cx + 1.5)},50 ${r2(cx - 1.5)},54" fill="none" stroke="#94a3b8" stroke-width="1.4"/>`);
    } else {
      for (const p of punches) {
        const pp = toPanel(p, x0);
        parts.push(`<circle cx="${r2(pp.x)}" cy="${r2(pp.y)}" r="${r2(size * 0.055)}" fill="#1e293b"/>`);
      }
    }
  }
  return svgWrap(parts.join(""), attrs);
}

/** The opened sheet with holes (an answer option). Extra attributes land on the <svg>. */
export function unfoldedSvg(holes: readonly Pt[], attrs = ""): string {
  const parts: string[] = [`<rect x="10" y="10" width="80" height="80" fill="#fff7ed" stroke="#334155" stroke-width="2"/>`];
  for (const h of holes) parts.push(`<circle cx="${r2(10 + 80 * h.x)}" cy="${r2(10 + 80 * h.y)}" r="4.5" fill="#1e293b"/>`);
  return svgWrap(parts.join(""), attrs);
}
