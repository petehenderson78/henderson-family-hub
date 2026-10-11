/**
 * Math content regressions: `node scripts/math-regressions.mts`.
 *
 * Plain Node 22+ (built-in TypeScript type stripping) with the repo's resolve
 * hook (./ts-resolve-hooks.mjs) for extension-less relative imports.
 *
 * One probe per fixed content-review finding (ME-01..ME-17 in math-early.ts /
 * math-util.ts, MU-07 and MU-08 in math-util.ts). Each probe builds 2,000
 * seeded questions for the affected skill(s) and checks the specific property
 * the finding broke, recomputing the answer independently from the prompt
 * wherever the prompt carries the numbers. Exits 1 with a readable report on
 * any failure.
 */

import { register } from "node:module";
import type { ChoiceQuestion, Question, Skill, TextQuestion } from "../src/lib/learn/types";

register("./ts-resolve-hooks.mjs", import.meta.url);

const generatorsMod = await import("../src/lib/learn/generators/index");
const earlyMod = await import("../src/lib/learn/generators/math-early");
const utilMod = await import("../src/lib/learn/generators/math-util");
const upperMod = await import("../src/lib/learn/generators/math-upper");
const upperFracMod = await import("../src/lib/learn/generators/math-upper-frac");
const upperGeoMod = await import("../src/lib/learn/generators/math-upper-geo");
const rngMod = await import("../src/lib/learn/rng");
const catalogMod = await import("../src/lib/learn/catalog");
const gradeMod = await import("../src/lib/learn/grade");

const { makeQuestion } = generatorsMod;
const early = earlyMod.generators;
const { columnSubExplain, fracAccept } = utilMod;
const { mulberry32, hashString } = rngMod;
const { CATALOG } = catalogMod;
const { gradeAnswer } = gradeMod;

const SEEDS = 2000;

// ---------------------------------------------------------------------------
// harness
// ---------------------------------------------------------------------------

interface ProbeResult {
  id: string;
  title: string;
  checked: number;
  failures: string[];
  error?: string;
}

const results: ProbeResult[] = [];

function seeds(tag: string): number[] {
  return Array.from({ length: SEEDS }, (_, i) => hashString(`math-regressions:${tag}:${i}`));
}

function skill(id: string): Skill {
  const s = CATALOG.find((x: Skill) => x.id === id);
  if (!s) throw new Error(`skill ${id} not in the catalog`);
  return s;
}

/**
 * Run `check` on 2,000 questions per skill. `check` returns undefined when the
 * question is not the kind the probe is about, true when it passes, or a
 * failure message. A probe must actually see at least `minChecked` relevant items.
 */
function probe(id: string, title: string, skills: string[], check: (q: Question, skillId: string) => true | string | undefined, minChecked = 50) {
  const r: ProbeResult = { id, title, checked: 0, failures: [] };
  try {
    for (const sid of skills) {
      const sk = skill(sid);
      for (const seed of seeds(`${id}:${sid}`)) {
        const q = makeQuestion(sk, seed);
        const out = check(q, sid);
        if (out === undefined) continue;
        r.checked += 1;
        if (out !== true && r.failures.length < 5) r.failures.push(`${sid} seed ${seed}: ${out}`);
        else if (out !== true) r.failures.push("");
      }
    }
    if (r.checked < minChecked) r.failures.push(`only ${r.checked} relevant items seen (expected ≥ ${minChecked}) — the probe is not exercising the fix`);
  } catch (err) {
    r.error = err instanceof Error ? err.message : String(err);
  }
  results.push(r);
}

/** Same as probe(), for a direct generator / helper call per seed. */
function probeDirect(id: string, title: string, run: (seed: number) => true | string | undefined, minChecked = 50) {
  const r: ProbeResult = { id, title, checked: 0, failures: [] };
  try {
    for (const seed of seeds(id)) {
      const out = run(seed);
      if (out === undefined) continue;
      r.checked += 1;
      if (out !== true && r.failures.length < 5) r.failures.push(`seed ${seed}: ${out}`);
      else if (out !== true) r.failures.push("");
    }
    if (r.checked < minChecked) r.failures.push(`only ${r.checked} relevant items seen (expected ≥ ${minChecked})`);
  } catch (err) {
    r.error = err instanceof Error ? err.message : String(err);
  }
  results.push(r);
}

function choiceLabels(q: Question): string[] {
  return q.type === "choice" ? q.options.map((o) => o.label ?? "") : [];
}

function answerLabel(q: Question): string {
  return q.type === "choice" ? (q.options[q.answerIndex]?.label ?? "") : "";
}

function svgsOf(q: Question): string[] {
  const out: string[] = [];
  if (q.display?.svg) out.push(q.display.svg);
  if (q.type === "choice") for (const o of q.options) if (o.svg) out.push(o.svg);
  return out;
}

// ---------------------------------------------------------------------------
// ME-01 — dollar notation never needs a carry ($1.108)
// ---------------------------------------------------------------------------

probe("ME-01", "coin total in dollar notation is 0-99¢ and written $D.CC", ["m2.m.money"], (q) => {
  const m = q.prompt.match(/has (\d+) dollars? and (\d+)¢\. How do we write that with a dollar sign\?/);
  if (!m) return undefined;
  const dollars = Number(m[1]);
  const cents = Number(m[2]);
  if (cents > 99) return `prompt says ${cents}¢ (needs a carry)`;
  const want = `$${dollars}.${String(cents).padStart(2, "0")}`;
  if (answerLabel(q) !== want) return `answer "${answerLabel(q)}", expected ${want}`;
  if (choiceLabels(q).filter((l) => l === want).length !== 1) return "correct label is not unique";
  if (!q.explain.includes(want)) return "explanation does not show the answer";
  return true;
});

// ---------------------------------------------------------------------------
// ME-02 — picture / bar graphs: exactly one correct category; no "0 more"
// ---------------------------------------------------------------------------

/** Category values from a picture-graph grid (each emoji = scale). */
function gridValues(q: Question): Map<string, number> | null {
  const grid = q.display?.grid;
  if (!grid) return null;
  const key = grid.find((r) => r[0] === "Key");
  const scale = key ? Number(key[1].split("=")[1]) : 1;
  const out = new Map<string, number>();
  for (const [label, pics] of grid) if (label !== "Key") out.set(label, [...pics].length * scale);
  return out;
}

/** Bar heights from a bar-graph SVG, in category order (equal value ⇔ equal height). */
function barHeights(q: Question): number[] {
  const svg = q.display?.svg ?? "";
  return [...svg.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="([\d.]+)" fill="#/g)].map((m) => Number(m[1]));
}

function barLabels(q: Question): string[] {
  const svg = q.display?.svg ?? "";
  return [...svg.matchAll(/<text x="[\d.]+" y="(?:80|88)"[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
}

probe("ME-02", "graph questions have exactly one correct option and non-zero differences", ["m1.dl.graph", "m2.dl.bargraph", "m2.dl.concepts", "m3.dl.scaled"], (q) => {
  if (/no, the smallest/.test(q.explain)) return `contradictory explanation: ${q.explain}`;
  const more = q.prompt.match(/How many more chose (.+) than (.+)\?$/);
  const which = q.prompt.match(/Which category has (\d+)\?$/);
  const ext = q.prompt.match(/Which was chosen the (most|least)\?$/);
  if (!more && !which && !ext) return undefined;
  const grid = gridValues(q);
  let vals: Map<string, number>;
  if (grid) vals = grid;
  else {
    const hs = barHeights(q);
    const ls = barLabels(q);
    if (hs.length === 0 || hs.length !== ls.length) return `could not read the bar graph (${hs.length} bars, ${ls.length} labels)`;
    vals = new Map(ls.map((l, i) => [l, hs[i]]));
  }
  if (more) {
    if (q.type !== "numeric") return "not numeric";
    if (q.answer <= 0) return `"how many more" answer is ${q.answer}`;
    if (grid) {
      const want = (vals.get(more[1]) ?? NaN) - (vals.get(more[2]) ?? NaN);
      if (want !== q.answer) return `answer ${q.answer}, recomputed ${want}`;
    }
    return true;
  }
  const ans = answerLabel(q);
  if (which) {
    if (grid) {
      const n = Number(which[1]);
      const hits = [...vals].filter(([, v]) => v === n).map(([l]) => l);
      if (hits.length !== 1 || hits[0] !== ans) return `categories with ${n}: [${hits.join(", ")}], answer ${ans}`;
    } else {
      const h = vals.get(ans);
      const same = [...vals.values()].filter((v) => v === h).length;
      if (same !== 1) return `${same} bars share the answer's height`;
    }
    return true;
  }
  if (ext) {
    const all = [...vals.values()];
    const target = ext[1] === "most" ? Math.max(...all) : Math.min(...all);
    const hits = [...vals].filter(([, v]) => v === target).map(([l]) => l);
    if (hits.length !== 1 || hits[0] !== ans) return `${ext[1]}: [${hits.join(", ")}] tie or mismatch, answer ${ans}`;
    return true;
  }
  return undefined;
});

// ---------------------------------------------------------------------------
// ME-03 / ME-09 — a square is also a rectangle and a rhombus
// ---------------------------------------------------------------------------

/** shapesAttributes draws a square as a bare 4-point polygon (rhombus/trapezoid are wrapped in <g>). */
function isSquareSvg(svg: string): boolean {
  if (svg.includes("<g ")) return false;
  const m = svg.match(/<polygon points="([^"]+)"/);
  return !!m && m[1].trim().split(/\s+/).length === 4 && !svg.includes("<line");
}

probeDirect("ME-03", "\"Which shape is a rectangle/rhombus?\" never offers a square", (seed) => {
  const q = early.shapesAttributes({ rng: mulberry32(seed), level: 3 });
  const m = q.prompt.match(/^Which shape is a (rectangle|rhombus)\?$/);
  if (!m || q.type !== "choice") return undefined;
  const squares = q.options.filter((o) => o.svg && isSquareSvg(o.svg)).length;
  if (squares > 0) return `"${q.prompt}" offers a square (also a ${m[1]})`;
  if (q.options[q.answerIndex]?.svg && isSquareSvg(q.options[q.answerIndex].svg as string)) return "answer is a square";
  return true;
}, 100);

probe("ME-09", "\"NOT a rectangle\" is never the square; a square is never named against rectangle/rhombus", ["m1.g.attributes", "m2.g.shapes"], (q) => {
  if (q.type !== "choice") return undefined;
  if (/^Which one is NOT a rectangle\?$/.test(q.prompt)) {
    const svg = q.options[q.answerIndex]?.svg ?? "";
    return isSquareSvg(svg) || /The square is different/.test(q.explain) ? "the square is marked as not a rectangle" : true;
  }
  if (/^(What shape is this|What is the name of this shape)\?$/.test(q.prompt) && answerLabel(q) === "square") {
    const bad = choiceLabels(q).filter((l) => l === "rectangle" || l === "rhombus");
    return bad.length ? `a square with "${bad.join(", ")}" offered as wrong` : true;
  }
  return undefined;
}, 50);

// ---------------------------------------------------------------------------
// ME-04 — within-10 subtraction never asks t − t
// ---------------------------------------------------------------------------

probe("ME-04", "m1.oa.sub10: t − s with 0 < s < t, answer recomputed, no \"0 jumps\"", ["m1.oa.sub10"], (q) => {
  const m = q.prompt.match(/^(\d+) − (\d+) = \?$/);
  if (!m || q.type !== "numeric") return undefined;
  const t = Number(m[1]);
  const s = Number(m[2]);
  if (s >= t || s < 1) return `${t} − ${s}`;
  if (q.answer !== t - s) return `answer ${q.answer}, expected ${t - s}`;
  if (/\b0 jumps\b|1 jumps/.test(q.explain)) return q.explain;
  return true;
});

// ---------------------------------------------------------------------------
// ME-05 — fewest bills
// ---------------------------------------------------------------------------

function parseBills(label: string): { value: number; count: number; ok: boolean } {
  let value = 0;
  let count = 0;
  let ok = true;
  for (const term of label.split(" + ")) {
    const m = term.match(/^(\d+) (ten|tens|five|fives|one|ones)$/);
    if (!m) return { value: NaN, count: NaN, ok: false };
    const n = Number(m[1]);
    if (n === 0) ok = false;
    if ((n === 1) !== !m[2].endsWith("s")) ok = false;
    value += n * (m[2].startsWith("ten") ? 10 : m[2].startsWith("five") ? 5 : 1);
    count += n;
  }
  return { value, count, ok };
}

probe("ME-05", "fewest-bills: $6-$19, one option makes the amount with the fewest bills, clean labels", ["m1.m.dollars"], (q) => {
  const m = q.prompt.match(/^Which bills make exactly \$(\d+) with the fewest bills\?$/);
  if (!m || q.type !== "choice") return undefined;
  const amt = Number(m[1]);
  if (amt > 19) return `$${amt} — one $20 bill would be fewest`;
  const fewest = Math.floor(amt / 10) + Math.floor((amt % 10) / 5) + (amt % 5);
  const parsed = choiceLabels(q).map((l) => ({ l, ...parseBills(l) }));
  const bad = parsed.find((p) => !p.ok);
  if (bad) return `badly formed option "${bad.l}"`;
  const winners = parsed.filter((p) => p.value === amt && p.count === fewest);
  if (winners.length !== 1 || winners[0].l !== answerLabel(q)) return `fewest-bill options [${winners.map((w) => w.l).join("; ")}], answer "${answerLabel(q)}"`;
  if (parsed.some((p) => p.value === amt && p.count < fewest)) return "an option beats the greedy answer";
  const sum = [...q.explain.matchAll(/\$(\d+)(?= [+=])/g)].reduce((s, x) => s + Number(x[1]), 0);
  if (sum !== amt) return `explanation bills add to $${sum}: ${q.explain}`;
  return true;
});

// ---------------------------------------------------------------------------
// ME-06 — near doubles stay within 20 and the picture shows every dot
// ---------------------------------------------------------------------------

probe("ME-06", "m1.oa.doubles: sums ≤ 20, ten-frame dots = a + b", ["m1.oa.doubles"], (q) => {
  if (q.type !== "numeric") return undefined;
  if (q.answer > 20) return `${q.prompt} = ${q.answer} in a within-20 skill`;
  const m = q.prompt.match(/^(\d+) \+ (\d+) = \?$/);
  if (!m) return true;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a + b !== q.answer) return `answer ${q.answer}, expected ${a + b}`;
  const dots = (q.display?.svg?.match(/<circle/g) ?? []).length;
  return dots === a + b ? true : `${dots} dots drawn for ${a} + ${b}`;
});

// ---------------------------------------------------------------------------
// ME-07 — compare: biggest place first, then the next place on a tie
// ---------------------------------------------------------------------------

const PLACE_OF: Record<string, number> = { ones: 1, tens: 10, hundreds: 100, thousands: 1000 };

probe("ME-07", "compare explanations start at the biggest place and name tied places", ["m1.nbt.compare", "m2.nbt.compare"], (q) => {
  const m = q.explain.match(/so (\d+) > (\d+)\./);
  if (!m) return undefined;
  const big = Number(m[1]);
  const small = Number(m[2]);
  if (big <= small) return `claims ${big} > ${small}`;
  if (String(big).length !== String(small).length) return true;
  const top = 10 ** (String(big).length - 1);
  let decide = top;
  while (decide >= 1 && Math.floor(big / decide) % 10 === Math.floor(small / decide) % 10) decide /= 10;
  const first = q.explain.match(/Compare the (\w+) first/);
  const tie = q.explain.match(/Both have (.+?), so compare the next place, the (\w+):/);
  if (first) return PLACE_OF[first[1]] === top && decide === top ? true : `"Compare the ${first[1]} first" for ${big} vs ${small}`;
  if (tie) {
    if (decide === top) return `says the top place ties for ${big} vs ${small}`;
    if (PLACE_OF[tie[2]] !== decide) return `decides on the ${tie[2]} for ${big} vs ${small}`;
    return true;
  }
  return `no place comparison: ${q.explain}`;
});

// ---------------------------------------------------------------------------
// ME-08 / MU-08 — column subtraction never shows a negative digit
// ---------------------------------------------------------------------------

/** Recompute every "x − y = z" in a column explanation and the digits it writes. */
function checkColumnSub(a: number, b: number, text: string): true | string {
  if (/(^|[^\d,])-\d/.test(text)) return `negative digit: ${text}`;
  const fin = text.match(/\. ([\d,]+) − ([\d,]+) = ([\d,]+)\.$/);
  if (!fin) return `no final sentence: ${text}`;
  const num = (x: string) => Number(x.replace(/,/g, ""));
  if (num(fin[1]) !== a || num(fin[2]) !== b || num(fin[3]) !== a - b) return `final sentence "${fin[0]}" for ${a} − ${b}`;
  const body = text.replace(/^Line up the places and subtract from the ones\. /, "").slice(0, -fin[0].length + 1);
  for (const m of body.matchAll(/(?<![\d,])(\d+) − (\d+) = (\d+)/g)) {
    if (Number(m[1]) - Number(m[2]) !== Number(m[3])) return `bad step "${m[0]}"`;
  }
  const steps = body.split("; ").filter((s) => /^[a-z-]+(?: \([^)]*\))?: /.test(s));
  const digits = steps.map((s) => Number(s.match(/= (\d+)\.?$/)?.[1] ?? NaN));
  const got = digits.reduce((acc, d, i) => acc + d * 10 ** i, 0);
  if (got !== a - b) return `column digits make ${got}, expected ${a - b}`;
  for (const s of steps) {
    const now = s.match(/^[a-z-]+ \((?:(\d) lent 1|the 0 became 10 and lent 1), so now (\d)\)/);
    if (now && now[1] !== undefined && Number(now[2]) !== Number(now[1]) - 1) return `bad lend "${s}"`;
    if (now && now[1] === undefined && now[2] !== "9") return `bad zero lend "${s}"`;
  }
  return true;
}

probe("ME-08", "sub3Digit column explanation: no negative digits, every step recomputed", ["m2.nbt.sub1000"], (q) => {
  const m = q.prompt.match(/^(\d+) − (\d+) = \?$/);
  if (!m || q.type !== "numeric") return undefined;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (q.answer !== a - b) return `answer ${q.answer}, expected ${a - b}`;
  return checkColumnSub(a, b, q.explain);
});

probeDirect("MU-08", "columnSubExplain(a, b) for random a ≥ b up to 6 digits (zeros forced in)", (seed) => {
  const rng = mulberry32(seed);
  const len = 3 + Math.floor(rng() * 4);
  let s = String(1 + Math.floor(rng() * 9));
  for (let i = 1; i < len; i++) s += rng() < 0.4 ? "0" : String(Math.floor(rng() * 10));
  const a = Number(s);
  const b = Math.floor(rng() * (a + 1));
  return checkColumnSub(a, b, columnSubExplain(a, b));
}, 2000);

probe("MU-08", "math-upper subtraction items (Zero Buster, 3-digit) use the same column explanation", ["m4.nbt.sub", "m3.nbt.addsub1000"], (q) => {
  const m = q.prompt.match(/^([\d,]+) − ([\d,]+) = \?$/);
  if (!m || !q.explain.startsWith("Line up the places and subtract")) return undefined;
  return checkColumnSub(Number(m[1].replace(/,/g, "")), Number(m[2].replace(/,/g, "")), q.explain);
}, 100);

// ---------------------------------------------------------------------------
// ME-10 — length stories: ribbon verbs and the unit on every number
// ---------------------------------------------------------------------------

const SCENE_VERBS = /\b(picks|wins|earns|gets|finds|collects|sets out|buys|brings|bakes|feeds|gives away|gives to friends|hands out|lends out|kicks|puts away|trades away|sells)\b/;

probe("ME-10", "m2.m.wp.length: every number carries a unit, no item-scene verbs or \"red inches\"", ["m2.m.wp.length"], (q) => {
  if (q.type !== "numeric") return undefined;
  if (SCENE_VERBS.test(q.prompt)) return `scene verb: ${q.prompt}`;
  if (/\b(red|blue) (cm|inch|inches|meter|meters)\b/.test(q.prompt)) return `colour on the unit: ${q.prompt}`;
  for (const m of q.prompt.matchAll(/\b\d+\b(?! (cm|inch|inches|meter|meters)\b)/g)) return `"${m[0]}" without a unit: ${q.prompt}`;
  if (!q.explain.includes(`= ${q.answer}`)) return `explanation never reaches ${q.answer}`;
  return true;
});

// ---------------------------------------------------------------------------
// ME-11 — 10 more / less across a hundred
// ---------------------------------------------------------------------------

probe("ME-11", "10/100 more or less: answer recomputed; crossings never claim \"only the tens digit\"", ["m2.nbt.mental", "m1.nbt.tenmore"], (q) => {
  const m = q.prompt.match(/^What is (\d+) (more|less) than (\d+)\?$/);
  if (!m || q.type !== "numeric") return undefined;
  const step = Number(m[1]);
  const n = Number(m[3]);
  const want = m[2] === "more" ? n + step : n - step;
  if (q.answer !== want) return `answer ${q.answer}, expected ${want}`;
  const crosses = Math.floor(n / (step * 10)) !== Math.floor(want / (step * 10));
  if (crosses && (/changes only/.test(q.explain) || /^Only the/.test(q.hint))) return `crossing ${n} → ${want} says only one digit changes`;
  if (!crosses && n % step !== want % step) return "lower digits changed";
  return true;
});

// ---------------------------------------------------------------------------
// ME-12 — "collect data" distractors are not survey questions
// ---------------------------------------------------------------------------

probe("ME-12", "data-question distractors cannot be answered by surveying classmates", ["m2.dl.concepts"], (q) => {
  if (!/collecting data from classmates/.test(q.prompt) || q.type !== "choice") return undefined;
  const wrong = choiceLabels(q).filter((_, i) => i !== q.answerIndex);
  const yesNo = wrong.find((w) => /^(Is|Are|Do|Does) /.test(w));
  if (yesNo) return `"${yesNo}" is a yes/no question classmates could answer and count`;
  if (/cannot be counted/.test(q.explain)) return "explanation claims opinions cannot be counted";
  return true;
});

// ---------------------------------------------------------------------------
// ME-13 — coins: biggest first
// ---------------------------------------------------------------------------

const COIN_VALUE: Record<string, number> = { quarter: 25, quarters: 25, dime: 10, dimes: 10, nickel: 5, nickels: 5, penny: 1, pennies: 1 };

probe("ME-13", "coin explanations and coin lists go from the biggest value down; count-on ends at the total", ["m1.m.coins.count", "m2.m.money"], (q) => {
  const vals = [...q.explain.matchAll(/(\d+) × (\d+)¢ = (\d+)¢/g)];
  if (vals.length === 0) return undefined;
  for (const v of vals) if (Number(v[1]) * Number(v[2]) !== Number(v[3])) return `bad product "${v[0]}"`;
  const order = vals.map((v) => Number(v[2]));
  if (order.some((v, i) => i > 0 && v >= order[i - 1])) return `coins not biggest-first: ${order.join(", ")}`;
  const coinWords = [...q.prompt.matchAll(/\b\d+ (quarters?|dimes?|nickels?|penny|pennies)\b/g)].map((m) => COIN_VALUE[m[1]]);
  if (coinWords.some((v, i) => i > 0 && v >= coinWords[i - 1])) return `prompt lists coins out of order: ${q.prompt}`;
  const total = vals.reduce((s, v) => s + Number(v[3]), 0);
  const run = q.explain.match(/count on: ([\d, ]+)\./);
  if (run) {
    const nums = run[1].split(", ").map(Number);
    if (nums[nums.length - 1] !== total || nums.some((x, i) => i > 0 && x <= nums[i - 1])) return `count-on "${run[1]}" does not climb to ${total}`;
  }
  if (q.type === "numeric" && /^How many cents/.test(q.prompt) && q.answer !== total) return `answer ${q.answer}, coins add to ${total}`;
  return true;
});

// ---------------------------------------------------------------------------
// ME-14 — no "70 − 0 = 70" hop
// ---------------------------------------------------------------------------

probe("ME-14", "m2.nbt.sub100: answer recomputed, no degenerate − 0 hop", ["m2.nbt.sub100"], (q) => {
  const m = q.prompt.match(/^(\d+) − (\d+) = \?$/);
  if (!m || q.type !== "numeric") return undefined;
  const want = Number(m[1]) - Number(m[2]);
  if (q.answer !== want) return `answer ${q.answer}, expected ${want}`;
  if (/ − 0 = /.test(q.explain)) return q.explain;
  if (!q.explain.includes(`= ${want}`)) return `explanation never reaches ${want}`;
  return true;
});

// ---------------------------------------------------------------------------
// ME-15 — the "no regrouping" skill never regroups
// ---------------------------------------------------------------------------

probe("ME-15", "m1.nbt.add2d1d (regroup: false): ones never make a new ten", ["m1.nbt.add2d1d"], (q) => {
  const m = q.prompt.match(/^(\d+) \+ (\d+) = \?$/);
  if (!m || q.type !== "numeric") return undefined;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (q.answer !== a + b) return `answer ${q.answer}, expected ${a + b}`;
  return (a % 10) + (b % 10) < 10 ? true : `${a} + ${b} regroups`;
});

// ---------------------------------------------------------------------------
// ME-16 — SVG attributes emitted once; labels do not collide
// ---------------------------------------------------------------------------

function duplicateAttr(svg: string): string | null {
  for (const tag of svg.matchAll(/<([a-zA-Z]+)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)) {
    const names = [...tag[2].matchAll(/([\w:-]+)="/g)].map((m) => m[1]);
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) return `<${tag[1]}> repeats ${dup}: ${tag[0].slice(0, 120)}`;
  }
  return null;
}

interface TextBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  text: string;
}

/** Rough text boxes (0.55 em per character), honouring text-anchor. */
function textBoxes(svg: string): TextBox[] {
  const out: TextBox[] = [];
  for (const m of svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" text-anchor="(\w+)" font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    const size = Number(m[4]);
    const w = [...m[5]].length * size * 0.55;
    const x0 = m[3] === "start" ? x : m[3] === "end" ? x - w : x - w / 2;
    out.push({ x0, x1: x0 + w, y0: y - size * 0.75, y1: y, text: m[5] });
  }
  return out;
}

function collision(svg: string): string | null {
  const boxes = textBoxes(svg);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.x0 < -0.5 || b.x1 > 100.5) return `"${b.text}" runs off the picture (${b.x0.toFixed(1)}..${b.x1.toFixed(1)})`;
    for (let j = i + 1; j < boxes.length; j++) {
      const c = boxes[j];
      if (b.x0 < c.x1 && c.x0 < b.x1 && b.y0 < c.y1 && c.y0 < b.y1) return `"${b.text}" overlaps "${c.text}"`;
    }
  }
  return null;
}

const MATH_GENERATORS = { ...early, ...upperMod.generators, ...upperFracMod.generators, ...upperGeoMod.generators };

probeDirect("ME-16", "no SVG element in any math generator repeats an attribute (levels 1-3)", (seed) => {
  for (const [id, gen] of Object.entries(MATH_GENERATORS)) {
    for (const level of [1, 3]) {
      let q: Question;
      try {
        q = gen({ rng: mulberry32(seed), level });
      } catch {
        continue; // generator crashes are the selfcheck's job
      }
      for (const svg of svgsOf(q)) {
        const d = duplicateAttr(svg);
        if (d) return `${id}: ${d}`;
      }
    }
  }
  return true;
}, 2000);

probe("ME-16", "length bars, bar graphs and number lines: labels inside the picture and not overlapping", ["m1.m.length.compare", "m2.m.longer", "m2.dl.bargraph", "m2.m.numberline", "m1.m.coins.count"], (q) => {
  const svg = q.display?.svg;
  if (!svg) return undefined;
  const d = duplicateAttr(svg) ?? collision(svg);
  return d ?? true;
});

// ---------------------------------------------------------------------------
// ME-17 — where the hour hand is
// ---------------------------------------------------------------------------

probe("ME-17", "\"Which clock shows h:mm?\": hour-hand wording matches the minutes", ["m2.m.time5"], (q) => {
  const m = q.prompt.match(/^Which clock shows (\d+):(\d\d)\?$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const next = (h % 12) + 1;
  const e = q.explain;
  if (min >= 35 && (/just past/.test(e) || !e.includes(`most of the way from ${h} to ${next}`))) return `${h}:${m[2]}: ${e}`;
  if (min > 0 && min <= 15 && !e.includes(`just past ${h}`)) return `${h}:${m[2]}: ${e}`;
  if (min === 30 && !e.includes(`halfway between ${h} and ${next}`)) return `${h}:${m[2]}: ${e}`;
  if (min === 0 && !e.includes(`right at ${h}`)) return `${h}:${m[2]}: ${e}`;
  return true;
});

// ---------------------------------------------------------------------------
// MU-07 — typed fractions accept the forms the explanation prints, nothing else
// ---------------------------------------------------------------------------

/** Value of "a/b", "w a/b", "w a / b" or "n"; null if not a well-formed proper form. */
function fracValue(s: string): number | null {
  const t = s.trim().replace(/\s*\/\s*/, "/");
  let m = t.match(/^(\d+) (\d+)\/(\d+)$/);
  if (m) {
    const [w, a, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (w < 1 || a < 1 || a >= b) return null; // "0 3/4", "5 0/6", "4 9/6" are not proper mixed numbers
    return w + a / b;
  }
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[2]) === 0 ? null : Number(m[1]) / Number(m[2]);
  m = t.match(/^(\d+)$/);
  return m ? Number(m[1]) : null;
}

probe("MU-07", "typed fraction items accept every equal form their explanation prints; every accepted form is equal and proper", ["m4.nf.addsub", "m4.nf.mixed.addsub", "m5.nf.unlike"], (q) => {
  if (q.type !== "text") return undefined;
  const tq = q as TextQuestion;
  const target = fracValue(tq.answer);
  if (target === null) return `answer "${tq.answer}" is not a fraction`;
  for (const a of tq.accept ?? []) {
    const v = fracValue(a);
    if (v === null || Math.abs(v - target) > 1e-9) return `accepts "${a}" for ${tq.answer}`;
  }
  for (const m of tq.explain.matchAll(/(\d+ \d+\/\d+|\d+\/\d+)/g)) {
    const v = fracValue(m[1]);
    if (v !== null && Math.abs(v - target) < 1e-9 && !gradeAnswer(q, m[1])) return `explanation prints "${m[1]}" but it is graded wrong`;
  }
  return true;
}, 200);

probeDirect("MU-07", "fracAccept(n, d): mixed forms of the given and simplified fraction; equivalents=false stays strict", (seed) => {
  const rng = mulberry32(seed);
  const d = 2 + Math.floor(rng() * 11);
  const n = 1 + Math.floor(rng() * 4 * d);
  const all = fracAccept(n, d, true);
  for (const a of all) {
    const v = fracValue(a);
    if (v === null || Math.abs(v - n / d) > 1e-9) return `fracAccept(${n}, ${d}) accepts "${a}"`;
  }
  const whole = Math.floor(n / d);
  if (whole >= 1 && n % d !== 0 && !all.includes(`${whole} ${n % d}/${d}`)) return `fracAccept(${n}, ${d}) misses "${whole} ${n % d}/${d}"`;
  const strict = fracAccept(n, d, false);
  if (strict.some((s) => s.replace(/\s+/g, "") !== `${n}/${d}`)) return `fracAccept(${n}, ${d}, false) = ${strict.join(" | ")}`;
  return true;
}, 2000);

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

let failed = 0;
for (const r of results) {
  const bad = r.failures.length;
  const shown = r.failures.filter(Boolean);
  if (r.error) {
    failed += 1;
    console.log(`✗ ${r.id}  ${r.title}\n    error: ${r.error}`);
  } else if (bad) {
    failed += 1;
    console.log(`✗ ${r.id}  ${r.title}  (${bad} of ${r.checked} failed)`);
    for (const f of shown) console.log(`    - ${f}`);
  } else {
    console.log(`✓ ${r.id}  ${r.title}  (${r.checked} items)`);
  }
}
console.log(failed ? `\n${failed} probe(s) failed.` : `\nAll ${results.length} probes passed.`);
if (failed) process.exit(1);

// keep the type-only imports referenced for editors
export type { ChoiceQuestion };
