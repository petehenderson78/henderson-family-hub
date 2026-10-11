/**
 * Reading + writing generator check: `node scripts/reading-check.mts`.
 *
 * Plain Node 22+ (type stripping) with the resolve hook from
 * ./ts-resolve-hooks.mjs, like learn-selfcheck.mts. Checks the content tables
 * (vocab sentences, evidence needles, order entries and their in-order text
 * anchors), content-audit guards (authored question shape, word counts, vocab
 * context and confusable distractor meanings, fragment / combine / punctuation
 * bank shape, known factual errors that must not come back), every word of
 * Lily's decodable passages against their phonics stages, then every generator in
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
const lilyMod = await import("../src/lib/learn/content/passages-lily");
const phonicsContentMod = await import("../src/lib/learn/content/phonics-lily");

const { generators: reading, EVIDENCE, ORDER, splitSentences, findVocabSentence, passageSetForSeed } = readingMod;
const { generators: writing, SKILL_LABEL, FRAGMENT_ITEMS, COMBINE_ITEMS, PUNCT_ITEMS } = writingMod;
const { COLE_PASSAGES, COLE_WRITING } = contentMod;
const { mulberry32, hashString } = rngMod;
const { COLE_READING_SKILLS } = catalogMod;
const { gradeAnswer } = gradeMod;
const { LILY_PASSAGES } = lilyMod;
const { PHONICS_STAGES } = phonicsContentMod;

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
    const p = byId.get(o.id);
    if (!p) continue;
    // each event is anchored to exactly one spot in the text, and the anchors run in the authored order
    assert(o.anchors.length === 3, where, "needs 3 anchors");
    const pos = o.anchors.map((a) => p.text.indexOf(a));
    o.anchors.forEach((a, i) => assert(pos[i] >= 0 && p.text.indexOf(a, pos[i] + 1) < 0, where, `anchor "${a}" must occur exactly once in the passage`));
    assert(pos[0] < pos[1] && pos[1] < pos[2], where, `anchors are not in passage order (${pos.join(", ")})`);
  }
  for (const L of LEVELS) {
    const at = COLE_PASSAGES.filter((p) => p.level === L);
    const ev = at.filter((p) => evIds.has(p.id)).length;
    const sq = at.filter((p) => orIds.has(p.id) || p.questions.some((q) => q.kind === "sequence")).length;
    console.log(`level ${L}: ${at.length} passages, evidence entries ${ev}, sequence-capable ${sq}`);
  }
}

// ---------------------------------------------------------------------------
// Content audit guards (each one pins a problem found when the content was reviewed)
// ---------------------------------------------------------------------------

{
  const allPassages: ReadingPassage[] = [...COLE_PASSAGES, ...LILY_PASSAGES];
  for (const p of allPassages) {
    const where = `content ${p.id}`;
    // authored questions: the right number of distinct options and one answer in range
    const optionCount = p.id.startsWith("cole-") ? 4 : 3;
    for (const [qi, q] of p.questions.entries()) {
      assert(q.options.length === optionCount, where, `question ${qi} has ${q.options.length} options, expected ${optionCount}`);
      assert(new Set(q.options.map(lower)).size === q.options.length, where, `question ${qi} repeats an option`);
      assert(Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.options.length, where, `question ${qi} answerIndex out of range`);
    }
    // declared word count stays close to the text
    const actual = p.text.split(/\s+/).filter(Boolean).length;
    assert(Math.abs(actual - p.words) <= Math.max(3, actual * 0.1), where, `words says ${p.words}, text has ${actual}`);
  }

  // rd.vocabContext quotes the first sentence that uses the word: it needs enough context,
  // unless the passage's own vocabulary question teaches the word ("I observed." alone does not)
  for (const p of COLE_PASSAGES) {
    const sentences = splitSentences(p.text);
    for (const v of p.vocab) {
      const hit = findVocabSentence(sentences, v.word);
      if (!hit) continue;
      const n = sentences[hit.index].split(/\s+/).filter(Boolean).length;
      const taught = p.questions.some((q) => q.kind === "vocabulary" && lower(q.prompt).includes(lower(v.word).slice(0, 5)));
      assert(n >= 4 || taught, `vocab ${p.id}`, `"${v.word}" is first used in a ${n}-word sentence: "${sentences[hit.index]}"`);
    }
  }

  // meanings that also read sensibly in the other word's sentence are never offered together
  const CONFUSABLE: readonly (readonly [string, string])[] = [
    ["faded", "pale"], ["sediment", "particles"], ["settled", "concluded"], ["admitted", "announced"], ["defender", "opposing"],
    ["satisfied", "certain"], ["certain", "exact"], ["flock", "clustering"], ["wireless", "telegraph"], ["merchants", "economists"],
    ["estimate", "prediction"], ["observe", "evidence"], ["observation", "evidence"], ["remarkable", "unusual"], ["fastener", "joint"],
    ["pattern", "cycle"], ["pattern", "routine"], ["cycle", "routine"], ["consistent", "pattern"],
  ];
  const meanings = new Map<string, string[]>();
  for (const p of COLE_PASSAGES) for (const v of p.vocab) meanings.set(lower(v.word), [...(meanings.get(lower(v.word)) ?? []), lower(v.meaning)]);
  let confusableChecks = 0;
  for (const p of COLE_PASSAGES) {
    for (const v of p.vocab) {
      const w = lower(v.word);
      const partners = CONFUSABLE.filter(([a, b]) => a === w || b === w).map(([a, b]) => (a === w ? b : a));
      const banned = new Set(partners.flatMap((x) => meanings.get(x) ?? []));
      if (banned.size === 0) continue;
      for (let i = 0; i < 25; i++) {
        const q = run(reading["rd.vocabContext"], hashString(`confusable:${p.id}:${w}:${i}`), { passageId: p.id, word: v.word });
        if (q.type !== "choice") continue;
        confusableChecks += 1;
        for (const o of q.options) assert(!banned.has(lower(o.label ?? "")), `vocab ${p.id}`, `"${v.word}" offered the meaning of a confusable word: "${o.label}"`);
      }
    }
  }

  // fragments: a subject-less fragment must not read as a command ("Set up a station." is a sentence)
  const IRREGULAR_PAST = new Set(["flew", "sent", "wrote", "ran", "swam", "dove", "threw", "took", "gave", "made", "held", "kept", "built", "caught", "found", "saw", "came", "went", "told", "began", "drew", "grew", "rode", "sang", "stood", "struck", "won"]);
  const OPENERS = /^(because|when|after|although|if|while|since|before|until)\b/i;
  for (const [i, it] of FRAGMENT_ITEMS.entries()) {
    const where = `FRAGMENT_ITEMS[${i}]`;
    const first = lower(it.text.split(/\s+/)[0].replace(/[^A-Za-z]/g, ""));
    assert(/^[A-Z]/.test(it.text) && it.text.endsWith("."), where, "item must start with a capital and end with a period");
    if (it.kind === "no-subject") {
      assert(first === lower(it.verb ?? ""), where, `a no-subject fragment must start with its verb "${it.verb}"`);
      assert(/(ed|[^s]s)$/.test(first) || IRREGULAR_PAST.has(first), where, `"${first}" could be read as a command, which makes a complete sentence`);
    }
    if (it.kind === "unfinished") assert(first === lower(it.opener ?? ""), where, `an unfinished fragment must start with its opener "${it.opener}"`);
    if (it.kind === "sentence" && OPENERS.test(it.text)) assert(it.text.includes(",") && !!it.note, where, "a sentence that starts with an opener needs its main clause after a comma and a note");
    if (it.kind !== "sentence") assert(!!it.fix && /^[A-Z]/.test(it.fix) && it.fix.endsWith(".") && (!OPENERS.test(it.fix) || it.fix.includes(",")), where, "fix must be one complete sentence");
  }

  // combine: wrong[0] is the parts run together, wrong[1] the same words with commas only, and the key uses a joining word
  const letters = (s: string) => s.replace(/[^A-Za-z]/g, "").toLowerCase();
  const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const JOIN = /\b(because|but|so|and|when|although|until|after|even though|if|while)\b/i;
  for (const [i, c] of COMBINE_ITEMS.entries()) {
    const where = `COMBINE_ITEMS[${i}]`;
    assert(JOIN.test(c.correct), where, "the key has no joining word");
    assert(!c.wrong[0].includes(",") && letters(c.wrong[0]) === letters(c.parts.join(" ")), where, `wrong[0] should be the parts run together: ${c.wrong[0]}`);
    assert(c.wrong[1].includes(",") && wordCount(c.wrong[1]) === wordCount(c.wrong[0]), where, `wrong[1] should be the same sentences joined by commas only: ${c.wrong[1]}`);
  }

  // punctuation: options differ only in punctuation, never in the words
  for (const [i, it] of PUNCT_ITEMS.entries()) for (const w of it.wrong) assert(letters(w) === letters(it.correct), `PUNCT_ITEMS[${i}]`, `distractor changes the words, not just the punctuation: ${w}`);

  // factual and logic errors found in review must not come back
  const coleCorpus = [
    ...COLE_PASSAGES.flatMap((p) => [p.text, ...p.vocab.map((v) => v.meaning), ...p.questions.flatMap((q) => [q.prompt, ...q.options, q.explain, q.hint])]),
    ...COLE_WRITING.flatMap((w) => [w.prompt, w.modelAnswer]),
    ...FRAGMENT_ITEMS.flatMap((x) => [x.text, x.fix ?? ""]),
    ...COMBINE_ITEMS.flatMap((x) => [...x.parts, x.correct, ...x.wrong]),
    ...PUNCT_ITEMS.flatMap((x) => [x.correct, ...x.wrong]),
    ...COLE_READING_SKILLS.flatMap((s) => s.intro ?? []),
  ].join("\n");
  const FACTS: readonly { re: RegExp; why: string }[] = [
    { re: /sweet potatoes did the opposite/i, why: "sweet potatoes do not put nutrients back into the soil (peanuts, a legume, do)" },
    { re: /underground rivers/i, why: "groundwater fills spaces in soil and rock; it is not underground rivers" },
    { re: /around South America/i, why: "1860 mail went by stagecoach or by ship via Panama" },
    { re: /stop growing and save/i, why: "adult butterflies never grow; the fall monarchs put off laying eggs" },
    { re: /fan-shaped land at the mouth of the Mississippi|delta, and it is still growing/i, why: "the Mississippi delta is bird's-foot shaped and losing land overall" },
    { re: /Galileo saw stripes/i, why: "Galileo's 1610 telescope could not show Jupiter's belts or the Great Red Spot" },
    { re: /At the northern tip of Sandy Hook/i, why: "the lighthouse is now about a mile and a half from the tip (paragraph 3)" },
    { re: /Marconi sent news|news of (a|the) yacht race (to shore|from the hill)/i, why: "the reports went from a ship at sea to Marconi's station on the hill" },
    { re: /four locked pockets/i, why: "not every mochila pocket was locked" },
    { re: /far more air into it/i, why: "a basketball holds only about one and a half times normal air pressure" },
    { re: /Some pins are lifted too far/i, why: "with one pin per hole, a pin lifted too far would not block the plug" },
    { re: /the other team's number nine/i, why: "the opponent changes every game; name the team whose number nine took eleven shots" },
    { re: /exactly as the loop had suggested/i, why: "the passage never says when the radar showed the rain ending" },
  ];
  for (const f of FACTS) assert(!f.re.test(coleCorpus), "facts (Cole)", `${f.re}: ${f.why}`);
  for (const p of LILY_PASSAGES) {
    assert(!(/\btulips?\b/i.test(p.text) && /\bseeds?\b/i.test(p.text)), `facts ${p.id}`, "tulips grow from bulbs, not seeds");
    assert(!/\bin March\b[^.]*plant seeds/i.test(p.text), `facts ${p.id}`, "corn and beans are not planted in March in New Jersey");
    assert(!/stir in water and mix it until it is sweet/i.test(p.text), `facts ${p.id}`, "water does not make lemonade sweet");
  }
  console.log(`audit: ${allPassages.length} passages, ${confusableChecks} confusable-vocab items, ${FRAGMENT_ITEMS.length + COMBINE_ITEMS.length + PUNCT_ITEMS.length} bank items, ${FACTS.length} fact pins`);
}

// ---------------------------------------------------------------------------
// Lily's decodable passages: every word is decodable at the passage's own phonicsStages
// ---------------------------------------------------------------------------

{
  const stages = PHONICS_STAGES.slice().sort((a, b) => a.order - b.order);
  const orderOf = new Map(stages.map((s) => [s.id, s.order] as const));
  const NEVER = 99;
  const st = (id: string): number => orderOf.get(id) ?? NEVER;
  const S = {
    a: st("cvc-a"), i: st("cvc-i"), o: st("cvc-o"), u: st("cvc-u"), e: st("cvc-e"),
    digraph: st("digraphs"), floss: st("floss"), blendStart: st("blends-beginning"), blendEnd: st("blends-ending"),
    magicA: st("magic-e-a"), magicOther: st("magic-e-i-o-u-e"), syllable: st("open-closed-syllables"),
    aiay: st("vowel-team-ai-ay"), eeea: st("vowel-team-ee-ea"), oaow: st("vowel-team-oa-ow-oe"), ighY: st("long-i-igh-y"),
    ar: st("r-controlled-ar"), or: st("r-controlled-or"), erirur: st("r-controlled-er-ir-ur"),
    diphthong: st("diphthongs"), soft: st("soft-c-g"), suffix: st("suffixes-ed-ing"),
  };
  assert(Object.values(S).every((n) => n < NEVER), "decodable: stages", "phonics-lily.ts stage ids changed; update the decodability check");
  const listed = new Map<string, number>();
  const sight = new Map<string, number>();
  for (const s of stages) {
    for (const w of s.words) if (!listed.has(w.word.toLowerCase())) listed.set(w.word.toLowerCase(), s.order);
    for (const w of s.sightWords) if (!sight.has(w.toLowerCase())) sight.set(w.toLowerCase(), s.order);
  }
  const known = (w: string): number | undefined => sight.get(w) ?? listed.get(w);
  /** The children's own names, known by sight from the first passage (see the passages-lily.ts header). */
  const OWN_NAMES = new Set(["lily", "cole"]);
  /** Words whose spelling looks decodable but whose sound breaks the patterns; usable only as listed sight words. */
  const IRREGULAR = new Set([
    "says", "push", "full", "bull", "bush", "sugar", "father", "both", "most", "post", "host", "ghost", "son", "won", "ton",
    "front", "month", "mother", "glove", "dove", "above", "oven", "none", "move", "lose", "whose", "live", "been", "pretty",
    "busy", "eye", "floor", "poor", "learn", "heard", "earth", "early", "earn", "search", "pearl", "bear", "pear", "wear",
    "swear", "head", "bread", "dead", "deaf", "ready", "heavy", "breath", "sweater", "weather", "feather", "leather",
    "instead", "spread", "thread", "meant", "health", "breakfast", "measure", "treasure", "steady", "break", "steak",
    "pint", "climb", "only", "any", "many", "very", "pull", "put", "of", "to", "do", "who", "two",
  ]);
  /** Final -ow is long o except in these. */
  const OW_DIPHTHONG_FINAL = new Set(["how", "now", "cow", "wow", "bow", "vow", "plow", "chow", "allow", "brow", "sow"]);
  const RULES: { re: RegExp; why: string }[] = [
    { re: /^(kn|wr|gn)|mb$/, why: "silent letter" },
    { re: /[^aeiou]le$/, why: "consonant-le syllable is not in the scope" },
    { re: /(old|olt|ild|ind)$/, why: "long vowel in a closed syllable" },
    { re: /(all|alk|alt|ald)$/, why: "a = /aw/" },
    { re: /^s?wa(s|sh|tch|nd|nt|ll|lk|lt|r)|^wor/, why: "w changes the vowel" },
    { re: /(are|ire|ure|ere)$/, why: "r-controlled vowel + e is not in the scope" },
    { re: /ear[^aeiouy]/, why: "ear = /er/" },
  ];
  type Unit = { g: string; stage: number; vowel: boolean };
  const GRAPHEMES: [string, number, boolean][] = [
    ["igh", S.ighY, true], ["dge", S.soft, false], ["tch", NEVER, false], ["ore", S.or, true],
    ["ai", S.aiay, true], ["ay", S.aiay, true], ["ee", S.eeea, true], ["ea", S.eeea, true], ["oa", S.oaow, true], ["oe", S.oaow, true],
    ["ow", S.oaow, true], ["ou", S.diphthong, true], ["oi", S.diphthong, true], ["oy", S.diphthong, true], ["au", S.diphthong, true],
    ["aw", S.diphthong, true], ["ew", NEVER, true], ["ar", S.ar, true], ["or", S.or, true], ["er", S.erirur, true], ["ir", S.erirur, true],
    ["ur", S.erirur, true], ["sh", S.digraph, false], ["ch", S.digraph, false], ["th", S.digraph, false], ["wh", S.digraph, false],
    ["ck", S.digraph, false], ["ng", S.blendEnd, false], ["nk", S.blendEnd, false], ["ff", S.floss, false], ["ll", S.floss, false],
    ["ss", S.floss, false], ["zz", S.floss, false], ["ph", NEVER, false], ["gh", NEVER, false], ["qu", NEVER, false],
  ];
  const SHORT: Record<string, number> = { a: S.a, i: S.i, o: S.o, u: S.u, e: S.e };
  const SUFFIXES = /(es|s|ed|ing)$/;

  /** Stage needed to decode a bare word (no suffix handling); NEVER when it cannot be decoded. */
  function bareStage(w: string): { stage: number; why: string } {
    const k = known(w);
    if (k !== undefined) return { stage: k, why: sight.has(w) ? "sight word" : "stage word" };
    if (IRREGULAR.has(w)) return { stage: NEVER, why: "irregular" };
    for (const r of RULES) if (r.re.test(w)) return { stage: NEVER, why: r.why };
    const units: Unit[] = [];
    for (let i = 0; i < w.length; ) {
      const g = GRAPHEMES.find(([x]) => w.startsWith(x, i));
      if (g) {
        let stage = g[1];
        if (g[0] === "ow") {
          const base = w.replace(SUFFIXES, "");
          stage = base.endsWith("ow") && !OW_DIPHTHONG_FINAL.has(base) ? S.oaow : S.diphthong;
        }
        units.push({ g: g[0], stage, vowel: g[2] });
        i += g[0].length;
        continue;
      }
      const c = w[i];
      if (c in SHORT) units.push({ g: c, stage: SHORT[c], vowel: true });
      else if (c === "y") units.push({ g: c, stage: i === 0 ? S.a : i === w.length - 1 ? S.ighY : NEVER, vowel: i !== 0 });
      else if (/[b-df-hj-np-tv-xz]/.test(c)) units.push({ g: c, stage: c === "q" ? NEVER : S.a, vowel: false });
      else return { stage: NEVER, why: `character "${c}"` };
      i += 1;
    }
    const why: string[] = [];
    let stage = S.a;
    const need = (n: number, reason: string) => {
      if (n > stage) {
        stage = n;
        why.push(reason);
      }
    };
    const n = units.length;
    let body = units;
    if (n >= 3 && units[n - 1].g === "e" && !units[n - 2].vowel && units[n - 3].vowel && units[n - 3].g.length === 1 && units[n - 3].g !== "y") {
      need(units[n - 3].g === "a" ? S.magicA : S.magicOther, `magic e (${units[n - 3].g}_e)`);
      if (units[n - 2].g === "c" || units[n - 2].g === "g") need(S.soft, "soft c/g");
      body = units.slice(0, n - 1).map((x, j) => (j === n - 3 ? { ...x, stage: 0 } : x));
    } else if (w.endsWith("ge")) need(S.soft, "soft g");
    body.forEach((x, j) => {
      need(x.stage, x.g);
      if (x.g === "c" && j + 1 < body.length && /^[eiy]/.test(body[j + 1].g)) need(S.soft, "soft c");
      const prev = body[j - 1];
      if (j > 0 && x.vowel && prev.vowel && (/^[aeiouy]$/.test(x.g) || /^[aeiouy]$/.test(prev.g))) need(NEVER, `vowel pair ${prev.g}${x.g}`);
    });
    const vowels = body.filter((x) => x.vowel).length;
    if (vowels === 0) need(NEVER, "no vowel");
    if (vowels >= 2) need(S.syllable, "two syllables");
    const last = body[body.length - 1];
    if (body === units && last.vowel && /^[aeiou]$/.test(last.g)) need(S.syllable, "open syllable");
    let lead = 0;
    while (lead < body.length && !body[lead].vowel) lead++;
    if (lead >= 2) need(S.blendStart, "beginning blend");
    let tail = 0;
    while (tail < body.length && !body[body.length - 1 - tail].vowel) tail++;
    if (tail >= 2) need(S.blendEnd, "ending blend");
    return { stage, why: why.join(", ") || "short vowel" };
  }

  /** Stage needed for a word as written: bare, plural / third-person -s, -ed / -ing, or a compound of two known words. */
  function wordStage(raw: string): { stage: number; why: string } {
    const w = raw.toLowerCase().replace(/'s$/, "");
    if (OWN_NAMES.has(w)) return { stage: 0, why: "own name" };
    let best = bareStage(w);
    const consider = (stage: number, why: string) => {
      if (stage < best.stage) best = { stage, why };
    };
    if (known(w) === undefined && !IRREGULAR.has(w)) {
      if (/[^s]s$/.test(w)) consider(bareStage(w.slice(0, -1)).stage, `-s on "${w.slice(0, -1)}"`);
      if (/(s|x|z|sh|ch)es$/.test(w)) consider(bareStage(w.slice(0, -2)).stage, `-es on "${w.slice(0, -2)}"`);
      if (w.endsWith("ies")) consider(Math.max(S.ighY, bareStage(`${w.slice(0, -3)}y`).stage), `-ies on "${w.slice(0, -3)}y"`);
      const m = /^(.+?)(ed|ing)$/.exec(w);
      if (m) {
        const s = m[1];
        const stems = [s, `${s}e`, ...(s.length > 2 && s[s.length - 1] === s[s.length - 2] ? [s.slice(0, -1)] : [])];
        const ok = stems.map((x) => ({ x, r: bareStage(x) })).filter(({ x, r }) => /[aeiouy]/.test(x) && r.stage < NEVER && (known(x) !== undefined || !r.why.includes("open syllable")));
        if (ok.length > 0) best = { stage: Math.max(S.suffix, Math.min(...ok.map((o) => o.r.stage))), why: `-${m[2]} on "${ok[0].x}"` };
      }
      for (let i = 2; i <= w.length - 2; i++) {
        const left = known(w.slice(0, i));
        const right = bareStage(w.slice(i));
        if (left !== undefined && w.length - i >= 2 && right.stage < NEVER) consider(Math.max(left, right.stage, S.syllable), `compound ${w.slice(0, i)}+${w.slice(i)}`);
      }
    }
    return best;
  }

  /** Phrases whose meaning needs a later stage than the word's spelling suggests. */
  const PHRASES: { re: RegExp; stage: number; why: string }[] = [
    { re: /\b(take|takes|took|taking) a bow\b/i, stage: S.diphthong, why: "bow = /bau/ (bend) needs the ow diphthong" },
  ];

  const stageIds = stages.map((s) => s.id);
  let wordsChecked = 0;
  for (const p of LILY_PASSAGES) {
    const where = `decodable ${p.id}`;
    const ids = p.phonicsStages ?? [];
    const max = Math.max(0, ...ids.map((id) => orderOf.get(id) ?? NEVER));
    assert(ids.length > 0 && max < NEVER, where, `phonicsStages missing or unknown: ${ids.join(",")}`);
    assert(ids.join(",") === stageIds.slice(0, max).join(","), where, `phonicsStages must be the cumulative stages 1..${max}`);
    for (const word of p.text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []) {
      wordsChecked += 1;
      const r = wordStage(word);
      assert(r.stage <= max, where, `"${word}" needs stage ${r.stage >= NEVER ? "(not decodable)" : r.stage} (${r.why}); passage is gated at ${max}`);
    }
    for (const ph of PHRASES) assert(!(ph.re.test(p.text) && ph.stage > max), where, `${ph.why}; passage is gated at ${max}`);
  }
  console.log(`decodable: ${LILY_PASSAGES.length} Lily passages, ${wordsChecked} words checked against their phonics stages`);
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
