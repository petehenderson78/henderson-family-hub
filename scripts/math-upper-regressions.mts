/**
 * Regression probes for the grade 3-5 math content review (findings MU-01..MU-21,
 * minus MU-07/MU-08 which live in math-util.ts):
 *   node scripts/math-upper-regressions.mts
 *
 * Each probe runs 2,000 seeded questions through the real catalog skill (and,
 * where a mode matters, the bare generator), RECOMPUTES the math independently
 * from what the child sees (prompt, options, picture) and fails on any item that
 * would mark a correct answer wrong, show two correct options, or teach
 * something false. Exits 1 with one example per failing probe.
 */

import { register } from "node:module";

register("./ts-resolve-hooks.mjs", import.meta.url);

const { generators, makeQuestion } = await import("../src/lib/learn/generators/index");
const { CATALOG } = await import("../src/lib/learn/catalog");
const { gradeAnswer } = await import("../src/lib/learn/grade");
const { mulberry32, hashString } = await import("../src/lib/learn/rng");

type Question = import("../src/lib/learn/types").Question;
type Skill = import("../src/lib/learn/types").Skill;

const SEEDS = 2000;

// ---------------------------------------------------------------------------
// harness
// ---------------------------------------------------------------------------

interface ProbeResult {
  id: string;
  checked: number;
  bad: number;
  example: string;
}

const results: ProbeResult[] = [];

function skillById(id: string): Skill {
  const s = CATALOG.find((x) => x.id === id);
  if (!s) throw new Error(`skill ${id} not in catalog`);
  return s;
}

/** 2,000 questions from a catalog skill (seeded via hashString, like the player). */
function* fromSkill(id: string): Generator<[number, Question]> {
  const s = skillById(id);
  for (let i = 0; i < SEEDS; i++) {
    const seed = hashString(`mu-regress:${id}:${i}`);
    yield [seed, makeQuestion(s, seed)];
  }
}

/** 2,000 questions from a bare generator with explicit params. */
function* fromGenerator(gen: string, params: Record<string, unknown> = {}, level?: number): Generator<[number, Question]> {
  const g = generators[gen];
  if (!g) throw new Error(`generator ${gen} not registered`);
  for (let i = 0; i < SEEDS; i++) {
    const seed = hashString(`mu-regress:${gen}:${JSON.stringify(params)}:${i}`);
    yield [seed, g({ rng: mulberry32(seed), level, params })];
  }
}

/**
 * Run `check` over the questions; it returns null when the item is fine, a
 * problem description when it is not, or undefined when the item is not the
 * kind this probe looks at.
 */
function probe(id: string, sources: Iterable<[number, Question]>[], check: (q: Question) => string | null | undefined, minChecked = 50) {
  const r: ProbeResult = { id, checked: 0, bad: 0, example: "" };
  for (const src of sources) {
    for (const [seed, q] of src) {
      const problem = check(q);
      if (problem === undefined) continue;
      r.checked += 1;
      if (problem !== null) {
        r.bad += 1;
        if (!r.example) r.example = `seed ${seed}: ${problem} — prompt "${q.prompt}"`;
      }
    }
  }
  if (r.checked < minChecked) {
    r.bad += 1;
    r.example = `only ${r.checked} matching items (expected >= ${minChecked}): the probe no longer finds the item type`;
  }
  results.push(r);
}

const labels = (q: Question): string[] => (q.type === "choice" ? q.options.map((o) => o.label ?? "") : []);
const marked = (q: Question): string => (q.type === "choice" ? q.options[q.answerIndex].label ?? "" : "");
const num = (s: string): number => Number(s.replace(/,/g, ""));

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

/** "3 1/4" | "13/4" | "3" → value as [numerator, denominator]; null if not a fraction. */
function parseFrac(s: string): [number, number] | null {
  const t = s.trim();
  let m = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (m) return [Number(m[1]) * Number(m[3]) + Number(m[2]), Number(m[3])];
  m = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return [Number(m[1]), Number(m[2])];
  m = t.match(/^(\d+)$/);
  if (m) return [Number(m[1]), 1];
  return null;
}
const fval = (s: string): number => {
  const f = parseFrac(s);
  return f ? f[0] / f[1] : NaN;
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// ---------------------------------------------------------------------------
// MU-01 — every triangle picture really has the angles its answer claims
// ---------------------------------------------------------------------------

probe("MU-01 triangle pictures match their angle class", [fromSkill("m4.g.classify"), fromGenerator("geometryClassify", { grade: 4 })], (q) => {
  if (q.prompt !== "Classify this triangle by its angles.") return undefined;
  const svg = q.display?.svg ?? "";
  const pts = (svg.match(/polygon points="([^"]+)"/)?.[1] ?? "").split(" ").map((p) => p.split(",").map(Number));
  if (pts.length !== 3) return "no 3-point polygon";
  const angles = pts.map((p, i) => {
    const a = pts[(i + 1) % 3];
    const b = pts[(i + 2) % 3];
    const v = [a[0] - p[0], a[1] - p[1]];
    const w = [b[0] - p[0], b[1] - p[1]];
    return (Math.acos((v[0] * w[0] + v[1] * w[1]) / (Math.hypot(v[0], v[1]) * Math.hypot(w[0], w[1]))) * 180) / Math.PI;
  });
  const max = Math.max(...angles);
  // a child must be able to SEE the class: right within 0.5°, otherwise at least 8° away from 90°
  const truth = Math.abs(max - 90) < 0.5 ? "right" : max >= 98 ? "obtuse" : max <= 82 ? "acute" : "ambiguous";
  const claim = marked(q).replace(" triangle", "");
  if (truth !== claim) return `marked ${claim} but angles are ${angles.map((x) => x.toFixed(1)).join("/")}`;
  // rotated corners stay inside the viewBox
  const rot = Number(svg.match(/rotate\((\d+) 50 50\)/)?.[1] ?? 0);
  const r = (rot * Math.PI) / 180;
  for (const [x, y] of pts) {
    const rx = 50 + (x - 50) * Math.cos(r) - (y - 50) * Math.sin(r);
    const ry = 50 + (x - 50) * Math.sin(r) + (y - 50) * Math.cos(r);
    if (rx < 0 || rx > 100 || ry < 0 || ry > 100) return `corner leaves the viewBox at rotation ${rot}`;
  }
  return null;
});

// ---------------------------------------------------------------------------
// MU-02 — "the value of the digit d in N": d appears exactly once in N
// ---------------------------------------------------------------------------

probe("MU-02 digit-value digit appears once", [fromSkill("m4.nbt.readwrite"), fromGenerator("placeValueMillions", { mode: "digitValue" })], (q) => {
  const m = q.prompt.match(/^What is the value of the digit (\d) in ([\d,]+)\?$/);
  if (!m) return undefined;
  const digits = m[2].replace(/,/g, "");
  const values = [...digits].flatMap((c, i) => (c === m[1] ? [Number(c) * 10 ** (digits.length - 1 - i)] : []));
  if (values.length !== 1) return `digit ${m[1]} occurs ${values.length} times (values ${values.join(", ")})`;
  if (num(marked(q)) !== values[0]) return `marked ${marked(q)}, digit is worth ${values[0]}`;
  return null;
});

// ---------------------------------------------------------------------------
// MU-03 — same perimeter, different area: exactly one such option, and it is marked
// ---------------------------------------------------------------------------

probe("MU-03 same-perimeter rectangle really has a different area", [fromSkill("m4.m.areaperim"), fromGenerator("areaPerimeter", { mode: "formula" })], (q) => {
  const m = q.prompt.match(/^A rectangle is (\d+) by (\d+) \(perimeter (\d+)\)\. Which rectangle has the SAME perimeter but a DIFFERENT area\?$/);
  if (!m) return undefined;
  const w = Number(m[1]);
  const h = Number(m[2]);
  const ok = labels(q).filter((l) => {
    const [a, b] = l.split(" by ").map(Number);
    return a > 0 && b > 0 && a + b === w + h && a * b !== w * h;
  });
  if (ok.length !== 1) return `${ok.length} options fit (${labels(q).join(" | ")})`;
  if (ok[0] !== marked(q)) return `marked ${marked(q)} but ${ok[0]} is the one`;
  const e = q.explain.match(/The areas differ: (\d+) × (\d+) = (\d+), but (\d+) × (\d+) = (\d+)\.$/);
  if (!e) return `explain does not compare the two areas: ${q.explain}`;
  const [p1, p2, a1, p3, p4, a2] = e.slice(1).map(Number);
  if (p1 * p2 !== a1 || p3 * p4 !== a2 || a1 === a2 || `${p3} by ${p4}` !== marked(q)) return `explain area claim is false: ${e[0]}`;
  return null;
});

// ---------------------------------------------------------------------------
// MU-04 — "who has more": ties answer "they have the same"; three distinct people
// ---------------------------------------------------------------------------

probe("MU-04 multiplicative vs additive comparison (ties, distinct names)", [fromSkill("m4.oa.multcompare")], (q) => {
  const m = q.prompt.match(/^(\w+) has (\d+) [\w ]+?\. (\w+) has (\d+) times as many as \1\. (\w+) has (\d+) more than \1\. Who has more, \3 or \5\?$/);
  if (!m) return q.prompt.includes("Who has more") ? "unparseable comparison prompt (names repeated?)" : undefined;
  const [, a, small, b, k, c, more] = m;
  if (new Set([a, b, c]).size !== 3) return `names repeat: ${a}, ${b}, ${c}`;
  const mult = Number(k) * Number(small);
  const add = Number(small) + Number(more);
  const truth = mult > add ? b : add > mult ? c : "they have the same";
  if (marked(q) !== truth) return `marked ${marked(q)}, truth ${truth} (${mult} vs ${add})`;
  if (/\b(\d+) [<>] \1\b/.test(q.explain)) return `explain compares a number with itself: ${q.explain}`;
  return null;
});

// ---------------------------------------------------------------------------
// MU-05 — greatest / least: no two equal-valued options; marked is the unique extreme
// ---------------------------------------------------------------------------

probe("MU-05 greatest/least sets have no equivalent fractions", [fromSkill("m4.nf.compare"), fromSkill("m3.nf.compare"), fromGenerator("compareFractions", {})], (q) => {
  const m = q.prompt.match(/^Which fraction is the (greatest|least)\?$/);
  if (!m) return undefined;
  const vals = labels(q).map(fval);
  for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) if (near(vals[i], vals[j])) return `${labels(q)[i]} = ${labels(q)[j]}`;
  const best = m[1] === "greatest" ? Math.max(...vals) : Math.min(...vals);
  if (!near(fval(marked(q)), best)) return `marked ${marked(q)} is not the ${m[1]}`;
  return null;
});

// ---------------------------------------------------------------------------
// MU-06 — typed conversions accept every equivalent form of the asked kind
// ---------------------------------------------------------------------------

probe("MU-06 mixed/improper typed answers accept simplified forms", [fromSkill("m4.nf.mixed"), fromGenerator("mixedImproper", { mode: "convert" })], (q) => {
  if (q.type !== "text") return undefined;
  let m = q.prompt.match(/^Write (\d+)\/(\d+) as a mixed number\./);
  if (m) {
    const [n, d] = [Number(m[1]), Number(m[2])];
    const w = Math.floor(n / d);
    const r = n % d;
    const g = gcd(r, d);
    const good = [`${w} ${r}/${d}`, `${w} ${r / g}/${d / g}`, `${w} ${(2 * r) / g}/${(2 * d) / g}`];
    for (const t of good) if (!gradeAnswer(q, t)) return `rejects ${t}`;
    if (gradeAnswer(q, `${n}/${d}`)) return "accepts the improper fraction for a mixed-number prompt";
    if (g > 1 && !q.explain.includes(`${w} ${r / g}/${d / g}`)) return `explain never shows the simplified ${w} ${r / g}/${d / g}`;
    return null;
  }
  m = q.prompt.match(/^Write (\d+) (\d+)\/(\d+) as an improper fraction\./);
  if (m) {
    const [w, r, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const n = w * d + r;
    const g = gcd(n, d);
    const good = [`${n}/${d}`, `${n / g}/${d / g}`, `${n} / ${d}`];
    for (const t of good) if (!gradeAnswer(q, t)) return `rejects ${t}`;
    if (gradeAnswer(q, `${w} ${r}/${d}`)) return "accepts the mixed number for an improper-fraction prompt";
    if (g > 1 && !q.explain.includes(`${n / g}/${d / g}`)) return `explain never shows the simplified ${n / g}/${d / g}`;
    return null;
  }
  return "unrecognised text prompt";
});

// ---------------------------------------------------------------------------
// MU-09 — fact explanations never use negative numbers
// ---------------------------------------------------------------------------

{
  let saw3x4 = 0;
  probe("MU-09 multiplication explanations have no negatives", [fromSkill("m3.oa.multfacts"), fromSkill("m3.oa.mixedfacts"), fromGenerator("multFacts", {})], (q) => {
    if (/^(3 × 4|4 × 3) = \?$/.test(q.prompt)) saw3x4 += 1;
    if (/(^|[\s(:;])[-−]\d/.test(q.explain)) return `negative number in explain: ${q.explain}`;
    // the numbers in "a × b = c" claims must be true
    for (const x of q.explain.matchAll(/(\d+) × (\d+) = (\d+)/g)) if (Number(x[1]) * Number(x[2]) !== Number(x[3])) return `false claim ${x[0]}`;
    for (const x of q.explain.matchAll(/(\d+) \+ (\d+) = (\d+)/g)) if (Number(x[1]) + Number(x[2]) !== Number(x[3])) return `false claim ${x[0]}`;
    return null;
  });
  if (saw3x4 === 0) results.push({ id: "MU-09 (coverage)", checked: 0, bad: 1, example: "no 3 × 4 item was generated, the probe cannot see the old bug" });
}

// ---------------------------------------------------------------------------
// MU-10 — decimal explanations: no floating-point noise, and the whole-number steps are true
// ---------------------------------------------------------------------------

probe("MU-10 decimal explanations are clean and correct", [fromSkill("m5.nbt.dec.mult"), fromSkill("m5.nbt.dec.div"), fromSkill("m5.nbt.dec.addsub")], (q) => {
  const text = [q.prompt, q.explain, q.hint, ...labels(q)].join(" ");
  if (/\d\.\d{5,}|\de-\d/.test(text)) return `float noise: ${q.explain}`;
  for (const x of q.explain.matchAll(/(\d+) (tenths|hundredths) ([×÷]) (\d+) = (\d+) \2/g)) {
    const [a, k, b] = [Number(x[1]), Number(x[4]), Number(x[5])];
    if (x[3] === "×" ? a * k !== b : a / k !== b) return `false step ${x[0]}`;
  }
  return null;
});

// ---------------------------------------------------------------------------
// MU-11 — like-denominator stories: verbs fit units, one whole is never exceeded, answer recomputed
// ---------------------------------------------------------------------------

probe("MU-11 fraction stories make sense and add up", [fromSkill("m4.nf.wp"), fromSkill("m4.nf.addsub"), fromGenerator("addSubLikeDenominators", { mode: "wordproblem", denoms: [2, 3, 4, 5, 6, 8, 10, 12] })], (q) => {
  if (!/\?$/.test(q.prompt) || !/[A-Za-z]{4,}.*\d+\/\d+.*\d+\/\d+/.test(q.prompt) || /^Which|=/.test(q.prompt)) return undefined;
  if (/\bate \d+\/\d+ of an? (mile|hour|yard)/.test(q.prompt)) return "food verb with a non-food unit";
  if (/\b[Aa] hour\b/.test(q.prompt)) return '"a hour"';
  const fr = [...q.prompt.matchAll(/(\d+)\/(\d+)/g)].map((x) => [Number(x[1]), Number(x[2])]);
  if (fr.length !== 2) return `expected two fractions, got ${fr.length}`;
  if (fr.some(([n, d]) => n < 1 || n >= d)) return "an amount is 0 or not a proper fraction";
  const add = /together|in all/.test(q.prompt);
  const sub = /left/.test(q.prompt);
  if (add === sub) return "cannot tell add from subtract";
  const [[a, d], [b]] = fr;
  if (add && /the same/.test(q.prompt) && a + b > d) return `${a}/${d} + ${b}/${d} of ONE whole is more than all of it`;
  const truth = add ? (a + b) / d : (a - b) / d;
  if (truth <= 0) return "nothing left / negative";
  if (!near(fval(marked(q)), truth)) return `marked ${marked(q)}, truth ${truth}`;
  return null;
});

// ---------------------------------------------------------------------------
// MU-12 — the estimate check rounds the real operands to the nearest half and lands near the answer
// ---------------------------------------------------------------------------

probe("MU-12 unlike-denominator estimate check is true", [fromSkill("m5.nf.unlike.mixed"), fromGenerator("addSubUnlikeDenominators", { wordProblem: true })], (q) => {
  const m = q.explain.match(/Estimate check: (.+?) is about (.+?) and (.+?) is about (.+?), so the answer should be about (.+?)\.$/);
  if (!m) return "no estimate check in a word-problem explanation";
  const [, L, Lh, R, Rh, Est] = m;
  if (!q.prompt.includes(L) || !q.prompt.includes(R)) return `estimate talks about ${L} / ${R}, not the prompt's numbers`;
  const half = (x: number) => Math.round(x * 2) / 2;
  if (!near(fval(L) > 0 ? half(fval(L)) : 0, fval(Lh)) || !near(half(fval(R)), fval(Rh))) return `rounding is off: ${m[0]}`;
  const add = q.explain.startsWith("In all");
  if (!near(add ? fval(Lh) + fval(Rh) : fval(Lh) - fval(Rh), fval(Est))) return `estimate arithmetic is off: ${m[0]}`;
  if (Math.abs(fval(marked(q)) - fval(Est)) > 0.5 + 1e-9) return `answer ${marked(q)} is not near the estimate ${Est}`;
  return null;
});

// ---------------------------------------------------------------------------
// MU-13 — the symmetry skill asks about symmetry; the classify skill does not
// ---------------------------------------------------------------------------

probe("MU-13 m4.g.symmetry only asks about lines of symmetry", [fromSkill("m4.g.symmetry")], (q) => (/symmetry/i.test(q.prompt) ? null : `off-standard item: ${q.prompt}`));
probe("MU-13 m4.g.classify stays on 4.G.A.1-2", [fromSkill("m4.g.classify")], (q) => (/symmetry/i.test(q.prompt) ? "symmetry item in the classify skill" : null));
{
  let sym = 0;
  let other = 0;
  for (const [, q] of fromGenerator("geometryClassify", { grade: 4 })) {
    if (/symmetry/i.test(q.prompt)) sym += 1;
    else other += 1;
  }
  results.push({ id: "MU-13 default (mixed) grade-4 mode still draws both kinds", checked: sym + other, bad: sym > 0 && other > 0 ? 0 : 1, example: `symmetry ${sym}, other ${other}` });
}

// ---------------------------------------------------------------------------
// MU-14 — line plots: nothing measures 0, and there are at least two lengths
// ---------------------------------------------------------------------------

probe("MU-14 line plots have no zero-length measurements", [fromSkill("m3.dl.lineplot"), fromSkill("m4.dl.lineplot"), fromSkill("m5.dl.lineplot"), fromSkill("m2.dl.lineplot")], (q) => {
  const svg = q.display?.svg ?? "";
  const texts = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)<\/text>/g)].map((x) => ({ x: x[1], y: Number(x[2]), t: x[3] }));
  const ticks = texts.filter((t) => t.y === 91);
  const marksAt = (x: string) => texts.filter((t) => t.t === "✕" && t.x === x).length;
  const zero = ticks.find((t) => t.t === "0");
  if (zero && marksAt(zero.x) > 0) return `${marksAt(zero.x)} ✕ above the 0 tick`;
  if (/\b0 inch/.test(q.prompt + q.explain)) return "text mentions a 0-inch measurement";
  if (ticks.filter((t) => marksAt(t.x) > 0).length < 2) return "fewer than two different lengths";
  return null;
});

// ---------------------------------------------------------------------------
// MU-15 — expanded form: exactly one option is a correct expanded form
// ---------------------------------------------------------------------------

probe("MU-15 only one option is a valid expanded form", [fromSkill("m4.nbt.readwrite"), fromGenerator("placeValueMillions", { mode: "expanded" })], (q) => {
  const m = q.prompt.match(/^Which is the expanded form of ([\d,]+)\?$/);
  if (!m) return undefined;
  const n = num(m[1]);
  const valid = labels(q).filter((l) => {
    const terms = l.split(" + ").map(num);
    const places = terms.map((t) => String(t).length);
    return terms.every((t) => /^[1-9]0*$/.test(String(t))) && new Set(places).size === places.length && terms.reduce((s, t) => s + t, 0) === n;
  });
  if (valid.length !== 1) return `${valid.length} valid expanded forms among ${labels(q).join(" | ")}`;
  if (valid[0] !== marked(q)) return `marked ${marked(q)}, valid one is ${valid[0]}`;
  return null;
});

// ---------------------------------------------------------------------------
// MU-16 — decimal digit value: never the digit 0, and the digit really sits in that place
// ---------------------------------------------------------------------------

probe("MU-16 decimal digit-value item never asks about a 0", [fromSkill("m5.nbt.placevalue"), fromGenerator("placeValueMillions", { decimals: true })], (q) => {
  const m = q.prompt.match(/^What is the value of the digit (\d) in (\d+)\.(\d{3}) \(in the (tenths|hundredths|thousandths) place\)\?$/);
  if (!m) return undefined;
  if (m[1] === "0") return "asks about the digit 0 (every option is worth 0)";
  const at = { tenths: 0, hundredths: 1, thousandths: 2 }[m[4] as "tenths" | "hundredths" | "thousandths"];
  if (m[3][at] !== m[1]) return `the ${m[4]} digit of ${m[2]}.${m[3]} is ${m[3][at]}, not ${m[1]}`;
  if (marked(q) !== `${m[1]} ${m[4]}`) return `marked ${marked(q)}`;
  return null;
});

// ---------------------------------------------------------------------------
// MU-17 — decomposing: a proper fraction into two non-empty parts; one correct sum
// ---------------------------------------------------------------------------

probe("MU-17 decompose items are non-degenerate", [fromSkill("m4.nf.decompose"), fromGenerator("addSubLikeDenominators", { mode: "decompose", denoms: [2, 3, 4] })], (q) => {
  let m = q.prompt.match(/^(\d+)\/(\d+) = (\d+)\/\2 \+ \?\/\2$/);
  if (m) {
    const [n, d, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (n >= d) return "decomposes a whole, not a proper fraction";
    if (a < 1 || n - a < 1 || q.type !== "numeric" || q.answer !== n - a) return "a part is empty or the answer is off";
    return null;
  }
  m = q.prompt.match(/^Which sum equals (\d+)\/(\d+)\?$/);
  if (!m) return undefined;
  const target = Number(m[1]) / Number(m[2]);
  if (Number(m[1]) >= Number(m[2])) return "target is not a proper fraction";
  const value = (l: string) => {
    const p = l.match(/^(\d+)\/(\d+) ([+×]) (\d+)\/(\d+)$/);
    if (!p) return NaN;
    const x = Number(p[1]) / Number(p[2]);
    const y = Number(p[4]) / Number(p[5]);
    return p[3] === "+" ? x + y : x * y;
  };
  const winners = labels(q).filter((l) => near(value(l), target));
  if (winners.length !== 1) return `${winners.length} options equal ${m[1]}/${m[2]}: ${labels(q).join(" | ")}`;
  if (winners[0] !== marked(q)) return `marked ${marked(q)}`;
  if (/(^|\s)0\//.test(marked(q))) return "answer has a 0/d part";
  return null;
});

// ---------------------------------------------------------------------------
// MU-18 — unit words agree with the amount ("4/8 bag of oats", "1 1/2 miles", "1 piece")
// ---------------------------------------------------------------------------

probe("MU-18 fraction-times-whole explanation units are pluralised correctly", [fromSkill("m4.nf.multwhole")], (q) => {
  const m = q.explain.match(/^Equation: \d+ × \d+\/\d+ = (\d+)\/(\d+)(?: = ([\d /]+?))? (liters? of water|bags? of oats|miles?|cups? of sugar)\./);
  if (!m) return q.explain.startsWith("Equation:") ? `unparseable: ${q.explain}` : undefined;
  const value = Number(m[1]) / Number(m[2]);
  const pluralUnit = /^(liters|bags|miles|cups)/.test(m[4]);
  if (pluralUnit !== value > 1) return `"${m[1]}/${m[2]} ${m[4]}"`;
  return null;
});
{
  const owned = new Set(["multFacts", "multiStepWordProblem", "placeValueMillions", "compareFractions", "addSubLikeDenominators", "mixedImproper", "multiplyFractionByWhole", "fractionOfShape", "dataLinePlot", "unitConversions"]);
  const sources = CATALOG.filter((s) => owned.has(s.generator)).map((s) => fromSkill(s.id));
  probe("MU-18 no '1 pieces' / '1 inches' / 'oatss' / 'leafs' anywhere", sources, (q) => {
    const text = [q.prompt, q.explain, q.hint, q.display?.speak ?? ""].join(" ");
    const bad = text.match(/\b1 (pieces|inches|miles|bags|cups|liters)\b|oatss|waters\b|sugars\b|leafs\b/);
    return bad ? `"${bad[0]}"` : null;
  });
}

// ---------------------------------------------------------------------------
// MU-19 — hierarchy items: exactly one option is right under BOTH trapezoid definitions
// ---------------------------------------------------------------------------

probe("MU-19 'every X is also a …' has one answer under either trapezoid definition", [fromSkill("m5.g.hierarchy"), fromGenerator("geometryClassify", {}, 5)], (q) => {
  const m = q.prompt.match(/^Every (square|rectangle|rhombus|parallelogram) is also a …$/);
  if (!m) return undefined;
  // inclusive definitions (a trapezoid has AT LEAST one pair of parallel sides; a kite two pairs of adjacent equal sides)
  const isA: Record<string, string[]> = {
    square: ["rectangle", "rhombus", "parallelogram", "quadrilateral", "trapezoid", "kite"],
    rectangle: ["parallelogram", "quadrilateral", "trapezoid"],
    rhombus: ["parallelogram", "quadrilateral", "trapezoid", "kite"],
    parallelogram: ["quadrilateral", "trapezoid"],
  };
  const right = labels(q).filter((l) => isA[m[1]].includes(l));
  if (right.length !== 1) return `${right.length} defensible answers: ${labels(q).join(" | ")}`;
  if (right[0] !== marked(q)) return `marked ${marked(q)}`;
  return null;
});

// ---------------------------------------------------------------------------
// MU-20 — coordinate moves are at least 1 unit and stay on the grid; conversion stories fit their units
// ---------------------------------------------------------------------------

probe("MU-20 coordinate moves are real moves on the grid", [fromSkill("m5.g.coordinate"), fromGenerator("coordinatePlane", {})], (q) => {
  const m = q.prompt.match(/^A point is at \((\d+), (\d+)\)\. It moves (\d+) units? to the right\./);
  if (!m) return undefined;
  const dx = Number(m[3]);
  if (dx < 1) return "moves 0 units";
  if (Number(m[1]) + dx > 10) return "moves off the 0-10 grid";
  if (q.type !== "numeric" || q.answer !== Number(m[1]) + dx) return "wrong answer";
  return null;
});
probe("MU-20 conversion stories measure the right kind of thing", [fromSkill("m5.m.convert"), fromGenerator("unitConversions", { grade: 5 })], (q) => {
  const m = q.prompt.match(/^\w+ has (\d+) (\w+) of (.+?) and .+? (\d+) (\w+)\. How many \5 are left\?$/);
  if (!m) return q.prompt.includes("are left?") ? "unparseable story" : undefined;
  const fits: Record<string, string[]> = { length: ["km", "m", "cm", "ft", "in", "yd"], mass: ["kg", "g", "lb", "oz"], volume: ["L", "mL"], time: ["hr", "min", "s"] };
  const kind = /trail|ribbon|rope/.test(m[3]) ? "length" : /feed|oats/.test(m[3]) ? "mass" : /water/.test(m[3]) ? "volume" : /time/.test(m[3]) ? "time" : "";
  if (!kind) return `unknown stuff "${m[3]}"`;
  if (!fits[kind].includes(m[2]) || !fits[kind].includes(m[5])) return `${m[3]} measured in ${m[2]} / ${m[5]}`;
  return null;
});

// ---------------------------------------------------------------------------
// MU-21 — fraction comparisons never show an empty fraction ("1/2 ○ 0/2")
// ---------------------------------------------------------------------------

probe("MU-21 compare items have no zero numerators and the marked sign is right", [fromSkill("m3.nf.compare"), fromSkill("m4.nf.compare"), fromGenerator("compareFractions", { mode: "sameNumOrDenom", denoms: [2, 3, 4, 6, 8] })], (q) => {
  if (q.type !== "choice") return undefined;
  const shown = [q.prompt, ...labels(q)].join(" ");
  const zero = shown.match(/(?<![\d/])0\/\d+/);
  if (zero) return `shows ${zero[0]}`;
  const m = q.prompt.match(/^(\d+)\/(\d+) ○ (\d+)\/(\d+)/);
  if (!m) return null;
  const [n1, d1, n2, d2] = m.slice(1).map(Number);
  const sign = n1 * d2 > n2 * d1 ? ">" : n1 * d2 < n2 * d1 ? "<" : "=";
  return marked(q) === sign ? null : `marked ${marked(q)}, recomputed ${sign}`;
}, 1500);

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

let failed = 0;
for (const r of results) {
  const ok = r.bad === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${r.id}: ${r.checked} items checked${ok ? "" : `, ${r.bad} bad — ${r.example}`}`);
}
if (failed > 0) {
  console.log(`\n✗ ${failed} probe(s) failed.`);
  process.exit(1);
}
console.log(`\n✓ All ${results.length} probes passed (${SEEDS} seeds per source).`);
