/**
 * Starter generators — six real, deterministic question generators so the
 * end-to-end flow runs. Content agents add more files next to this one (e.g.
 * math-early.ts, math-upper.ts, reasoning.ts, phonics.ts, reading.ts,
 * writing.ts), each exporting `const generators: Record<string, Generator>`,
 * and spread them into ./index.ts.
 *
 * Rules: pure functions of ctx.rng (never Math.random), relative imports
 * only, `import type` for types, no DOM. Every question has `explain`
 * (1-3 kid-friendly sentences stating the rule) and `hint` (a nudge, not
 * the answer). SVGs are self-contained strings with viewBox 0 0 100 100.
 */

import type { ChoiceQuestion, Generator, GeneratorContext, Option, Question } from "../types";
import { int, pick, shuffle } from "../rng";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function numParam(ctx: GeneratorContext, key: string, fallback: number): number {
  const v = ctx.params?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function levelOf(ctx: GeneratorContext): number {
  if (typeof ctx.level === "number") return ctx.level;
  return numParam(ctx, "level", 1);
}

/** Build a 4-option choice question from an answer + candidate distractors (kept unique). */
function choiceFromNumbers(
  rng: () => number,
  answer: number,
  distractors: number[],
  base: Omit<ChoiceQuestion, "type" | "options" | "answerIndex">
): ChoiceQuestion {
  const uniq: number[] = [];
  for (const d of distractors) {
    if (d !== answer && !uniq.includes(d) && Number.isFinite(d)) uniq.push(d);
    if (uniq.length === 3) break;
  }
  let bump = 1;
  while (uniq.length < 3) {
    const cand = answer + bump * (bump % 2 === 0 ? -1 : 1) * Math.ceil(bump / 2);
    if (cand !== answer && !uniq.includes(cand)) uniq.push(cand);
    bump += 1;
  }
  const values = shuffle(rng, [answer, ...uniq]);
  return {
    type: "choice",
    ...base,
    options: values.map((v) => ({ label: String(v) })),
    answerIndex: values.indexOf(answer),
  };
}

const SVG_OPEN = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img">';

// ---------------------------------------------------------------------------
// countNext — Lily, 1.NBT.A.1
// ---------------------------------------------------------------------------

const countNext: Generator = (ctx) => {
  const { rng } = ctx;
  const max = numParam(ctx, "max", 120);
  const variant = rng() < 0.65 ? "series" : "after";
  if (variant === "series") {
    const start = int(rng, 1, max - 3);
    const shown = [start, start + 1, start + 2];
    const answer = start + 3;
    return {
      type: "numeric",
      prompt: `What number comes next?  ${shown.join(", ")}, ___`,
      answer,
      display: { speak: `What number comes next? ${shown.join(", ")}, ...` },
      explain: `When we count, each number is one more than the last. ${start + 2} + 1 = ${answer}.`,
      hint: "Say the numbers out loud and keep counting by one.",
    };
  }
  const n = int(rng, 1, max - 1);
  return {
    type: "numeric",
    prompt: `What number comes right after ${n}?`,
    answer: n + 1,
    display: { speak: `What number comes right after ${n}?` },
    explain: `The number after ${n} is one more: ${n} + 1 = ${n + 1}.`,
    hint: `Start at ${n} and count on one more.`,
  };
};

// ---------------------------------------------------------------------------
// addWithin10 — Lily, 1.OA.C.6 (ten-frame SVG)
// ---------------------------------------------------------------------------

function tenFrameSvg(a: number, b: number): string {
  const cells: string[] = [];
  for (let i = 0; i < 10; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = 5 + col * 18;
    const y = 32 + row * 18;
    cells.push(`<rect x="${x}" y="${y}" width="18" height="18" fill="#fff" stroke="#94a3b8" stroke-width="1.5"/>`);
    if (i < a) cells.push(`<circle cx="${x + 9}" cy="${y + 9}" r="6" fill="#2563eb"/>`);
    else if (i < a + b) cells.push(`<circle cx="${x + 9}" cy="${y + 9}" r="6" fill="#f59e0b"/>`);
  }
  return `${SVG_OPEN}${cells.join("")}</svg>`;
}

const addWithin10: Generator = (ctx) => {
  const { rng } = ctx;
  const max = Math.min(10, numParam(ctx, "max", 10));
  const a = int(rng, 1, max - 1);
  const b = int(rng, 1, max - a);
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  const countOn = Array.from({ length: small }, (_, i) => big + i + 1).join(", ");
  return {
    type: "numeric",
    prompt: `${a} + ${b} = ?`,
    answer: a + b,
    display: { svg: tenFrameSvg(a, b), speak: `${a} plus ${b} equals what?` },
    explain: `Start at ${big} and count on ${small} more: ${countOn}. So ${a} + ${b} = ${a + b}.`,
    hint: "Start at the bigger number and count on. Count the dots in the frame.",
  };
};

// ---------------------------------------------------------------------------
// multFacts — Cole, 3.OA.C.7
// ---------------------------------------------------------------------------

function multExplain(a: number, b: number): string {
  const prod = a * b;
  if (a === 0 || b === 0) return `Anything times 0 is 0. ${a} × ${b} = 0.`;
  if (a === 1 || b === 1) return `Anything times 1 is itself. ${a} × ${b} = ${prod}.`;
  if (a === 2 || b === 2) {
    const other = a === 2 ? b : a;
    return `Times 2 is a double: ${other} + ${other} = ${prod}.`;
  }
  if (a === 10 || b === 10) {
    const other = a === 10 ? b : a;
    return `Times 10 just adds a zero: ${other} becomes ${other}0. ${a} × ${b} = ${prod}.`;
  }
  if (a === 5 || b === 5) {
    const other = a === 5 ? b : a;
    return `Skip count by 5, ${other} times: ${Array.from({ length: other }, (_, i) => 5 * (i + 1)).join(", ")}. So ${a} × ${b} = ${prod}.`;
  }
  if (a === 9 || b === 9) {
    const other = a === 9 ? b : a;
    return `Nines trick: ${other} × 10 = ${other * 10}, then take away ${other}: ${other * 10} − ${other} = ${prod}.`;
  }
  const groups = Array.from({ length: Math.min(a, 6) }, () => String(b)).join(" + ");
  return `${a} × ${b} means ${a} groups of ${b}: ${groups}${a > 6 ? " + …" : ""} = ${prod}. (${b} × ${a} = ${prod} too — the turn-around fact.)`;
}

const multFacts: Generator = (ctx) => {
  const { rng } = ctx;
  const min = numParam(ctx, "min", 0);
  const max = numParam(ctx, "max", 12);
  // Weight toward the harder facts (3-9) so 0/1/10 don't dominate.
  const a = rng() < 0.75 ? int(rng, Math.max(min, 3), Math.min(max, 9)) : int(rng, min, max);
  const b = rng() < 0.75 ? int(rng, Math.max(min, 3), Math.min(max, 9)) : int(rng, min, max);
  const skip = Array.from({ length: Math.min(a, 4) }, (_, i) => b * (i + 1)).join(", ");
  return {
    type: "numeric",
    prompt: `${a} × ${b} = ?`,
    answer: a * b,
    display: { speak: `${a} times ${b}` },
    explain: multExplain(a, b),
    hint: a === 0 || b === 0 ? "What is any number times zero?" : `Skip count by ${b}: ${skip}${a > 4 ? ", …" : ""}`,
  };
};

// ---------------------------------------------------------------------------
// mult2x1 — Cole, 4.NBT.B.5
// ---------------------------------------------------------------------------

const mult2x1: Generator = (ctx) => {
  const { rng } = ctx;
  const a = int(rng, 12, 99);
  const b = int(rng, 2, 9);
  const tens = Math.floor(a / 10) * 10;
  const ones = a % 10;
  const prod = a * b;
  return {
    type: "numeric",
    prompt: `${a} × ${b} = ?`,
    answer: prod,
    display: { speak: `${a} times ${b}` },
    explain:
      ones === 0
        ? `${a} is ${a / 10} tens. ${a / 10} × ${b} = ${(a / 10) * b}, so ${a} × ${b} = ${prod}.`
        : `Break ${a} into ${tens} + ${ones}. ${tens} × ${b} = ${tens * b} and ${ones} × ${b} = ${ones * b}. ${tens * b} + ${ones * b} = ${prod}.`,
    hint: `Split ${a} into tens and ones (${tens} and ${ones}), multiply each by ${b}, then add.`,
  };
};

// ---------------------------------------------------------------------------
// numberSeries — both (level 1 / level 3)
// ---------------------------------------------------------------------------

interface Series {
  terms: number[];
  answer: number;
  rule: string;
  distractors: number[];
}

function seriesLevel1(rng: () => number): Series {
  const kind = pick(rng, ["+1", "+2", "+5", "+10", "-1", "-2"] as const);
  const step = kind === "+1" ? 1 : kind === "+2" ? 2 : kind === "+5" ? 5 : kind === "+10" ? 10 : kind === "-1" ? -1 : -2;
  const len = 4;
  const start = step > 0 ? int(rng, 1, 30) : int(rng, 10, 30);
  const terms = Array.from({ length: len }, (_, i) => start + step * i);
  const answer = start + step * len;
  const word = step > 0 ? `${step} more` : `${-step} less`;
  return {
    terms,
    answer,
    rule: `Each number is ${word} than the one before. ${terms[len - 1]} ${step > 0 ? "+" : "−"} ${Math.abs(step)} = ${answer}.`,
    distractors: [answer + step, answer - step, answer + 1, answer - 1, answer + 2 * step],
  };
}

function seriesLevel3(rng: () => number): Series {
  const kind = pick(rng, ["add", "sub", "double", "triple", "growing", "alternate", "squares", "fib"] as const);
  const len = 5;
  switch (kind) {
    case "add": {
      const step = int(rng, 3, 12);
      const start = int(rng, 1, 40);
      const terms = Array.from({ length: len }, (_, i) => start + step * i);
      const answer = start + step * len;
      return { terms, answer, rule: `Add ${step} each time: ${terms[len - 1]} + ${step} = ${answer}.`, distractors: [answer + step, answer - step, answer + 1, answer - 2] };
    }
    case "sub": {
      const step = int(rng, 3, 9);
      const start = int(rng, 60, 99);
      const terms = Array.from({ length: len }, (_, i) => start - step * i);
      const answer = start - step * len;
      return { terms, answer, rule: `Subtract ${step} each time: ${terms[len - 1]} − ${step} = ${answer}.`, distractors: [answer - step, answer + step, answer + 1, answer - 1] };
    }
    case "double": {
      const start = int(rng, 1, 5);
      const terms = Array.from({ length: len }, (_, i) => start * 2 ** i);
      const answer = start * 2 ** len;
      return { terms, answer, rule: `Each number is double the one before: ${terms[len - 1]} × 2 = ${answer}.`, distractors: [answer - terms[len - 1] / 2, terms[len - 1] + (terms[len - 1] - terms[len - 2]), answer + 2, answer * 2] };
    }
    case "triple": {
      const start = int(rng, 1, 3);
      const terms = Array.from({ length: 4 }, (_, i) => start * 3 ** i);
      const answer = start * 3 ** 4;
      return { terms, answer, rule: `Each number is 3 times the one before: ${terms[3]} × 3 = ${answer}.`, distractors: [terms[3] * 2, answer + 3, answer - 3, terms[3] + (terms[3] - terms[2])] };
    }
    case "growing": {
      const start = int(rng, 1, 10);
      const first = int(rng, 1, 3);
      const terms = [start];
      for (let i = 1; i < len; i++) terms.push(terms[i - 1] + first + (i - 1));
      const answer = terms[len - 1] + first + (len - 1);
      const diffs = Array.from({ length: len }, (_, i) => first + i).join(", ");
      return { terms, answer, rule: `The jumps grow by 1 each time: +${diffs}. ${terms[len - 1]} + ${first + len - 1} = ${answer}.`, distractors: [terms[len - 1] + first + (len - 2), answer + 1, answer - 1, answer + 2] };
    }
    case "alternate": {
      const up = int(rng, 4, 10);
      const down = int(rng, 1, up - 2);
      const start = int(rng, 2, 20);
      const terms = [start];
      for (let i = 1; i < len; i++) terms.push(terms[i - 1] + (i % 2 === 1 ? up : -down));
      const nextIsUp = len % 2 === 1;
      const answer = terms[len - 1] + (nextIsUp ? up : -down);
      return { terms, answer, rule: `The pattern alternates: +${up}, −${down}, +${up}, −${down}. Next is ${nextIsUp ? `+${up}` : `−${down}`}: ${answer}.`, distractors: [terms[len - 1] + (nextIsUp ? -down : up), answer + 1, answer - 1, terms[len - 1]] };
    }
    case "squares": {
      const offset = int(rng, 1, 3);
      const terms = Array.from({ length: len }, (_, i) => (i + offset) ** 2);
      const answer = (len + offset) ** 2;
      return { terms, answer, rule: `These are square numbers: ${terms.map((t, i) => `${i + offset}×${i + offset}`).join(", ")}. Next is ${len + offset} × ${len + offset} = ${answer}.`, distractors: [answer - 1, terms[len - 1] + (terms[len - 1] - terms[len - 2]), answer + 2, answer + (len + offset)] };
    }
    default: {
      const a = int(rng, 1, 4);
      const b = int(rng, a, a + 4);
      const terms = [a, b];
      for (let i = 2; i < len; i++) terms.push(terms[i - 1] + terms[i - 2]);
      const answer = terms[len - 1] + terms[len - 2];
      return { terms, answer, rule: `Each number is the sum of the two before it: ${terms[len - 2]} + ${terms[len - 1]} = ${answer}.`, distractors: [terms[len - 1] + (terms[len - 1] - terms[len - 2]), answer + 1, answer - 1, terms[len - 1] * 2] };
    }
  }
}

const numberSeries: Generator = (ctx) => {
  const { rng } = ctx;
  const level = levelOf(ctx);
  const s = level >= 3 ? seriesLevel3(rng) : seriesLevel1(rng);
  return choiceFromNumbers(rng, s.answer, s.distractors, {
    prompt: `What number comes next?  ${s.terms.join(", ")}, ___`,
    display: { speak: `What number comes next? ${s.terms.join(", ")}` },
    explain: s.rule,
    hint: "Find what changes from one number to the next. Check your rule on every step.",
  });
};

// ---------------------------------------------------------------------------
// figureMatrix — both (2×2 SVG matrix: rotate / fill toggle / shape change)
// ---------------------------------------------------------------------------

type ShapeName = "arrow" | "triangle" | "ell" | "half";

interface Cell {
  shape: ShapeName;
  /** quarter turns clockwise, 0..3 */
  rot: number;
  filled: boolean;
}

const SHAPES: readonly ShapeName[] = ["arrow", "triangle", "ell", "half"];
const SHAPE_WORD: Record<ShapeName, string> = { arrow: "arrow", triangle: "triangle", ell: "L-shape", half: "half-circle" };

function shapePath(shape: ShapeName, filled: boolean): string {
  const style = filled ? 'fill="#4f46e5" stroke="#4f46e5"' : 'fill="none" stroke="#4f46e5"';
  const common = `${style} stroke-width="5" stroke-linejoin="round"`;
  switch (shape) {
    case "arrow":
      return `<polygon points="50,14 82,50 62,50 62,86 38,86 38,50 18,50" ${common}/>`;
    case "triangle":
      return `<polygon points="50,16 84,80 16,80" ${common}/>`;
    case "ell":
      return `<path d="M30 18 h42 v18 h-24 v46 h-18 z" ${common}/>`;
    default:
      return `<path d="M18 62 A32 32 0 0 1 82 62 Z" ${common}/>`;
  }
}

function cellInner(c: Cell): string {
  return `<g transform="rotate(${c.rot * 90} 50 50)">${shapePath(c.shape, c.filled)}</g>`;
}

function cellSvg(c: Cell): string {
  return `${SVG_OPEN}${cellInner(c)}</svg>`;
}

function matrixSvg(tl: Cell, tr: Cell, bl: Cell): string {
  const place = (c: Cell, x: number, y: number) => `<g transform="translate(${x} ${y}) scale(0.44)">${cellInner(c)}</g>`;
  return (
    `${SVG_OPEN}` +
    `<rect x="1" y="1" width="98" height="98" rx="6" fill="#fff" stroke="#cbd5e1" stroke-width="1.5"/>` +
    `<line x1="50" y1="1" x2="50" y2="99" stroke="#cbd5e1" stroke-width="1.5"/>` +
    `<line x1="1" y1="50" x2="99" y2="50" stroke="#cbd5e1" stroke-width="1.5"/>` +
    place(tl, 3, 3) +
    place(tr, 53, 3) +
    place(bl, 3, 53) +
    `<text x="75" y="84" text-anchor="middle" font-size="30" font-weight="700" fill="#94a3b8" font-family="sans-serif">?</text>` +
    `</svg>`
  );
}

type RuleName = "rotate" | "fill" | "shape";

function applyRule(rule: RuleName, c: Cell): Cell {
  switch (rule) {
    case "rotate":
      return { ...c, rot: (c.rot + 1) % 4 };
    case "fill":
      return { ...c, filled: !c.filled };
    default:
      return { ...c, shape: SHAPES[(SHAPES.indexOf(c.shape) + 1) % SHAPES.length] };
  }
}

const RULE_WORD: Record<RuleName, string> = {
  rotate: "turns a quarter turn",
  fill: "switches between filled and empty",
  shape: "changes to a different shape",
};

function cellKey(c: Cell): string {
  return `${c.shape}-${c.rot}-${c.filled ? "f" : "e"}`;
}

const figureMatrix: Generator = (ctx) => {
  const { rng } = ctx;
  const level = levelOf(ctx);
  const tl: Cell = { shape: pick(rng, SHAPES), rot: int(rng, 0, 3), filled: rng() < 0.5 };

  let rowRule: RuleName;
  let colRule: RuleName;
  if (level >= 3) {
    const rules = shuffle(rng, ["rotate", "fill", "shape"] as RuleName[]);
    rowRule = rules[0];
    colRule = rules[1];
  } else {
    rowRule = pick(rng, ["rotate", "fill"] as RuleName[]);
    colRule = "shape";
  }

  const tr = applyRule(rowRule, tl);
  const bl = applyRule(colRule, tl);
  const br = applyRule(colRule, tr);

  const candidates: Cell[] = shuffle(rng, [
    applyRule("rotate", br),
    applyRule("fill", br),
    applyRule("shape", br),
    tr,
    bl,
    tl,
    applyRule("rotate", applyRule("rotate", br)),
  ]);
  const seen = new Set<string>([cellKey(br)]);
  const distractors: Cell[] = [];
  for (const c of candidates) {
    const k = cellKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    distractors.push(c);
    if (distractors.length === 3) break;
  }
  const cells = shuffle(rng, [br, ...distractors]);
  const options: Option[] = cells.map((c) => ({ svg: cellSvg(c) }));

  const q: Question = {
    type: "choice",
    prompt: "Which picture finishes the pattern?",
    display: { svg: matrixSvg(tl, tr, bl), speak: "Which picture finishes the pattern?" },
    options,
    answerIndex: cells.indexOf(br),
    explain: `Across the row, the picture ${RULE_WORD[rowRule]}. Down the column, it ${RULE_WORD[colRule]}. So the missing one is ${br.filled ? "a filled" : "an empty"} ${SHAPE_WORD[br.shape]}, turned like the one above it.`,
    hint: "Look at how the top row changes from left to right. Now do the same thing to the bottom-left picture.",
  };
  return q;
};

// ---------------------------------------------------------------------------

export const generators: Record<string, Generator> = {
  countNext,
  addWithin10,
  multFacts,
  mult2x1,
  numberSeries,
  figureMatrix,
};
