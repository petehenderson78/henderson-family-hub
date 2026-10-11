/**
 * Reading + writing generator check: `node scripts/reading-check.mts`.
 *
 * Plain Node 22+ (type stripping) with the resolve hook from
 * ./ts-resolve-hooks.mjs, like learn-selfcheck.mts. Checks the content tables
 * (vocab sentences, evidence needles, order entries), then every generator in
 * generators/reading.ts and generators/writing.ts × 300 seeds × levels
 * 3 / 3.5 / 4: prompt, options, answerIndex validity and spread, explain/hint,
 * passage present and identical to the content text, the correct option
 * matching the content answer, passage spread across consecutive seeds,
 * attempt-cycling, determinism, and the writing text items' selfCheck /
 * modelAnswer. Exits 1 with a readable report on any failure.
 */

import { register } from "node:module";
import type { ChoiceQuestion, GeneratorContext, Question } from "../src/lib/learn/types";
import type { ReadingPassage } from "../src/lib/learn/content/types";

register("./ts-resolve-hooks.mjs", import.meta.url);

const readingMod = await import("../src/lib/learn/generators/reading");
const writingMod = await import("../src/lib/learn/generators/writing");
const contentMod = await import("../src/lib/learn/content/passages-cole");
const rngMod = await import("../src/lib/learn/rng");
const catalogMod = await import("../src/lib/learn/catalog-reading-cole");
const gradeMod = await import("../src/lib/learn/grade");

const { generators: reading, EVIDENCE, ORDER, splitSentences, findVocabSentence, passageSetForSeed } = readingMod;
const { generators: writing, SKILL_LABEL, FRAGMENT_ITEMS, COMBINE_ITEMS, PUNCT_ITEMS } = writingMod;
const { COLE_PASSAGES, COLE_WRITING } = contentMod;
const { mulberry32, hashString } = rngMod;
const { COLE_READING_SKILLS } = catalogMod;
const { gradeAnswer } = gradeMod;

const N = 300;
const LEVELS = [3, 3.5, 4];
/** `Read “Title”, then answer: ` precedes the first question of a passage. */
const READ_PREFIX = /^Read “(.+?)”, then answer: /;
function stripPrefix(prompt: string): { stem: string; title?: string } {
  const m = READ_PREFIX.exec(prompt);
  return m ? { stem: prompt.slice(m[0].length), title: m[1] } : { stem: prompt };
}

interface Failure {
  where: string;
  message: string;
}
const failures: Failure[] = [];
const warnings: string[] = [];
let checks = 0;

function fail(where: string, message: string) {
  failures.push({ where, message });
}
function assert(cond: unknown, where: string, message: string) {
  checks += 1;
  if (!cond) fail(where, message);
}
function warn(message: string) {
  warnings.push(message);
}
function bad(s: string): boolean {
  return /\bNaN\b|\bundefined\b|\[object Object\]/.test(s);
}
function lower(s: string): string {
  return s.trim().toLowerCase();
}
const byTitle = new Map<string, ReadingPassage>(COLE_PASSAGES.map((p) => [p.title, p]));
const byId = new Map<string, ReadingPassage>(COLE_PASSAGES.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// Content tables
// ---------------------------------------------------------------------------

{
  for (const p of COLE_PASSAGES) {
    const sentences = splitSentences(p.text);
    assert(sentences.length >= 10, `content ${p.id}`, `only ${sentences.length} sentences split`);
    for (const s of sentences) assert(p.text.includes(s), `content ${p.id}`, `split sentence not a substring: ${s.slice(0, 40)}`);
    for (const v of p.vocab) assert(!!findVocabSentence(sentences, v.word), `content ${p.id}`, `vocab word "${v.word}" has no sentence in the passage`);
    const seq = p.questions.some((q) => q.kind === "sequence");
    if (seq && ORDER.some((o) => o.id === p.id)) warn(`${p.id} has both a sequence question and an ORDER entry (the question wins)`);
  }
  const evIds = new Set<string>();
  for (const e of EVIDENCE) {
    const where = `EVIDENCE ${e.id}`;
    assert(!evIds.has(e.id), where, "duplicate entry");
    evIds.add(e.id);
    const p = byId.get(e.id);
    assert(!!p, where, "unknown passage id");
    if (!p) continue;
    const sentences = splitSentences(p.text);
    const hits = sentences.filter((s) => s.includes(e.needle));
    assert(hits.length === 1, where, `needle "${e.needle}" matches ${hits.length} sentences`);
    for (const x of e.exclude) assert(sentences.some((s) => s.includes(x)), where, `exclude needle "${x}" matches no sentence`);
    assert(e.claim.length > 10 && e.why.length > 10, where, "claim/why too short");
  }
  const orIds = new Set<string>();
  for (const o of ORDER) {
    const where = `ORDER ${o.id}`;
    assert(!orIds.has(o.id), where, "duplicate entry");
    orIds.add(o.id);
    assert(!!byId.get(o.id), where, "unknown passage id");
    assert(o.events.length === 3 && new Set(o.events).size === 3 && o.events.every((x) => x.length > 5), where, "needs 3 distinct events");
  }
  for (const L of LEVELS) {
    const at = COLE_PASSAGES.filter((p) => p.level === L);
    const ev = at.filter((p) => evIds.has(p.id)).length;
    const sq = at.filter((p) => orIds.has(p.id) || p.questions.some((q) => q.kind === "sequence")).length;
    console.log(`level ${L}: ${at.length} passages, evidence entries ${ev}, sequence-capable ${sq}`);
  }
}

// ---------------------------------------------------------------------------
// Reading generators
// ---------------------------------------------------------------------------

function run(gen: (ctx: GeneratorContext) => Question, seed: number, params?: Record<string, unknown>): Question {
  return gen({ rng: mulberry32(seed), level: 3, params });
}

function checkChoiceShape(q: Question, tag: string): q is ChoiceQuestion {
  assert(typeof q.prompt === "string" && q.prompt.trim().length > 0 && !bad(q.prompt), tag, "prompt empty or bad");
  assert(typeof q.explain === "string" && q.explain.trim().length > 0 && !bad(q.explain), tag, "explain empty or bad");
  assert(typeof q.hint === "string" && q.hint.trim().length > 0 && !bad(q.hint), tag, "hint empty or bad");
  if (q.type !== "choice") {
    fail(tag, `expected choice, got ${q.type}`);
    return false;
  }
  assert(q.options.length === 4, tag, `expected 4 options, got ${q.options.length}`);
  const labels = q.options.map((o) => o.label ?? "");
  assert(labels.every((l) => l.length > 0 && !bad(l)), tag, "option without label / bad label");
  assert(new Set(labels).size === labels.length, tag, `options not unique: ${labels.join(" | ")}`);
  assert(Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.options.length, tag, `answerIndex out of range: ${q.answerIndex}`);
  assert(gradeAnswer(q, String(q.answerIndex)), tag, "gradeAnswer rejects the correct choice");
  assert(q.display?.speak === undefined, tag, "display.speak should not be set for reading items");
  return true;
}

/** Verifies the correct option against the content; returns the passage used. */
function checkReadingItem(id: string, q: ChoiceQuestion, tag: string): ReadingPassage | undefined {
  const passage = q.display?.passage;
  assert(!!passage, tag, "display.passage missing");
  if (!passage) return undefined;
  const p = byTitle.get(passage.title);
  assert(!!p, tag, `passage title not in content: ${passage.title}`);
  if (!p) return undefined;
  assert(passage.text === p.text, tag, "display.passage.text differs from content text");
  assert(passage.level === p.level, tag, "display.passage.level differs from content");

  const labels = q.options.map((o) => o.label ?? "");
  const correct = labels[q.answerIndex];
  const { stem, title } = stripPrefix(q.prompt);
  const cq = p.questions.find((x) => x.prompt === stem);
  if (cq) {
    assert(correct === cq.options[cq.answerIndex], tag, `correct option "${correct}" != content answer "${cq.options[cq.answerIndex]}"`);
    assert(labels.every((l) => cq.options.includes(l)), tag, "option not from the content question");
    const qi = p.questions.indexOf(cq);
    assert((title !== undefined) === (qi === 0), tag, `"Read …, then answer:" prefix wrong for question ${qi}`);
    if (title !== undefined) assert(title === p.title, tag, "prefix title differs from the passage title");
    assert(q.explain === cq.explain && q.hint === cq.hint, tag, "explain/hint not from content");
    if (id === "rd.mainIdea") assert(cq.kind === "main-idea" || cq.kind === "author-purpose", tag, `rd.mainIdea served kind ${cq.kind}`);
    if (id === "rd.inference") assert(cq.kind === "inference", tag, `rd.inference served kind ${cq.kind}`);
    if (id === "rd.sequence") assert(cq.kind === "sequence", tag, `rd.sequence served content kind ${cq.kind} (fallback)`);
    if (id === "rd.evidenceLine") fail(tag, "rd.evidenceLine fell back to a content question");
    if (id === "rd.vocabContext") fail(tag, "rd.vocabContext fell back to a content question");
    return p;
  }
  if (id === "rd.vocabContext") {
    const m = /What does the word “(.+?)” mean in this sentence\?$/.exec(q.prompt);
    const sm = /the author writes: “(.+?)”  What does/.exec(q.prompt);
    assert(!!m && !!sm, tag, `vocab prompt not parseable: ${q.prompt.slice(0, 80)}`);
    if (!m || !sm) return p;
    const form = lower(m[1]);
    const entries = p.vocab.filter((v) => form.startsWith(lower(v.word))).sort((a, b) => b.word.length - a.word.length);
    assert(entries.length > 0, tag, `word "${form}" is not a vocab word of ${p.id}`);
    if (entries.length === 0) return p;
    assert(lower(correct) === lower(entries[0].meaning), tag, `correct "${correct}" != meaning "${entries[0].meaning}"`);
    assert(p.text.includes(sm[1]), tag, "quoted sentence not in passage text");
    assert(new RegExp(`\\b${m[1].replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`, "i").test(sm[1]), tag, "quoted sentence does not contain the word");
    const ownMeanings = new Set(p.vocab.map((v) => lower(v.meaning)));
    for (const l of labels) if (l !== correct) assert(!ownMeanings.has(lower(l)), tag, `distractor "${l}" is a meaning from the same passage`);
    assert(q.explain.startsWith("Clue: “"), tag, "vocab explain does not cite the clue sentence");
    return p;
  }
  if (id === "rd.evidenceLine") {
    const e = EVIDENCE.find((x) => x.id === p.id);
    assert(!!e, tag, `no EVIDENCE entry for ${p.id}`);
    if (!e) return p;
    assert(q.prompt.endsWith(e.claim), tag, "prompt does not end with the claim");
    assert(p.text.includes(correct), tag, `correct sentence not in passage: ${correct.slice(0, 50)}`);
    assert(correct.includes(e.needle), tag, `correct sentence lacks needle "${e.needle}"`);
    for (const l of labels) {
      if (l === correct) continue;
      assert(p.text.includes(l), tag, `distractor not in passage: ${l.slice(0, 50)}`);
      assert(!l.includes(e.needle) && !e.exclude.some((x) => l.includes(x)), tag, `distractor also supports the claim: ${l.slice(0, 50)}`);
    }
    assert(q.explain.includes(correct), tag, "evidence explain does not quote the evidence sentence");
    return p;
  }
  if (id === "rd.sequence" && q.prompt.startsWith("Put these events")) {
    const o = ORDER.find((x) => x.id === p.id);
    assert(!!o, tag, `no ORDER entry for ${p.id}`);
    if (!o) return p;
    const m = /  A\. (.+?)  B\. (.+?)  C\. (.+?)  Which order is correct\?$/.exec(q.prompt);
    assert(!!m, tag, "sequence prompt not parseable");
    if (!m) return p;
    const byLetter: Record<string, string> = { A: m[1], B: m[2], C: m[3] };
    const letters = correct.split(" → ");
    assert(letters.length === 3, tag, `correct option not an ordering: ${correct}`);
    const got = letters.map((L) => byLetter[L]);
    assert(got.join("|") === o.events.join("|"), tag, `correct ordering ${got.join(" > ")} != authored ${o.events.join(" > ")}`);
    assert(new Set(m.slice(1, 4)).size === 3 && o.events.every((e) => m.slice(1, 4).includes(e)), tag, "prompt events differ from authored events");
    for (const l of labels) assert(/^[ABC] → [ABC] → [ABC]$/.test(l) && new Set(l.split(" → ")).size === 3, tag, `bad ordering option: ${l}`);
    return p;
  }
  fail(tag, `unrecognized item for ${id}: ${q.prompt.slice(0, 80)}`);
  return p;
}

function checkSpread(ids: string[], where: string) {
  const P = new Set(ids).size;
  let dup = 0;
  for (let i = 1; i < ids.length; i++) if (ids[i] === ids[i - 1]) dup++;
  const rate = dup / (ids.length - 1);
  assert(rate <= Math.min(0.5, 3 / P), where, `adjacent passage repeats ${(rate * 100).toFixed(1)}% with ${P} distinct passages`);
  const W = Math.min(20, P);
  const need = Math.max(2, Math.floor(W / 3));
  let worst = W;
  for (let i = 0; i + W <= ids.length; i++) worst = Math.min(worst, new Set(ids.slice(i, i + W)).size);
  assert(worst >= need, where, `a window of ${W} seeds had only ${worst} distinct passages`);
  return { P, rate, worst, W };
}

const readingIds = Object.keys(reading);
console.log(`\nChecking ${readingIds.length} reading generator(s) × ${LEVELS.length} level(s) × ${N} seeds…`);
for (const id of readingIds) {
  const gen = reading[id];
  for (const L of LEVELS) {
    const where = `${id} (level ${L})`;
    const positions = [0, 0, 0, 0];
    const ids: string[] = [];
    const prompts = new Set<string>();
    let exact = 0;
    for (let i = 0; i < N; i++) {
      const seed = hashString(`reading-check:${id}:${L}:${i}`);
      const tag = `${where} seed ${seed}`;
      let q: Question;
      try {
        q = run(gen, seed, { level: L });
      } catch (err) {
        fail(tag, `threw: ${(err as Error).message}`);
        continue;
      }
      if (!checkChoiceShape(q, tag)) continue;
      const p = checkReadingItem(id, q, tag);
      if (p) {
        ids.push(p.id);
        assert(Math.abs(p.level - L) <= 0.5 + 1e-9, tag, `passage level ${p.level} too far from requested ${L}`);
        if (p.level === L) exact++;
      }
      positions[q.answerIndex] += 1;
      prompts.add(q.prompt);
      const again = JSON.stringify(run(gen, seed, { level: L }));
      assert(again === JSON.stringify(q), tag, "not deterministic for the same seed");
    }
    const maxShare = Math.max(...positions) / N;
    assert(maxShare < 0.45, where, `answer position share ${(maxShare * 100).toFixed(0)}% (${positions.join("/")})`);
    const spread = checkSpread(ids, where);
    // attempt cycling: strict no-repeat within pool-size windows
    const cyc: string[] = [];
    for (let i = 0; i < N; i++) {
      const q = run(gen, hashString(`reading-check:cycle:${id}:${L}:${i}`), { level: L, attempt: i });
      const t = q.display?.passage?.title ?? "";
      cyc.push(byTitle.get(t)?.id ?? "?");
    }
    const Pc = new Set(cyc).size;
    let okWindows = true;
    for (let i = 0; i + Pc <= cyc.length; i++) if (new Set(cyc.slice(i, i + Pc)).size !== Pc) okWindows = false;
    assert(okWindows, where, `attempt cycling repeated a passage within ${Pc} consecutive attempts`);
    console.log(
      `  ${where}: ${prompts.size} distinct prompts, ${spread.P} passages (${((exact / Math.max(1, ids.length)) * 100).toFixed(0)}% at exact level), adjacent repeats ${(spread.rate * 100).toFixed(1)}%, min distinct per ${spread.W}-window ${spread.worst}, positions ${positions.join("/")}`
    );
  }
}

// topic filter, passage sets, and the shared self-check's call shape
{
  const gen = reading["rd.passage"];
  for (let i = 0; i < 40; i++) {
    const q = run(gen, hashString(`topic:${i}`), { level: 3.5, topic: "fiction" });
    const p = byTitle.get(q.display?.passage?.title ?? "");
    assert(p?.genre === "fiction", "rd.passage topic=fiction", `served ${p?.id} (${p?.genre})`);
    const q2 = run(gen, hashString(`topic2:${i}`), { level: 3.5, topic: ["sports", "sports-science"] });
    const p2 = byTitle.get(q2.display?.passage?.title ?? "");
    assert(p2?.topic === "sports" || p2?.topic === "sports-science", "rd.passage topic=sports", `served ${p2?.id} (${p2?.topic})`);
  }
  for (let i = 0; i < 60; i++) {
    const seed = hashString(`set:${i}`);
    const set = passageSetForSeed(3.5, seed);
    const again = passageSetForSeed(3.5, seed);
    assert(JSON.stringify(set) === JSON.stringify(again), "passageSetForSeed", "not deterministic");
    const p = byId.get(set.passageId);
    assert(!!p && p.level === 3.5 && set.questions.length === 3, "passageSetForSeed", `bad set ${JSON.stringify(set).slice(0, 80)}`);
    for (const sq of set.questions) {
      const q = run(gen, seed + sq.index, { passageId: set.passageId, qIndex: sq.index });
      assert(q.display?.passage?.title === set.title && stripPrefix(q.prompt).stem === sq.prompt, "passageSetForSeed + rd.passage", `question ${sq.index} of ${set.passageId} not served`);
    }
  }
  const set4 = passageSetForSeed(4, 7);
  assert(byId.get(set4.passageId)?.level === 4, "passageSetForSeed level 4", `got level ${byId.get(set4.passageId)?.level}`);
  // the shared self-check calls gen({ rng, level }) with level 1 / 3 and no params: everything must work and vary
  for (const id of readingIds) {
    for (const L of [1, 3]) {
      const prompts = new Set<string>();
      for (let i = 0; i < N; i++) {
        const seed = hashString(`selfcheck:${id}:${L}:${i}`);
        const q = reading[id]({ rng: mulberry32(seed), level: L });
        if (checkChoiceShape(q, `${id} selfcheck-shape level ${L} seed ${seed}`)) prompts.add(q.prompt);
      }
      if (prompts.size <= N / 10) warn(`${id} at ctx.level ${L} with no params: ${prompts.size} distinct prompts (learn-selfcheck wants > ${N / 10})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Writing generators
// ---------------------------------------------------------------------------

console.log(`\nChecking ${Object.keys(writing).length} writing generator(s) × ${N} seeds…`);
{
  const gen = writing["wr.sentence"];
  const variants: Array<{ name: string; params?: Record<string, unknown> }> = [
    { name: "all" },
    ...Object.keys(SKILL_LABEL).map((k) => ({ name: k, params: { skill: k } })),
    { name: "array", params: { skill: ["because-but-so", "appositive"] } },
  ];
  for (const v of variants) {
    const where = `wr.sentence (${v.name})`;
    const served = new Set<string>();
    for (let i = 0; i < N; i++) {
      const seed = hashString(`reading-check:wr.sentence:${v.name}:${i}`);
      const tag = `${where} seed ${seed}`;
      const q = run(gen, seed, v.params);
      assert(q.type === "text", tag, `expected text, got ${q.type}`);
      if (q.type !== "text") continue;
      assert(q.selfCheck === true, tag, "selfCheck not true");
      assert(typeof q.modelAnswer === "string" && q.modelAnswer.length > 0, tag, "modelAnswer missing");
      assert(q.answer === q.modelAnswer, tag, "answer should equal modelAnswer");
      const w = COLE_WRITING.find((x) => x.prompt === q.prompt);
      assert(!!w, tag, "prompt is not a COLE_WRITING prompt");
      if (!w) continue;
      served.add(w.id);
      assert(q.modelAnswer === w.modelAnswer, tag, "modelAnswer differs from content");
      assert(q.explain.split("\n").every((l) => l.startsWith("Check: ")) && q.explain.split("\n").length === w.checklist.length, tag, "explain is not the checklist as Check: lines");
      assert(q.hint === w.checklist[0], tag, "hint is not the first checklist item");
      const skills = Array.isArray(v.params?.skill) ? (v.params?.skill as string[]) : v.params?.skill ? [v.params.skill as string] : [];
      if (skills.length) assert(skills.map((s) => SKILL_LABEL[s]).includes(w.skill), tag, `skill ${w.skill} not in ${skills.join(",")}`);
      const mentioned = COLE_PASSAGES.find((p) => w.prompt.includes(p.title));
      if (mentioned) assert(q.display?.passage?.text === mentioned.text, tag, `prompt mentions "${mentioned.title}" but display.passage is missing`);
      else assert(q.display === undefined, tag, "unexpected display on a prompt with no passage");
      assert(JSON.stringify(run(gen, seed, v.params)) === JSON.stringify(q), tag, "not deterministic");
    }
    const expected = COLE_WRITING.filter((w) => !v.params?.skill || (Array.isArray(v.params.skill) ? (v.params.skill as string[]) : [v.params.skill as string]).map((s) => SKILL_LABEL[s]).includes(w.skill)).length;
    assert(served.size === expected, where, `served ${served.size} of ${expected} prompts`);
    console.log(`  ${where}: ${served.size} prompts served`);
  }
  // unseen-first
  const seen = COLE_WRITING.filter((w) => w.skill === SKILL_LABEL["because-but-so"]).slice(0, 3).map((w) => w.id);
  for (let i = 0; i < 30; i++) {
    const q = run(gen, hashString(`seen:${i}`), { skill: "because-but-so", seen });
    const w = COLE_WRITING.find((x) => x.prompt === q.prompt);
    assert(!!w && !seen.includes(w.id), "wr.sentence seen", `served seen prompt ${w?.id}`);
  }
}

for (const id of ["wr.fragmentOrSentence", "wr.combine", "wr.punctuation"]) {
  const gen = writing[id];
  const positions = [0, 0, 0, 0];
  const prompts = new Set<string>();
  for (let i = 0; i < N; i++) {
    const seed = hashString(`reading-check:${id}:${i}`);
    const tag = `${id} seed ${seed}`;
    const q = run(gen, seed);
    if (!checkChoiceShape(q, tag)) continue;
    assert(q.display === undefined, tag, "writing choice items should not carry a passage");
    const labels = q.options.map((o) => o.label ?? "");
    const correct = labels[q.answerIndex];
    if (id === "wr.fragmentOrSentence") {
      const item = FRAGMENT_ITEMS.find((x) => q.prompt.includes(`“${x.text}”`));
      assert(!!item, tag, "prompt does not contain a bank item");
      const kindIndex: Record<string, number> = { sentence: 0, "no-subject": 1, "no-verb": 2, unfinished: 3 };
      if (item) assert(q.answerIndex === kindIndex[item.kind], tag, `answerIndex ${q.answerIndex} != kind ${item.kind}`);
      if (item?.kind === "sentence") assert(q.explain.includes(`"${item.subject}"`) && q.explain.includes(`"${item.verb}"`), tag, "explain does not name subject and verb");
      if (item && item.kind !== "sentence") assert(!!item.fix && q.explain.includes(item.fix), tag, "fragment explain lacks the fix");
    } else if (id === "wr.combine") {
      const item = COMBINE_ITEMS.find((x) => x.correct === correct);
      assert(!!item, tag, `correct option "${correct}" is not a bank answer`);
      if (item) {
        assert(labels.every((l) => l === item.correct || item.wrong.includes(l)), tag, "option not from the bank item");
        assert(item.parts.every((p) => q.prompt.includes(p)), tag, "prompt lacks the parts");
      }
    } else {
      const item = PUNCT_ITEMS.find((x) => x.correct === correct);
      assert(!!item, tag, `correct option "${correct}" is not a bank answer`);
      if (item) assert(labels.every((l) => l === item.correct || item.wrong.includes(l)), tag, "option not from the bank item");
    }
    positions[q.answerIndex] += 1;
    prompts.add(q.prompt);
    assert(JSON.stringify(run(gen, seed)) === JSON.stringify(q), tag, "not deterministic");
  }
  const maxShare = Math.max(...positions) / N;
  assert(maxShare < 0.45, id, `answer position share ${(maxShare * 100).toFixed(0)}% (${positions.join("/")})`);
  console.log(`  ${id}: ${prompts.size} distinct prompts, positions ${positions.join("/")}`);
  if (prompts.size <= N / 10) warn(`${id}: ${prompts.size} distinct prompts (learn-selfcheck wants > ${N / 10}; the bank has that many items)`);
}

// bank sanity
{
  assert(new Set(FRAGMENT_ITEMS.map((x) => x.text)).size === FRAGMENT_ITEMS.length, "FRAGMENT_ITEMS", "duplicate texts");
  for (const [i, c] of COMBINE_ITEMS.entries()) assert(!c.wrong.includes(c.correct) && new Set(c.wrong).size === 3, `COMBINE_ITEMS[${i}]`, "options not unique");
  for (const [i, c] of PUNCT_ITEMS.entries()) assert(!c.wrong.includes(c.correct) && new Set(c.wrong).size === 3, `PUNCT_ITEMS[${i}]`, "options not unique");
  console.log(`  banks: ${FRAGMENT_ITEMS.length} fragment items, ${COMBINE_ITEMS.length} combine items, ${PUNCT_ITEMS.length} punctuation items, ${COLE_WRITING.length} writing prompts`);
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

{
  const all = { ...reading, ...writing };
  const ids = new Set<string>();
  for (const s of COLE_READING_SKILLS) {
    const where = `catalog ${s.id}`;
    assert(!ids.has(s.id), where, "duplicate id");
    ids.add(s.id);
    assert(s.track === "cole", where, "track must be cole");
    assert(!!all[s.generator], where, `generator "${s.generator}" not in reading/writing`);
    assert(s.standards.length > 0 && s.parentTip.length > 0 && s.title.length > 0 && s.kidTitle.length > 0, where, "fields missing");
    assert(!!s.intro && s.intro.length >= 2 && s.intro.length <= 3, where, "intro should have 2-3 lines");
    for (const pre of s.prereqs) assert(COLE_READING_SKILLS.some((x) => x.id === pre), where, `prereq ${pre} missing`);
    assert(s.estMinutes === (s.subject === "reading" ? 10 : 6), where, `estMinutes ${s.estMinutes}`);
    if (s.subject === "reading") assert(s.testOut === false, where, "passage skills are practiced, not compacted");
    const gen = all[s.generator];
    if (!gen) continue;
    for (let i = 0; i < 20; i++) {
      const q = gen({ rng: mulberry32(hashString(`${s.id}:${i}`)), level: typeof s.params?.level === "number" ? s.params.level : undefined, params: s.params });
      assert(q.prompt.length > 0, where, "makeQuestion-style call produced no prompt");
      if (s.subject === "reading") {
        const p = byTitle.get(q.display?.passage?.title ?? "");
        const L = s.params?.level as number;
        const spread = (s.params?.spread as number | undefined) ?? 0;
        assert(!!p && Math.abs(p.level - L) <= spread + 1e-9, where, `served ${p?.id} level ${p?.level} for level ${L} ± ${spread}`);
      }
    }
  }
  console.log(`\n${COLE_READING_SKILLS.length} skills: ${COLE_READING_SKILLS.map((s) => s.id).join(", ")}`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

for (const w of warnings) console.log(`  ! ${w}`);
if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} failure(s) out of ${checks} checks:\n`);
  for (const f of failures.slice(0, 40)) console.error(`  - [${f.where}] ${f.message}`);
  if (failures.length > 40) console.error(`  … and ${failures.length - 40} more`);
  process.exit(1);
} else {
  console.log(`\n✓ All ${checks} checks passed (${readingIds.length + Object.keys(writing).length} generators: ${[...readingIds, ...Object.keys(writing)].join(", ")}).`);
}
