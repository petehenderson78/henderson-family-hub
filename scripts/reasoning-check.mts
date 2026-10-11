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
 */

import { register } from "node:module";
import type { ChoiceQuestion, Option, Question } from "../src/lib/learn/types";

register("./ts-resolve-hooks.mjs", import.meta.url);

const reasoningMod = await import("../src/lib/learn/generators/reasoning");
const rngMod = await import("../src/lib/learn/rng");
const catalogMod = await import("../src/lib/learn/catalog-reasoning");
const banksMod = await import("../src/lib/learn/content/verbal-banks");

const { generators } = reasoningMod;
const { mulberry32, hashString } = rngMod;
const { REASONING_SKILLS } = catalogMod;
const { VERBAL_BANKS } = banksMod;

const SEEDS = 300;
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
      // determinism
      const again = JSON.stringify(gen({ rng: mulberry32(seed), level }));
      assert(again === JSON.stringify(q), tag, "not deterministic for the same seed");
    }
    const total = [...positions.values()].reduce((a, b) => a + b, 0);
    const maxShare = Math.max(...[...positions.values()].map((v) => v / Math.max(1, total)));
    assert(maxShare <= MAX_POSITION_SHARE, where, `answer position skew: one position holds ${(maxShare * 100).toFixed(0)}% of items`);
    const minOptions = Math.min(...optionCounts);
    assert(positions.size >= minOptions, where, `answers never land on some positions (${positions.size} of ${minOptions})`);
    assert(prompts.size > SEEDS / 10, where, `low variety: only ${prompts.size} distinct items`);
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
