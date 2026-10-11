/**
 * Reading generators for Cole (grade 3 → 4), built on COLE_PASSAGES
 * (32 original passages at levels 3 / 3.5 / 4, each with 3 authored questions
 * and 3-4 vocabulary words).
 *
 * Generator ids
 *   rd.passage       one of the passage's authored questions (any kind)
 *   rd.mainIdea      the passage's main-idea / author-purpose question   (RI.CI / RL.CI)
 *   rd.inference     the passage's inference question                     (RI.CR / RL.CR)
 *   rd.vocabContext  vocabulary in context: the sentence that uses a vocab word,
 *                    4 meanings (3 drawn from other passages' vocab)      (L.VL)
 *   rd.evidenceLine  which quoted sentence best supports a claim; claims
 *                    and evidence sentences come from the EVIDENCE table   (RI.CR / RL.CR)
 *   rd.sequence      the passage's sequence question when it has one, else
 *                    an order-the-events item from the ORDER table        (RI.IT / RL.IT)
 *
 * Params (all optional, read from ctx.params; ctx.level is ignored because
 * the shared self-check passes track levels 1 / 3 there):
 *   level      3 | 3.5 | 4. Exact match first; the pool widens by ±0.5 only when
 *              the exact level (after topic / kind filters) is exhausted. When
 *              absent, every passage (3–4) is eligible.
 *   spread     extra tolerance always applied, e.g. { level: 3, spread: 0.5 }
 *              uses levels 3 and 3.5 (default 0).
 *   topic      string | string[]: passage topic ("sports", "science", …) or
 *              genre ("fiction" | "nonfiction").
 *   passageId  force one passage (see passageSetForSeed).
 *   qIndex     rd.passage only: which of the passage's questions to ask.
 *   attempt    attempts so far. When present, the passage is chosen by cycling
 *              through a fixed shuffled order of the pool instead of by rng, so
 *              no passage repeats within pool-size consecutive items.
 *   word       rd.vocabContext only: force a vocabulary word.
 *
 * Every question carries display.passage = { title, text, level } so the
 * player can show the text; display.speak is never set because Cole reads
 * the passage himself. Pure functions of ctx.rng; relative imports only.
 */

import type { ChoiceQuestion, Generator, GeneratorContext, Option, Passage } from "../types";
import type { ContentQuestion, ReadingPassage } from "../content/types";
import { hashString, mulberry32, pick, sample, shuffle } from "../rng";
import { COLE_PASSAGES } from "../content/passages-cole";

// ---------------------------------------------------------------------------
// params
// ---------------------------------------------------------------------------

const LEVELS: readonly number[] = [3, 3.5, 4];

function numParam(ctx: GeneratorContext, key: string): number | undefined {
  const v = ctx.params?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function strParam(ctx: GeneratorContext, key: string): string | undefined {
  const v = ctx.params?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Nearest authored level (3, 3.5 or 4). */
export function snapLevel(n: number): number {
  let best = LEVELS[0];
  for (const l of LEVELS) if (Math.abs(l - n) < Math.abs(best - n)) best = l;
  return best;
}

interface LevelSpec {
  level: number;
  spread: number;
}

/** params.level → exact level (plus params.spread); no params.level → everything. */
function levelSpec(ctx: GeneratorContext): LevelSpec {
  const level = numParam(ctx, "level");
  const spread = Math.max(0, numParam(ctx, "spread") ?? 0);
  if (level === undefined) return { level: 3.5, spread: Math.max(spread, 0.5) };
  return { level: snapLevel(level), spread };
}

function topicsOf(ctx: GeneratorContext): string[] {
  const t = ctx.params?.topic;
  if (typeof t === "string" && t.length > 0) return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string" && x.length > 0);
  return [];
}

// ---------------------------------------------------------------------------
// sentences
// ---------------------------------------------------------------------------

const ABBREVIATIONS = /\b(Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr)\./g;
const GUARD = "\u0001";

/** Split passage text into sentences (paragraph-aware, keeps "Mr." / "St." together). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.replace(/\u0001/g, ".").trim();
    if (t) out.push(t);
  };
  for (const para of text.split(/\n\s*\n/)) {
    const guarded = para.replace(ABBREVIATIONS, `$1${GUARD}`);
    let start = 0;
    for (let i = 0; i < guarded.length; i++) {
      const c = guarded[i];
      if (c !== "." && c !== "!" && c !== "?") continue;
      let j = i + 1;
      while (j < guarded.length && (guarded[j] === '"' || guarded[j] === "”" || guarded[j] === "'")) j++;
      if (j >= guarded.length || /\s/.test(guarded[j])) {
        push(guarded.slice(start, j));
        start = j;
        i = j - 1;
      }
    }
    push(guarded.slice(start));
  }
  return out;
}

/** Drop a stray opening or closing double quote left by splitting multi-sentence dialogue. */
function tidyQuote(s: string): string {
  const n = (s.match(/"/g) ?? []).length;
  if (n % 2 === 1) {
    if (s.startsWith('"')) return s.slice(1);
    if (s.endsWith('"')) return s.slice(0, -1);
  }
  return s;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// passage selection
// ---------------------------------------------------------------------------

type Pred = (p: ReadingPassage) => boolean;

function near(p: ReadingPassage, level: number, tol: number): boolean {
  return Math.abs(p.level - level) <= tol + 1e-9;
}

function matchesTopic(p: ReadingPassage, topics: readonly string[]): boolean {
  return topics.length === 0 || topics.some((t) => t === p.topic || t === p.genre);
}

/**
 * Candidate passages for a level: exact level (± spread) and topic first, then
 * widened by ±0.5, then without the topic filter, so a block never comes up empty.
 */
export function passagePool(level: number, spread: number, topics: readonly string[] = [], eligible: Pred = () => true): ReadingPassage[] {
  const tiers: Pred[] = [
    (p) => near(p, level, spread) && matchesTopic(p, topics) && eligible(p),
    (p) => near(p, level, spread + 0.5) && matchesTopic(p, topics) && eligible(p),
    (p) => near(p, level, spread) && eligible(p),
    (p) => near(p, level, spread + 0.5) && eligible(p),
    (p) => eligible(p),
  ];
  for (const t of tiers) {
    const pool = COLE_PASSAGES.filter(t);
    if (pool.length > 0) return pool;
  }
  return COLE_PASSAGES.slice();
}

function choosePassage(ctx: GeneratorContext, eligible: Pred): ReadingPassage {
  const forced = strParam(ctx, "passageId");
  if (forced) {
    const p = COLE_PASSAGES.find((x) => x.id === forced);
    if (p && eligible(p)) return p;
  }
  const { level, spread } = levelSpec(ctx);
  const pool = passagePool(level, spread, topicsOf(ctx), eligible);
  const attempt = numParam(ctx, "attempt");
  if (attempt !== undefined && attempt >= 0) {
    // Fixed order per pool: any pool.length consecutive attempts see distinct passages.
    const order = shuffle(mulberry32(hashString(pool.map((p) => p.id).join("|"))), pool);
    return order[Math.floor(attempt) % order.length];
  }
  return pick(ctx.rng, pool);
}

function passageDisplay(p: ReadingPassage): Passage {
  return { title: p.title, text: p.text, level: p.level };
}

function questionIndexOfKind(p: ReadingPassage, kinds: readonly ContentQuestion["kind"][]): number {
  return p.questions.findIndex((q) => kinds.includes(q.kind));
}

/** A choice question from one of the passage's authored questions, options shuffled. */
function contentChoice(rng: () => number, p: ReadingPassage, qi: number, readPrefix: boolean): ChoiceQuestion {
  const q = p.questions[qi];
  const order = shuffle(
    rng,
    q.options.map((_, i) => i)
  );
  const options: Option[] = order.map((i) => ({ label: q.options[i] }));
  return {
    type: "choice",
    prompt: `${readPrefix && qi === 0 ? `Read “${p.title}”, then answer: ` : ""}${q.prompt}`,
    options,
    answerIndex: order.indexOf(q.answerIndex),
    display: { passage: passageDisplay(p) },
    explain: q.explain,
    hint: q.hint,
  };
}

/** 4 unique labels with the correct one tracked after shuffling. */
function choiceOf(rng: () => number, correct: string, distractors: readonly string[]): { options: Option[]; answerIndex: number } {
  const labels = shuffle(rng, [correct, ...distractors]);
  return { options: labels.map((label) => ({ label })), answerIndex: labels.indexOf(correct) };
}

// ---------------------------------------------------------------------------
// passage sets (for the player: run all three questions of one passage)
// ---------------------------------------------------------------------------

export interface PassageSet {
  passageId: string;
  title: string;
  level: number;
  questions: { index: number; kind: ContentQuestion["kind"]; prompt: string }[];
}

/**
 * Deterministic passage + its (up to 3) questions for a block. The player may
 * call this so consecutive items share one passage:
 *
 *   const set = passageSetForSeed(3.5, seed);
 *   for (const q of set.questions)
 *     generators["rd.passage"]({ rng: mulberry32(seed + q.index), params: { passageId: set.passageId, qIndex: q.index } });
 */
export function passageSetForSeed(level: number, seed: number, spread = 0, topics: readonly string[] = []): PassageSet {
  const pool = passagePool(snapLevel(level), spread, topics, (p) => p.questions.length > 0);
  const p = pick(mulberry32(seed), pool);
  return {
    passageId: p.id,
    title: p.title,
    level: p.level,
    questions: p.questions.slice(0, 3).map((q, index) => ({ index, kind: q.kind, prompt: q.prompt })),
  };
}

// ---------------------------------------------------------------------------
// rd.passage / rd.mainIdea / rd.inference
// ---------------------------------------------------------------------------

const passageGen: Generator = (ctx) => {
  const p = choosePassage(ctx, (x) => x.questions.length > 0);
  const forced = numParam(ctx, "qIndex");
  const qi = forced !== undefined && forced >= 0 && forced < p.questions.length ? Math.floor(forced) : Math.floor(ctx.rng() * p.questions.length);
  return contentChoice(ctx.rng, p, qi, true);
};

function kindGenerator(kinds: readonly ContentQuestion["kind"][]): Generator {
  return (ctx) => {
    const p = choosePassage(ctx, (x) => questionIndexOfKind(x, kinds) >= 0);
    const qi = questionIndexOfKind(p, kinds);
    return contentChoice(ctx.rng, p, qi < 0 ? 0 : qi, true);
  };
}

const mainIdeaGen = kindGenerator(["main-idea", "author-purpose"]);
const inferenceGen = kindGenerator(["inference"]);

// ---------------------------------------------------------------------------
// rd.vocabContext
// ---------------------------------------------------------------------------

interface VocabEntry {
  word: string;
  meaning: string;
  passageId: string;
}

const VOCAB_ALL: VocabEntry[] = COLE_PASSAGES.flatMap((p) => p.vocab.map((v) => ({ word: v.word, meaning: v.meaning, passageId: p.id })));

/** Word families whose meanings are too close to serve as distractors for each other. */
const NEAR_STEMS: readonly (readonly string[])[] = [
  ["pattern", "cycle", "routine", "consist"],
  ["observ", "evidence"],
  ["estimat", "predict"],
  ["remarkab", "unusual"],
  ["fasten", "joint"],
];

function related(a: string, b: string): boolean {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la.slice(0, 5) === lb.slice(0, 5)) return true;
  return NEAR_STEMS.some((g) => g.some((s) => la.startsWith(s)) && g.some((s) => lb.startsWith(s)));
}

interface Hit {
  index: number;
  form: string;
}

/** First sentence using the word (whole word first, then an inflected form such as "clustering"). */
export function findVocabSentence(sentences: readonly string[], word: string): Hit | undefined {
  const whole = new RegExp(`\\b${escapeRe(word)}\\b`, "i");
  const prefix = new RegExp(`\\b${escapeRe(word)}[a-z]*`, "i");
  for (const re of [whole, prefix]) {
    for (let i = 0; i < sentences.length; i++) {
      const m = re.exec(sentences[i]);
      if (m) return { index: i, form: m[0] };
    }
  }
  return undefined;
}

interface VocabHit {
  word: string;
  meaning: string;
  hit: Hit;
}

const vocabContextGen: Generator = (ctx) => {
  const { rng } = ctx;
  const p = choosePassage(ctx, (x) => x.vocab.length > 0);
  const sentences = splitSentences(p.text);
  const hits: VocabHit[] = [];
  for (const v of p.vocab) {
    const hit = findVocabSentence(sentences, v.word);
    if (hit) hits.push({ word: v.word, meaning: v.meaning, hit });
  }
  const forcedWord = strParam(ctx, "word");
  const chosen = (forcedWord ? hits.find((h) => h.word.toLowerCase() === forcedWord.toLowerCase()) : undefined) ?? (hits.length > 0 ? pick(rng, hits) : undefined);
  if (!chosen) {
    const qi = questionIndexOfKind(p, ["vocabulary"]);
    return contentChoice(rng, p, qi < 0 ? 0 : qi, true);
  }

  const sentence = tidyQuote(sentences[chosen.hit.index]);
  const nextRaw = sentences[chosen.hit.index + 1];
  const next = nextRaw && nextRaw.length <= 160 ? tidyQuote(nextRaw) : undefined;
  const form = chosen.hit.form.toLowerCase();

  // Distractor meanings: other passages' vocab, never a word family or a meaning
  // that this passage teaches (its vocab was pre-taught, so none of it may be a wrong option).
  const seen = new Set<string>(p.vocab.map((v) => norm(v.meaning)));
  const candidates: string[] = [];
  for (const e of VOCAB_ALL) {
    if (e.passageId === p.id || p.vocab.some((v) => related(e.word, v.word))) continue;
    const k = norm(e.meaning);
    if (seen.has(k)) continue;
    seen.add(k);
    candidates.push(e.meaning);
  }
  const distractors = sample(rng, candidates, 3);
  const { options, answerIndex } = choiceOf(rng, capitalize(chosen.meaning), distractors.map(capitalize));

  const stem = chosen.word.toLowerCase().slice(0, 5);
  const contentQ = p.questions.find((q) => q.kind === "vocabulary" && new RegExp(`\\b${escapeRe(stem)}`, "i").test(q.prompt));
  const clue = `Clue: “${sentence}”`;
  const explain = contentQ
    ? `${clue} ${contentQ.explain}`
    : `${clue}${next ? ` The next sentence adds: “${next}”` : ""} Read the words around “${form}”: the sentence only makes sense if it means ${chosen.meaning}.`;

  return {
    type: "choice",
    prompt: `In “${p.title}” the author writes: “${sentence}”  What does the word “${form}” mean in this sentence?`,
    options,
    answerIndex,
    display: { passage: passageDisplay(p) },
    explain,
    hint: contentQ?.hint ?? "Cover the word and read the sentence again. Which meaning keeps the sentence making sense?",
  };
};

// ---------------------------------------------------------------------------
// rd.evidenceLine — authored claim → evidence sentence (by a unique needle)
// ---------------------------------------------------------------------------

export interface EvidenceEntry {
  id: string;
  /** The idea to support, stated in different words from the passage. */
  claim: string;
  /** Substring that occurs in exactly one sentence of the passage: the evidence. */
  needle: string;
  /** Why that sentence proves the claim (first sentence of the explanation). */
  why: string;
  /** Needles of other sentences that also support the claim; never used as distractors. */
  exclude: readonly string[];
}

export const EVIDENCE: readonly EvidenceEntry[] = [
  { id: "cole-p01", claim: "The air pushes on the ball less on the side where it is moving faster.", needle: "pushes on the ball less", why: "The claim is about which side of the ball gets pushed less, and that sentence says fast-moving air pushes less than slow-moving air.", exclude: ["same direction as the air rushing past", "fight against the rushing air", "gently shoved toward the faster side", "The secret is spin"] },
  { id: "cole-p02", claim: "The towers' different shapes helped sailors during the day, not just at night.", needle: "In daylight", why: "Only this sentence tells what the two shapes did for a sailor in daylight.", exclude: ["builders did that on purpose", "count two lights", "north tower is eight-sided"] },
  { id: "cole-p03", claim: "The yellow and orange colors are already in the leaf during summer; the green just hides them.", needle: "Yellow and orange materials", why: "That sentence says the yellow and orange materials are in the leaf too, hidden under all that green.", exclude: ["colors were hiding in the leaves all summer", "covers up every other color", "that were there all along finally show"] },
  { id: "cole-p04", claim: "The beak is the only hard part of an octopus's body.", needle: "only hard piece", why: "The sentence says the beak is the only hard piece of the animal.", exclude: ["Because it has no bones", "three hearts, blue blood, and no bones"] },
  { id: "cole-p05", claim: "The moon does not make its own light.", needle: "makes no light of its own", why: "That sentence states it directly; the next one explains where the light comes from instead.", exclude: ["sunlight bounces off"] },
  { id: "cole-p06", claim: "Franklin wanted everyone to be able to use his inventions.", needle: "never patented", why: "The sentence gives his exact reason for not patenting them.", exclude: [] },
  { id: "cole-p07", claim: "A high price makes fewer people buy.", needle: "many people will walk past", why: "At two dollars, many people walk past: that is fewer buyers at a higher price.", exclude: ["Price is a choice", "At fifty cents, a cup is an easy decision"] },
  { id: "cole-p08", claim: "Sound takes about five seconds to travel one mile.", needle: "one mile every five seconds", why: "That sentence gives the speed of sound in miles and seconds.", exclude: ["count five seconds between the flash", "Ten seconds means about two miles", "Sound is much slower"] },
  { id: "cole-p09", claim: "The Mississippi gets wider because the rivers that join it add water.", needle: "adds more water", why: "The sentence links the tributaries' water to the river growing wider and stronger.", exclude: ["other rivers pour into it", "Missouri River joins from the west"] },
  { id: "cole-p10", claim: "De Mestral got his idea by looking at a burr very closely.", needle: "under a microscope", why: "Looking under a microscope is looking very closely, and that is where he saw the hooks.", exclude: ["covered with hundreds of tiny hooks", "hooks had caught", "decided to copy the idea"] },
  { id: "cole-p11", claim: "The same basketball bounces lower when it is cold than when it is warm.", needle: "cold garage", why: "The sentence compares one ball in a cold garage with the same ball after it warms up.", exclude: ["When the air is cold, they slow down", "Nothing leaked out", "stopped pushing as hard", "Temperature changes how well this works"] },
  { id: "cole-p12", claim: "A key that is almost the right shape still will not open the lock.", needle: "almost right will not work", why: "The sentence says exactly that: even an almost-right key will not work.", exclude: ["bumps are the wrong heights", "Some pins are lifted too far", "exact heights of the pins"] },
  { id: "cole-p13", claim: "The monarchs that fly to Mexico have never made the trip before.", needle: "never been to Mexico", why: "That sentence says the butterflies that make it have never been to Mexico.", exclude: ["parents and grandparents were born in the north", "Somehow the fall butterflies find"] },
  { id: "cole-p14", claim: "Planting cotton every year made the soil poor.", needle: "wore out the soil", why: "The sentence says cotton slowly wore out the soil.", exclude: ["put nutrients back", "farmers around Tuskegee had a problem", "peanuts and sweet potatoes did the opposite"] },
  { id: "cole-p15", claim: "The land at Sandy Hook has grown longer over the years.", needle: "carried sand northward", why: "The sentence explains that waves and currents carried sand and the land itself grew.", exclude: ["has not moved an inch", "five hundred feet from the tip", "mile and a half from the tip", "hook is still growing"] },
  { id: "cole-p16", claim: "Galileo saw the four lights move from one night to the next.", needle: "changed position", why: "That sentence says that night after night the lights changed position.", exclude: ["concluded that they were moons", "spotted four small lights"] },
  { id: "cole-p17", claim: "The telegraph could send a message much faster than the Pony Express.", needle: "cross the country in minutes", why: "The sentence compares ten days by horse with minutes by telegraph.", exclude: ["finished a telegraph line", "Two days after the line was completed", "lasted only eighteen months"] },
  { id: "cole-p18", claim: "Cold air turns water vapor back into drops of liquid water.", needle: "cannot hold as much water vapor", why: "The sentence says cold air cannot hold as much vapor, so the vapor changes back into droplets.", exclude: ["High in the sky, the air is cold", "This step is called condensation", "outside of a cold glass"] },
  { id: "cole-p19", claim: "When there is a lot of something and few people want it, the price goes down.", needle: "supply is high and demand is low", why: "That is the rule stated in the passage: high supply plus low demand means prices fall.", exclude: ["stores lower the price so the fruit sells", "If demand drops", "supply is low and demand is high"] },
  { id: "cole-p20", claim: "The goose at the front of the V has the hardest job.", needle: "works the hardest", why: "The sentence says the front goose has no one ahead of it, so it works the hardest.", exclude: ["There is one exception", "When the leader grows tired"] },
  { id: "cole-p21", claim: "Owen blamed Maya without any proof.", needle: "did not have any evidence", why: "The sentence says he did not have any evidence when he blamed her.", exclude: ["just knew that Maya borrowed things", "That's a guess, not a clue", "I blamed you before I checked"] },
  { id: "cole-p22", claim: "Dash stored fewer acorns than he believed because he counted too quickly.", needle: "counted too fast", why: "The sentence gives both parts: he counted too fast and stored fewer than he thought.", exclude: ["found only six acorns", "half of them were hollow"] },
  { id: "cole-p23", claim: "The closet plant was tall but not healthy.", needle: "thin and pale yellow", why: "The sentence says it was tall but thin, pale, and floppy, which is not a healthy plant.", exclude: ["Its two tiny leaves had never opened", "not growing better", "It is stretching", "reach for light that is not there", "closet plant collapsed"] },
  { id: "cole-p24", claim: "Grandpa himself hit the home run.", needle: "name written in the margin", why: "Grandpa points to a name next to the home run, and the next sentence says it was his own.", exclude: ["It was his own name", "I did not just keep score", "I got to bat"] },
  { id: "cole-p25", claim: "The floor was wet on each morning the lunchbox moved.", needle: "shiny and a little damp", why: "The sentence says that on all three mornings the floor had been shiny and damp.", exclude: ["moved only on Monday", "never moved on Thursday", "floor under the cubbies was dry", "days the floor gets mopped", "pushing a mop"] },
  { id: "cole-p26", claim: "Two blazes painted together mean the trail turns.", needle: "Two blazes means a turn", why: "Isaiah says it in those words: two blazes means a turn.", exclude: ["top one points which way", "two blue blazes, one painted above the other", "real trail bent sharply right"] },
  { id: "cole-p27", claim: "The heron knew the creek's pattern because she had watched it for a long time.", needle: "through many seasons", why: "The sentence says she had watched the creek through many seasons and noticed a pattern.", exclude: ["Twice each day the water rose", "Twice each day it drained", "pulled small fish through a narrow gap", "I observed", "telling the same story every day"] },
  { id: "cole-p28", claim: "Leo moved left because his notes told him where number nine usually shot.", needle: "remembered the notebook", why: "The sentence shows him remembering the notebook numbers right before he moved.", exclude: ["Nine of them had gone low", "plants her right foot and swings across", "shaded a step to his left", "I read my notes", "Eleven shots is not a guess"] },
  { id: "cole-p29", claim: "The defender used Hana's eyes to know where the ball was going.", needle: "watched Hana's eyes", why: "The sentence says the defender watched Hana's eyes and moved before Sam had taken two steps.", exclude: ["her head turned toward the right sideline", "did not watch Sam at all", "pointing at him with my face"] },
  { id: "cole-p30", claim: "The thirty percent chance was about the whole day, not about game time.", needle: "for the whole day", why: "Dad says it directly: the thirty percent is for the whole day.", exclude: ["not telling us about ten o'clock", "The percent is an estimate for the day"] },
  { id: "cole-p31", claim: "A rectangle made of sticks can be pushed out of shape.", needle: "pushed into a lean", why: "Rosa says a rectangle can be pushed into a lean, and she shows it by squashing one flat.", exclude: ["A triangle can't", "sides lock each other in place", "rows of triangles", "shape matters more than the amount of wood"] },
  { id: "cole-p32", claim: "Tired legs cause a flatter shot that hits the front of the rim.", needle: "tired legs make a flatter shot", why: "That sentence is Coach's explanation, word for word.", exclude: ["Front rim, front rim, front rim", "evidence was consistent"] },
];

const EVIDENCE_BY_ID = new Map(EVIDENCE.map((e) => [e.id, e] as const));

const evidenceLineGen: Generator = (ctx) => {
  const { rng } = ctx;
  const p = choosePassage(ctx, (x) => EVIDENCE_BY_ID.has(x.id));
  const entry = EVIDENCE_BY_ID.get(p.id);
  const sentences = splitSentences(p.text);
  const evIdx = entry ? sentences.findIndex((s) => s.includes(entry.needle)) : -1;
  if (!entry || evIdx < 0) return inferenceGen(ctx);

  const blocked = (s: string) => entry.exclude.some((x) => s.includes(x));
  let pool = sentences.filter((s, i) => i !== evIdx && !blocked(s) && s.length >= 25 && s.length <= 180);
  if (pool.length < 3) pool = sentences.filter((s, i) => i !== evIdx && !blocked(s));
  const correct = tidyQuote(sentences[evIdx]);
  const distractors: string[] = [];
  for (const s of shuffle(rng, pool)) {
    const t = tidyQuote(s);
    if (t === correct || distractors.includes(t)) continue;
    distractors.push(t);
    if (distractors.length === 3) break;
  }
  if (distractors.length < 3) return inferenceGen(ctx);

  const { options, answerIndex } = choiceOf(rng, correct, distractors);
  return {
    type: "choice",
    prompt: `Which sentence from “${p.title}” best supports this idea?  ${entry.claim}`,
    options,
    answerIndex,
    display: { passage: passageDisplay(p) },
    explain: `${entry.why} The sentence “${correct}” is the evidence. The other sentences are true, but they are about something else.`,
    hint: "Find the sentence that says the same thing as the idea in the passage's own words. The other sentences are nearby, but they talk about something different.",
  };
};

// ---------------------------------------------------------------------------
// rd.sequence — the passage's sequence question, or authored order-the-events
// ---------------------------------------------------------------------------

export interface OrderEntry {
  id: string;
  /** Three events in the order the passage gives them. */
  events: readonly [string, string, string];
  /** Where in the passage the order is verified. */
  note: string;
}

export const ORDER: readonly OrderEntry[] = [
  { id: "cole-p03", events: ["The tree stops making new chlorophyll", "The green fades and the yellows and oranges show", "The tree seals off the stem and the leaf drifts down"], note: "Paragraph 3 has the tree stopping and the green fading; the last paragraph has the leaf letting go." },
  { id: "cole-p04", events: ["The octopus shoots out a cloud of dark ink", "It jets away by squirting water out of its body", "The water clears and the octopus is gone"], note: "All three steps are in the last paragraph, in that order." },
  { id: "cole-p06", events: ["Franklin goes to work in his brother's print shop at age twelve", "He leaves Boston for Philadelphia at seventeen", "He helps start a lending library and a fire company"], note: "Paragraph 1 gives age twelve, paragraph 2 gives age seventeen, and the town projects are in paragraph 3." },
  { id: "cole-p08", events: ["Lightning heats the air in a tiny fraction of a second", "The heated air expands with a violent push", "The push races outward as a wave of sound"], note: "Paragraph 2 gives the chain: heat, expand, sound." },
  { id: "cole-p09", events: ["The river begins at Lake Itasca in Minnesota", "The Missouri and Ohio Rivers join it", "The river empties into the Gulf of Mexico"], note: "The passage follows the water from its source (paragraph 1) past the tributaries (paragraph 2) to its mouth (paragraph 4)." },
  { id: "cole-p11", events: ["The ball hits the floor and the bottom flattens", "The air inside gets squeezed even more", "The extra push shoves the ball back into the air"], note: "Paragraph 2 lists the bounce step by step." },
  { id: "cole-p12", events: ["The correct key slides in and each bump lifts a pin", "Every pin lines up with the top of the plug", "The plug turns and the door opens"], note: "Paragraph 3 gives the steps in this order." },
  { id: "cole-p13", events: ["Monarchs fly south to the mountains of Mexico in the fall", "They cluster on fir trees to stay warm through the winter", "In spring they fly north and lay eggs on milkweed"], note: "Fall is in paragraph 1, the winter clusters in paragraph 3, and spring in paragraph 4." },
  { id: "cole-p14", events: ["Carver earns a college degree in agriculture in Iowa", "He moves to Alabama to teach at Tuskegee", "He urges farmers to rotate cotton with peanuts"], note: "Paragraph 2 gives the degree and then the 1896 move; the crop advice comes in paragraph 3." },
  { id: "cole-p15", events: ["Merchants raise money with lottery tickets to build the tower", "British soldiers hold Sandy Hook during the Revolutionary War", "The area becomes an army fort and later part of a national park"], note: "The tower was built in 1764 (paragraph 2); the Revolutionary War came after that, and paragraph 4 says the fort and the park came later still." },
  { id: "cole-p16", events: ["Galileo points a telescope at Jupiter and spots four lights", "The lights change position night after night", "Galileo concludes they are moons"], note: "The last paragraph tells these three steps in order." },
  { id: "cole-p17", events: ["Businessmen promise to carry mail in just ten days", "Workers finish a telegraph line across the country", "The Pony Express closes two days later"], note: "The promise opens the passage; the telegraph and the closing are in the last paragraph." },
  { id: "cole-p21", events: ["Owen blames Maya for taking the cleat", "Owen follows the mud smear to the dog bed", "Owen says sorry to Maya"], note: "The blame is in paragraph 2, the smear in paragraph 4, and the apology in paragraph 5." },
  { id: "cole-p22", events: ["Dash shouts that he is done for the year by lunchtime", "Winter arrives early and hard", "Dash finds only six acorns in his first hole"], note: "Paragraph 2 has the shout; paragraph 4 has the early winter and then the nearly empty hole." },
  { id: "cole-p24", events: ["The first batter strikes out", "The second batter is thrown out, shortstop to first", "The third batter hits a home run"], note: "Paragraph 3 reads the last inning batter by batter." },
  { id: "cole-p25", events: ["Theo and Amara make a list of what they know", "Amara arrives early on Thursday and finds the floor dry", "Amara sees Mr. Patel mopping under the cubbies"], note: "The list is in paragraph 3; paragraph 4 has the dry Thursday and then the mopping on the following Monday." },
  { id: "cole-p26", events: ["The cousins scramble over the fallen oak", "Isaiah notices there is no paint on the trees", "They go back and find two blue blazes on a maple"], note: "Paragraph 2 has the oak and then the missing paint; paragraph 4 has the double blaze." },
  { id: "cole-p27", events: ["The gull dives and comes up with only weeds", "The gull flies off to try the dump", "The water drains and the heron strikes"], note: "Paragraph 2 has the gull's failure and leaving; paragraph 4 has the heron's catch." },
  { id: "cole-p28", events: ["The starting keeper twists her ankle", "Number nine breaks free and races toward the goal", "Leo smothers the ball in the left corner"], note: "The injury ends paragraph 3; the breakaway and the save are in paragraph 4." },
  { id: "cole-p30", events: ["Dad reads a thirty percent chance of rain on his phone", "Priya watches the radar loop on the tablet", "The first fat drops hit the dugout roof"], note: "Paragraph 1 is Dad's phone, paragraph 2 is the radar, and the rain comes in paragraph 4." },
  { id: "cole-p31", events: ["Kenji's first bridge sags under the third book", "The family drives over a steel bridge built from triangles", "Kenji's second bridge holds nine books"], note: "The sagging is in paragraph 1, the drive in paragraph 3, and test day in the last paragraph." },
  { id: "cole-p32", events: ["Coach hands Mateo a blank chart", "Mateo adds up each column", "Mateo watches his misses hit the front of the rim"], note: "The chart comes in paragraph 1, the adding up in paragraph 2, and the watching in the last paragraph." },
];

const ORDER_BY_ID = new Map(ORDER.map((e) => [e.id, e] as const));

const PERMS: readonly (readonly number[])[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

const sequenceGen: Generator = (ctx) => {
  const { rng } = ctx;
  const p = choosePassage(ctx, (x) => questionIndexOfKind(x, ["sequence"]) >= 0 || ORDER_BY_ID.has(x.id));
  const qi = questionIndexOfKind(p, ["sequence"]);
  if (qi >= 0) return contentChoice(rng, p, qi, true);
  const entry = ORDER_BY_ID.get(p.id);
  if (!entry) {
    const di = questionIndexOfKind(p, ["detail", "inference"]);
    return contentChoice(rng, p, di < 0 ? 0 : di, true);
  }

  // letters[eventIndex] = the letter shown for that event in the prompt.
  const letters = shuffle(rng, ["A", "B", "C"]);
  const byLetter = ["A", "B", "C"].map((L) => entry.events[letters.indexOf(L)]);
  const key = (perm: readonly number[]) => perm.map((e) => letters[e]).join(" → ");
  const correct = key(PERMS[0]);
  const others = PERMS.slice(1).map(key);
  const { options, answerIndex } = choiceOf(rng, correct, sample(rng, others, 3));
  return {
    type: "choice",
    prompt: `Put these events from “${p.title}” in the order they happen in the passage.  A. ${byLetter[0]}  B. ${byLetter[1]}  C. ${byLetter[2]}  Which order is correct?`,
    options,
    answerIndex,
    display: { passage: passageDisplay(p) },
    explain: `The passage tells it in this order: 1) ${entry.events[0]}. 2) ${entry.events[1]}. 3) ${entry.events[2]}. ${entry.note} So the order is ${correct}.`,
    hint: "Skim the passage from the top. Which of the three events do you reach first? Which comes last?",
  };
};

// ---------------------------------------------------------------------------

export const generators: Record<string, Generator> = {
  "rd.passage": passageGen,
  "rd.mainIdea": mainIdeaGen,
  "rd.inference": inferenceGen,
  "rd.vocabContext": vocabContextGen,
  "rd.evidenceLine": evidenceLineGen,
  "rd.sequence": sequenceGen,
};
