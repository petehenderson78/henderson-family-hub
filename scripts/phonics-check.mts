/**
 * Phonics + Lily reading generator check: `node scripts/phonics-check.mts`.
 *
 * Plain Node 22+ (type stripping) with the resolve hook from
 * ./ts-resolve-hooks.mjs, like learn-selfcheck.mts. Runs every generator in
 * generators/phonics.ts × every stage (params.stage and params.upTo) × 150
 * seeds, and the passage generators × levels 1 / 1.5 / 2 × 150 seeds:
 * prompt / explain / hint present, 3 unique options, answerIndex valid and
 * spread (no slot > 45% over the 150 seeds; a flagged slot is re-measured over
 * 3000 fresh seeds and fails only if it is still above 1/3 + 4σ there, because a
 * uniform shuffle trips the 45% screen in ~0.5% of configs, about once per run
 * across ~300 choice configs), tiles answers are stage words spellable from the
 * tiles, tap answers 2-5, equal to an independent phoneme count and varied (no
 * box count above 80% of a config's items), picture items pair word ↔ emoji
 * exactly as the content does, missing-sound blanks rebuild the pictured word,
 * rhymes share the rime, decoding items never speak the answer word, sight-word
 * items speak the target and never print it in the prompt, passage text equals
 * the content, attempt cycling, determinism, and catalog integrity (unique ids,
 * prereqs exist, generator ids exist, every stage covered, single root).
 * Exits 1 with a readable report on any failure.
 */

import { register } from "node:module";
import type { ChoiceQuestion, GeneratorContext, Question, Skill } from "../src/lib/learn/types";
import type { PhonicsStage } from "../src/lib/learn/content/types";

register("./ts-resolve-hooks.mjs", import.meta.url);

const phMod = await import("../src/lib/learn/generators/phonics");
const contentMod = await import("../src/lib/learn/content/phonics-lily");
const passagesMod = await import("../src/lib/learn/content/passages-lily");
const rngMod = await import("../src/lib/learn/rng");
const catalogMod = await import("../src/lib/learn/catalog-reading-lily");
const gradeMod = await import("../src/lib/learn/grade");

const { generators, lilyPassageSetForSeed, lilyPassagePool } = phMod;
const { PHONICS_STAGES, SIGHT_WORD_GROUPS } = contentMod;
const { LILY_PASSAGES } = passagesMod;
const { mulberry32, hashString } = rngMod;
const { LILY_READING_SKILLS } = catalogMod;
const { gradeAnswer } = gradeMod;

const N = 150;
const MAX_POSITION_SHARE = 0.45;
const MIN_POSITION_SAMPLES = 30;
/** Fresh seeds for re-measuring a slot the 150-seed screen flagged, and the z-score it must stay under. */
const CONFIRM_N = 3000;
const CONFIRM_Z = 4;
/** Sound boxes: the most common box count may be the answer at most this share of a config's items. */
const MAX_TAP_SHARE = 0.8;


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
function lc(s: string): string {
  return s.trim().toLowerCase();
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function containsToken(hay: string, needle: string): boolean {
  const n = needle.trim();
  if (!n) return false;
  return new RegExp(`(^|[^\\w])${escapeRe(n)}(?=$|[^\\w])`, "i").test(hay);
}
function optionKey(o: { label?: string; svg?: string; emoji?: string }): string {
  return JSON.stringify([o.label ?? "", o.emoji ?? "", o.svg ?? ""]);
}
function tilesCanSpell(tiles: string[], answer: string): boolean {
  const target = answer.replace(/\s+/g, "").toLowerCase();
  const pool = tiles.map((t) => t.replace(/\s+/g, "").toLowerCase());
  const used = new Array(pool.length).fill(false);
  function walk(pos: number): boolean {
    if (pos === target.length) return true;
    for (let i = 0; i < pool.length; i++) {
      if (used[i] || !pool[i] || !target.startsWith(pool[i], pos)) continue;
      used[i] = true;
      if (walk(pos + pool[i].length)) return true;
      used[i] = false;
    }
    return false;
  }
  return walk(0);
}

// ---------------------------------------------------------------------------
// content indexes
// ---------------------------------------------------------------------------

const STAGES: PhonicsStage[] = PHONICS_STAGES.slice().sort((a, b) => a.order - b.order);
const STAGE_ORDER = new Map(STAGES.map((s) => [s.id, s.order]));
/** word → { emoji, order } (first stage wins) */
const WORD_INFO = new Map<string, { emoji?: string; order: number; stage: string }>();
for (const s of STAGES) for (const w of s.words) if (!WORD_INFO.has(lc(w.word))) WORD_INFO.set(lc(w.word), { emoji: w.emoji, order: s.order, stage: s.id });
const SENTENCE_STAGE = new Map<string, number>();
for (const s of STAGES) for (const sent of s.sentences) if (!SENTENCE_STAGE.has(sent)) SENTENCE_STAGE.set(sent, s.order);
const PASSAGE_BY_TITLE = new Map(LILY_PASSAGES.map((p) => [p.title, p] as const));

function wordOrder(word: string): number {
  return WORD_INFO.get(lc(word))?.order ?? 0;
}

/**
 * Independent phoneme counter (written separately from the generator's parser):
 * a table of multi-letter graphemes scanned left to right, a silent final e
 * (after a consonant, when the word has another vowel), and one sound per
 * remaining letter.
 *   one sound:  digraphs sh ch th wh ck ng, trigraphs tch and final dge (bridge =
 *               b-r-i-dge, judge = j-u-dge; the e of dge is part of it, not a magic
 *               e), doubled consonants, vowel teams, r-controlled vowels (ar or ore
 *               er ir ur) and magic e (the e is silent: cake = k-a_e-k)
 *   two sounds: x (/k/ /s/: ox = 3, box = 4) and qu (/k/ /w/)
 *   letter by letter: blends (flag = 4), nk (/ng/ /k/: think = th-i-n-k = 4), and
 *               a vowel + r when the r starts the next syllable (gi-raffe = 5)
 * -ed / -ing words are not counted here: the sound boxes never use the suffix
 * stage (asserted below).
 */
const R_STARTS_SYLLABLE = new Set(["giraffe"]);

function countPhonemes(word: string, stageOrder: number): number {
  const w = lc(word);
  const diph = stageOrder >= (STAGE_ORDER.get("diphthongs") ?? 20);
  const vowelsRe = /[aeiou]|y$/;
  const finalDge = w.endsWith("dge");
  const silentE = !finalDge && w.length > 2 && w.endsWith("e") && /[bcdfghjklmnpqrstvwxz]/.test(w[w.length - 2]) && vowelsRe.test(w.slice(0, -1));
  const body = silentE ? w.slice(0, -1) : w;
  const multi: string[] = ["igh", "dge", "tch", "ore", "sh", "ch", "th", "wh", "ck", "ai", "ay", "ee", "ea", "oa", "oe", "ow", "ar", "or", "er", "ir", "ur", ...(diph ? ["ou", "oi", "oy", "au", "aw"] : [])];
  let count = 0;
  let i = 0;
  while (i < body.length) {
    const rest = body.slice(i);
    let took = 0;
    let sounds = 1;
    for (const m of multi) {
      if (rest.startsWith(m)) {
        // "ore" and "dge" only at the end of the whole word; "ng" handled below
        if ((m === "ore" || m === "dge") && i + 3 !== w.length) continue;
        if (/^[aeiou]r$/.test(m) && R_STARTS_SYLLABLE.has(w)) continue;
        took = m.length;
        break;
      }
    }
    if (!took && rest.startsWith("qu")) {
      took = 2;
      sounds = 2;
    }
    if (!took && rest[0] === "x") {
      took = 1;
      sounds = 2;
    }
    if (!took && rest.startsWith("ng") && (i + 2 === w.length || /[bcdfghjklmnpqrstvwxz]/.test(w[i + 2] ?? ""))) took = 2;
    if (!took && rest.length >= 2 && rest[0] === rest[1] && /[bcdfglmnprstz]/.test(rest[0])) took = 2;
    if (!took) took = 1;
    count += sounds;
    i += took;
  }
  return count;
}

// ---------------------------------------------------------------------------
// generator runs
// ---------------------------------------------------------------------------

function run(gen: (ctx: GeneratorContext) => Question, seed: number, params: Record<string, unknown>): Question {
  return gen({ rng: mulberry32(seed), params });
}

function checkCommon(q: Question, tag: string) {
  assert(typeof q.prompt === "string" && q.prompt.trim().length > 0 && !bad(q.prompt), tag, "prompt empty or bad");
  assert(typeof q.explain === "string" && q.explain.trim().length > 0 && !bad(q.explain), tag, "explain empty or bad");
  assert(typeof q.hint === "string" && q.hint.trim().length > 0 && !bad(q.hint), tag, "hint empty or bad");
  assert(!/\bwrong\b/i.test(q.explain) && !/\bwrong\b/i.test(q.hint), tag, 'explain/hint must not say "wrong"');
  assert(typeof q.display?.speak === "string" && q.display.speak.trim().length > 0 && !bad(q.display.speak), tag, "display.speak missing (Lily's player speaks it)");
}

function checkChoice(q: Question, tag: string, expectOptions = 3): q is ChoiceQuestion {
  if (q.type !== "choice") {
    fail(tag, `expected choice, got ${q.type}`);
    return false;
  }
  assert(q.options.length === expectOptions, tag, `expected ${expectOptions} options, got ${q.options.length}`);
  const keys = q.options.map(optionKey);
  assert(new Set(keys).size === keys.length, tag, `options not unique: ${keys.join(" ")}`);
  assert(q.options.every((o) => !!(o.label || o.emoji) && !bad(o.label ?? "") && !bad(o.emoji ?? "")), tag, "option without label/emoji");
  assert(Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.options.length, tag, `answerIndex out of range: ${q.answerIndex}`);
  assert(gradeAnswer(q, String(q.answerIndex)), tag, "gradeAnswer rejects the correct choice");
  return true;
}

interface Stats {
  positions: Map<number, number>;
  positionSamples: number;
  answers: Set<string>;
  items: Set<string>;
}

function newStats(): Stats {
  return { positions: new Map(), positionSamples: 0, answers: new Set(), items: new Set() };
}

function recordChoice(st: Stats, q: ChoiceQuestion) {
  st.positionSamples += 1;
  st.positions.set(q.answerIndex, (st.positions.get(q.answerIndex) ?? 0) + 1);
  st.answers.add(optionKey(q.options[q.answerIndex]));
  st.items.add(q.prompt + "|" + q.options.map(optionKey).join(","));
}

function distText(m: Map<number, number>): string {
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
}

/** answerIndex counts over `n` fresh seeds (for re-measuring a flagged config). */
function positionCounts(gen: (ctx: GeneratorContext) => Question, params: Record<string, unknown>, n: number, ns: string): Map<number, number> {
  const m = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const q = run(gen, hashString(`${ns}:${i}`), params);
    if (q.type === "choice") m.set(q.answerIndex, (m.get(q.answerIndex) ?? 0) + 1);
  }
  return m;
}

/** Largest slot share a uniform k-way shuffle stays under over n seeds (z = CONFIRM_Z). */
function shareLimit(k: number, n: number): number {
  const p = 1 / k;
  return p + CONFIRM_Z * Math.sqrt((p * (1 - p)) / n);
}

function finishStats(st: Stats, where: string, minItems: number, remeasure?: (n: number) => Map<number, number>) {
  assert(st.answers.size > 1, where, `all ${N} answers identical`);
  assert(st.items.size >= minItems, where, `low variety: only ${st.items.size} distinct items`);
  if (st.positionSamples < MIN_POSITION_SAMPLES) return;
  const share = Math.max(...st.positions.values()) / st.positionSamples;
  const dist = distText(st.positions);
  if (share > MAX_POSITION_SHARE && remeasure) {
    // A uniform shuffle lands > 45% of 150 answers in one slot in ~0.5% of configs (z ≈ 3), so with
    // ~300 choice configs the screen raises about one false alarm per run. Re-measure over fresh
    // seeds and fail only when the skew is real there too.
    const big = remeasure(CONFIRM_N);
    const total = [...big.values()].reduce((a, b) => a + b, 0);
    const bigShare = total > 0 ? Math.max(...big.values()) / total : 1;
    const limit = shareLimit(3, total);
    const screen = `${Math.round(share * 100)}% of ${st.positionSamples} answers in one slot (${dist})`;
    const confirm = `${(bigShare * 100).toFixed(1)}% over ${total} fresh seeds (${distText(big)}; uniform limit ${(limit * 100).toFixed(1)}%)`;
    assert(bigShare <= limit, where, `correct option position is skewed: ${screen}, and ${confirm}`);
    if (bigShare <= limit) warn(`${where}: ${screen}, but ${confirm}: sampling noise, not a skew`);
    return;
  }
  assert(share <= MAX_POSITION_SHARE, where, `correct option position is skewed (${Math.round(share * 100)}% in one slot; ${dist})`);
}

/** The pool a scope allows: words from stages with order <= maxOrder. */
function inPool(word: string, maxOrder: number): boolean {
  const info = WORD_INFO.get(lc(word));
  return !!info && info.order <= maxOrder;
}

function sentenceTokens(sentence: string): string[] {
  return sentence.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
}

/** Emojis of the content words in a sentence (singular or plural), for the scene checks. */
function sentenceEmojis(sentence: string, maxOrder: number): Set<string> {
  const out = new Set<string>();
  for (const t of sentenceTokens(sentence)) {
    const base = WORD_INFO.has(t) ? t : t.endsWith("s") && WORD_INFO.has(t.slice(0, -1)) ? t.slice(0, -1) : undefined;
    if (!base) continue;
    const info = WORD_INFO.get(base)!;
    if (info.emoji && info.order <= maxOrder) out.add(info.emoji);
  }
  return out;
}

/** Spelled rime: from the first vowel letter (or a final y) to the end. */
function rimeOf(word: string): string {
  const w = lc(word);
  const m = /[aeiou].*$|y$/.exec(w);
  return m ? m[0] : w;
}

function emojiChars(s: string): string[] {
  return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)].map((x) => x.segment);
}

const PH_IDS = Object.keys(generators).filter((id) => id.startsWith("ph."));
const RD_IDS = Object.keys(generators).filter((id) => id.startsWith("rd."));
console.log(`Checking ${PH_IDS.length} phonics generators × ${STAGES.length} stages × 2 modes × ${N} seeds, ${RD_IDS.length} reading generators × 3 levels × ${N} seeds…`);

const segmentWordsSeen = new Map<string, number>();

for (const id of PH_IDS) {
  const gen = generators[id];
  for (const mode of ["stage", "upTo"] as const) {
    for (const stage of STAGES) {
      const where = `generator ${id} (${mode}=${stage.id})`;
      const maxOrder = stage.order;
      const targetMin = mode === "stage" ? stage.order : 1;
      const params: Record<string, unknown> = id === "ph.sightWord" ? { group: ((stage.order - 1) % 20) + 1 } : { [mode]: stage.id };
      const st = newStats();
      const tapAnswers = new Set<number>();
      const tapCounts = new Map<number, number>();
      const tileAnswers = new Set<string>();
      for (let i = 0; i < N; i++) {
        const seed = hashString(`phonics:${id}:${mode}:${stage.id}:${i}`);
        let q: Question;
        try {
          q = run(gen, seed, params);
        } catch (err) {
          fail(where, `seed ${seed} threw: ${(err as Error).message}`);
          continue;
        }
        const tag = `${where} seed ${seed}`;
        checkCommon(q, tag);
        const speak = q.display?.speak ?? "";

        if (id === "ph.wordPicture") {
          if (!checkChoice(q, tag)) continue;
          recordChoice(st, q);
          const word = q.prompt.trim();
          const info = WORD_INFO.get(lc(word));
          assert(!!info && info.order <= maxOrder && info.order >= targetMin, tag, `prompt word "${word}" is not a target-stage word`);
          const correct = q.options[q.answerIndex];
          assert(!!info?.emoji && correct.emoji === info.emoji, tag, `correct emoji ${correct.emoji} is not the content emoji for "${word}" (${info?.emoji})`);
          assert(q.options.every((o, k) => k === q.answerIndex || (o.emoji && o.emoji !== info?.emoji)), tag, "a distractor shows the target's emoji");
          assert(!containsToken(speak, word), tag, `speak gives the answer: "${speak}"`);
        } else if (id === "ph.pictureWord") {
          if (!checkChoice(q, tag)) continue;
          recordChoice(st, q);
          const correct = q.options[q.answerIndex].label ?? "";
          const info = WORD_INFO.get(lc(correct));
          assert(!!info && info.order <= maxOrder && info.order >= targetMin, tag, `correct word "${correct}" not in the target stages`);
          assert(!!info?.emoji && q.display?.emoji === info.emoji, tag, `display.emoji ${q.display?.emoji} is not the content emoji for "${correct}"`);
          for (const o of q.options) {
            const oi = WORD_INFO.get(lc(o.label ?? ""));
            assert(!!oi && oi.order <= maxOrder, tag, `option "${o.label}" is not a pool word`);
            if (o.label !== correct) assert(!oi?.emoji || oi.emoji !== info?.emoji, tag, `distractor "${o.label}" has the same picture as the answer`);
          }
          assert(!containsToken(speak, correct) && !containsToken(q.prompt, correct) && !containsToken(q.hint, correct), tag, `speak/prompt/hint gives the answer "${correct}"`);
        } else if (id === "ph.buildWord") {
          if (q.type !== "tiles") {
            fail(tag, `expected tiles, got ${q.type}`);
            continue;
          }
          const info = WORD_INFO.get(lc(q.answer));
          assert(!!info && info.order <= maxOrder && info.order >= targetMin, tag, `tiles answer "${q.answer}" is not a target-stage word`);
          assert(q.tiles.length >= 2 && q.tiles.length <= 12 && q.tiles.every((t) => t.length > 0), tag, `tiles bad: ${JSON.stringify(q.tiles)}`);
          assert(tilesCanSpell(q.tiles, q.answer), tag, `tiles ${JSON.stringify(q.tiles)} cannot spell "${q.answer}"`);
          assert(q.slots >= 1 && q.slots <= q.tiles.length, tag, `slots ${q.slots} out of range`);
          const letters = q.answer.toLowerCase().split("");
          assert(letters.every((ch) => q.tiles.some((t) => t.toLowerCase().includes(ch))), tag, "an answer letter is missing from the tiles");
          assert(q.tiles.length - q.slots >= 1 && q.tiles.length - q.slots <= 2, tag, `expected 1-2 distractor tiles, got ${q.tiles.length - q.slots}`);
          assert(gradeAnswer(q, q.answer), tag, "gradeAnswer rejects the tiles answer");
          assert(!!info?.emoji && q.display?.emoji === info.emoji, tag, `display.emoji ${q.display?.emoji} is not the content emoji for "${q.answer}"`);
          assert(!containsToken(speak, q.answer) && !containsToken(q.prompt, q.answer) && !containsToken(q.hint, q.answer), tag, `speak/prompt/hint gives the answer "${q.answer}"`);
          tileAnswers.add(lc(q.answer));
          st.items.add(q.answer + q.tiles.join(","));
          st.answers.add(q.answer);
        } else if (id === "ph.missingSound") {
          if (!checkChoice(q, tag)) continue;
          recordChoice(st, q);
          const shown = q.prompt;
          assert((shown.match(/_/g) ?? []).length === 1, tag, `prompt must show exactly one blank: "${shown}"`);
          const correct = q.options[q.answerIndex].label ?? "";
          const rebuilt = shown.replace(/\s+/g, "").replace("_", correct);
          const info = WORD_INFO.get(lc(rebuilt));
          assert(!!info && info.order <= maxOrder && info.order >= targetMin, tag, `blank + "${correct}" rebuilds "${rebuilt}", not a target-stage word`);
          assert(!!info?.emoji && q.display?.emoji === info.emoji, tag, `display.emoji ${q.display?.emoji} is not the content emoji for "${rebuilt}"`);
          for (const o of q.options) {
            const alt = shown.replace(/\s+/g, "").replace("_", o.label ?? "");
            if (o.label !== correct) assert(lc(alt) !== lc(rebuilt), tag, "a distractor also rebuilds the word");
          }
          assert(!containsToken(speak, rebuilt) && !containsToken(q.hint, rebuilt), tag, `speak/hint gives the word "${rebuilt}"`);
        } else if (id === "ph.rhyme") {
          if (!checkChoice(q, tag)) continue;
          recordChoice(st, q);
          const m = /rhymes with (\S+)\?/.exec(q.prompt);
          const target = m ? m[1] : "";
          assert(inPool(target, maxOrder), tag, `prompt word "${target}" not in the pool`);
          const correct = q.options[q.answerIndex].label ?? "";
          assert(inPool(correct, maxOrder) && lc(correct) !== lc(target), tag, `answer "${correct}" not a distinct pool word`);
          assert(rimeOf(correct) === rimeOf(target), tag, `"${correct}" does not share the rime of "${target}"`);
          for (const o of q.options) if (o.label !== correct) assert(rimeOf(o.label ?? "") !== rimeOf(target), tag, `distractor "${o.label}" also rhymes with "${target}"`);
          assert(containsToken(speak, target), tag, "rhyme item must speak the prompt word");
        } else if (id === "ph.soundSort") {
          if (!checkChoice(q, tag)) continue;
          recordChoice(st, q);
          const correct = q.options[q.answerIndex].label ?? "";
          assert(inPool(correct, maxOrder) && wordOrder(correct) >= targetMin, tag, `answer "${correct}" not a target-stage word`);
          for (const o of q.options) assert(inPool(o.label ?? "", maxOrder), tag, `option "${o.label}" not in the pool`);
          const ex = /(?:like in|same sound as) (\S+)\?/.exec(q.prompt);
          if (ex) assert(q.options.every((o) => lc(o.label ?? "") !== lc(ex[1])), tag, `example word "${ex[1]}" is also an option`);
          assert(!containsToken(speak, correct), tag, `speak names the answer "${correct}"`);
        } else if (id === "ph.segmentSounds") {
          if (q.type !== "tap") {
            fail(tag, `expected tap, got ${q.type}`);
            continue;
          }
          const m = /"([^"]+)"/.exec(q.prompt);
          const word = m ? m[1] : "";
          const info = WORD_INFO.get(lc(word));
          assert(!!info && info.order <= maxOrder, tag, `word "${word}" not in the pool`);
          assert(info?.stage !== "suffixes-ed-ing", tag, `"${word}" is a suffix-stage word; -ed / -ing endings are not counted by the sound boxes`);
          assert(q.rows === 1 && q.cols === 5 && q.variant === "plain", tag, `expected a 1×5 plain grid, got ${q.rows}×${q.cols} ${q.variant}`);
          assert(q.answer >= 2 && q.answer <= 5, tag, `tap answer ${q.answer} outside 2-5`);
          const independent = countPhonemes(word, info?.order ?? 22);
          assert(q.answer === independent, tag, `"${word}": generator counts ${q.answer} sounds, independent counter ${independent}`);
          assert(containsToken(speak, word), tag, "segment item must speak the word");
          if (info?.emoji) assert(q.display?.emoji === info.emoji, tag, "display.emoji differs from the content emoji");
          assert(gradeAnswer(q, String(q.answer)), tag, "gradeAnswer rejects the tap answer");
          tapAnswers.add(q.answer);
          tapCounts.set(q.answer, (tapCounts.get(q.answer) ?? 0) + 1);
          segmentWordsSeen.set(lc(word), q.answer);
          st.items.add(word);
          st.answers.add(String(q.answer));
        } else if (id === "ph.sightWord") {
          if (!checkChoice(q, tag)) continue;
          recordChoice(st, q);
          const g = params.group as number;
          const allowed = new Set(SIGHT_WORD_GROUPS.filter((x) => x.order <= g).flatMap((x) => x.words.map(lc)));
          const correct = q.options[q.answerIndex].label ?? "";
          assert(allowed.has(lc(correct)), tag, `"${correct}" is not in Fry groups 1-${g}`);
          for (const o of q.options) assert(allowed.has(lc(o.label ?? "")), tag, `option "${o.label}" is not in Fry groups 1-${g}`);
          assert(containsToken(speak, correct), tag, `sight-word item must speak the target "${correct}" (speak: "${speak}")`);
          assert(!containsToken(q.prompt, correct), tag, "prompt must not print the target");
        } else if (id === "ph.sentenceRead") {
          if (!checkChoice(q, tag)) continue;
          recordChoice(st, q);
          const sentence = q.prompt;
          const sOrder = SENTENCE_STAGE.get(sentence);
          assert(sOrder !== undefined && sOrder <= maxOrder && sOrder >= targetMin, tag, `prompt is not a target-stage sentence: "${sentence}"`);
          const inSentence = sentenceEmojis(sentence, maxOrder);
          const correct = emojiChars(q.options[q.answerIndex].emoji ?? "");
          assert(correct.length >= 1 && correct.length <= 3 && correct.every((e) => inSentence.has(e)), tag, `correct scene ${correct.join("")} has an emoji that is not a word of "${sentence}"`);
          for (const o of q.options) {
            if (o === q.options[q.answerIndex]) continue;
            const es = emojiChars(o.emoji ?? "");
            assert(es.length >= 1 && es.every((e) => !inSentence.has(e)), tag, `distractor scene ${o.emoji} shares a picture with "${sentence}"`);
          }
          assert(speak === "Read the sentence. Tap the picture that matches.", tag, `speak must not read the sentence: "${speak}"`);
        } else {
          fail(tag, `no checks for generator ${id}`);
        }
      }
      if (id === "ph.buildWord") assert(tileAnswers.size >= 3, where, `only ${tileAnswers.size} distinct words built`);
      if (id === "ph.segmentSounds") {
        assert(tapAnswers.size >= 2, where, `all tap answers equal ${[...tapAnswers][0]}`);
        const top = Math.max(0, ...tapCounts.values());
        assert(top <= MAX_TAP_SHARE * N, where, `one box count is the answer ${Math.round((100 * top) / N)}% of the time (${distText(tapCounts)}): a child could tap it without listening`);
      }
      finishStats(st, where, 8, (n) => positionCounts(gen, params, n, `phonics-confirm:${id}:${mode}:${stage.id}`));
      // determinism
      const a = JSON.stringify(run(gen, 12345, params));
      const b = JSON.stringify(run(gen, 12345, params));
      assert(a === b, where, "not deterministic for the same seed");
    }
  }
}

// Independent counter vs generator parser across every word the sound boxes used.
{
  const disagree: string[] = [];
  for (const [word, n] of segmentWordsSeen) {
    const m = countPhonemes(word, wordOrder(word));
    if (m !== n) disagree.push(`${word} (generator ${n}, checker ${m})`);
  }
  console.log(`sound boxes: ${segmentWordsSeen.size} distinct words used, independent counter agrees on ${segmentWordsSeen.size - disagree.length}`);
  assert(disagree.length === 0, "sound boxes", `phoneme counts disagree: ${disagree.join("; ")}`);
}

// ---------------------------------------------------------------------------
// passages
// ---------------------------------------------------------------------------

for (const id of RD_IDS) {
  const gen = generators[id];
  for (const level of [1, 1.5, 2]) {
    const where = `generator ${id} (level ${level})`;
    const st = newStats();
    const seen = new Set<string>();
    for (let i = 0; i < N; i++) {
      const seed = hashString(`phonics:${id}:${level}:${i}`);
      let q: Question;
      try {
        q = run(gen, seed, { level });
      } catch (err) {
        fail(where, `seed ${seed} threw: ${(err as Error).message}`);
        continue;
      }
      const tag = `${where} seed ${seed}`;
      checkCommon(q, tag);
      if (!checkChoice(q, tag)) continue;
      recordChoice(st, q);
      const passage = q.display?.passage;
      assert(!!passage, tag, "display.passage missing");
      if (!passage) continue;
      const p = PASSAGE_BY_TITLE.get(passage.title);
      assert(!!p, tag, `passage title not in content: ${passage.title}`);
      if (!p) continue;
      seen.add(p.id);
      assert(passage.text === p.text && passage.level === p.level, tag, "display.passage differs from the content");
      assert(p.level === level, tag, `passage level ${p.level}, asked for ${level}`);
      const cq = p.questions.find((x) => x.prompt === q.prompt);
      assert(!!cq, tag, `prompt is not one of the passage's questions: ${q.prompt}`);
      if (!cq) continue;
      assert(q.options[q.answerIndex].label === cq.options[cq.answerIndex], tag, "correct option differs from the content answer");
      assert(q.options.map((o) => o.label).sort().join("|") === cq.options.slice().sort().join("|"), tag, "options differ from the content options");
      assert(q.explain === cq.explain && q.hint === cq.hint, tag, "explain/hint differ from the content");
      const speak = q.display?.speak ?? "";
      if (id === "rd.lilyPassage") {
        assert(speak === cq.prompt, tag, `speak must be the question only: "${speak.slice(0, 60)}"`);
      } else {
        const flat = p.text.replace(/\s*\n+\s*/g, " ");
        assert(speak.includes(flat) && speak.endsWith(cq.prompt) && speak.startsWith(p.title), tag, "listen item must speak title, passage text and the question");
      }
    }
    const pool = LILY_PASSAGES.filter((p) => p.level === level);
    assert(seen.size === pool.length, where, `only ${seen.size} of ${pool.length} level-${level} passages appeared`);
    finishStats(st, where, 8, (n) => positionCounts(gen, { level }, n, `phonics-confirm:${id}:${level}`));
    // attempt cycling: pool.length consecutive attempts see distinct passages
    const titles = new Set<string>();
    for (let a = 0; a < pool.length; a++) {
      const q = run(gen, 1, { level, attempt: a });
      titles.add(q.display?.passage?.title ?? "");
    }
    assert(titles.size === pool.length, where, `attempt cycling repeats a passage (${titles.size}/${pool.length})`);
    const a = JSON.stringify(run(gen, 777, { level }));
    const b = JSON.stringify(run(gen, 777, { level }));
    assert(a === b, where, "not deterministic for the same seed");
  }
  // upTo gating keeps to decodable passages
  {
    const q = run(gen, 3, { level: 1, upTo: "digraphs" });
    const p = PASSAGE_BY_TITLE.get(q.display?.passage?.title ?? "");
    const maxOrder = Math.max(0, ...(p?.phonicsStages ?? []).map((s) => STAGE_ORDER.get(s) ?? 99));
    assert(!!p && maxOrder <= (STAGE_ORDER.get("digraphs") ?? 6), `generator ${id} upTo`, `passage ${p?.id} needs stage order ${maxOrder} > digraphs`);
    const gated = lilyPassagePool(1, STAGE_ORDER.get("digraphs"));
    assert(gated.length >= 2 && gated.every((x) => x.phonicsStages!.every((s) => (STAGE_ORDER.get(s) ?? 99) <= 6)), `lilyPassagePool upTo`, `gated pool wrong: ${gated.map((x) => x.id).join(",")}`);
  }
  // forced passage + question
  {
    const q = run(gen, 5, { passageId: "lily-p03", qIndex: 1 });
    assert(q.display?.passage?.title === "The Wet Hen" && q.prompt === LILY_PASSAGES[2].questions[1].prompt, `generator ${id} passageId/qIndex`, "forced passage/question not honoured");
  }
}

// lilyPassageSetForSeed
for (const level of [1, 1.5, 2]) {
  const s1 = lilyPassageSetForSeed(level, 4242);
  const s2 = lilyPassageSetForSeed(level, 4242);
  assert(JSON.stringify(s1) === JSON.stringify(s2), `lilyPassageSetForSeed(${level})`, "not deterministic");
  const p = LILY_PASSAGES.find((x) => x.id === s1.passageId);
  assert(!!p && p.level === level && s1.questions.length === p.questions.length && s1.questions.length === 2, `lilyPassageSetForSeed(${level})`, `bad set ${JSON.stringify(s1)}`);
  const q = run(generators["rd.lilyPassage"], 9, { passageId: s1.passageId, qIndex: s1.questions[1].index });
  assert(q.display?.passage?.title === s1.title && q.prompt === s1.questions[1].prompt, `lilyPassageSetForSeed(${level})`, "set does not drive the generator");
}

// ---------------------------------------------------------------------------
// catalog
// ---------------------------------------------------------------------------

{
  const skills: Skill[] = LILY_READING_SKILLS;
  const ids = new Set<string>();
  const roots: string[] = [];
  for (const s of skills) {
    const where = `catalog ${s.id}`;
    assert(!ids.has(s.id), where, "duplicate skill id");
    ids.add(s.id);
    assert(s.track === "lily", where, `track ${s.track}`);
    assert(s.subject === "phonics" || s.subject === "reading", where, `subject ${s.subject}`);
    assert(!!generators[s.generator], where, `generator "${s.generator}" is not in generators/phonics.ts`);
    assert(s.grade === 1 || s.grade === 2, where, `grade ${s.grade}`);
    assert(s.title.length > 0 && s.kidTitle.length > 0 && s.parentTip.length > 0, where, "titles/parentTip missing");
    assert(s.standards.length > 0, where, "standards missing");
    assert(!!s.intro && s.intro.length >= 2 && s.intro.length <= 3 && s.intro.every((l) => l.trim().length > 0), where, "intro needs 2-3 non-empty lines");
    assert(s.estMinutes > 0, where, "estMinutes");
    assert(!s.prereqs.includes(s.id), where, "lists itself as a prereq");
    if (s.prereqs.length === 0) roots.push(s.id);
    for (const pre of s.prereqs) {
      assert(skills.some((x) => x.id === pre), where, `prereq "${pre}" not in LILY_READING_SKILLS`);
      assert(skills.findIndex((x) => x.id === pre) < skills.findIndex((x) => x.id === s.id), where, `prereq "${pre}" comes after the skill in array order`);
    }
    try {
      const a = JSON.stringify(run(generators[s.generator], 42, s.params ?? {}));
      const b = JSON.stringify(run(generators[s.generator], 42, s.params ?? {}));
      assert(a === b, where, "not deterministic with the skill's params");
    } catch (err) {
      fail(where, `generator threw with the skill's params: ${(err as Error).message}`);
    }
  }
  assert(roots.length === 1 && roots[0] === "p1.cvc-a.read" && skills[0].id === "p1.cvc-a.read", "catalog roots", `expected the single root p1.cvc-a.read first, got ${roots.join(",")} (first: ${skills[0].id})`);
  for (const stage of STAGES) {
    const p = stage.order <= 16 ? "p1" : "p2";
    for (const kind of ["read", "build", "sounds"]) assert(ids.has(`${p}.${stage.id}.${kind}`), `catalog stage ${stage.id}`, `missing ${p}.${stage.id}.${kind}`);
    const read = skills.find((s) => s.id === `${p}.${stage.id}.read`);
    assert(read?.params?.stage === stage.id && read?.testOut === true, `catalog stage ${stage.id}`, "read skill params/testOut");
    const build = skills.find((s) => s.id === `${p}.${stage.id}.build`);
    assert(build?.testOut === false && build?.prereqs.includes(`${p}.${stage.id}.read`), `catalog stage ${stage.id}`, "build skill testOut/prereq");
    const sounds = skills.find((s) => s.id === `${p}.${stage.id}.sounds`);
    assert(sounds?.testOut === true && sounds?.prereqs.includes(`${p}.${stage.id}.build`), `catalog stage ${stage.id}`, "sounds skill testOut/prereq");
    assert(read?.grade === (stage.order <= 16 ? 1 : 2), `catalog stage ${stage.id}`, "grade");
    if (stage.order % 3 === 0) assert(ids.has(`${p}.${stage.id}.sentence`), `catalog stage ${stage.id}`, "missing sentence skill");
  }
  for (let g = 1; g <= 6; g++) assert(skills.some((s) => s.id === `sw.g${g}` && s.params?.group === g), "catalog sight words", `missing sw.g${g}`);
  for (const id of ["rd1.passage", "rd1.listen", "rd1_5.passage", "rd2.passage", "rd2.listen"]) assert(ids.has(id), "catalog reading", `missing ${id}`);
  // cycles
  const byId = new Map(skills.map((s) => [s.id, s]));
  const color = new Map<string, 1 | 2>();
  let cycle: string | null = null;
  function visit(id: string, path: string[]): void {
    if (cycle) return;
    const c = color.get(id);
    if (c === 2) return;
    if (c === 1) {
      cycle = [...path.slice(path.indexOf(id)), id].join(" → ");
      return;
    }
    color.set(id, 1);
    for (const pre of byId.get(id)?.prereqs ?? []) if (byId.has(pre)) visit(pre, [...path, id]);
    color.set(id, 2);
  }
  for (const s of skills) visit(s.id, []);
  assert(cycle === null, "catalog prereqs", `cycle: ${cycle}`);
  const counts = { phonics: skills.filter((s) => s.subject === "phonics").length, reading: skills.filter((s) => s.subject === "reading").length };
  console.log(`catalog: ${skills.length} skills (${counts.phonics} phonics, ${counts.reading} reading); generators: ${Object.keys(generators).join(", ")}`);
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

for (const w of warnings) console.warn(`  ⚠ ${w}`);
if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} failure(s) out of ${checks} checks:\n`);
  const shown = failures.slice(0, Number(process.env.PHONICS_CHECK_SHOW ?? 40));
  for (const f of shown) console.error(`  - [${f.where}] ${f.message}`);
  if (failures.length > shown.length) console.error(`  … and ${failures.length - shown.length} more`);
  process.exit(1);
} else {
  console.log(`✓ All ${checks} checks passed.`);
}
