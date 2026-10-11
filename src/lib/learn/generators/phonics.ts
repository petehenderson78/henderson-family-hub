/**
 * Phonics and early-reading generators for Lily (grade 1 → 2, Orton-Gillingham
 * style), built on PHONICS_STAGES (22 stages of decodable words, sentences and
 * sight words), SIGHT_WORD_GROUPS (Fry 1-200) and LILY_PASSAGES (30 decodable
 * passages at levels 1 / 1.5 / 2).
 *
 * Every item works for a non-reader: tap-only (choice / tiles / tap), emoji
 * pictures, and text-to-speech through display.speak (the player reads
 * display.speak aloud automatically for Lily and offers a speaker button per
 * option). Pure functions of ctx.rng; relative imports only; no DOM.
 *
 * Generator ids
 *   ph.wordPicture    read a word, tap the matching picture (3 emoji)   — the main decoding item
 *   ph.pictureWord    see a picture, tap the word (3 near-miss words)
 *   ph.buildWord      tiles: build the pictured word from grapheme tiles (+1-2 distractor tiles)
 *   ph.missingSound   choice: "c _ t" + 🐱, tap the missing grapheme
 *   ph.rhyme          "Which word rhymes with cat?" (3 words)
 *   ph.soundSort      "Which word has the sh sound, like in ship?" / "...starts with the same sound as mat?"
 *   ph.segmentSounds  tap: one box per sound (Elkonin boxes, 5 boxes, answer 2-5, varied within a stage)
 *   ph.sightWord      hear "Tap the word: the", find it among 3 Fry words (spoken on purpose, never printed in the prompt)
 *   ph.sentenceRead   read a decodable sentence, tap the matching emoji scene
 *   rd.lilyPassage    a decodable passage + one of its authored questions (the child reads)
 *   rd.lilyListen     listening comprehension: the passage and the question are spoken
 *
 * Params (ctx.params, all optional)
 *   stage     a stage id ("cvc-a") or order number: target words come from that stage;
 *             distractors from that stage and earlier.
 *   upTo      a stage id or order: targets and distractors from every stage up to and
 *             including it. Default when neither is given: the first stage.
 *   group     ph.sightWord: Fry group 1-20 (words from groups 1..group; default 1).
 *   level     rd.*: passage level 1 | 1.5 | 2 (default 1). `upTo` also filters passages
 *             to those whose phonicsStages are all taught by that stage.
 *   attempt   rd.*: cycle through a fixed shuffled order of the pool instead of rng.
 *   passageId / qIndex   rd.*: force one passage / one of its questions.
 *
 * SPEECH AND THE ANSWER (for the lead / player): for decoding items
 * (ph.wordPicture, ph.pictureWord, ph.buildWord, ph.missingSound,
 * ph.sentenceRead) display.speak is always set and never contains the target
 * word, because hearing the word defeats the decoding. ph.pictureWord's options
 * are word labels; the player's per-option speaker button would read them
 * aloud and give the item away. Labels are kept here (the Option type has no
 * "do not speak" flag); the lead decides whether the player hides the option
 * speakers for these generator ids, or treats ph.pictureWord as a
 * listening/matching item. ph.sightWord and ph.rhyme / ph.soundSort / ph.segmentSounds
 * speak the target word on purpose (heart words and phonemic awareness are
 * listening tasks).
 */

import type { ChoiceQuestion, Generator, GeneratorContext, Option, Passage, Question, TapQuestion, TilesQuestion } from "../types";
import type { ContentQuestion, PhonicsStage, ReadingPassage } from "../content/types";
import { hashString, mulberry32, pick, sample, shuffle } from "../rng";
import { PHONICS_STAGES, SIGHT_WORD_GROUPS } from "../content/phonics-lily";
import { LILY_PASSAGES } from "../content/passages-lily";

// ---------------------------------------------------------------------------
// stages and params
// ---------------------------------------------------------------------------

const STAGES: readonly PhonicsStage[] = PHONICS_STAGES.slice().sort((a, b) => a.order - b.order);
const STAGE_BY_ID = new Map(STAGES.map((s) => [s.id, s] as const));

function orderOf(id: string): number {
  return STAGE_BY_ID.get(id)?.order ?? 0;
}

const ORDER_MAGIC_E_A = orderOf("magic-e-a");
const ORDER_DIPHTHONGS = orderOf("diphthongs");
const ORDER_SOFT_C_G = orderOf("soft-c-g");

/** Resolve a stage param (id string or 1-based order number). */
function stageParam(ctx: GeneratorContext, key: string): PhonicsStage | undefined {
  const v = ctx.params?.[key];
  if (typeof v === "string") return STAGE_BY_ID.get(v);
  if (typeof v === "number" && Number.isFinite(v)) return STAGES[Math.min(STAGES.length, Math.max(1, Math.round(v))) - 1];
  return undefined;
}

interface Scope {
  /** The stage being practised (the last one when upTo is used). */
  focus: PhonicsStage;
  /** Stages whose words may be the target. */
  targets: readonly PhonicsStage[];
  /** Stages whose words may be distractors (focus and every earlier stage). */
  pool: readonly PhonicsStage[];
}

export function scopeOf(ctx: GeneratorContext): Scope {
  const upTo = stageParam(ctx, "upTo");
  if (upTo) {
    const all = STAGES.slice(0, upTo.order);
    return { focus: upTo, targets: all, pool: all };
  }
  const stage = stageParam(ctx, "stage");
  if (!stage) {
    // No stage given (generic harnesses only; every catalog skill passes one):
    // behave like upTo = the last stage so items span the whole scope.
    const last = STAGES[STAGES.length - 1];
    return { focus: last, targets: STAGES.slice(), pool: STAGES.slice() };
  }
  return { focus: stage, targets: [stage], pool: STAGES.slice(0, stage.order) };
}

function numParam(ctx: GeneratorContext, key: string): number | undefined {
  const v = ctx.params?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function strParam(ctx: GeneratorContext, key: string): string | undefined {
  const v = ctx.params?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

// ---------------------------------------------------------------------------
// grapheme parser
//
// A word is split into units (graphemes). Each unit has a sound key:
//   short vowels a e i o u · long vowels A E I O U · r-controlled AR OR ER ·
//   diphthongs OU OI AW · consonant digraphs sh ch th w(wh) k(ck) ng · ch(tch) j(dge) ·
//   consonants as themselves (c → k or s, g → g or j, x → ks: one tile, two sounds) ·
//   "" for a silent e.
// Magic e is two units: the vowel letter (sound = long vowel) and a silent e, so
// tiles and blanks stay letter by letter ("c a k e", "c _ k e") while the
// phoneme count treats a_e as one sound. Teams that only appear from a later
// stage (ou/ow/oi/oy/au/aw, soft g) are read letter by letter in earlier
// stages' words ("away" = a-w-ay), which is how those words are taught.
// ---------------------------------------------------------------------------

export interface Unit {
  text: string;
  sound: string;
  silent: boolean;
}

const VOWEL_LETTERS = new Set(["a", "e", "i", "o", "u"]);
const VOWEL_SOUNDS = new Set(["a", "e", "i", "o", "u", "A", "E", "I", "O", "U", "AR", "OR", "ER", "OU", "OI", "AW"]);
const LONG_OF: Record<string, string> = { a: "A", e: "E", i: "I", o: "O", u: "U" };
const EARLY_TEAMS: Record<string, string> = { ai: "A", ay: "A", ee: "E", ea: "E", oa: "O", oe: "O", ar: "AR", or: "OR", er: "ER", ir: "ER", ur: "ER" };
const DIPHTHONG_TEAMS: Record<string, string> = { ou: "OU", ow: "OU", oi: "OI", oy: "OI", au: "AW", aw: "AW" };
const CONSONANT_DIGRAPHS: Record<string, string> = { sh: "sh", ch: "ch", th: "th", wh: "w", ck: "k" };
const SOFT_G_EXCEPTIONS = new Set(["gem", "huge"]);
/** Words whose r starts the next syllable, so the vowel before it is not r-controlled: gi-raffe = j-i-r-a-ff (5 sounds). */
const OPEN_R_WORDS = new Set(["giraffe"]);

function isVowelLetter(c: string | undefined): boolean {
  return c !== undefined && VOWEL_LETTERS.has(c);
}

function isConsonantLetter(c: string | undefined): boolean {
  return c !== undefined && /^[a-z]$/.test(c) && !VOWEL_LETTERS.has(c);
}

/** Split a word into graphemes. `stageOrder` is the order of the stage that teaches the word. */
export function parseWord(word: string, stageOrder = STAGES.length): Unit[] {
  const w = word.toLowerCase();
  const n = w.length;
  const out: Unit[] = [];
  const unit = (text: string, sound: string, silent = false) => out.push({ text, sound, silent });
  const softG = stageOrder >= ORDER_SOFT_C_G || SOFT_G_EXCEPTIONS.has(w);
  let silentFinalE = false;
  let i = 0;
  while (i < n) {
    const c0 = w[i];
    const c1 = w[i + 1];
    const c2 = w[i + 2];
    const rest = w.slice(i);
    const hasEarlierVowel = out.some((u) => VOWEL_SOUNDS.has(u.sound));
    // three-letter graphemes
    if (rest.startsWith("igh")) {
      unit("igh", "I");
      i += 3;
      continue;
    }
    if (rest.startsWith("tch")) {
      unit("tch", "ch");
      i += 3;
      continue;
    }
    if (rest === "dge") {
      unit("dge", "j");
      i += 3;
      continue;
    }
    if (rest === "ore") {
      unit("ore", "OR");
      i += 3;
      continue;
    }
    // the silent e that a magic-e vowel claimed earlier
    if (silentFinalE && i === n - 1 && c0 === "e") {
      unit("e", "", true);
      i += 1;
      continue;
    }
    // magic e: vowel + one consonant + final e (cake, kite, these)
    if (stageOrder >= ORDER_MAGIC_E_A && isVowelLetter(c0) && isConsonantLetter(c1) && c2 === "e" && i + 3 === n) {
      unit(c0, LONG_OF[c0]);
      silentFinalE = true;
      i += 1;
      continue;
    }
    // two-letter graphemes
    const two = c1 !== undefined ? c0 + c1 : "";
    if (two && CONSONANT_DIGRAPHS[two]) {
      unit(two, CONSONANT_DIGRAPHS[two]);
      i += 2;
      continue;
    }
    if (two === "ng" && (i + 2 === n || isConsonantLetter(c2))) {
      unit("ng", "ng");
      i += 2;
      continue;
    }
    if (two === "ow" && stageOrder < ORDER_DIPHTHONGS) {
      unit("ow", "O");
      i += 2;
      continue;
    }
    if (two && stageOrder >= ORDER_DIPHTHONGS && DIPHTHONG_TEAMS[two]) {
      unit(two, DIPHTHONG_TEAMS[two]);
      i += 2;
      continue;
    }
    if (two && EARLY_TEAMS[two] && !(two[1] === "r" && OPEN_R_WORDS.has(w))) {
      unit(two, EARLY_TEAMS[two]);
      i += 2;
      continue;
    }
    if (two && c0 === c1 && isConsonantLetter(c0)) {
      // doubled consonant (ff ll ss zz bb dd gg mm nn pp tt cc): one sound
      unit(two, c0 === "c" ? "k" : c0);
      i += 2;
      continue;
    }
    // single letters
    if (c0 === "e" && i === n - 1) {
      // final e: silent after another vowel sound (fence, horse), long e otherwise (he, she)
      if (hasEarlierVowel) unit("e", "", true);
      else unit("e", "E");
      i += 1;
      continue;
    }
    if (c0 === "y") {
      if (i === n - 1 && i > 0) unit("y", hasEarlierVowel ? "E" : "I");
      else unit("y", "y");
      i += 1;
      continue;
    }
    if (isVowelLetter(c0)) {
      // a single vowel that ends the word is an open syllable: go, hi, no
      unit(c0, i === n - 1 && i > 0 ? LONG_OF[c0] : c0);
      i += 1;
      continue;
    }
    if (c0 === "c") {
      unit("c", c1 === "e" || c1 === "i" || c1 === "y" ? "s" : "k");
      i += 1;
      continue;
    }
    if (c0 === "g") {
      unit("g", softG && (c1 === "e" || c1 === "i" || c1 === "y") ? "j" : "g");
      i += 1;
      continue;
    }
    if (c0 === "x") {
      unit("x", "ks");
      i += 1;
      continue;
    }
    unit(c0, c0);
    i += 1;
  }
  return out;
}

/** Sounds one unit stands for: none for a silent e, two for x (/k/ /s/: box = b-o-k-s), one otherwise. */
function soundsIn(u: Unit): number {
  if (u.silent) return 0;
  return u.sound === "ks" ? 2 : 1;
}

/** Number of sounds (phonemes) in a word. */
export function phonemeCount(word: string, stageOrder?: number): number {
  return parseWord(word, stageOrder).reduce((n, u) => n + soundsIn(u), 0);
}

/** The units from the first vowel sound to the end (the rime), or [] when there is no vowel. */
function rimeUnits(units: readonly Unit[]): Unit[] {
  const i = units.findIndex((u) => VOWEL_SOUNDS.has(u.sound));
  return i < 0 ? [] : units.slice(i);
}

function spelledRime(units: readonly Unit[]): string {
  return rimeUnits(units).map((u) => u.text).join("");
}

function soundRime(units: readonly Unit[]): string {
  return rimeUnits(units)
    .filter((u) => !u.silent)
    .map((u) => u.sound)
    .join("-");
}

function vowelUnitCount(units: readonly Unit[]): number {
  return units.filter((u) => VOWEL_SOUNDS.has(u.sound)).length;
}

/** "c-a-t", with magic-e shown as one sound: "c-a_e-k". */
function soundSpelling(units: readonly Unit[]): string {
  const magicE = units.length > 0 && units[units.length - 1].silent && units.some((u) => u.text.length === 1 && LONG_OF[u.text] === u.sound);
  return units
    .filter((u) => !u.silent)
    .map((u) => (magicE && u.text.length === 1 && LONG_OF[u.text] === u.sound ? `${u.text}_e` : u.text))
    .join("-");
}

// ---------------------------------------------------------------------------
// word pools
// ---------------------------------------------------------------------------

export interface PoolWord {
  word: string;
  emoji?: string;
  stage: PhonicsStage;
  units: Unit[];
}

const WORDS_BY_STAGE = new Map<string, PoolWord[]>();
for (const s of STAGES) {
  const seen = new Set<string>();
  const list: PoolWord[] = [];
  for (const w of s.words) {
    const key = w.word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ word: w.word, emoji: w.emoji, stage: s, units: parseWord(w.word, s.order) });
  }
  WORDS_BY_STAGE.set(s.id, list);
}

function wordsOf(stages: readonly PhonicsStage[]): PoolWord[] {
  const out: PoolWord[] = [];
  for (const s of stages) out.push(...(WORDS_BY_STAGE.get(s.id) ?? []));
  return out;
}

/** The word → emoji map for a set of stages (first stage wins on conflicts). */
function emojiMap(stages: readonly PhonicsStage[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const w of wordsOf(stages)) if (w.emoji && !m.has(w.word.toLowerCase())) m.set(w.word.toLowerCase(), w.emoji);
  return m;
}

/** 0..4: how close two spellings are (minimal pairs score highest). */
function similarity(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let score = 0;
  if (x.length === y.length) {
    let diff = 0;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) diff += 1;
    if (diff === 1) score += 4;
    else if (diff === 2) score += 1.5;
    else score += 0.5;
  }
  if (x.slice(-2) === y.slice(-2)) score += 2;
  if (x[0] === y[0]) score += 1;
  if (Math.abs(x.length - y.length) >= 3) score -= 1;
  return score;
}


/** Shuffle options and track the correct one. */
function shuffledChoice(rng: () => number, correct: Option, distractors: readonly Option[]): { options: Option[]; answerIndex: number } {
  const options = shuffle(rng, [correct, ...distractors]);
  return { options, answerIndex: options.indexOf(correct) };
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// ---------------------------------------------------------------------------
// grapheme families (distractor tiles and missing-sound options)
// ---------------------------------------------------------------------------

const SHORT_VOWELS: readonly string[] = ["a", "e", "i", "o", "u"];
const DIGRAPHS: readonly string[] = ["sh", "ch", "th", "wh", "ck"];
const FLOSS: readonly string[] = ["ff", "ll", "ss", "zz"];
const BEGIN_BLENDS: readonly string[] = ["bl", "cl", "fl", "gl", "pl", "sl", "br", "cr", "dr", "fr", "gr", "pr", "tr", "sc", "sk", "sm", "sn", "sp", "st", "sw"];
const END_BLENDS: readonly string[] = ["st", "nd", "mp", "nt", "nk", "ng", "ft", "lt", "lk", "lp", "sk"];
const VOWEL_TEAMS: readonly string[] = ["ai", "ay", "ee", "ea", "oa", "ow", "oe", "igh", "y"];
const R_TEAMS: readonly string[] = ["ar", "or", "er", "ir", "ur", "ore"];
const DIPHTHONGS: readonly string[] = ["ou", "ow", "oi", "oy", "au", "aw"];
const CONSONANTS: readonly string[] = "bcdfghjklmnprstvwz".split("");
const SUFFIXES: readonly string[] = ["ing", "ed", "er"];

/** The family a grapheme belongs to (for distractors of the same kind). */
function familyOf(text: string): readonly string[] {
  for (const fam of [DIGRAPHS, FLOSS, VOWEL_TEAMS, R_TEAMS, DIPHTHONGS, SUFFIXES]) if (fam.includes(text)) return fam;
  if (text.length === 1 && VOWEL_LETTERS.has(text)) return SHORT_VOWELS;
  if (text.length === 2 && text[0] === text[1]) return FLOSS;
  return CONSONANTS;
}

/** Stage patterns that are plain graphemes ("sh", "ai"; not "a_e", "-st", "open syllable"). */
function stageGraphemes(stage: PhonicsStage): string[] {
  return stage.patterns.map((p) => p.replace(/^-/, "").replace(/\s.*$/, "")).filter((p) => /^[a-z]{1,3}$/.test(p));
}

/** Ranked candidates (closest spellings first, ties in rng order). */
function ranked<T>(rng: () => number, target: string, candidates: readonly T[], key: (t: T) => string): T[] {
  const scored = shuffle(rng, candidates).map((c) => ({ c, s: similarity(target, key(c)) }));
  scored.sort((p, q) => q.s - p.s);
  return scored.map((p) => p.c);
}

/** n items from a ranked list, favouring the top of it, with distinct `uniq` keys. */
function takeDistinct<T>(rng: () => number, list: readonly T[], n: number, uniq: (t: T) => string, taken: readonly string[] = []): T[] {
  const window = shuffle(rng, list.slice(0, Math.min(list.length, 2 * n + 2)));
  const rest = list.slice(window.length);
  const seen = new Set(taken);
  const out: T[] = [];
  for (const t of [...window, ...rest]) {
    const k = uniq(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length === n) break;
  }
  return out;
}

function lc(s: string): string {
  return s.toLowerCase();
}

// ---------------------------------------------------------------------------
// ph.wordPicture — read the word, tap the picture
// ---------------------------------------------------------------------------

const wordPicture: Generator = (ctx) => {
  const { rng } = ctx;
  const scope = scopeOf(ctx);
  const targets = wordsOf(scope.targets).filter((w) => w.emoji);
  const target = pick(rng, targets);
  const cands = wordsOf(scope.pool).filter((w) => w.emoji && w.emoji !== target.emoji && lc(w.word) !== lc(target.word));
  const distractors = takeDistinct(rng, ranked(rng, target.word, cands, (w) => w.word), 2, (w) => w.emoji ?? "", [target.emoji ?? ""]);
  const { options, answerIndex } = shuffledChoice(
    rng,
    { emoji: target.emoji },
    distractors.map((d) => ({ emoji: d.emoji }))
  );
  return {
    type: "choice",
    prompt: target.word,
    options,
    answerIndex,
    display: { speak: "Read the word. Tap the picture that matches." },
    explain: `${target.word} is ${soundSpelling(target.units)}: ${target.emoji} ${target.word}. ${target.stage.rule}`,
    hint: "Touch each letter and say its sound. Then blend the sounds together and find that picture.",
  };
};

// ---------------------------------------------------------------------------
// ph.pictureWord — see the picture, tap the word (near-miss words)
// ---------------------------------------------------------------------------

const pictureWord: Generator = (ctx) => {
  const { rng } = ctx;
  const scope = scopeOf(ctx);
  const targets = wordsOf(scope.targets).filter((w) => w.emoji);
  const target = pick(rng, targets);
  const cands = wordsOf(scope.pool).filter((w) => lc(w.word) !== lc(target.word) && (!w.emoji || w.emoji !== target.emoji));
  const distractors = takeDistinct(rng, ranked(rng, target.word, cands, (w) => w.word), 2, (w) => lc(w.word), [lc(target.word)]);
  const { options, answerIndex } = shuffledChoice(
    rng,
    { label: target.word },
    distractors.map((d) => ({ label: d.word }))
  );
  const wrong = distractors.map((d) => d.word).join(" and ");
  return {
    type: "choice",
    prompt: "Which word is the picture?",
    options,
    answerIndex,
    display: { emoji: target.emoji, speak: "Find the word for the picture." },
    explain: `The picture is a ${target.word}: ${soundSpelling(target.units)}. ${wrong ? `${cap(wrong)} look close, but the sounds do not match.` : ""} ${target.stage.rule}`.trim(),
    hint: "Say the picture's name slowly. What sound do you hear at the start? At the end? Find the word with those letters.",
  };
};

// ---------------------------------------------------------------------------
// ph.buildWord — tiles
// ---------------------------------------------------------------------------

function distractorTiles(rng: () => number, w: PoolWord, stage: PhonicsStage, n: number): string[] {
  const word = lc(w.word);
  const cands = new Set<string>();
  for (const u of w.units) for (const g of familyOf(u.text)) cands.add(g);
  for (const g of stageGraphemes(stage)) cands.add(g);
  // a tile that is a substring of the word could take part in a correct build; never offer one
  const pool = [...cands].filter((g) => !word.includes(g));
  return sample(rng, pool, n);
}

const buildWord: Generator = (ctx) => {
  const { rng } = ctx;
  const scope = scopeOf(ctx);
  const targets = wordsOf(scope.targets).filter((w) => w.emoji && w.units.length <= 8);
  const target = pick(rng, targets.length ? targets : wordsOf(scope.targets));
  const answerTiles = target.units.map((u) => u.text);
  const extra = distractorTiles(rng, target, scope.focus, rng() < 0.5 ? 1 : 2);
  const tiles = shuffle(rng, [...answerTiles, ...extra]);
  const q: TilesQuestion = {
    type: "tiles",
    prompt: "Build the word for the picture.",
    tiles,
    slots: answerTiles.length,
    answer: target.word,
    display: { emoji: target.emoji, speak: "Build the word for the picture." },
    explain: `${target.emoji ?? ""} ${target.word}: ${soundSpelling(target.units)}. ${target.stage.rule}`.trim(),
    hint: "Say the picture's name slowly. What sound do you hear at the start? Put that tile down, then the sound that comes after it.",
  };
  return q;
};

// ---------------------------------------------------------------------------
// ph.missingSound — "c _ t" + 🐱
// ---------------------------------------------------------------------------

interface Blank {
  /** index of the first blanked unit */
  index: number;
  /** how many units are blanked (2 for a blend) */
  span: number;
  /** the grapheme family to draw distractors from */
  family: readonly string[];
}

function firstVowelLetter(units: readonly Unit[]): number {
  return units.findIndex((u) => u.text.length === 1 && VOWEL_LETTERS.has(u.text) && VOWEL_SOUNDS.has(u.sound));
}

function unitIn(units: readonly Unit[], fam: readonly string[]): number {
  return units.findIndex((u) => fam.includes(u.text) && !u.silent);
}

function chooseBlank(w: PoolWord, stage: PhonicsStage): Blank | undefined {
  const u = w.units;
  const id = stage.id;
  const isCons = (x: Unit | undefined) => !!x && !x.silent && !VOWEL_SOUNDS.has(x.sound) && x.text.length === 1;
  const vowel = (): Blank | undefined => {
    const i = firstVowelLetter(u);
    return i < 0 ? undefined : { index: i, span: 1, family: SHORT_VOWELS };
  };
  if (id === "digraphs") {
    const i = unitIn(u, DIGRAPHS);
    return i < 0 ? vowel() : { index: i, span: 1, family: DIGRAPHS };
  }
  if (id === "floss") {
    const i = unitIn(u, FLOSS);
    return i < 0 ? vowel() : { index: i, span: 1, family: FLOSS };
  }
  if (id === "blends-beginning") {
    if (isCons(u[0]) && isCons(u[1]) && BEGIN_BLENDS.includes(u[0].text + u[1].text)) return { index: 0, span: 2, family: BEGIN_BLENDS };
    return vowel();
  }
  if (id === "blends-ending") {
    const n = u.length;
    if (u[n - 1]?.text === "ng") return { index: n - 1, span: 1, family: END_BLENDS };
    if (isCons(u[n - 2]) && isCons(u[n - 1]) && END_BLENDS.includes(u[n - 2].text + u[n - 1].text)) return { index: n - 2, span: 2, family: END_BLENDS };
    return vowel();
  }
  if (id.startsWith("vowel-team") || id === "long-i-igh-y") {
    const own = stageGraphemes(stage);
    const i = unitIn(u, own.length ? own : VOWEL_TEAMS);
    if (i < 0) return vowel();
    const fam = [...own.filter((g) => g !== "y" || u[i].text === "y"), ...VOWEL_TEAMS.filter((g) => !own.includes(g))];
    return { index: i, span: 1, family: fam };
  }
  if (id.startsWith("r-controlled")) {
    const i = unitIn(u, R_TEAMS);
    return i < 0 ? vowel() : { index: i, span: 1, family: R_TEAMS };
  }
  if (id === "diphthongs") {
    const i = unitIn(u, DIPHTHONGS);
    return i < 0 ? vowel() : { index: i, span: 1, family: DIPHTHONGS };
  }
  if (id === "soft-c-g") {
    const c = u.findIndex((x) => x.text === "c" && x.sound === "s");
    if (c >= 0) return { index: c, span: 1, family: ["c", "s", "k"] };
    const d = u.findIndex((x) => x.text === "dge");
    if (d >= 0) return { index: d, span: 1, family: ["dge", "ge", "j"] };
    const g = u.findIndex((x) => x.text === "g" && x.sound === "j");
    if (g >= 0) return { index: g, span: 1, family: ["g", "j", "dge"] };
    return vowel();
  }
  if (id === "suffixes-ed-ing") {
    const n = u.length;
    if (u[n - 2]?.text === "i" && u[n - 1]?.text === "ng") return { index: n - 2, span: 2, family: SUFFIXES };
    if (u[n - 2]?.text === "e" && u[n - 1]?.text === "d") return { index: n - 2, span: 2, family: SUFFIXES };
    if (u[n - 1]?.text === "er") return { index: n - 1, span: 1, family: SUFFIXES };
    return vowel();
  }
  // cvc stages, magic e, open/closed syllables
  return vowel();
}

const missingSound: Generator = (ctx) => {
  const { rng } = ctx;
  const scope = scopeOf(ctx);
  const targets = shuffle(
    rng,
    wordsOf(scope.targets).filter((w) => w.emoji)
  );
  let target: PoolWord = targets[0];
  let blank: Blank | undefined;
  for (const w of targets) {
    blank = chooseBlank(w, w.stage);
    if (blank) {
      target = w;
      break;
    }
  }
  if (!blank) return wordPicture(ctx);
  const u = target.units;
  // Vary the blank: 40% of the time hide a single consonant instead of the stage pattern,
  // so the answer is not "always a" at a single-vowel stage.
  {
    const consonants = u.map((x, i) => i).filter((i) => (i < blank!.index || i >= blank!.index + blank!.span) && u[i].text.length === 1 && !u[i].silent && !VOWEL_SOUNDS.has(u[i].sound) && CONSONANTS.includes(u[i].text));
    if (consonants.length > 0 && rng() < 0.4) blank = { index: pick(rng, consonants), span: 1, family: CONSONANTS };
  }
  const correct = u.slice(blank.index, blank.index + blank.span).map((x) => x.text).join("");
  const shown = [...u.slice(0, blank.index).map((x) => x.text), "_", ...u.slice(blank.index + blank.span).map((x) => x.text)].join(" ");
  const word = lc(target.word);
  const fill = (g: string) => [...u.slice(0, blank!.index).map((x) => x.text), g, ...u.slice(blank!.index + blank!.span).map((x) => x.text)].join("");
  let family = blank.family.filter((g) => g !== correct && fill(g) !== word);
  if (family.length < 2) family = [...family, ...(VOWEL_LETTERS.has(correct[0]) ? SHORT_VOWELS : CONSONANTS).filter((g) => g !== correct && !family.includes(g) && fill(g) !== word)];
  const distractors = sample(rng, family, 2);
  const { options, answerIndex } = shuffledChoice(
    rng,
    { label: correct },
    distractors.map((label) => ({ label }))
  );
  return {
    type: "choice",
    prompt: shown,
    options,
    answerIndex,
    display: { emoji: target.emoji, speak: "Which sound is missing?" },
    explain: `${target.emoji ?? ""} ${target.word} is ${soundSpelling(u)}. The missing part is ${correct}. ${target.stage.rule}`.trim(),
    hint: "Say the picture's name slowly and tap each sound on your fingers. Which sound lands on the empty spot?",
  };
};

// ---------------------------------------------------------------------------
// ph.rhyme — "Which word rhymes with cat?"
// ---------------------------------------------------------------------------

function oneSyllableWithOnset(w: PoolWord): boolean {
  return vowelUnitCount(w.units) === 1 && w.units.length > 0 && !VOWEL_SOUNDS.has(w.units[0].sound);
}

function sameRime(a: PoolWord, b: PoolWord): boolean {
  return lc(a.word) !== lc(b.word) && spelledRime(a.units) === spelledRime(b.units) && soundRime(a.units) === soundRime(b.units);
}

const rhyme: Generator = (ctx) => {
  const { rng } = ctx;
  const scope = scopeOf(ctx);
  const pool = wordsOf(scope.pool).filter(oneSyllableWithOnset);
  const candidates = (stages: readonly PhonicsStage[]) => wordsOf(stages).filter(oneSyllableWithOnset).filter((t) => pool.some((p) => sameRime(t, p)));
  let targets = candidates(scope.targets);
  if (targets.length === 0) targets = candidates(scope.pool);
  if (targets.length === 0) return wordPicture(ctx);
  const target = pick(rng, targets);
  const correct = pick(
    rng,
    pool.filter((p) => sameRime(target, p))
  );
  const targetRime = soundRime(target.units);
  const others = pool.filter((p) => soundRime(p.units) !== targetRime && lc(p.word) !== lc(target.word));
  // Prefer distractors that start like the target so the first letter is no shortcut.
  const preferred = [...shuffle(rng, others.filter((p) => p.units[0].sound === target.units[0].sound)), ...shuffle(rng, others.filter((p) => p.units[0].sound !== target.units[0].sound))];
  const distractors = takeDistinct(rng, preferred, 2, (p) => lc(p.word), [lc(target.word), lc(correct.word)]);
  const { options, answerIndex } = shuffledChoice(
    rng,
    { label: correct.word },
    distractors.map((d) => ({ label: d.word }))
  );
  const rime = spelledRime(target.units);
  return {
    type: "choice",
    prompt: `Which word rhymes with ${target.word}?`,
    options,
    answerIndex,
    display: { speak: `Which word rhymes with ${target.word}?` },
    explain: `${correct.word} rhymes with ${target.word}: they both end with -${rime}. ${distractors.map((d) => d.word).join(" and ")} end with a different sound.`,
    hint: `Say ${target.word}, then say just the end: -${rime}. Tap each word's speaker and listen for the one that ends the same way.`,
  };
};

// ---------------------------------------------------------------------------
// ph.soundSort — "Which word has the sh sound, like in ship?"
// ---------------------------------------------------------------------------

interface SoundAsk {
  key: string;
  name: string;
}

const STAGE_SOUNDS: Record<string, readonly SoundAsk[]> = {
  "cvc-a": [{ key: "a", name: "short a" }],
  "cvc-i": [{ key: "i", name: "short i" }],
  "cvc-o": [{ key: "o", name: "short o" }],
  "cvc-u": [{ key: "u", name: "short u" }],
  "cvc-e": [{ key: "e", name: "short e" }],
  digraphs: [
    { key: "sh", name: "sh" },
    { key: "ch", name: "ch" },
    { key: "th", name: "th" },
  ],
  "magic-e-a": [{ key: "A", name: "long a" }],
  "magic-e-i-o-u-e": [
    { key: "I", name: "long i" },
    { key: "O", name: "long o" },
    { key: "U", name: "long u" },
  ],
  "vowel-team-ai-ay": [{ key: "A", name: "long a" }],
  "vowel-team-ee-ea": [{ key: "E", name: "long e" }],
  "vowel-team-oa-ow-oe": [{ key: "O", name: "long o" }],
  "long-i-igh-y": [
    { key: "I", name: "long i" },
    { key: "E", name: "long e" },
  ],
  "r-controlled-ar": [{ key: "AR", name: "ar" }],
  "r-controlled-or": [{ key: "OR", name: "or" }],
  "r-controlled-er-ir-ur": [{ key: "ER", name: "er" }],
  diphthongs: [
    { key: "OU", name: "ow, like ouch" },
    { key: "OI", name: "oy" },
    { key: "AW", name: "aw" },
  ],
  "soft-c-g": [{ key: "j", name: "j" }],
};

const STAGE_POSITION: Record<string, "first" | "last"> = {
  floss: "last",
  "blends-beginning": "first",
  "blends-ending": "last",
  "open-closed-syllables": "first",
  "suffixes-ed-ing": "first",
};

function firstSound(w: PoolWord): string {
  return w.units.find((u) => !u.silent)?.sound ?? "";
}

function lastSound(w: PoolWord): string {
  const audible = w.units.filter((u) => !u.silent);
  return audible.length ? audible[audible.length - 1].sound : "";
}

/** Words that occur in the sound-sort stems; never the target, so speaking the stem never names the answer. */
const STEM_WORDS = new Set(["which", "word", "has", "the", "sound", "like", "starts", "ends", "with", "short", "long", "a", "e", "i", "o", "u", "ar", "or", "er", "ow", "oy", "aw", "ouch", "j", "sh", "ch", "th"]);

const soundSort: Generator = (ctx) => {
  const { rng } = ctx;
  const scope = scopeOf(ctx);
  const pool = wordsOf(scope.pool);
  const targets = wordsOf(scope.targets).filter((w) => !STEM_WORDS.has(lc(w.word)));
  const asks = STAGE_SOUNDS[scope.focus.id];
  const wordLabels = (ws: readonly PoolWord[]) => ws.map((w) => ({ label: w.word }));

  if (asks && rng() < 0.75) {
    const ask = pick(rng, asks);
    const has = (w: PoolWord) => w.units.some((u) => !u.silent && u.sound === ask.key);
    const tWords = targets.filter(has);
    const dWords = pool.filter((w) => !has(w));
    if (tWords.length >= 1 && dWords.length >= 2) {
      const target = pick(rng, tWords);
      const examples = pool.filter((w) => has(w) && lc(w.word) !== lc(target.word));
      const example = examples.length ? pick(rng, examples) : undefined;
      const distractors = takeDistinct(rng, shuffle(rng, dWords), 2, (w) => lc(w.word), [lc(target.word), example ? lc(example.word) : ""]);
      const { options, answerIndex } = shuffledChoice(rng, { label: target.word }, wordLabels(distractors));
      const stem = example ? `Which word has the ${ask.name} sound, like ${example.word}?` : `Which word has the ${ask.name} sound?`;
      return {
        type: "choice",
        prompt: stem,
        options,
        answerIndex,
        display: { speak: stem },
        explain: `${target.word} has the ${ask.name} sound: ${soundSpelling(target.units)}. ${distractors.map((d) => d.word).join(" and ")} do not. ${scope.focus.rule}`,
        hint: `Tap each word's speaker and listen for the ${ask.name} sound${example ? `, the sound you hear in ${example.word}` : ""}.`,
      };
    }
  }

  // position variant: first / last sound
  const position = STAGE_POSITION[scope.focus.id] ?? (rng() < 0.5 ? "first" : "last");
  const soundOf = position === "first" ? firstSound : lastSound;
  const withPartner = targets.filter((t) => pool.some((p) => lc(p.word) !== lc(t.word) && soundOf(p) === soundOf(t)) && pool.some((p) => soundOf(p) !== soundOf(t)));
  const target = pick(rng, withPartner.length ? withPartner : targets);
  const key = soundOf(target);
  const examples = pool.filter((p) => lc(p.word) !== lc(target.word) && soundOf(p) === key);
  const example = examples.length ? pick(rng, examples) : undefined;
  const dWords = pool.filter((p) => soundOf(p) !== key);
  const distractors = takeDistinct(rng, shuffle(rng, dWords), 2, (w) => lc(w.word), [lc(target.word), example ? lc(example.word) : ""]);
  const { options, answerIndex } = shuffledChoice(rng, { label: target.word }, wordLabels(distractors));
  const where = position === "first" ? "starts" : "ends";
  const stem = example ? `Which word ${where} like ${example.word}?` : `Which word ${where} with the ${key} sound?`;
  return {
    type: "choice",
    prompt: stem,
    options,
    answerIndex,
    display: { speak: stem },
    explain: `${target.word} ${where} with the ${key} sound${example ? `, just like ${example.word}` : ""}: ${soundSpelling(target.units)}. ${distractors.map((d) => d.word).join(" and ")} ${position === "first" ? "start" : "end"} with a different sound.`,
    hint: `Say ${example ? example.word : "the word"} slowly. What sound do you hear at the ${position === "first" ? "start" : "end"}? Now listen to each word for that sound in the same spot.`,
  };
};

// ---------------------------------------------------------------------------
// ph.segmentSounds — Elkonin boxes (tap one box per sound)
// ---------------------------------------------------------------------------

const SEGMENT_BOXES = 5;
/** The stage's most common box count should be the answer at most this share of the time… */
const SEGMENT_MAX_SHARE = 0.6;
/** …by borrowing at most this share of items from the pool, so the stage's own words stay the core. */
const SEGMENT_MAX_MIX = 0.4;
const ORDER_DIGRAPHS = orderOf("digraphs");

function letterCount(w: PoolWord): number {
  return w.word.replace(/[^a-z]/gi, "").length;
}

function listAnd(items: readonly string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The sound-box word. The stage's own words are the core, but many stages have
 * a single count by construction (every cvc word is 3 sounds, every starting-
 * blend word 4), and a child would learn to tap that number without listening.
 * So when one count dominates, up to 40% of items borrow a word with another
 * count from this or an earlier stage (letters already taught): 2-sound words
 * (at, in, up, egg), x words (box = 4 sounds) and, from the digraph stage on,
 * with double weight, words whose letters and sounds differ in number (ship:
 * 4 letters, 3 sounds), which is the point of sound boxes.
 */
function segmentTarget(rng: () => number, scope: Scope): PoolWord {
  const countOf = (w: PoolWord) => phonemeCount(w.word, w.stage.order);
  // -ed words (jumped = /t/, wished = /t/) are not counted letter by letter here; the suffix stage uses missing-sound items instead.
  const fits = (w: PoolWord) => {
    if (w.stage.id === "suffixes-ed-ing") return false;
    const n = countOf(w);
    return n >= 2 && n <= SEGMENT_BOXES;
  };
  const pool = wordsOf(scope.pool).filter(fits);
  const own = wordsOf(scope.targets).filter(fits);
  const stageWords = own.length > 0 ? own : pool;
  const withEmoji = stageWords.filter((w) => w.emoji);
  const core = withEmoji.length >= 4 ? withEmoji : stageWords;
  const tally = new Map<number, number>();
  for (const w of core) tally.set(countOf(w), (tally.get(countOf(w)) ?? 0) + 1);
  let usual = 0;
  let usualN = 0;
  for (const [n, k] of tally) {
    if (k > usualN) {
      usual = n;
      usualN = k;
    }
  }
  const contrast = pool.filter((w) => countOf(w) !== usual);
  const mix = contrast.length > 0 ? Math.min(SEGMENT_MAX_MIX, Math.max(0, 1 - SEGMENT_MAX_SHARE / (usualN / core.length))) : 0;
  if (rng() < mix) {
    const lettersDiffer = scope.focus.order >= ORDER_DIGRAPHS ? contrast.filter((w) => letterCount(w) !== countOf(w)) : [];
    return pick(rng, [...contrast, ...lettersDiffer]);
  }
  return pick(rng, core);
}

const segmentSounds: Generator = (ctx) => {
  const { rng } = ctx;
  const target = segmentTarget(rng, scopeOf(ctx));
  const units = target.units;
  const n = phonemeCount(target.word, target.stage.order);
  const teams = [...new Set(units.filter((u) => !u.silent && u.text.length > 1).map((u) => u.text))];
  const notes: string[] = [];
  if (teams.length > 0) notes.push(`The letters ${listAnd(teams)} make one sound${teams.length > 1 ? " each" : ""}.`);
  if (units.some((u) => u.sound === "ks")) notes.push("The x makes two sounds, /k/ and /s/.");
  if (units.some((u) => u.silent)) notes.push("The silent e makes no sound of its own.");
  const q: TapQuestion = {
    type: "tap",
    prompt: `Tap one box for each sound you hear in "${target.word}".`,
    rows: 1,
    cols: SEGMENT_BOXES,
    answer: n,
    variant: "plain",
    display: { emoji: target.emoji, speak: `Tap one box for each sound you hear in ${target.word}.` },
    explain: [`${target.word} has ${n} sounds: ${soundSpelling(units)}.`, ...notes].join(" "),
    hint: "Say the word slowly like a robot. Tap one box for each sound you say, not for each letter.",
  };
  return q;
};

// ---------------------------------------------------------------------------
// ph.sightWord — "Tap the word: the" (heart words; the target is spoken on purpose)
// ---------------------------------------------------------------------------

const SIGHT_GROUPS = SIGHT_WORD_GROUPS.slice().sort((a, b) => a.order - b.order);

/**
 * Printed stems. The target is only spoken (display.speak); the first stem that
 * does not contain it as a word is printed, so "the", "you" or "word" never
 * appear on screen while the child looks for them. The two stems share no Fry word.
 */
const SIGHT_PROMPTS: readonly string[] = ["Listen, then tap the word you hear.", "Listen and tap."];

function hasWord(text: string, word: string): boolean {
  return lc(text).split(/[^a-z']+/).includes(lc(word));
}

const sightWord: Generator = (ctx) => {
  const { rng } = ctx;
  const g = Math.min(SIGHT_GROUPS.length, Math.max(1, Math.round(numParam(ctx, "group") ?? 1)));
  const groups = SIGHT_GROUPS.slice(0, g);
  const latest = groups[g - 1].words;
  const earlier = groups.slice(0, g - 1).flatMap((x) => x.words);
  const target = earlier.length > 0 && rng() < 0.4 ? pick(rng, earlier) : pick(rng, latest);
  const all = groups.flatMap((x) => x.words).filter((w) => lc(w) !== lc(target));
  const distractors = takeDistinct(rng, ranked(rng, target, all, (w) => w), 2, lc, [lc(target)]);
  const { options, answerIndex } = shuffledChoice(
    rng,
    { label: target },
    distractors.map((label) => ({ label }))
  );
  return {
    type: "choice",
    prompt: SIGHT_PROMPTS.find((p) => !hasWord(p, target)) ?? "🔊",
    options,
    answerIndex,
    display: { speak: `Tap the word: ${target}.` },
    explain: `This word is ${target}. It is a heart word: we know it by heart, as a whole. ${distractors.join(" and ")} are different words.`,
    hint: "Listen again. Look at the first letter of each word, then the last letter.",
  };
};

// ---------------------------------------------------------------------------
// ph.sentenceRead — read a decodable sentence, tap the matching emoji scene
// ---------------------------------------------------------------------------

/** Emoji words whose picture would mislead when the word is used another way in a sentence. */
const SCENE_BLOCKLIST = new Set(["can", "saw", "pen", "letter", "bow", "bat", "first", "third", "number", "check", "mix", "plus", "well"]);

export interface Scene {
  sentence: string;
  /** the pictured words, in sentence order */
  words: string[];
  emojis: string[];
}

function tokens(sentence: string): string[] {
  return sentence
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** The emoji scene of a sentence: pictures of its content words (up to 3). */
export function sceneOf(sentence: string, emoji: Map<string, string>): Scene {
  const words: string[] = [];
  const emojis: string[] = [];
  for (const t of tokens(sentence)) {
    const base = emoji.has(t) ? t : t.endsWith("s") && emoji.has(t.slice(0, -1)) ? t.slice(0, -1) : undefined;
    if (!base || SCENE_BLOCKLIST.has(base)) continue;
    const e = emoji.get(base)!;
    if (emojis.includes(e)) continue;
    words.push(base);
    emojis.push(e);
    if (emojis.length === 3) break;
  }
  return { sentence, words, emojis };
}

function sentencesOf(stages: readonly PhonicsStage[]): string[] {
  const out: string[] = [];
  for (const s of stages) out.push(...s.sentences);
  return out;
}

const sentenceRead: Generator = (ctx) => {
  const { rng } = ctx;
  const scope = scopeOf(ctx);
  const emoji = emojiMap(scope.pool);
  const targets = sentencesOf(scope.targets)
    .map((s) => sceneOf(s, emoji))
    .filter((s) => s.emojis.length > 0);
  if (targets.length === 0) return wordPicture(ctx);
  const target = pick(rng, targets);
  const want = new Set(target.emojis);
  const others = sentencesOf(scope.pool)
    .map((s) => sceneOf(s, emoji))
    .filter((s) => s.emojis.length > 0 && s.sentence !== target.sentence && s.emojis.every((e) => !want.has(e)));
  const distractors = takeDistinct(rng, shuffle(rng, others), 2, (s) => s.emojis.join(""), [target.emojis.join("")]);
  if (distractors.length < 2) return wordPicture(ctx);
  const { options, answerIndex } = shuffledChoice(
    rng,
    { emoji: target.emojis.join("") },
    distractors.map((d) => ({ emoji: d.emojis.join("") }))
  );
  const list = (ws: string[]) => (ws.length <= 1 ? ws.join("") : `${ws.slice(0, -1).join(", ")} and ${ws[ws.length - 1]}`);
  return {
    type: "choice",
    prompt: target.sentence,
    options,
    answerIndex,
    display: { speak: "Read the sentence. Tap the picture that matches." },
    explain: `The sentence says: ${target.sentence} The matching picture shows ${list(target.words)}: ${target.emojis.join("")}.`,
    hint: "Read each word, one at a time. Who or what is in the sentence? Find the picture with those things.",
  };
};

// ---------------------------------------------------------------------------
// rd.lilyPassage / rd.lilyListen — decodable passages
// ---------------------------------------------------------------------------

const PASSAGE_LEVELS: readonly number[] = [1, 1.5, 2];

/** Nearest authored passage level (1, 1.5 or 2). */
export function snapLilyLevel(n: number): number {
  let best = PASSAGE_LEVELS[0];
  for (const l of PASSAGE_LEVELS) if (Math.abs(l - n) < Math.abs(best - n)) best = l;
  return best;
}

/** The highest stage order a passage relies on (0 when it lists none). */
function passageStageOrder(p: ReadingPassage): number {
  let max = 0;
  for (const id of p.phonicsStages ?? []) max = Math.max(max, orderOf(id));
  return max;
}

/**
 * Passages at a level whose phonics stages are all taught by `maxOrder`
 * (when given). Falls back to the whole level, then to every passage, so a
 * block never comes up empty.
 */
export function lilyPassagePool(level: number, maxOrder?: number): ReadingPassage[] {
  const atLevel = LILY_PASSAGES.filter((p) => Math.abs(p.level - level) < 1e-9 && p.questions.length > 0);
  if (maxOrder !== undefined) {
    const gated = atLevel.filter((p) => passageStageOrder(p) <= maxOrder);
    if (gated.length > 0) return gated;
  }
  if (atLevel.length > 0) return atLevel;
  return LILY_PASSAGES.filter((p) => p.questions.length > 0);
}

function chooseLilyPassage(ctx: GeneratorContext): ReadingPassage {
  const forced = strParam(ctx, "passageId");
  if (forced) {
    const p = LILY_PASSAGES.find((x) => x.id === forced);
    if (p && p.questions.length > 0) return p;
  }
  const level = snapLilyLevel(numParam(ctx, "level") ?? 1);
  const upTo = stageParam(ctx, "upTo");
  const pool = lilyPassagePool(level, upTo?.order);
  const attempt = numParam(ctx, "attempt");
  if (attempt !== undefined && attempt >= 0) {
    // Fixed order per pool: any pool.length consecutive attempts see distinct passages.
    const order = shuffle(mulberry32(hashString(pool.map((p) => p.id).join("|"))), pool);
    return order[Math.floor(attempt) % order.length];
  }
  return pick(ctx.rng, pool);
}

function questionIndex(ctx: GeneratorContext, p: ReadingPassage): number {
  const forced = numParam(ctx, "qIndex");
  if (forced !== undefined && forced >= 0 && forced < p.questions.length) return Math.floor(forced);
  return Math.floor(ctx.rng() * p.questions.length);
}

function passageDisplay(p: ReadingPassage): Passage {
  return { title: p.title, text: p.text, level: p.level };
}

function passageChoice(rng: () => number, p: ReadingPassage, qi: number, speak: string): ChoiceQuestion {
  const q: ContentQuestion = p.questions[qi];
  const order = shuffle(
    rng,
    q.options.map((_, i) => i)
  );
  const options: Option[] = order.map((i) => ({ label: q.options[i] }));
  return {
    type: "choice",
    prompt: q.prompt,
    options,
    answerIndex: order.indexOf(q.answerIndex),
    display: { passage: passageDisplay(p), speak },
    explain: q.explain,
    hint: q.hint,
  };
}

/** The child reads the passage herself; only the question is spoken. */
const lilyPassage: Generator = (ctx) => {
  const p = chooseLilyPassage(ctx);
  const qi = questionIndex(ctx, p);
  return passageChoice(ctx.rng, p, qi, p.questions[qi].prompt);
};

/** Listening comprehension: the whole passage and the question are spoken. */
const lilyListen: Generator = (ctx) => {
  const p = chooseLilyPassage(ctx);
  const qi = questionIndex(ctx, p);
  const text = p.text.replace(/\s*\n+\s*/g, " ");
  return passageChoice(ctx.rng, p, qi, `${p.title}. ${text} ${p.questions[qi].prompt}`);
};

export interface LilyPassageSet {
  passageId: string;
  title: string;
  level: number;
  questions: { index: number; kind: ContentQuestion["kind"]; prompt: string }[];
}

/**
 * Deterministic passage + its questions for a block, so consecutive items share
 * one passage (the child reads it once):
 *
 *   const set = lilyPassageSetForSeed(1, seed);
 *   for (const q of set.questions)
 *     generators["rd.lilyPassage"]({ rng: mulberry32(seed + q.index), params: { passageId: set.passageId, qIndex: q.index } });
 *
 * `upTo` (a stage id) keeps to passages decodable at that stage.
 */
export function lilyPassageSetForSeed(level: number, seed: number, upTo?: string): LilyPassageSet {
  const pool = lilyPassagePool(snapLilyLevel(level), upTo ? orderOf(upTo) || undefined : undefined);
  const p = pick(mulberry32(seed), pool);
  return {
    passageId: p.id,
    title: p.title,
    level: p.level,
    questions: p.questions.map((q, index) => ({ index, kind: q.kind, prompt: q.prompt })),
  };
}

// ---------------------------------------------------------------------------

export const generators: Record<string, Generator> = {
  "ph.wordPicture": wordPicture,
  "ph.pictureWord": pictureWord,
  "ph.buildWord": buildWord,
  "ph.missingSound": missingSound,
  "ph.rhyme": rhyme,
  "ph.soundSort": soundSort,
  "ph.segmentSounds": segmentSounds,
  "ph.sightWord": sightWord,
  "ph.sentenceRead": sentenceRead,
  "rd.lilyPassage": lilyPassage,
  "rd.lilyListen": lilyListen,
};

/** Unused-import guard for types referenced only in signatures. */
export type { Question };
