/**
 * Reasoning ("Brain") generators — deterministic question builders modeled on
 * the item FORMATS of the CogAT batteries (never actual test items), tuned for
 * level 1 (Lily, grade 1: pictorial, read aloud, 3 options where natural) and
 * level 3 (Cole, grade 3: text, 4 options, two-step rules).
 *
 * Ids (all prefixed "r."):
 *   Quantitative  r.numberSeries  r.numberAnalogies  r.numberPuzzles
 *   Nonverbal     r.figureMatrix  r.figureClassification  r.figureSeries  r.paperFolding  r.patternCompletion
 *   Verbal        r.verbalAnalogies  r.verbalClassification  r.sentenceCompletion   (from content/verbal-banks)
 *   Extras        r.mentalRotation  r.oddOneOut  r.sudoku4  r.logicGrid
 *
 * Every generator works at both levels (the check script runs 1 and 3) and reads
 * `ctx.level` (else `params.level`, else 1). Useful params:
 *   options: number            override the option count
 *   steps / kinds: list        restrict number-series patterns
 *   variant: "belongs"|"odd"   figure classification format
 *   folds / punches: number    paper folding difficulty
 *   patterns: string[]         pattern completion templates (e.g. "AABB")
 *   symbols: "emoji"|"digits"  sudoku symbols
 *   attempt: number            verbal banks: walk a fixed permutation so consecutive attempts never repeat
 *   seen: string[]             verbal banks: prompts (or explains) already shown, excluded while any item is unseen
 *   max: number                number series level 1: largest answer (default 50; ≤ 10 draws bead strings)
 *
 * Rules: pure functions of ctx.rng (never Math.random), relative imports only,
 * `import type` for types, no enums, no DOM. SVGs: viewBox 0 0 100 100, no id="".
 * Every question has `explain` (states the rule) and `hint` (a nudge, never the answer).
 */

import type { ChoiceQuestion, Generator, GeneratorContext, Option } from "../types";
import type { VerbalItem } from "../content/types";
import { hashString, int, mulberry32, pick, sample, shuffle } from "../rng";
import { VERBAL_BANKS } from "../content/verbal-banks";
import type { Figure, Fold, Pt, ShapeName } from "./reasoning-svg";
import {
  ALL_SHAPES,
  CHIRAL_SHAPES,
  CURVED_SHAPES,
  HUE_WORD,
  SHAPE_INFO,
  SIMPLE_SHAPES,
  SIZE_WORD,
  STRAIGHT_SHAPES,
  TURN_SHAPES,
  balanceSvg,
  beadStringsSvg,
  describeFigure,
  figureKey,
  figureSvg,
  foldingSvg,
  holesKey,
  matrixSvg,
  reflectPoint,
  rowSvg,
  unfoldHoles,
  unfoldedSvg,
} from "./reasoning-svg";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Rng = () => number;

function numParam(ctx: GeneratorContext, key: string, fallback: number): number {
  const v = ctx.params?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function strParam(ctx: GeneratorContext, key: string, fallback: string): string {
  const v = ctx.params?.[key];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function strListParam(ctx: GeneratorContext, key: string): string[] | undefined {
  const v = ctx.params?.[key];
  if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string")) return v as string[];
  return undefined;
}

function numListParam(ctx: GeneratorContext, key: string): number[] | undefined {
  const v = ctx.params?.[key];
  if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number" && Number.isFinite(x))) return v as number[];
  return undefined;
}

/** ctx.level, else params.level, else 1. */
function levelOf(ctx: GeneratorContext): number {
  if (typeof ctx.level === "number") return ctx.level;
  return numParam(ctx, "level", 1);
}

function isL3(ctx: GeneratorContext): boolean {
  return levelOf(ctx) >= 3;
}

/** Option count: params.options, else the level default. */
function nOptions(ctx: GeneratorContext, l1: number, l3: number): number {
  const p = numParam(ctx, "options", 0);
  if (p >= 2) return Math.floor(p);
  return isL3(ctx) ? l3 : l1;
}

/** Read-aloud text for level 1 (undefined at level 3, where the child reads). */
function speakFor(ctx: GeneratorContext, text: string): string | undefined {
  return isL3(ctx) ? undefined : text;
}

function optionKey(o: Option): string {
  return JSON.stringify([o.label ?? "", o.emoji ?? "", o.svg ?? ""]);
}

interface Built {
  options: Option[];
  answerIndex: number;
}

/** Shuffle the correct option in with the first n-1 distinct distractors (answer position is uniform by rng). */
function assemble(rng: Rng, correct: Option, distractors: readonly Option[], n: number): Built {
  const seen = new Set<string>([optionKey(correct)]);
  const ds: Option[] = [];
  for (const d of distractors) {
    const k = optionKey(d);
    if (seen.has(k)) continue;
    seen.add(k);
    ds.push(d);
    if (ds.length >= n - 1) break;
  }
  const options = shuffle(rng, [correct, ...ds]);
  return { options, answerIndex: options.indexOf(correct) };
}

/** Numeric options as labels; pads with ±1, ±2 … when the distractor list runs short. */
function numberChoice(rng: Rng, answer: number, distractors: readonly number[], n: number): Built {
  const uniq: number[] = [];
  const ok = (d: number) => Number.isFinite(d) && Number.isInteger(d) && d !== answer && !uniq.includes(d) && (d >= 0 || answer < 0);
  for (const d of distractors) {
    if (ok(d)) uniq.push(d);
    if (uniq.length >= n - 1) break;
  }
  let bump = 1;
  while (uniq.length < n - 1) {
    const cand = answer + (bump % 2 === 0 ? -1 : 1) * Math.ceil(bump / 2);
    if (ok(cand)) uniq.push(cand);
    bump += 1;
  }
  const values = shuffle(rng, [answer, ...uniq]);
  return { options: values.map((v) => ({ label: String(v) })), answerIndex: values.indexOf(answer) };
}

function choice(base: Omit<ChoiceQuestion, "type" | "options" | "answerIndex">, built: Built): ChoiceQuestion {
  return { type: "choice", ...base, options: built.options, answerIndex: built.answerIndex };
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// ---------------------------------------------------------------------------
// r.numberSeries — Quantitative: Number Series
// ---------------------------------------------------------------------------

interface Series {
  terms: number[];
  answer: number;
  rule: string;
  distractors: number[];
}

function seriesL1(rng: Rng, steps: readonly number[], max: number): Series {
  const step = pick(rng, steps);
  const len = 4;
  const maxStart = Math.max(1, max - len * step);
  let start: number;
  if (step >= 5 && rng() < 0.5 && step + len * step <= max) start = step; // the classic skip count: 5, 10, 15, 20 …
  else start = int(rng, 1, maxStart);
  const terms = Array.from({ length: len }, (_, i) => start + step * i);
  const answer = start + step * len;
  const last = terms[len - 1];
  return {
    terms,
    answer,
    rule: `Each number is ${step} more than the one before (count ${step === 1 ? "on by ones" : `by ${step}s`}). ${last} + ${step} = ${answer}.`,
    distractors: [answer + 1, answer - 1, answer + step, last, answer + 2 * step, answer - step],
  };
}

function seriesL3(rng: Rng, kinds: readonly string[]): Series {
  const kind = pick(rng, kinds);
  const len = 5;
  switch (kind) {
    case "sub": {
      const step = int(rng, 3, 9);
      const start = int(rng, 50, 99);
      const terms = Array.from({ length: len }, (_, i) => start - step * i);
      const answer = start - step * len;
      return { terms, answer, rule: `The numbers go DOWN by ${step} each time: ${terms[len - 1]} − ${step} = ${answer}.`, distractors: [answer + step, answer - step, answer + 1, answer - 1, terms[len - 1] + step] };
    }
    case "double": {
      const start = int(rng, 1, 5);
      const terms = Array.from({ length: len }, (_, i) => start * 2 ** i);
      const answer = start * 2 ** len;
      return { terms, answer, rule: `Each number is DOUBLE the one before (× 2): ${terms[len - 1]} × 2 = ${answer}.`, distractors: [terms[len - 1] + (terms[len - 1] - terms[len - 2]), answer + 2, answer - 2, answer * 2, terms[len - 1] + 2] };
    }
    case "growing": {
      const start = int(rng, 1, 12);
      const first = int(rng, 1, 3);
      const terms = [start];
      for (let i = 1; i < len; i++) terms.push(terms[i - 1] + first + (i - 1));
      const answer = terms[len - 1] + first + (len - 1);
      const diffs = Array.from({ length: len }, (_, i) => `+${first + i}`).join(", ");
      return { terms, answer, rule: `The jumps grow by 1 each time: ${diffs}. ${terms[len - 1]} + ${first + len - 1} = ${answer}.`, distractors: [terms[len - 1] + first + (len - 2), answer + 1, answer - 1, terms[len - 1] + first] };
    }
    case "shrinking": {
      const start = int(rng, 40, 80);
      const first = int(rng, 1, 3);
      const terms = [start];
      for (let i = 1; i < len; i++) terms.push(terms[i - 1] - (first + i - 1));
      const answer = terms[len - 1] - (first + len - 1);
      const diffs = Array.from({ length: len }, (_, i) => `−${first + i}`).join(", ");
      return { terms, answer, rule: `The numbers go down by a bigger jump each time: ${diffs}. ${terms[len - 1]} − ${first + len - 1} = ${answer}.`, distractors: [terms[len - 1] - (first + len - 2), answer + 1, answer - 1, terms[len - 1] - first] };
    }
    case "alternate": {
      const up = int(rng, 4, 10);
      const down = int(rng, 1, up - 2);
      const start = int(rng, 2, 20);
      const terms = [start];
      for (let i = 1; i < len; i++) terms.push(terms[i - 1] + (i % 2 === 1 ? up : -down));
      const nextIsUp = len % 2 === 1;
      const answer = terms[len - 1] + (nextIsUp ? up : -down);
      return { terms, answer, rule: `Two steps take turns: +${up}, then −${down}, then +${up} again. Next is ${nextIsUp ? `+${up}` : `−${down}`}: ${terms[len - 1]} ${nextIsUp ? "+" : "−"} ${nextIsUp ? up : down} = ${answer}.`, distractors: [terms[len - 1] + (nextIsUp ? -down : up), answer + 1, answer - 1, terms[len - 1]] };
    }
    case "interleave": {
      const a = int(rng, 1, 20);
      const b = int(rng, 1, 20);
      const d1 = int(rng, 1, 5);
      const d2 = pick(rng, [1, 2, 3, 5, 10].filter((d) => d !== d1));
      const terms: number[] = [];
      for (let i = 0; i < 3; i++) terms.push(a + d1 * i, b + d2 * i);
      const answer = a + d1 * 3;
      return { terms, answer, rule: `Two patterns take turns. The 1st, 3rd, 5th numbers go ${a}, ${a + d1}, ${a + 2 * d1} (+${d1}); the others go ${b}, ${b + d2}, ${b + 2 * d2} (+${d2}). The next one belongs to the first pattern: ${a + 2 * d1} + ${d1} = ${answer}.`, distractors: [b + d2 * 3, terms[5] + d1, terms[5] + d2, answer + 1, answer - 1] };
    }
    case "squares": {
      const offset = int(rng, 1, 3);
      const terms = Array.from({ length: len }, (_, i) => (i + offset) ** 2);
      const answer = (len + offset) ** 2;
      return { terms, answer, rule: `These are square numbers: ${terms.map((_, i) => `${i + offset}×${i + offset}`).join(", ")}. Next is ${len + offset} × ${len + offset} = ${answer}.`, distractors: [terms[len - 1] + (terms[len - 1] - terms[len - 2]), answer - 1, answer + 2, answer + (len + offset)] };
    }
    case "fib": {
      const a = int(rng, 1, 4);
      const b = int(rng, a, a + 4);
      const terms = [a, b];
      for (let i = 2; i < len; i++) terms.push(terms[i - 1] + terms[i - 2]);
      const answer = terms[len - 1] + terms[len - 2];
      return { terms, answer, rule: `Each number is the SUM of the two before it: ${terms[len - 2]} + ${terms[len - 1]} = ${answer}.`, distractors: [terms[len - 1] + (terms[len - 1] - terms[len - 2]), answer + 1, answer - 1, terms[len - 1] * 2] };
    }
    case "triple": {
      const start = int(rng, 1, 3);
      const terms = Array.from({ length: 4 }, (_, i) => start * 3 ** i);
      const answer = start * 3 ** 4;
      return { terms, answer, rule: `Each number is 3 TIMES the one before: ${terms[3]} × 3 = ${answer}.`, distractors: [terms[3] * 2, terms[3] + (terms[3] - terms[2]), answer + 3, answer - 3] };
    }
    default: {
      const step = int(rng, 3, 12);
      const start = int(rng, 1, 40);
      const terms = Array.from({ length: len }, (_, i) => start + step * i);
      const answer = start + step * len;
      return { terms, answer, rule: `Add ${step} each time: ${terms[len - 1]} + ${step} = ${answer}.`, distractors: [answer + step, answer - step, answer + 1, answer - 2, terms[len - 1] + step + 1] };
    }
  }
}

const L1_STEPS = [1, 2, 5, 10];
const L3_KINDS = ["add", "sub", "double", "growing", "shrinking", "alternate", "interleave", "squares", "fib"];

const numberSeries: Generator = (ctx) => {
  const { rng } = ctx;
  const s = isL3(ctx) ? seriesL3(rng, strListParam(ctx, "kinds") ?? L3_KINDS) : seriesL1(rng, numListParam(ctx, "steps") ?? L1_STEPS, Math.max(10, numParam(ctx, "max", 50)));
  const beads = !isL3(ctx) && Math.max(...s.terms) <= 10;
  const list = s.terms.join(", ");
  return choice(
    {
      prompt: `What number comes next?  ${list}, ___`,
      display: { svg: beads ? beadStringsSvg(s.terms) : undefined, speak: speakFor(ctx, `What number comes next? ${list}, and then?`) },
      explain: s.rule,
      hint: isL3(ctx) ? "Write the jump between each pair of numbers. If the jumps are not all the same, look for a jump pattern or two patterns taking turns." : "Say the numbers out loud. How much do you add each time?",
    },
    numberChoice(rng, s.answer, s.distractors, nOptions(ctx, 3, 4))
  );
};

// ---------------------------------------------------------------------------
// r.numberAnalogies — Quantitative: Number Analogies
// ---------------------------------------------------------------------------

const COUNT_EMOJI: readonly [string, string][] = [
  ["🍎", "apples"],
  ["🐟", "fish"],
  ["⭐", "stars"],
  ["🐶", "dogs"],
  ["🌸", "flowers"],
  ["🎈", "balloons"],
  ["🍪", "cookies"],
  ["🐸", "frogs"],
  ["🚗", "cars"],
  ["🦋", "butterflies"],
];

interface Relation {
  word: string;
  f: (n: number) => number;
  /** inputs for which the output is a whole number in a kid-sized range */
  domain: number[];
}

function relationsL1(): Relation[] {
  return [
    { word: "one more", f: (n) => n + 1, domain: [1, 2, 3, 4, 5] },
    { word: "two more", f: (n) => n + 2, domain: [1, 2, 3, 4] },
    { word: "one less", f: (n) => n - 1, domain: [2, 3, 4, 5, 6] },
    { word: "double (twice as many)", f: (n) => n * 2, domain: [1, 2, 3] },
    { word: "half as many", f: (n) => n / 2, domain: [2, 4, 6] },
  ];
}

function relationsL3(rng: Rng): Relation {
  const kind = pick(rng, ["add", "add", "sub", "mul", "mul", "div", "square", "double1"]);
  switch (kind) {
    case "add": {
      const n = int(rng, 2, 9);
      return { word: `add ${n}`, f: (x) => x + n, domain: Array.from({ length: 20 }, (_, i) => i + 1) };
    }
    case "sub": {
      const n = int(rng, 2, 9);
      return { word: `subtract ${n}`, f: (x) => x - n, domain: Array.from({ length: 20 }, (_, i) => i + n + 1) };
    }
    case "mul": {
      const n = pick(rng, [2, 3, 4, 5, 10]);
      return { word: `multiply by ${n}`, f: (x) => x * n, domain: Array.from({ length: 10 }, (_, i) => i + 2) };
    }
    case "div": {
      const n = pick(rng, [2, 3, 4]);
      return { word: `divide by ${n}`, f: (x) => x / n, domain: Array.from({ length: 9 }, (_, i) => (i + 2) * n) };
    }
    case "square":
      return { word: "multiply the number by itself", f: (x) => x * x, domain: [2, 3, 4, 5, 6, 7, 8, 9] };
    default:
      return { word: "double it, then add 1", f: (x) => x * 2 + 1, domain: Array.from({ length: 11 }, (_, i) => i + 2) };
  }
}

const numberAnalogies: Generator = (ctx) => {
  const { rng } = ctx;
  if (!isL3(ctx)) {
    const rel = pick(rng, relationsL1());
    const [a, c] = sample(rng, rel.domain, 2);
    const [e1, e2] = sample(rng, COUNT_EMOJI, 2);
    const fa = rel.f(a);
    const fc = rel.f(c);
    const group = (emoji: string, n: number) => emoji.repeat(n);
    const n = nOptions(ctx, 3, 4);
    const cands = [fc + 1, fc - 1, c, c + (fa - a), fc + 2, c + 1, c - 1].filter((v) => v >= 1 && v <= 8 && v !== fc);
    const built = assemble(rng, { emoji: group(e2[0], fc) }, cands.map((v) => ({ emoji: group(e2[0], v) })), n);
    const prompt = `${a} ${e1[1]} turn into ${fa} ${e1[1]}. ${c} ${e2[1]} turn into how many ${e2[1]}?`;
    return choice(
      {
        prompt,
        display: { grid: [[group(e1[0], a), group(e1[0], fa)], [group(e2[0], c), "?"]], speak: prompt },
        explain: `Top row: ${a} became ${fa}, that is ${rel.word}. Do the same to the bottom row: ${c} ${e2[1]} become ${fc} ${e2[1]}.`,
        hint: `Count the ${e1[1]} in the top row. What happened to them? Now do the same thing to the ${e2[1]}.`,
      },
      built
    );
  }
  const rel = relationsL3(rng);
  const [a, c, e] = sample(rng, rel.domain, 3);
  const fa = rel.f(a);
  const fc = rel.f(c);
  const answer = rel.f(e);
  const ratio = fa / a;
  const cands = [e + (fa - a), Number.isInteger(ratio) ? e * ratio : NaN, answer + 1, answer - 1, e, fc, answer + (fa - a), e * 2, answer + 2];
  return choice(
    {
      prompt: `[${a} → ${fa}]   [${c} → ${fc}]   [${e} → ?]`,
      explain: `Both pairs follow the same rule, "${rel.word}": ${a} → ${fa} and ${c} → ${fc}. So ${e} → ${answer}.`,
      hint: "Find a rule that works for the FIRST pair, then test it on the second pair. Try adding first, then multiplying.",
    },
    numberChoice(rng, answer, cands, nOptions(ctx, 3, 4))
  );
};

// ---------------------------------------------------------------------------
// r.numberPuzzles — Quantitative: Number Puzzles (balance / trains / equations)
// ---------------------------------------------------------------------------

const numberPuzzles: Generator = (ctx) => {
  const { rng } = ctx;
  const n = nOptions(ctx, 3, 4);
  const kinds = strListParam(ctx, "kinds") ?? (isL3(ctx) ? ["missing", "missing", "two-eq", "same-blank", "substitute"] : ["balance", "balance", "train"]);
  const kind = pick(rng, kinds);
  switch (kind) {
    case "train": {
      const total = int(rng, 3, 9);
      const k = int(rng, 1, total - 1);
      const answer = total - k;
      const prompt = `The first train carries ${total} blocks. The second train has ${k} ${plural(k, "block", "blocks")} and an empty car. How many blocks go in the empty car so both trains carry the same?`;
      return choice(
        {
          prompt,
          display: { emoji: `🚂${"🟦".repeat(total)}   🚂${"🟦".repeat(k)}❓`, speak: prompt },
          explain: `Both trains must carry ${total}. The second train already has ${k}, and ${k} + ${answer} = ${total}, so ${answer} more ${plural(answer, "block goes", "blocks go")} in the empty car.`,
          hint: `Count up from ${k} until you reach ${total}. How many did you count?`,
        },
        numberChoice(rng, answer, [answer + 1, answer - 1, total, k, answer + 2], n)
      );
    }
    case "missing": {
      const form = pick(rng, ["plus", "plus2", "minus", "minus2", "times", "div", "div2"]);
      let left = "";
      let answer = 0;
      let explain = "";
      if (form === "plus") {
        const b = int(rng, 3, 19);
        answer = int(rng, 2, 20);
        left = `? + ${b} = ${answer + b}`;
        explain = `Undo the + ${b} by subtracting: ${answer + b} − ${b} = ${answer}. Check: ${answer} + ${b} = ${answer + b}.`;
      } else if (form === "plus2") {
        const a = int(rng, 3, 19);
        answer = int(rng, 2, 20);
        left = `${a} + ? = ${a + answer}`;
        explain = `${a + answer} − ${a} = ${answer}. Check: ${a} + ${answer} = ${a + answer}.`;
      } else if (form === "minus") {
        const b = int(rng, 2, 15);
        const c = int(rng, 2, 20);
        answer = b + c;
        left = `? − ${b} = ${c}`;
        explain = `Undo the − ${b} by adding: ${c} + ${b} = ${answer}. Check: ${answer} − ${b} = ${c}.`;
      } else if (form === "minus2") {
        const a = int(rng, 10, 30);
        answer = int(rng, 2, a - 2);
        left = `${a} − ? = ${a - answer}`;
        explain = `${a} − ${a - answer} = ${answer}. Check: ${a} − ${answer} = ${a - answer}.`;
      } else if (form === "times") {
        const b = int(rng, 2, 9);
        answer = int(rng, 2, 9);
        left = `? × ${b} = ${answer * b}`;
        explain = `Think "what times ${b} makes ${answer * b}?" ${answer} × ${b} = ${answer * b}, so the missing number is ${answer}.`;
      } else if (form === "div") {
        const b = int(rng, 2, 9);
        answer = int(rng, 2, 9);
        left = `${answer * b} ÷ ? = ${b}`;
        explain = `${answer * b} split into groups of ? gives ${b}, so ? × ${b} = ${answer * b}. ${answer} × ${b} = ${answer * b}, so ? = ${answer}.`;
      } else {
        const b = int(rng, 2, 9);
        const c = int(rng, 2, 9);
        answer = b * c;
        left = `? ÷ ${b} = ${c}`;
        explain = `Undo the ÷ ${b} by multiplying: ${c} × ${b} = ${answer}. Check: ${answer} ÷ ${b} = ${c}.`;
      }
      return choice(
        {
          prompt: `Which number makes this true?  ${left}`,
          explain,
          hint: "Cover the ? and ask: what number would make the two sides equal? Undo the operation (the opposite of + is −, the opposite of × is ÷).",
        },
        numberChoice(rng, answer, [answer + 1, answer - 1, answer + 2, answer * 2, Math.floor(answer / 2)], n)
      );
    }
    case "two-eq": {
      const a = int(rng, 2, 9);
      const form = pick(rng, ["sum-diff", "sum-sum", "prod-sum", "pair"]);
      if (form === "sum-diff") {
        const d = int(rng, 1, a - 1);
        const answer = a - d;
        return choice(
          {
            prompt: `■ + ■ = ${2 * a}   and   ■ − ● = ${d}.   What is ●?`,
            explain: `■ + ■ = ${2 * a} means ■ = ${a} (half of ${2 * a}). Then ${a} − ● = ${d}, so ● = ${a} − ${d} = ${answer}.`,
            hint: "Start with the equation that has only ONE kind of shape. Find ■ first, then use it in the other equation.",
          },
          numberChoice(rng, answer, [a, a + d, 2 * a, d, answer + 1, answer - 1], n)
        );
      }
      if (form === "sum-sum") {
        const s = int(rng, a + 1, a + 9);
        const answer = s - a;
        return choice(
          {
            prompt: `■ + ■ = ${2 * a}   and   ■ + ● = ${s}.   What is ●?`,
            explain: `■ + ■ = ${2 * a} means ■ = ${a}. Then ${a} + ● = ${s}, so ● = ${s} − ${a} = ${answer}.`,
            hint: "Which equation can you solve by itself? Solve that one first.",
          },
          numberChoice(rng, answer, [a, s, 2 * a, answer + 1, answer - 1, s - 2 * a], n)
        );
      }
      if (form === "prod-sum") {
        const s = int(rng, a + 1, a + 9);
        const answer = s - a;
        return choice(
          {
            prompt: `■ × ■ = ${a * a}   and   ■ + ● = ${s}.   What is ●?`,
            explain: `■ × ■ = ${a * a} means ■ = ${a} (because ${a} × ${a} = ${a * a}). Then ${a} + ● = ${s}, so ● = ${answer}.`,
            hint: "Which number times itself gives the first answer? That is ■.",
          },
          numberChoice(rng, answer, [a, s, a * a - s, answer + 1, answer - 1], n)
        );
      }
      // pair: ■ + ● = s, ■ − ● = d → ■ = (s + d) / 2
      const b = int(rng, 1, a - 1);
      const s = a + b;
      const d = a - b;
      return choice(
        {
          prompt: `■ + ● = ${s}   and   ■ − ● = ${d}.   What is ■?`,
          explain: `■ is the bigger number. Two numbers with sum ${s} and difference ${d}: ${a} + ${b} = ${s} and ${a} − ${b} = ${d}. So ■ = ${a} and ● = ${b}.`,
          hint: `Try pairs that add to ${s}: which pair has a difference of ${d}?`,
        },
        numberChoice(rng, a, [b, s, d, a + 1, a - 1], n)
      );
    }
    case "same-blank": {
      const m = pick(rng, [2, 3, 4]);
      const answer = int(rng, 2, 9);
      const c = answer * (m - 1);
      return choice(
        {
          prompt: `The SAME number goes in both blanks:  ${m} × ___ = ___ + ${c}.   What is the number?`,
          explain: `Test the choices: ${m} × ${answer} = ${m * answer} and ${answer} + ${c} = ${answer + c}. Both sides match, so the number is ${answer}.`,
          hint: "Try each choice in BOTH blanks and see which one makes the two sides equal.",
        },
        numberChoice(rng, answer, [c, answer + 1, answer - 1, m, c - answer], n)
      );
    }
    default: {
      // balance (level 1): ? + b = c or b + ? = c, shown on a balance scale
      const c = int(rng, 4, 10);
      const b = int(rng, 1, c - 1);
      const answer = c - b;
      const first = rng() < 0.5;
      const left = first ? `? + ${b}` : `${b} + ?`;
      const prompt = `The scale is balanced. ${left} = ${c}. What number is the ?`;
      return choice(
        {
          prompt,
          display: { svg: balanceSvg(left, String(c)), speak: `The scale is balanced. ${first ? `Something plus ${b}` : `${b} plus something`} equals ${c}. What number is the question mark?` },
          explain: `Both sides weigh the same, so ? + ${b} must equal ${c}. Count up from ${b} to ${c}: that is ${answer}. ${answer} + ${b} = ${c}.`,
          hint: `Start at ${b} and count on until you reach ${c}. How many counts did it take?`,
        },
        numberChoice(rng, answer, [answer + 1, answer - 1, c, b, c + b], n)
      );
    }
  }
};

// ---------------------------------------------------------------------------
// figure rules (shared by matrix / series)
// ---------------------------------------------------------------------------

type Attr = "rot" | "flip" | "fill" | "shade" | "size" | "count" | "shape" | "hue";

interface Rule {
  attr: Attr;
  /** rot: quarter turns (1, 2 or -1); count: +1 / -1 */
  step: number;
  /** cycle for the "shape" rule */
  shapes: ShapeName[];
}

const ATTR_CLASS: Record<Attr, string> = { rot: "orient", flip: "orient", fill: "fill", shade: "fill", size: "size", count: "count", shape: "shape", hue: "hue" };

function applyRule(r: Rule, f: Figure): Figure {
  switch (r.attr) {
    case "rot":
      return { ...f, rot: (((f.rot + r.step) % 4) + 4) % 4 };
    case "flip":
      return { ...f, flip: !f.flip };
    case "fill":
      return { ...f, fill: f.fill === 0 ? 2 : 0 };
    case "shade":
      return { ...f, fill: ((f.fill + 1) % 3) as 0 | 1 | 2 };
    case "size":
      return { ...f, size: f.size === 0 ? 1 : 0 };
    case "count":
      return { ...f, count: ((((f.count - 1 + r.step) % 3) + 3) % 3 + 1) as 1 | 2 | 3 };
    case "shape": {
      const i = r.shapes.indexOf(f.shape);
      return { ...f, shape: r.shapes[(i + 1) % r.shapes.length] };
    }
    default:
      return { ...f, hue: ((f.hue + 1) % 3) as 0 | 1 | 2 };
  }
}

function ruleWord(r: Rule): string {
  switch (r.attr) {
    case "rot":
      return r.step === 2 ? "turns upside down (a half turn)" : r.step === -1 ? "turns a quarter turn to the left" : "turns a quarter turn to the right";
    case "flip":
      return "flips over, like a mirror image";
    case "fill":
      return "switches between empty and solid";
    case "shade":
      return "gets darker: empty, then light, then solid";
    case "size":
      return "switches between small and big";
    case "count":
      return r.step === 1 ? "gets one more copy" : "loses one copy";
    case "shape":
      return `changes shape (${r.shapes.map((s) => SHAPE_INFO[s].word).join(" → ")})`;
    default:
      return "changes colour (blue → orange → pink)";
  }
}

/** Pick 1-2 rules on different attributes; the shape cycle respects the other rule's symmetry needs. */
function makeRules(rng: Rng, l3: boolean, howMany: number, pool: readonly Attr[]): Rule[] {
  const chosen: Attr[] = [];
  const classes = new Set<string>();
  for (const a of shuffle(rng, pool)) {
    if (classes.has(ATTR_CLASS[a])) continue;
    classes.add(ATTR_CLASS[a]);
    chosen.push(a);
    if (chosen.length === howMany) break;
  }
  const needTurn = chosen.includes("rot");
  const needChiral = chosen.includes("flip");
  const shapePool = needChiral ? CHIRAL_SHAPES : needTurn ? TURN_SHAPES : l3 ? ALL_SHAPES : SIMPLE_SHAPES;
  return chosen.map((attr) => ({
    attr,
    step: attr === "rot" ? (l3 ? pick(rng, [1, 1, 2, -1]) : 1) : attr === "count" ? (l3 ? pick(rng, [1, -1]) : 1) : 0,
    shapes: attr === "shape" ? sample(rng, shapePool, 3) : [],
  }));
}

/** A starting figure that keeps every rule visible (turnable shape for rotations, chiral for flips, …). */
function startFigure(rng: Rng, rules: readonly Rule[], l3: boolean, chainLen: number): Figure {
  const shapeRule = rules.find((r) => r.attr === "shape");
  const needTurn = rules.some((r) => r.attr === "rot");
  const needChiral = rules.some((r) => r.attr === "flip");
  const pool = shapeRule ? shapeRule.shapes : needChiral ? CHIRAL_SHAPES : needTurn ? TURN_SHAPES : l3 ? ALL_SHAPES : SIMPLE_SHAPES;
  const shape = pick(rng, pool);
  const countRule = rules.find((r) => r.attr === "count");
  let count: 1 | 2 | 3 = l3 ? pick(rng, [1, 1, 2] as const) : 1;
  if (countRule) count = countRule.step === 1 ? (chainLen >= 3 ? 1 : pick(rng, [1, 2] as const)) : chainLen >= 3 ? 3 : pick(rng, [2, 3] as const);
  const shade = rules.some((r) => r.attr === "shade");
  return {
    shape,
    rot: SHAPE_INFO[shape].period === 4 ? int(rng, 0, 3) : 0,
    flip: l3 && SHAPE_INFO[shape].chiral && rng() < 0.3,
    fill: shade ? (int(rng, 0, 2) as 0 | 1 | 2) : pick(rng, [0, 2] as const),
    size: pick(rng, [0, 1] as const),
    count,
    hue: int(rng, 0, 2) as 0 | 1 | 2,
  };
}

/** Small one-attribute changes to a figure (near-miss distractors). */
function perturbations(rng: Rng, f: Figure): Figure[] {
  const out: Figure[] = [
    { ...f, fill: f.fill === 0 ? 2 : 0 },
    { ...f, hue: ((f.hue + 1) % 3) as 0 | 1 | 2 },
    { ...f, size: f.size === 0 ? 1 : 0 },
    { ...f, rot: (f.rot + 1) % 4 },
    { ...f, rot: (f.rot + 2) % 4 },
    { ...f, flip: !f.flip },
    { ...f, count: (f.count === 3 ? 2 : f.count + 1) as 1 | 2 | 3 },
    { ...f, shape: pick(rng, ALL_SHAPES.filter((s) => s !== f.shape)) },
  ];
  return shuffle(rng, out);
}

function figureOptions(rng: Rng, answer: Figure, tiers: readonly (readonly Figure[])[], n: number): Built {
  const seen = new Set<string>([figureKey(answer)]);
  const ds: Figure[] = [];
  for (const tier of tiers) {
    for (const f of tier) {
      const k = figureKey(f);
      if (seen.has(k)) continue;
      seen.add(k);
      ds.push(f);
      if (ds.length >= n - 1) break;
    }
    if (ds.length >= n - 1) break;
  }
  return assemble(rng, { svg: figureSvg(answer) }, ds.map((f) => ({ svg: figureSvg(f) })), n);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// r.figureMatrix — Nonverbal: Figure Matrices (2×2 at level 1, 3×3 at level 3)
// ---------------------------------------------------------------------------

const MATRIX_POOL_L1: readonly Attr[] = ["rot", "fill", "size", "count", "shape", "hue"];
const MATRIX_POOL_L3: readonly Attr[] = ["rot", "rot", "flip", "fill", "shade", "size", "count", "shape", "hue"];

const figureMatrix: Generator = (ctx) => {
  const { rng } = ctx;
  const l3 = isL3(ctx);
  const n = Math.max(2, Math.min(3, Math.floor(numParam(ctx, "size", l3 ? 3 : 2))));
  const [rowRule, colRule] = makeRules(rng, l3, 2, l3 ? MATRIX_POOL_L3 : MATRIX_POOL_L1);
  const tl = startFigure(rng, [rowRule, colRule], l3, n);
  const cells: Figure[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let f = tl;
      for (let k = 0; k < j; k++) f = applyRule(rowRule, f);
      for (let k = 0; k < i; k++) f = applyRule(colRule, f);
      cells.push(f);
    }
  }
  const answer = cells[n * n - 1];
  const left = cells[n * n - 2];
  const above = cells[n * n - 1 - n];
  const tier1 = shuffle(rng, [left, above, applyRule(rowRule, answer), applyRule(colRule, answer)]);
  const tier2 = perturbations(rng, answer);
  const built = figureOptions(rng, answer, [tier1, tier2, [tl]], nOptions(ctx, 4, 4));
  const shown: (Figure | null)[] = cells.map((c, i) => (i === n * n - 1 ? null : c));
  const prompt = "Which picture finishes the pattern?";
  return choice(
    {
      prompt,
      display: { svg: matrixSvg(shown, n), speak: speakFor(ctx, `${prompt} Look at how the top row changes, then do the same to the bottom row.`) },
      explain: `Across each row, the picture ${ruleWord(rowRule)}. Down each column, it ${ruleWord(colRule)}. So the missing cell shows ${describeFigure(answer)}.`,
      hint: "Say out loud what changes from the first picture to the next one in the top row. Then make that same change to the picture beside the ?.",
    },
    built
  );
};

// ---------------------------------------------------------------------------
// r.figureClassification — Nonverbal: Figure Classification
// ---------------------------------------------------------------------------

type ClassKey = "shape" | "fill" | "hue" | "size" | "count" | "rot" | "curved";

function classRuleName(key: ClassKey, v: number | string): string {
  switch (key) {
    case "shape":
      return `all ${SHAPE_INFO[v as ShapeName].plural}`;
    case "fill":
      return v === 2 ? "all solid (filled in)" : "all empty (just outlines)";
    case "hue":
      return `all ${HUE_WORD[v as number]}`;
    case "size":
      return `all ${SIZE_WORD[v as number]}`;
    case "count":
      return `all groups of ${v}`;
    case "rot":
      return "all turned the same way";
    default:
      return v === "yes" ? "all curved shapes (round edges)" : "all shapes with straight sides";
  }
}

const figureClassification: Generator = (ctx) => {
  const { rng } = ctx;
  const l3 = isL3(ctx);
  const variantParam = strParam(ctx, "variant", l3 ? "mixed" : "belongs");
  const variant = variantParam === "mixed" ? (rng() < 0.3 ? "odd" : "belongs") : variantParam;
  const keys: ClassKey[] = l3 ? ["shape", "fill", "hue", "size", "count", "rot", "curved"] : ["shape", "fill", "hue", "count", "size"];
  const key = pick(rng, keys);
  const basePool = l3 ? ALL_SHAPES : SIMPLE_SHAPES;

  // the shared value and the shape pools that satisfy / break the rule
  let v: number | string = 0;
  let goodShapes: readonly ShapeName[] = basePool;
  let badShapes: readonly ShapeName[] = basePool;
  if (key === "shape") {
    v = pick(rng, basePool);
    goodShapes = [v as ShapeName];
    badShapes = basePool.filter((s) => s !== v);
  } else if (key === "rot") {
    v = int(rng, 0, 3);
    goodShapes = TURN_SHAPES;
    badShapes = TURN_SHAPES;
  } else if (key === "curved") {
    v = pick(rng, ["yes", "no"]);
    goodShapes = v === "yes" ? CURVED_SHAPES : STRAIGHT_SHAPES.filter((s) => l3 || SIMPLE_SHAPES.includes(s));
    badShapes = v === "yes" ? STRAIGHT_SHAPES.filter((s) => l3 || SIMPLE_SHAPES.includes(s)) : CURVED_SHAPES;
  } else if (key === "fill") v = pick(rng, [0, 2]);
  else if (key === "hue") v = int(rng, 0, 2);
  else if (key === "size") v = int(rng, 0, 1);
  else v = pick(rng, [2, 3]);

  const rnd = (shape: ShapeName): Figure => ({
    shape,
    rot: SHAPE_INFO[shape].period === 4 ? int(rng, 0, 3) : 0,
    flip: false,
    fill: pick(rng, [0, 2] as const),
    size: pick(rng, [0, 1] as const),
    count: l3 ? pick(rng, [1, 1, 2, 3] as const) : 1,
    hue: int(rng, 0, 2) as 0 | 1 | 2,
  });
  const setKey = (f: Figure): Figure => {
    if (key === "fill") return { ...f, fill: v as 0 | 2 };
    if (key === "hue") return { ...f, hue: v as 0 | 1 | 2 };
    if (key === "size") return { ...f, size: v as 0 | 1 };
    if (key === "count") return { ...f, count: v as 2 | 3 };
    if (key === "rot") return { ...f, rot: v as number };
    return f;
  };
  const breakKey = (f: Figure): Figure => {
    if (key === "fill") return { ...f, fill: v === 0 ? 2 : 0 };
    if (key === "hue") return { ...f, hue: ((Number(v) + int(rng, 1, 2)) % 3) as 0 | 1 | 2 };
    if (key === "size") return { ...f, size: v === 0 ? 1 : 0 };
    if (key === "count") return { ...f, count: pick(rng, ([1, 2, 3] as const).filter((c) => c !== v)) };
    if (key === "rot") return { ...f, rot: (Number(v) + int(rng, 1, 3)) % 4 };
    return { ...f, shape: pick(rng, badShapes) };
  };

  // three exemplars: share the key, vary everything else (never all three alike on a visible attribute)
  const exShapes = key === "shape" ? [v, v, v] as ShapeName[] : sample(rng, goodShapes, 3);
  const exemplars = exShapes.map((s) => setKey(rnd(s)));
  const vary = (get: (f: Figure) => number, set: (f: Figure, x: number) => Figure, values: readonly number[]) => {
    if (new Set(exemplars.map(get)).size > 1) return;
    const i = int(rng, 0, 2);
    const alt = pick(rng, values.filter((x) => x !== get(exemplars[i])));
    exemplars[i] = set(exemplars[i], alt);
  };
  if (key !== "fill") vary((f) => f.fill, (f, x) => ({ ...f, fill: x as 0 | 2 }), [0, 2]);
  if (key !== "hue") vary((f) => f.hue, (f, x) => ({ ...f, hue: x as 0 | 1 | 2 }), [0, 1, 2]);
  if (key !== "size") vary((f) => f.size, (f, x) => ({ ...f, size: x as 0 | 1 }), [0, 1]);
  if (key !== "count" && l3) vary((f) => f.count, (f, x) => ({ ...f, count: x as 1 | 2 | 3 }), [1, 2, 3]);
  if (key !== "rot" && exemplars.every((f) => SHAPE_INFO[f.shape].period === 4)) vary((f) => f.rot, (f, x) => ({ ...f, rot: x }), [0, 1, 2, 3]);

  // the one that belongs: shares the key, looks different from every exemplar
  const unusedGood = goodShapes.filter((s) => !exShapes.includes(s));
  let correct = setKey(rnd(unusedGood.length ? pick(rng, unusedGood) : pick(rng, goodShapes)));
  for (let tries = 0; tries < 12 && exemplars.some((e) => figureKey(e) === figureKey(correct)); tries++) correct = setKey(rnd(correct.shape));
  if (exemplars.some((e) => figureKey(e) === figureKey(correct))) correct = { ...correct, hue: ((correct.hue + 1) % 3) as 0 | 1 | 2, size: correct.size === 0 ? 1 : 0 };

  // near-miss distractors: each looks like an exemplar but breaks the rule
  const nearMiss = shuffle(rng, exemplars).map((e) => breakKey(e));
  const spare = [breakKey(correct), breakKey(rnd(pick(rng, badShapes))), breakKey(rnd(pick(rng, badShapes)))];
  const ruleName = classRuleName(key, v);
  const hint = "Ask: what do all three have in common — the shape, the colour, the filling, the size, how they are turned, or how many copies there are? Only one thing is the same for all of them.";

  if (variant === "odd") {
    const odd = nearMiss[0];
    const built = assemble(rng, { svg: figureSvg(odd) }, [...exemplars, correct].map((f) => ({ svg: figureSvg(f) })), 4);
    const prompt = "Which picture does NOT belong with the others?";
    return choice(
      {
        prompt,
        display: { speak: speakFor(ctx, prompt) },
        explain: `Three of these are ${ruleName}. The odd one out is ${describeFigure(odd)} — it breaks the rule, so it does not belong.`,
        hint,
      },
      built
    );
  }
  const built = figureOptions(rng, correct, [nearMiss, spare], nOptions(ctx, 3, 4));
  const prompt = "These three pictures go together. Which picture belongs with them?";
  return choice(
    {
      prompt,
      display: { svg: rowSvg(exemplars), speak: speakFor(ctx, `${prompt} Think about what is the same in all three.`) },
      explain: `The three pictures are ${ruleName}, and so is the answer: ${describeFigure(correct)}. The other choices break the rule.`,
      hint,
    },
    built
  );
};

// ---------------------------------------------------------------------------
// r.figureSeries — Nonverbal: Figure Series (sequence of 4, choose the next)
// ---------------------------------------------------------------------------

const SERIES_POOL_L1: readonly Attr[] = ["rot", "fill", "size", "hue", "shape"];
const SERIES_POOL_L3: readonly Attr[] = ["rot", "rot", "fill", "size", "hue", "shape", "flip"];

const figureSeries: Generator = (ctx) => {
  const { rng } = ctx;
  const l3 = isL3(ctx);
  const howMany = l3 ? (rng() < 0.6 ? 2 : 1) : 1;
  const rules = makeRules(rng, l3, howMany, l3 ? SERIES_POOL_L3 : SERIES_POOL_L1);
  const f0 = startFigure(rng, rules, l3, 5);
  const figs: Figure[] = [f0];
  for (let i = 1; i < 5; i++) figs.push(rules.reduce((f, r) => applyRule(r, f), figs[i - 1]));
  const answer = figs[4];
  const last = figs[3];
  const wrongWay = rules.map((r) => (r.attr === "rot" ? { ...r, step: -r.step } : r.attr === "count" ? { ...r, step: -r.step } : r)).reduce((f, r) => applyRule(r, f), last);
  const partial = rules.length === 2 ? [applyRule(rules[0], last), applyRule(rules[1], last)] : [];
  const tier1 = shuffle(rng, [last, wrongWay, rules.reduce((f, r) => applyRule(r, f), answer), ...partial, figs[2]]);
  const built = figureOptions(rng, answer, [tier1, perturbations(rng, answer)], nOptions(ctx, 3, 4));
  const prompt = "Which picture comes next in the row?";
  return choice(
    {
      prompt,
      display: { svg: rowSvg([figs[0], figs[1], figs[2], figs[3], null]), speak: speakFor(ctx, `${prompt} Look at how each picture changes from the one before it.`) },
      explain: `From one picture to the next, it ${rules.map(ruleWord).join(" AND it ")}. After ${describeFigure(last)}, the next one is ${describeFigure(answer)}.`,
      hint: "Look at just the first two pictures: what changed? Check that the same change happens again from the second to the third. Then do it once more.",
    },
    built
  );
};

// ---------------------------------------------------------------------------
// r.paperFolding — Nonverbal: Paper Folding
// ---------------------------------------------------------------------------

const GRID_COORDS = [0.125, 0.375, 0.625, 0.875];

function foldWords(folds: readonly Fold[]): string {
  return folds
    .map((f, i) => {
      const again = i > 0 && f.axis === folds[i - 1].axis ? "again, the same way" : "";
      if (f.axis === "d") return "folded corner to corner along the diagonal";
      if (f.axis === "x") return `folded in half ${again || (f.keep === "hi" ? "with the left side going over onto the right" : "with the right side going over onto the left")}`;
      return `folded in half ${again || (f.keep === "hi" ? "with the top coming down onto the bottom" : "with the bottom going up onto the top")}`;
    })
    .join(", then ");
}

function foldProgram(rng: Rng, folds: number, l3: boolean): Fold[] {
  if (folds <= 1) {
    if (l3 && rng() < 0.3) return [{ axis: "d", at: 0, keep: pick(rng, ["hi", "lo"]) }];
    return [{ axis: pick(rng, ["x", "y"]), at: 0.5, keep: pick(rng, ["hi", "lo"]) }];
  }
  const first: Fold = { axis: pick(rng, ["x", "y"]), at: 0.5, keep: pick(rng, ["hi", "lo"]) };
  if (rng() < 0.4) {
    // parallel: fold the half in half again the same way
    return [first, { axis: first.axis, at: first.keep === "hi" ? 0.75 : 0.25, keep: first.keep }];
  }
  return [first, { axis: first.axis === "x" ? "y" : "x", at: 0.5, keep: pick(rng, ["hi", "lo"]) }];
}

const paperFolding: Generator = (ctx) => {
  const { rng } = ctx;
  const l3 = isL3(ctx);
  const nFolds = Math.max(1, Math.min(2, Math.floor(numParam(ctx, "folds", l3 ? 2 : 1))));
  const nPunch = Math.max(1, Math.min(2, Math.floor(numParam(ctx, "punches", l3 ? pick(rng, [1, 2]) : 1))));
  const folds = foldProgram(rng, nFolds, l3);
  const allowed: Pt[] = [];
  for (const x of GRID_COORDS) for (const y of GRID_COORDS) if (folds.every((f) => (f.keep === "hi" ? (f.axis === "x" ? x - f.at : f.axis === "y" ? y - f.at : y - x) : f.axis === "x" ? f.at - x : f.axis === "y" ? f.at - y : x - y) > 0.01)) allowed.push({ x, y });
  const punches = sample(rng, allowed, nPunch);
  const holes = unfoldHoles(punches, folds);
  const layers = 2 ** folds.length;

  // distractor hole sets
  const cands: Pt[][] = [];
  cands.push(punches.slice()); // forgot to mirror
  if (folds.length === 2) {
    cands.push(unfoldHoles(punches, [folds[1]])); // undid only the last fold
    cands.push(unfoldHoles(punches, [folds[0]])); // undid only the first fold
  }
  cands.push(unfoldHoles(punches, folds.map((f): Fold => (f.axis === "d" ? { axis: "x", at: 0.5, keep: "hi" } : { ...f, axis: f.axis === "x" ? "y" : "x" })))); // mirrored across the wrong line
  cands.push(unfoldHoles(punches, folds.map((f) => (f.axis === "d" ? { ...f, keep: f.keep === "hi" ? "lo" : "hi" } : f)))); // (diagonal: same set; harmless)
  // copied instead of mirrored (slide the hole across the first fold line)
  const f0 = folds[0];
  const slide = (p: Pt): Pt => (f0.axis === "x" ? { x: p.x - (f0.keep === "hi" ? 0.5 : -0.5), y: p.y } : f0.axis === "y" ? { x: p.x, y: p.y - (f0.keep === "hi" ? 0.5 : -0.5) } : { x: 1 - p.y, y: 1 - p.x });
  const slid = unfoldHoles(punches, folds.slice(1));
  cands.push([...slid, ...slid.map(slide)].filter((p) => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1));
  // one hole missing / one extra
  cands.push(holes.filter((_, i) => i !== int(rng, 0, holes.length - 1)));
  const extraPool: Pt[] = [];
  for (const x of GRID_COORDS) for (const y of GRID_COORDS) if (!holes.some((h) => Math.abs(h.x - x) < 1e-6 && Math.abs(h.y - y) < 1e-6)) extraPool.push({ x, y });
  if (extraPool.length) cands.push([...holes, pick(rng, extraPool)]);
  // everything mirrored across the other axis too (one fold too many)
  cands.push(unfoldHoles(punches, [...folds, { axis: folds[0].axis === "x" ? "y" : "x", at: 0.5, keep: "hi" }]));
  // the mirror of the punches across the fold only (lost the originals)
  cands.push(punches.map((p) => reflectPoint(p, folds[folds.length - 1])));

  const answerKey = holesKey(holes);
  const seen = new Set<string>([answerKey]);
  const ds: Pt[][] = [];
  const onSheet = (p: Pt) => p.x > 0.02 && p.x < 0.98 && p.y > 0.02 && p.y < 0.98;
  for (const c of cands) {
    const k = holesKey(c);
    if (c.length === 0 || seen.has(k) || !c.every(onSheet)) continue;
    seen.add(k);
    ds.push(c);
  }
  const n = nOptions(ctx, 3, 4);
  const built = assemble(
    rng,
    { svg: unfoldedSvg(holes, `data-holes="${answerKey}"`) },
    ds.map((c) => ({ svg: unfoldedSvg(c, `data-holes="${holesKey(c)}"`) })),
    n
  );
  const foldAttr = folds.map((f) => `${f.axis}${f.at}${f.keep}`).join(";");
  const punchAttr = punches.map((p) => `${p.x},${p.y}`).join(";");
  const prompt = `The paper is ${folds.length === 1 ? "folded once" : "folded twice"} along the dashed line${folds.length > 1 ? "s" : ""}, then ${nPunch === 1 ? "a hole is" : "two holes are"} punched through all the layers. Which picture shows the paper opened back up?`;
  return choice(
    {
      prompt,
      display: { svg: foldingSvg(folds, punches, `data-folds="${foldAttr}" data-punches="${punchAttr}"`), speak: speakFor(ctx, prompt) },
      explain: `The paper was ${foldWords(folds)}, so it has ${layers} layers. Every punch goes through all ${layers} layers, and each hole appears again as a mirror image across the fold line${folds.length > 1 ? "s" : ""}. ${nPunch} ${plural(nPunch, "punch", "punches")} × ${layers} layers = ${holes.length} holes, all in mirror-image spots.`,
      hint: "Every fold doubles the layers. Picture the fold line as a mirror: each hole gets a twin on the other side, the same distance from the line. Count the holes first, then check their spots.",
    },
    built
  );
};

// ---------------------------------------------------------------------------
// r.patternCompletion — ABAB / AABB emoji patterns (level 1), longer cycles at level 3
// ---------------------------------------------------------------------------

const PATTERN_EMOJI: readonly [string, string][] = [
  ["🍎", "apple"],
  ["🍌", "banana"],
  ["🐶", "dog"],
  ["🐱", "cat"],
  ["⭐", "star"],
  ["❤️", "heart"],
  ["🔵", "blue circle"],
  ["🟥", "red square"],
  ["🌙", "moon"],
  ["☀️", "sun"],
  ["🐸", "frog"],
  ["🦋", "butterfly"],
  ["🚗", "car"],
  ["🍓", "strawberry"],
  ["🟢", "green circle"],
  ["🔺", "red triangle"],
];

const PATTERNS_L1 = ["AB", "AB", "AAB", "ABB", "AABB", "ABC"];
const PATTERNS_L3 = ["ABCB", "AABC", "ABCC", "ABAC", "AABBC", "ABCD", "AABBCC"];

const patternCompletion: Generator = (ctx) => {
  const { rng } = ctx;
  const l3 = isL3(ctx);
  const template = pick(rng, strListParam(ctx, "patterns") ?? (l3 ? PATTERNS_L3 : PATTERNS_L1));
  const letters = [...new Set(template.split(""))];
  const chosen = sample(rng, PATTERN_EMOJI, Math.max(letters.length + 2, 4));
  const map = new Map<string, [string, string]>();
  letters.forEach((ch, i) => map.set(ch, chosen[i]));
  const unit = template.split("").map((ch) => map.get(ch) as [string, string]);
  const minLen = l3 ? Math.max(8, unit.length * 2) : Math.max(6, unit.length * 2);
  const shownLen = minLen + int(rng, 0, 2);
  const shown: [string, string][] = [];
  for (let i = 0; i < shownLen; i++) shown.push(unit[i % unit.length]);
  const answer = unit[shownLen % unit.length];
  const n = nOptions(ctx, 3, 4);
  const others = chosen.filter((e) => e[0] !== answer[0]);
  const built = assemble(rng, { emoji: answer[0] }, others.map((e) => ({ emoji: e[0] })), n);
  const names = unit.map((u) => u[1]).join(", ");
  const prompt = "What comes next in the pattern?";
  return choice(
    {
      prompt,
      display: { emoji: `${shown.map((s) => s[0]).join(" ")} ❓`, speak: speakFor(ctx, `${prompt} The pattern goes ${shown.map((s) => s[1]).join(", ")}, and then?`) },
      explain: `The pattern repeats "${names}" over and over. After ${shown[shownLen - 1][1]} comes ${answer[1]}.`,
      hint: "Say the pattern out loud and clap it: where does it start over? Find the part that repeats, then keep going.",
    },
    built
  );
};

// ---------------------------------------------------------------------------
// Verbal battery — from content/verbal-banks (analogies, classification, completion)
// ---------------------------------------------------------------------------

const PERM_CACHE = new Map<string, number[]>();

/** A fixed shuffled order of a bank (seeded by the bank name), so `params.attempt` walks every item before any repeat. */
function bankPermutation(bank: readonly VerbalItem[], name: string): number[] {
  const key = `${name}:${bank.length}`;
  let perm = PERM_CACHE.get(key);
  if (!perm) {
    perm = shuffle(
      mulberry32(hashString(`reasoning:${key}`)),
      bank.map((_, i) => i)
    );
    PERM_CACHE.set(key, perm);
  }
  return perm;
}

/** params.attempt → permutation walk; else params.seen (prompts) excluded; else a plain rng pick. */
function pickBankItem(ctx: GeneratorContext, bank: readonly VerbalItem[], name: string): VerbalItem {
  const attempt = numParam(ctx, "attempt", -1);
  if (attempt >= 0) return bank[bankPermutation(bank, name)[Math.floor(attempt) % bank.length]];
  const seen = strListParam(ctx, "seen");
  const pool = seen ? bank.filter((it) => !seen.includes(it.prompt) && !seen.includes(it.explain)) : bank;
  return pick(ctx.rng, pool.length ? pool : bank);
}

function bankFor(ctx: GeneratorContext, kind: "analogies" | "classification" | "completion"): { bank: readonly VerbalItem[]; name: string } {
  const lvl = isL3(ctx) ? 3 : 1;
  return { bank: VERBAL_BANKS[kind][lvl], name: `${kind}:${lvl}` };
}

function verbalChoice(ctx: GeneratorContext, item: VerbalItem, prompt: string, speakIntro: string): ChoiceQuestion {
  const l3 = isL3(ctx);
  const order = shuffle(
    ctx.rng,
    item.options.map((_, i) => i)
  );
  const options: Option[] = order.map((i) => {
    const o: Option = { label: item.options[i] };
    if (!l3 && item.emojis && item.emojis[i]) o.emoji = item.emojis[i];
    return o;
  });
  const words = order.map((i) => item.options[i]);
  const spoken = `${speakIntro} Is it ${words.slice(0, -1).join(", ")}, or ${words[words.length - 1]}?`;
  const q: ChoiceQuestion = {
    type: "choice",
    prompt,
    options,
    answerIndex: order.indexOf(item.answerIndex),
    explain: item.explain,
    hint: item.hint,
  };
  if (!l3) q.display = { speak: spoken };
  return q;
}

const verbalAnalogies: Generator = (ctx) => {
  const { bank, name } = bankFor(ctx, "analogies");
  const item = pickBankItem(ctx, bank, name);
  if (isL3(ctx)) return verbalChoice(ctx, item, `Finish the analogy:  ${item.prompt}`, "");
  return verbalChoice(ctx, item, item.prompt, item.prompt.replace(/_+\s*\.?/, "what?"));
};

const verbalClassification: Generator = (ctx) => {
  const { bank, name } = bankFor(ctx, "classification");
  const item = pickBankItem(ctx, bank, name);
  const isOdd = /^which one does not belong/i.test(item.prompt);
  if (isL3(ctx)) return verbalChoice(ctx, item, isOdd ? item.prompt : `Which word goes with these?  ${item.prompt}`, "");
  const words = item.prompt.split(/,\s*/);
  const listed = words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : item.prompt;
  const prompt = isOdd ? item.prompt : `Which one goes with ${listed}?`;
  return verbalChoice(ctx, item, prompt, prompt);
};

const sentenceCompletion: Generator = (ctx) => {
  const { bank, name } = bankFor(ctx, "completion");
  const item = pickBankItem(ctx, bank, name);
  if (isL3(ctx)) return verbalChoice(ctx, item, item.prompt, "");
  return verbalChoice(ctx, item, item.prompt, item.prompt.replace(/_+/, "something"));
};

// ---------------------------------------------------------------------------
// r.mentalRotation — the same figure turned (never flipped)
// ---------------------------------------------------------------------------

const mentalRotation: Generator = (ctx) => {
  const { rng } = ctx;
  const l3 = isL3(ctx);
  const shape = pick(rng, CHIRAL_SHAPES);
  const base: Figure = { shape, rot: int(rng, 0, 3), flip: l3 && rng() < 0.3, fill: pick(rng, [0, 2] as const), size: 1, count: 1, hue: int(rng, 0, 2) as 0 | 1 | 2 };
  const k = l3 ? pick(rng, [1, 2, 3]) : pick(rng, [1, 2]);
  const answer: Figure = { ...base, rot: (base.rot + k) % 4 };
  const mirrors = shuffle(
    rng,
    [0, 1, 2, 3].map((j) => ({ ...base, flip: !base.flip, rot: (base.rot + j) % 4 }))
  );
  const built = figureOptions(rng, answer, [mirrors], nOptions(ctx, 3, 4));
  const prompt = "Which picture is the SAME shape, just turned around (not flipped over)?";
  const turn = k === 2 ? "turned upside down" : k === 1 ? "turned a quarter turn to the right" : "turned a quarter turn to the left";
  return choice(
    {
      prompt,
      display: { svg: figureSvg(base), speak: speakFor(ctx, `${prompt} Imagine spinning the shape on the table.`) },
      explain: `Spinning a shape never turns it into its mirror image. The answer is the shape ${turn}. The other choices are flipped over, like a reflection in a mirror — you cannot get those by turning.`,
      hint: "Imagine putting your finger on the shape and spinning it on the table. A spin can never flip it over. Follow where the shape's 'foot' or 'flag' ends up.",
    },
    built
  );
};

// ---------------------------------------------------------------------------
// r.oddOneOut — emoji sets (which does not belong)
// ---------------------------------------------------------------------------

interface Category {
  id: string;
  one: string;
  many: string;
  members: [string, string][];
  near: string[];
}

function cat(id: string, one: string, many: string, members: string, near: string[] = []): Category {
  return { id, one, many, members: members.split("|").map((m) => [m.slice(0, m.indexOf(" ")), m.slice(m.indexOf(" ") + 1)] as [string, string]), near };
}

const CATEGORIES: readonly Category[] = [
  cat("fruit", "a fruit", "fruits", "🍎 apple|🍌 banana|🍇 grapes|🍓 strawberry|🍉 watermelon|🍊 orange|🍐 pear|🍒 cherries", ["vegetable", "sweet"]),
  cat("vegetable", "a vegetable", "vegetables", "🥕 carrot|🥦 broccoli|🌽 corn|🥔 potato|🧅 onion|🥒 cucumber|🫑 pepper", ["fruit"]),
  cat("farm", "a farm animal", "farm animals", "🐄 cow|🐖 pig|🐑 sheep|🐔 chicken|🐴 horse|🐐 goat|🦃 turkey", ["wild", "pet"]),
  cat("wild", "a wild animal", "wild animals", "🦁 lion|🐘 elephant|🦒 giraffe|🐯 tiger|🦓 zebra|🐻 bear|🦘 kangaroo", ["farm", "pet"]),
  cat("pet", "a pet", "pets", "🐶 dog|🐱 cat|🐹 hamster|🐰 rabbit|🐢 turtle|🐠 goldfish", ["farm", "wild"]),
  cat("sea", "a sea animal", "sea animals", "🐙 octopus|🦀 crab|🐬 dolphin|🦈 shark|🐳 whale|🦞 lobster|🐡 blowfish", ["bird", "farm"]),
  cat("bird", "a bird", "birds", "🦉 owl|🦅 eagle|🦆 duck|🐧 penguin|🦜 parrot|🦢 swan|🐦 robin", ["insect", "sea"]),
  cat("insect", "an insect", "insects", "🐝 bee|🐞 ladybug|🦋 butterfly|🐜 ant|🦗 cricket|🪲 beetle", ["bird"]),
  cat("land", "a land vehicle", "land vehicles", "🚗 car|🚌 bus|🚲 bicycle|🚂 train|🏍️ motorcycle|🚜 tractor|🚒 fire truck", ["boat", "air"]),
  cat("boat", "a boat", "boats", "⛵ sailboat|🚢 ship|🛶 canoe|🚤 speedboat|⛴️ ferry", ["land"]),
  cat("air", "something that flies", "things that fly in the sky", "✈️ airplane|🚁 helicopter|🚀 rocket|🎈 hot-air balloon|🛩️ small plane", ["land", "bird"]),
  cat("clothes", "something you wear", "clothes", "👕 shirt|👖 pants|🧥 coat|🧢 cap|🧦 socks|👗 dress|🧤 mittens|👟 sneaker", ["kitchen"]),
  cat("tool", "a tool", "tools", "🔨 hammer|🪚 saw|🔧 wrench|🪛 screwdriver|✂️ scissors|🪜 ladder", ["kitchen", "school"]),
  cat("kitchen", "something from the kitchen", "kitchen things", "🍴 fork|🥄 spoon|🔪 knife|🍳 frying pan|🥣 bowl|☕ cup|🫖 teapot", ["tool", "furniture"]),
  cat("sport", "something for sports", "sports things", "⚽ soccer ball|🏀 basketball|⚾ baseball|🎾 tennis ball|🏈 football|🏐 volleyball|🏒 hockey stick", ["instrument"]),
  cat("instrument", "a musical instrument", "musical instruments", "🎸 guitar|🥁 drum|🎺 trumpet|🎻 violin|🎹 piano|🪈 flute|🪗 accordion", ["sport", "tool"]),
  cat("weather", "a kind of weather", "kinds of weather", "☀️ sun|🌧️ rain|⛈️ storm|🌨️ snow|🌈 rainbow|🌪️ tornado|☁️ cloud", ["space"]),
  cat("space", "something in space", "things in space", "🌙 moon|⭐ star|🪐 planet|☄️ comet|🌍 Earth|🛰️ satellite", ["weather"]),
  cat("school", "a school thing", "school things", "✏️ pencil|📚 books|🎒 backpack|📏 ruler|🖍️ crayon|📐 set square|🖊️ pen", ["tool"]),
  cat("furniture", "a piece of furniture", "furniture", "🛏️ bed|🪑 chair|🛋️ couch|🗄️ cabinet|🪞 mirror", ["kitchen"]),
  cat("body", "a body part", "body parts", "👂 ear|👃 nose|👁️ eye|🦶 foot|✋ hand|🦷 tooth|👅 tongue"),
  cat("sweet", "a sweet treat", "sweet treats", "🍪 cookie|🍩 donut|🍰 cake|🍭 lollipop|🍫 chocolate|🧁 cupcake|🍬 candy", ["fruit"]),
  cat("flower", "a flower", "flowers", "🌹 rose|🌻 sunflower|🌷 tulip|🌼 daisy|🌺 hibiscus", ["vegetable"]),
];

const oddOneOut: Generator = (ctx) => {
  const { rng } = ctx;
  const l3 = isL3(ctx);
  const a = pick(rng, CATEGORIES);
  const nearPool = CATEGORIES.filter((c) => c.id !== a.id && (a.near.includes(c.id) || c.near.includes(a.id)));
  const farPool = CATEGORIES.filter((c) => c.id !== a.id && !a.near.includes(c.id) && !c.near.includes(a.id));
  const b = l3 && nearPool.length ? pick(rng, nearPool) : pick(rng, farPool.length ? farPool : nearPool);
  const same = sample(rng, a.members, 3);
  const odd = pick(rng, b.members);
  const built = assemble(rng, { emoji: odd[0], label: odd[1] }, same.map((m) => ({ emoji: m[0], label: m[1] })), 4);
  const prompt = "Which one does NOT belong with the others?";
  return choice(
    {
      prompt,
      display: { speak: speakFor(ctx, `${prompt} ${built.options.map((o) => o.label).join(", ")}.`) },
      explain: `${cap(odd[1])} is ${b.one}. The other three are ${a.many}: ${same[0][1]}, ${same[1][1]} and ${same[2][1]}.`,
      hint: "Name each picture out loud. Three of them are the same KIND of thing. Which one is a different kind?",
    },
    built
  );
};

// ---------------------------------------------------------------------------
// r.sudoku4 — 4×4 mini sudoku, fill the ? cell
// ---------------------------------------------------------------------------

const SUDOKU_EMOJI: readonly (readonly string[])[] = [
  ["🍎", "🍌", "🍇", "🍓"],
  ["🐶", "🐱", "🐰", "🐸"],
  ["⭐", "🌙", "☀️", "☁️"],
  ["🔴", "🔵", "🟢", "🟡"],
  ["🚗", "🚌", "🚲", "🚂"],
];

function sudokuSolution(rng: Rng): number[][] {
  const base = [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1],
  ];
  const rowOrder = shuffle(rng, [0, 1]).flatMap((b) => shuffle(rng, [0, 1]).map((r) => b * 2 + r));
  const colOrder = shuffle(rng, [0, 1]).flatMap((s) => shuffle(rng, [0, 1]).map((c) => s * 2 + c));
  const digits = shuffle(rng, [1, 2, 3, 4]);
  let g = rowOrder.map((r) => colOrder.map((c) => digits[base[r][c] - 1]));
  if (rng() < 0.5) g = [0, 1, 2, 3].map((c) => [0, 1, 2, 3].map((r) => g[r][c]));
  return g;
}

const sudoku4: Generator = (ctx) => {
  const { rng } = ctx;
  const l3 = isL3(ctx);
  const symbolsKind = strParam(ctx, "symbols", l3 ? "digits" : "emoji");
  const syms = symbolsKind === "digits" ? ["1", "2", "3", "4"] : pick(rng, SUDOKU_EMOJI).slice();
  const sol = sudokuSolution(rng);
  const tr = int(rng, 0, 3);
  const tc = int(rng, 0, 3);
  const others = shuffle(
    rng,
    [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => [r, c])).filter(([r, c]) => r !== tr || c !== tc)
  );
  let blanks = others.slice(0, Math.max(0, Math.floor(numParam(ctx, "blanks", l3 ? int(rng, 5, 7) : int(rng, 1, 3)))));
  const peers = (bl: number[][]) => {
    const hidden = (r: number, c: number) => bl.some(([br, bc]) => br === r && bc === c);
    const row: number[] = [];
    const col: number[] = [];
    const box: number[] = [];
    for (let i = 0; i < 4; i++) {
      if (i !== tc && !hidden(tr, i)) row.push(sol[tr][i]);
      if (i !== tr && !hidden(i, tc)) col.push(sol[i][tc]);
    }
    const br = Math.floor(tr / 2) * 2;
    const bc = Math.floor(tc / 2) * 2;
    for (let r = br; r < br + 2; r++) for (let c = bc; c < bc + 2; c++) if ((r !== tr || c !== tc) && !hidden(r, c)) box.push(sol[r][c]);
    return { row, col, box, all: new Set([...row, ...col, ...box]) };
  };
  while (blanks.length > 0 && peers(blanks).all.size < 3) blanks = blanks.slice(0, -1);
  const p = peers(blanks);
  const answer = sol[tr][tc];
  const grid = sol.map((row, r) => row.map((d, c) => (r === tr && c === tc ? "?" : blanks.some(([br, bc]) => br === r && bc === c) ? "" : syms[d - 1])));
  const name = (d: number) => syms[d - 1];
  const list = (ds: number[]) => (ds.length ? [...new Set(ds)].map(name).join(" ") : "nothing yet");
  const thing = symbolsKind === "digits" ? "number" : "picture";
  const prompt = `Which ${thing} goes in the ? box?`;
  return choice(
    {
      prompt,
      display: { grid, speak: speakFor(ctx, `${prompt} Every row and every column needs each ${thing} exactly once.`) },
      explain: `Every row, every column and every 2×2 box must have ${syms.join(" ")} exactly once. The ?'s row already has ${list(p.row)}, its column has ${list(p.col)} and its box has ${list(p.box)}. The only one missing is ${name(answer)}.`,
      hint: `Look along the ?'s row and down its column. Cross off every ${thing} you see there. Whatever is left over is the answer.`,
    },
    { options: syms.map((s) => (symbolsKind === "digits" ? { label: s } : { emoji: s })), answerIndex: answer - 1 }
  );
};

// ---------------------------------------------------------------------------
// r.logicGrid — three clues, who has which (deduction)
// ---------------------------------------------------------------------------

const KID_NAMES = ["Ava", "Ben", "Cara", "Dev", "Ella", "Finn", "Gus", "Hana", "Ivy", "Jay", "Kim", "Leo", "Mia", "Noah", "Omar", "Pia", "Ria", "Sam", "Tess", "Uma"];

interface LogicTheme {
  items: [string, string][];
  has: (k: string, p: string) => string;
  hasNot: (k: string, p: string) => string;
  neither: (k1: string, k2: string, p: string) => string;
  ask: (k: string) => string;
  the: (p: string) => string;
  must: (k: string, p: string) => string;
}

const LOGIC_THEMES: readonly LogicTheme[] = [
  {
    items: [["🐶", "dog"], ["🐱", "cat"], ["🐟", "fish"], ["🐰", "rabbit"], ["🐹", "hamster"], ["🐢", "turtle"], ["🐦", "bird"]],
    has: (k, p) => `${k} has the ${p}.`,
    hasNot: (k, p) => `${k} does not have the ${p}.`,
    neither: (k1, k2, p) => `Neither ${k1} nor ${k2} has the ${p}.`,
    ask: (k) => `Which pet does ${k} have?`,
    the: (p) => `the ${p}`,
    must: (k, p) => `${k} must have the ${p}`,
  },
  {
    items: [["🍎", "apple"], ["🍌", "banana"], ["🍇", "grapes"], ["🍓", "strawberry"], ["🍉", "watermelon"], ["🍊", "orange"]],
    has: (k, p) => `${k}'s favorite fruit is the ${p}.`,
    hasNot: (k, p) => `${k}'s favorite fruit is not the ${p}.`,
    neither: (k1, k2, p) => `Neither ${k1} nor ${k2} picked the ${p}.`,
    ask: (k) => `Which fruit is ${k}'s favorite?`,
    the: (p) => `the ${p}`,
    must: (k, p) => `${k}'s favorite must be the ${p}`,
  },
  {
    items: [["⚽", "soccer"], ["🏀", "basketball"], ["⚾", "baseball"], ["🎾", "tennis"], ["🏊", "swimming"], ["🥋", "karate"]],
    has: (k, p) => `${k} does ${p}.`,
    hasNot: (k, p) => `${k} does not do ${p}.`,
    neither: (k1, k2, p) => `Neither ${k1} nor ${k2} does ${p}.`,
    ask: (k) => `Which sport does ${k} do?`,
    the: (p) => p,
    must: (k, p) => `${k} must do ${p}`,
  },
];

interface Clue {
  kind: "pos" | "neg" | "neither";
  kids: number[];
  item: number;
}

const PERMS3 = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

function clueHolds(c: Clue, perm: readonly number[]): boolean {
  if (c.kind === "pos") return perm[c.kids[0]] === c.item;
  return c.kids.every((k) => perm[k] !== c.item);
}

const logicGrid: Generator = (ctx) => {
  const { rng } = ctx;
  const l3 = isL3(ctx);
  const theme = pick(rng, LOGIC_THEMES);
  const kids = sample(rng, KID_NAMES, 3);
  const items = sample(rng, theme.items, 3);
  const perm = pick(rng, PERMS3); // kid i has items[perm[i]]
  const q = int(rng, 0, 2);
  const cands: Clue[] = [];
  for (let k = 0; k < 3; k++) {
    cands.push({ kind: "pos", kids: [k], item: perm[k] });
    for (let p = 0; p < 3; p++) if (perm[k] !== p) cands.push({ kind: "neg", kids: [k], item: p });
  }
  if (l3) for (let p = 0; p < 3; p++) cands.push({ kind: "neither", kids: [0, 1, 2].filter((k) => perm[k] !== p), item: p });
  const pool = shuffle(rng, cands);
  let clues: Clue[] | null = null;
  const maxPos = l3 ? 1 : 2;
  outer: for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++)
      for (let k = j + 1; k < pool.length; k++) {
        const set = [pool[i], pool[j], pool[k]];
        if (set.filter((c) => c.kind === "pos").length > maxPos) continue;
        if (set.some((c) => c.kind === "pos" && c.kids[0] === q)) continue;
        if (set.some((c) => c.kind === "neither" && c.kids.includes(q) && set.some((d) => d !== c && d.kind === "neither" && d.kids.includes(q)))) continue;
        const fits = PERMS3.filter((pp) => set.every((c) => clueHolds(c, pp)));
        const everyClueMatters = set.every((c) => PERMS3.filter((pp) => set.filter((d) => d !== c).every((d) => clueHolds(d, pp))).length > fits.length);
        if (fits.length === 1 && fits[0] === perm && everyClueMatters) {
          clues = set;
          break outer;
        }
      }
  if (!clues) {
    const other = [0, 1, 2].filter((k) => k !== q);
    clues = [
      { kind: "pos", kids: [other[0]], item: perm[other[0]] },
      { kind: "neg", kids: [q], item: perm[other[1]] },
      { kind: "neg", kids: [other[1]], item: perm[q] },
    ];
  }
  const clueText = (c: Clue) => {
    const p = items[c.item][1];
    if (c.kind === "pos") return theme.has(kids[c.kids[0]], p);
    if (c.kind === "neg") return theme.hasNot(kids[c.kids[0]], p);
    return theme.neither(kids[c.kids[0]], kids[c.kids[1]], p);
  };
  // deduction chain for the explanation
  const possible = [0, 1, 2].map(() => new Set([0, 1, 2]));
  for (const c of clues) {
    if (c.kind === "pos") {
      possible[c.kids[0]] = new Set([c.item]);
      for (let k = 0; k < 3; k++) if (k !== c.kids[0]) possible[k].delete(c.item);
    } else for (const k of c.kids) possible[k].delete(c.item);
  }
  const steps: string[] = [];
  const assigned = new Set<number>();
  clues.forEach((c, i) => {
    if (c.kind !== "pos") return;
    assigned.add(c.kids[0]);
    steps.push(`Clue ${i + 1} tells us ${theme.has(kids[c.kids[0]], items[c.item][1]).replace(/\.$/, "")}`);
  });
  for (let guard = 0; guard < 6 && assigned.size < 3; guard++) {
    let moved = false;
    for (let k = 0; k < 3; k++) {
      if (assigned.has(k) || possible[k].size !== 1) continue;
      const it = [...possible[k]][0];
      assigned.add(k);
      steps.push(`${theme.must(kids[k], items[it][1])} (it is the only one left for ${kids[k]})`);
      for (let o = 0; o < 3; o++) if (o !== k) possible[o].delete(it);
      moved = true;
    }
    for (let it = 0; it < 3 && !moved; it++) {
      const who = [0, 1, 2].filter((k) => !assigned.has(k) && possible[k].has(it));
      if (who.length === 1 && !assigned.has(who[0])) {
        assigned.add(who[0]);
        possible[who[0]] = new Set([it]);
        steps.push(`${theme.must(kids[who[0]], items[it][1])} (nobody else can)`);
        for (let o = 0; o < 3; o++) if (o !== who[0]) possible[o].delete(it);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const answerItem = items[perm[q]];
  const built = assemble(rng, { emoji: answerItem[0], label: answerItem[1] }, items.filter((_, i) => i !== perm[q]).map((it) => ({ emoji: it[0], label: it[1] })), 3);
  const prompt = `${clues.map((c, i) => `${i + 1}) ${clueText(c)}`).join("  ")}  ${theme.ask(kids[q])}`;
  return choice(
    {
      prompt,
      display: { emoji: items.map((it) => it[0]).join("  "), speak: speakFor(ctx, prompt) },
      explain: `${steps.length ? steps.join(". ") + ". " : ""}So the answer is ${theme.the(answerItem[1])}.`,
      hint: `Make a little chart: ${kids.join(", ")} across the top, ${items.map((it) => it[1]).join(", ")} down the side. Put an X for every "not". When a row or column has only one empty box left, that is the answer.`,
    },
    built
  );
};

// ---------------------------------------------------------------------------

export const generators: Record<string, Generator> = {
  "r.numberSeries": numberSeries,
  "r.numberAnalogies": numberAnalogies,
  "r.numberPuzzles": numberPuzzles,
  "r.figureMatrix": figureMatrix,
  "r.figureClassification": figureClassification,
  "r.figureSeries": figureSeries,
  "r.paperFolding": paperFolding,
  "r.patternCompletion": patternCompletion,
  "r.verbalAnalogies": verbalAnalogies,
  "r.verbalClassification": verbalClassification,
  "r.sentenceCompletion": sentenceCompletion,
  "r.mentalRotation": mentalRotation,
  "r.oddOneOut": oddOneOut,
  "r.sudoku4": sudoku4,
  "r.logicGrid": logicGrid,
};
