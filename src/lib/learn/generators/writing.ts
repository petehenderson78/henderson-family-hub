/**
 * Writing generators for Cole (grade 3 → 4): The Writing Revolution style
 * sentence-level work (L.WF.3.3 / L.WF.4.3, W.AW.3.1, W.IW.4.2).
 *
 * Generator ids
 *   wr.sentence            free-writing prompt from COLE_WRITING (text, selfCheck)
 *   wr.fragmentOrSentence  complete sentence or fragment, and what is missing
 *   wr.combine             pick the correctly combined sentence (run-on / comma-splice /
 *                          wrong-connector distractors)
 *   wr.punctuation         pick the correctly punctuated sentence (list commas,
 *                          dialogue quotation marks, apostrophes)
 *
 * wr.sentence params (optional): skill — "because-but-so" | "appositive" |
 * "combine" | "topic-sentence" | "summary" (or an array of those); seen — ids of
 * prompts already written (unseen prompts are offered first); promptId — force one.
 * When a prompt refers to a passage by title, display.passage carries that passage.
 *
 * Pure functions of ctx.rng; relative imports only; no DOM.
 */

import type { Generator, GeneratorContext, Option, Passage } from "../types";
import type { WritingPrompt } from "../content/types";
import { pick, shuffle } from "../rng";
import { COLE_PASSAGES, COLE_WRITING } from "../content/passages-cole";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function strParam(ctx: GeneratorContext, key: string): string | undefined {
  const v = ctx.params?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function strListParam(ctx: GeneratorContext, key: string): string[] {
  const v = ctx.params?.[key];
  if (typeof v === "string" && v.length > 0) return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return [];
}

/** 4 unique labels with the correct one tracked after shuffling. */
function choiceOf(rng: () => number, correct: string, distractors: readonly string[]): { options: Option[]; answerIndex: number } {
  const labels = shuffle(rng, [correct, ...distractors]);
  return { options: labels.map((label) => ({ label })), answerIndex: labels.indexOf(correct) };
}

// ---------------------------------------------------------------------------
// wr.sentence — authored prompts, self-checked against a model answer
// ---------------------------------------------------------------------------

export const SKILL_LABEL: Record<string, string> = {
  "because-but-so": "Because / But / So",
  appositive: "Appositive",
  combine: "Combine the Sentences",
  "topic-sentence": "Topic Sentence",
  summary: "Two-Sentence Summary",
};

function passageFor(w: WritingPrompt): Passage | undefined {
  const p = COLE_PASSAGES.find((x) => w.prompt.includes(x.title));
  return p ? { title: p.title, text: p.text, level: p.level } : undefined;
}

const sentenceGen: Generator = (ctx) => {
  const { rng } = ctx;
  const wanted = strListParam(ctx, "skill").map((s) => SKILL_LABEL[s] ?? s);
  let pool = COLE_WRITING.filter((w) => wanted.length === 0 || wanted.includes(w.skill));
  if (pool.length === 0) pool = COLE_WRITING.slice();
  const forcedId = strParam(ctx, "promptId");
  const forced = forcedId ? pool.find((w) => w.id === forcedId) : undefined;
  const seen = new Set(strListParam(ctx, "seen"));
  const unseen = pool.filter((w) => !seen.has(w.id));
  const w = forced ?? pick(rng, unseen.length > 0 ? unseen : pool);
  const passage = passageFor(w);
  return {
    type: "text",
    prompt: w.prompt,
    answer: w.modelAnswer,
    selfCheck: true,
    modelAnswer: w.modelAnswer,
    ...(passage ? { display: { passage } } : {}),
    explain: w.checklist.map((c) => `Check: ${c}`).join("\n"),
    hint: w.checklist[0] ?? "Say the sentence out loud before you write it.",
  };
};

// ---------------------------------------------------------------------------
// wr.fragmentOrSentence
// ---------------------------------------------------------------------------

type FragmentKind = "sentence" | "no-subject" | "no-verb" | "unfinished";

interface FragmentItem {
  text: string;
  kind: FragmentKind;
  subject?: string;
  verb?: string;
  opener?: string;
  fix?: string;
  note?: string;
}

const FRAGMENT_OPTIONS: readonly string[] = [
  "Complete sentence",
  "Fragment: it is missing a subject (who or what)",
  "Fragment: it is missing a verb (what happens)",
  "Fragment: it starts a thought but does not finish it",
];

const FRAGMENT_INDEX: Record<FragmentKind, number> = { sentence: 0, "no-subject": 1, "no-verb": 2, unfinished: 3 };

export const FRAGMENT_ITEMS: readonly FragmentItem[] = [
  // complete sentences
  { text: "The octopus squeezed through a gap the size of a quarter.", kind: "sentence", subject: "The octopus", verb: "squeezed" },
  { text: "Geese fly in a V to save energy.", kind: "sentence", subject: "Geese", verb: "fly" },
  { text: "Pip counted every pile of acorns twice.", kind: "sentence", subject: "Pip", verb: "counted" },
  { text: "The lighthouse keeper climbed the tower at dusk.", kind: "sentence", subject: "The lighthouse keeper", verb: "climbed" },
  { text: "Sound travels about one mile every five seconds.", kind: "sentence", subject: "Sound", verb: "travels" },
  { text: "Mateo kept the first chart in his locker.", kind: "sentence", subject: "Mateo", verb: "kept" },
  { text: "When the leader tires, another goose takes the front.", kind: "sentence", subject: "another goose", verb: "takes", note: "It starts with \"When,\" but the second part finishes the thought." },
  { text: "Monarchs lay their eggs on milkweed.", kind: "sentence", subject: "Monarchs", verb: "lay" },
  { text: "The heron waited for the tide to drain.", kind: "sentence", subject: "The heron", verb: "waited" },
  { text: "Because the soil was tired, Carver told farmers to plant peanuts.", kind: "sentence", subject: "Carver", verb: "told", note: "It starts with \"Because,\" but the second part finishes the thought." },
  { text: "Kenji glued the sticks into triangles.", kind: "sentence", subject: "Kenji", verb: "glued" },
  { text: "The custodian lifted the lunchbox onto the bench.", kind: "sentence", subject: "The custodian", verb: "lifted" },
  // missing a subject
  { text: "Squeezed through a gap the size of a quarter.", kind: "no-subject", verb: "squeezed", fix: "The octopus squeezed through a gap the size of a quarter." },
  { text: "Flew thousands of miles to the mountains of Mexico.", kind: "no-subject", verb: "flew", fix: "The monarchs flew thousands of miles to the mountains of Mexico." },
  { text: "Counted the seconds between the flash and the thunder.", kind: "no-subject", verb: "counted", fix: "Priya counted the seconds between the flash and the thunder." },
  { text: "Dropped back into the line to rest.", kind: "no-subject", verb: "dropped", fix: "The tired leader dropped back into the line to rest." },
  { text: "Shoots out a cloud of dark ink.", kind: "no-subject", verb: "shoots", fix: "The octopus shoots out a cloud of dark ink." },
  { text: "Tested his wireless telegraph at Twin Lights in 1899.", kind: "no-subject", verb: "tested", fix: "Marconi tested his wireless telegraph at Twin Lights in 1899." },
  { text: "Wrote down where every shot went.", kind: "no-subject", verb: "wrote", fix: "Leo wrote down where every shot went." },
  // missing a verb
  { text: "The raised red seams on the baseball.", kind: "no-verb", subject: "The raised red seams", fix: "The raised red seams on the baseball grab the air." },
  { text: "A storm wider than Earth.", kind: "no-verb", subject: "A storm", fix: "The Great Red Spot is a storm wider than Earth." },
  { text: "The oldest working lighthouse in the United States.", kind: "no-verb", subject: "The oldest working lighthouse", fix: "Sandy Hook Lighthouse is the oldest working lighthouse in the United States." },
  { text: "Millions of butterflies on the branches of the fir trees.", kind: "no-verb", subject: "Millions of butterflies", fix: "Millions of butterflies rested on the branches of the fir trees." },
  { text: "The custodian with his mop and bucket.", kind: "no-verb", subject: "The custodian", fix: "The custodian with his mop and bucket lifted the lunchbox onto the bench." },
  { text: "A box of strawberries for three dollars in June.", kind: "no-verb", subject: "A box of strawberries", fix: "A box of strawberries costs three dollars in June." },
  { text: "Two blue blazes on the trunk of a maple.", kind: "no-verb", subject: "Two blue blazes", fix: "Two blue blazes marked the trunk of a maple." },
  // starts a thought but does not finish it
  { text: "Because the ball spins so fast.", kind: "unfinished", subject: "the ball", verb: "spins", opener: "Because", fix: "Because the ball spins so fast, it curves on its way to the plate." },
  { text: "When the water drains back toward the bay.", kind: "unfinished", subject: "the water", verb: "drains", opener: "When", fix: "When the water drains back toward the bay, the fish are easy to catch." },
  { text: "After Kenji built his second bridge.", kind: "unfinished", subject: "Kenji", verb: "built", opener: "After", fix: "After Kenji built his second bridge, it held nine books." },
  { text: "Although Dash gathered one hundred acorns.", kind: "unfinished", subject: "Dash", verb: "gathered", opener: "Although", fix: "Although Dash gathered one hundred acorns, half of them were hollow." },
  { text: "If you count five seconds between the flash and the boom.", kind: "unfinished", subject: "you", verb: "count", opener: "If", fix: "If you count five seconds between the flash and the boom, the lightning is about a mile away." },
  { text: "While the heron waited by the gap in the rocks.", kind: "unfinished", subject: "the heron", verb: "waited", opener: "While", fix: "While the heron waited by the gap in the rocks, the gull flew off to the dump." },
];

function fragmentExplain(item: FragmentItem): string {
  const fix = item.fix ?? "";
  switch (item.kind) {
    case "sentence":
      return `Subject: "${item.subject}" (who or what). Verb: "${item.verb}" (what happens). It tells a complete thought, so it is a sentence.${item.note ? ` ${item.note}` : ""}`;
    case "no-subject":
      return `There is a verb, "${item.verb}", but no subject: who or what ${item.verb}? Add one to fix it: "${fix}"`;
    case "no-verb":
      return `It names something, "${item.subject}", but nothing happens: there is no verb. Add one to fix it: "${fix}"`;
    default:
      return `It has a subject ("${item.subject}") and a verb ("${item.verb}"), but "${item.opener}" turns it into a beginning that needs an ending. Finish the thought to fix it: "${fix}"`;
  }
}

const fragmentGen: Generator = (ctx) => {
  const item = pick(ctx.rng, FRAGMENT_ITEMS);
  return {
    type: "choice",
    prompt: `Is this a complete sentence or a fragment?  “${item.text}”`,
    options: FRAGMENT_OPTIONS.map((label) => ({ label })),
    answerIndex: FRAGMENT_INDEX[item.kind],
    explain: fragmentExplain(item),
    hint: "Ask three questions: Who or what? (the subject) What happens? (the verb) Is the thought finished?",
  };
};

// ---------------------------------------------------------------------------
// wr.combine
// ---------------------------------------------------------------------------

interface CombineItem {
  parts: readonly string[];
  correct: string;
  /** run-on, comma splice, wrong connector (meaning changed) */
  wrong: readonly [string, string, string];
  why: string;
}

export const COMBINE_ITEMS: readonly CombineItem[] = [
  {
    parts: ["The octopus has no bones.", "It can squeeze through tiny gaps."],
    correct: "Because the octopus has no bones, it can squeeze through tiny gaps.",
    wrong: ["The octopus has no bones it can squeeze through tiny gaps.", "The octopus has no bones, it can squeeze through tiny gaps.", "The octopus has no bones, so it cannot squeeze through tiny gaps."],
    why: "The second idea happens because of the first, so \"because\" joins them and keeps the meaning.",
  },
  {
    parts: ["Sound is slow.", "Light is fast."],
    correct: "Sound is slow, but light is fast.",
    wrong: ["Sound is slow light is fast.", "Sound is slow, light is fast.", "Sound is slow, so light is fast."],
    why: "The two ideas are opposites, so \"but\" is the joining word. Slow sound does not cause fast light, so \"so\" is wrong.",
  },
  {
    parts: ["The leader goose gets tired.", "It drops back into the line."],
    correct: "When the leader goose gets tired, it drops back into the line.",
    wrong: ["The leader goose gets tired it drops back into the line.", "The leader goose gets tired, it drops back into the line.", "The leader goose drops back into the line, so it gets tired."],
    why: "Getting tired comes first and causes the move, so \"when\" fits. The \"so\" version flips the cause and the result.",
  },
  {
    parts: ["Dash gathered acorns fast.", "He did not check them."],
    correct: "Dash gathered acorns fast, but he did not check them.",
    wrong: ["Dash gathered acorns fast he did not check them.", "Dash gathered acorns fast, he did not check them.", "Dash gathered acorns fast, so he checked them twice."],
    why: "The second idea is a contrast with the first (fast, but careless), so \"but\" fits. The \"so\" version says he checked them twice, which is what Pip did, not Dash.",
  },
  {
    parts: ["Lightning heats the air.", "The air expands.", "We hear thunder."],
    correct: "When lightning heats the air, the air expands, and we hear thunder.",
    wrong: ["Lightning heats the air the air expands we hear thunder.", "Lightning heats the air, the air expands, we hear thunder.", "We hear thunder, so lightning heats the air."],
    why: "The events happen in order: heat, expand, thunder. \"When\" and \"and\" link them; commas alone cannot.",
  },
  {
    parts: ["Priya checked the app.", "Priya checked the radar."],
    correct: "Priya checked the app and the radar.",
    wrong: ["Priya checked the app Priya checked the radar.", "Priya checked the app, she checked the radar.", "Priya checked the app, but she checked the radar."],
    why: "Both sentences share the same subject and verb, so you can join the two things she checked with \"and\" and say \"Priya checked\" only once.",
  },
  {
    parts: ["Carver studied plants.", "He helped farmers grow better crops."],
    correct: "Carver studied plants and helped farmers grow better crops.",
    wrong: ["Carver studied plants he helped farmers grow better crops.", "Carver studied plants, he helped farmers grow better crops.", "Carver studied plants, but he helped farmers grow better crops."],
    why: "Both ideas go together, so \"and\" joins them with one subject. \"But\" would signal a contrast that is not there.",
  },
  {
    parts: ["The key was worn down.", "The lock would not open."],
    correct: "The key was worn down, so the lock would not open.",
    wrong: ["The key was worn down the lock would not open.", "The key was worn down, the lock would not open.", "The key was worn down because the lock would not open."],
    why: "The worn key is the cause and the stuck lock is the result, so \"so\" fits. \"Because\" would make the lock the cause.",
  },
  {
    parts: ["Jupiter is made mostly of gas.", "You cannot land on it."],
    correct: "Jupiter is made mostly of gas, so you cannot land on it.",
    wrong: ["Jupiter is made mostly of gas you cannot land on it.", "Jupiter is made mostly of gas, you cannot land on it.", "Jupiter is made mostly of gas because you cannot land on it."],
    why: "Being made of gas is the reason you cannot land, so \"so\" shows the result. The \"because\" version flips cause and result.",
  },
  {
    parts: ["The heron waited.", "The water drained.", "The fish came through the gap."],
    correct: "The heron waited until the water drained and the fish came through the gap.",
    wrong: ["The heron waited the water drained the fish came through the gap.", "The heron waited, the water drained, the fish came through the gap.", "The fish came through the gap, so the water drained and the heron waited."],
    why: "\"Until\" tells how long she waited, and \"and\" links the draining with the fish. The last version puts the events in the wrong order.",
  },
  {
    parts: ["Owen blamed Maya.", "He had no evidence."],
    correct: "Owen blamed Maya even though he had no evidence.",
    wrong: ["Owen blamed Maya he had no evidence.", "Owen blamed Maya, he had no evidence.", "Owen blamed Maya because he had no evidence."],
    why: "Blaming someone with no evidence is a contrast, so \"even though\" fits. Having no evidence is not a reason to blame.",
  },
  {
    parts: ["The Pony Express was fast.", "The telegraph was faster."],
    correct: "The Pony Express was fast, but the telegraph was faster.",
    wrong: ["The Pony Express was fast the telegraph was faster.", "The Pony Express was fast, the telegraph was faster.", "The Pony Express was fast, so the telegraph was faster."],
    why: "The second idea contrasts with the first, so \"but\" fits. A comma by itself cannot join two sentences.",
  },
  {
    parts: ["Kenji used fewer sticks.", "His second bridge held nine books."],
    correct: "Although Kenji used fewer sticks, his second bridge held nine books.",
    wrong: ["Kenji used fewer sticks his second bridge held nine books.", "Kenji used fewer sticks, his second bridge held nine books.", "Kenji used fewer sticks, so his second bridge held nine books."],
    why: "Fewer sticks and a stronger bridge is a surprise, so \"although\" fits. Fewer sticks did not cause the strength; the triangles did.",
  },
  {
    parts: ["The moon makes no light.", "It reflects sunlight."],
    correct: "The moon makes no light, but it reflects sunlight.",
    wrong: ["The moon makes no light it reflects sunlight.", "The moon makes no light, it reflects sunlight.", "The moon makes no light because it reflects sunlight."],
    why: "The second idea corrects the first, so \"but\" fits. Reflecting sunlight is not the reason the moon makes no light.",
  },
  {
    parts: ["Strawberries are scarce in January.", "They cost more."],
    correct: "Strawberries cost more in January because they are scarce.",
    wrong: ["Strawberries are scarce in January they cost more.", "Strawberries are scarce in January, they cost more.", "Strawberries are scarce in January, but they cost more."],
    why: "Being scarce is the reason for the higher price, so \"because\" fits. \"But\" would signal a contrast that is not there.",
  },
  {
    parts: ["Leo kept a notebook.", "He knew where number nine would shoot."],
    correct: "Because Leo kept a notebook, he knew where number nine would shoot.",
    wrong: ["Leo kept a notebook he knew where number nine would shoot.", "Leo kept a notebook, he knew where number nine would shoot.", "Leo kept a notebook, so he did not know where number nine would shoot."],
    why: "The notebook is the reason he knew, so \"because\" fits. The \"so\" version says the opposite of the story.",
  },
  {
    parts: ["De Mestral looked at a burr under a microscope.", "He saw hundreds of tiny hooks."],
    correct: "When de Mestral looked at a burr under a microscope, he saw hundreds of tiny hooks.",
    wrong: ["De Mestral looked at a burr under a microscope he saw hundreds of tiny hooks.", "De Mestral looked at a burr under a microscope, he saw hundreds of tiny hooks.", "De Mestral saw hundreds of tiny hooks, so he looked at a burr under a microscope."],
    why: "Looking came first and led to seeing the hooks, so \"when\" fits. The \"so\" version reverses the order.",
  },
  {
    parts: ["The tree stops making chlorophyll.", "The green fades."],
    correct: "The tree stops making chlorophyll, so the green fades.",
    wrong: ["The tree stops making chlorophyll the green fades.", "The tree stops making chlorophyll, the green fades.", "The tree stops making chlorophyll, but the green fades."],
    why: "Stopping the chlorophyll causes the fading, so \"so\" fits. \"But\" would signal a contrast that is not there.",
  },
  {
    parts: ["Sailors counted two lights.", "They knew which part of the coast they were passing."],
    correct: "When sailors counted two lights, they knew which part of the coast they were passing.",
    wrong: ["Sailors counted two lights they knew which part of the coast they were passing.", "Sailors counted two lights, they knew which part of the coast they were passing.", "Sailors counted two lights, but they knew which part of the coast they were passing."],
    why: "Counting the lights is what told the sailors where they were, so \"when\" fits. \"But\" would signal a contrast that is not there.",
  },
  {
    parts: ["Mateo felt better at the end of practice.", "His chart showed more makes at the start."],
    correct: "Mateo felt better at the end of practice, but his chart showed more makes at the start.",
    wrong: ["Mateo felt better at the end of practice his chart showed more makes at the start.", "Mateo felt better at the end of practice, his chart showed more makes at the start.", "Mateo felt better at the end of practice, so his chart showed more makes at the start."],
    why: "The feeling and the chart disagree, so \"but\" fits. His feeling did not cause the chart's numbers.",
  },
  {
    parts: ["The lights were turned off in 1949.", "Ships no longer needed them."],
    correct: "The lights were turned off in 1949 because ships no longer needed them.",
    wrong: ["The lights were turned off in 1949 ships no longer needed them.", "The lights were turned off in 1949, ships no longer needed them.", "The lights were turned off in 1949, so ships no longer needed them."],
    why: "Ships not needing the lights is the reason they were turned off, so \"because\" fits. The \"so\" version makes the shutdown the cause.",
  },
  {
    parts: ["The monarchs weigh less than a paper clip.", "They fly thousands of miles."],
    correct: "Although the monarchs weigh less than a paper clip, they fly thousands of miles.",
    wrong: ["The monarchs weigh less than a paper clip they fly thousands of miles.", "The monarchs weigh less than a paper clip, they fly thousands of miles.", "The monarchs weigh less than a paper clip, so they fly thousands of miles."],
    why: "A tiny weight and a huge trip is a surprise, so \"although\" fits. The weight does not cause the trip.",
  },
  {
    parts: ["The sun warms the sea.", "Water vapor rises into the air."],
    correct: "When the sun warms the sea, water vapor rises into the air.",
    wrong: ["The sun warms the sea water vapor rises into the air.", "The sun warms the sea, water vapor rises into the air.", "Water vapor rises into the air, so the sun warms the sea."],
    why: "The warming comes first and causes the rising, so \"when\" fits. The \"so\" version reverses cause and result.",
  },
  {
    parts: ["Amara wanted to be a detective.", "She collected evidence before naming a suspect."],
    correct: "Amara wanted to be a detective, so she collected evidence before naming a suspect.",
    wrong: ["Amara wanted to be a detective she collected evidence before naming a suspect.", "Amara wanted to be a detective, she collected evidence before naming a suspect.", "Amara wanted to be a detective because she collected evidence before naming a suspect."],
    why: "Wanting to be a detective is why she collected evidence first, so \"so\" shows the result. The \"because\" version flips it.",
  },
  {
    parts: ["The Great Red Spot is shrinking.", "It is still the largest storm in the solar system."],
    correct: "The Great Red Spot is shrinking, but it is still the largest storm in the solar system.",
    wrong: ["The Great Red Spot is shrinking it is still the largest storm in the solar system.", "The Great Red Spot is shrinking, it is still the largest storm in the solar system.", "The Great Red Spot is shrinking because it is still the largest storm in the solar system."],
    why: "Shrinking and still being the largest is a contrast, so \"but\" fits. Being large is not the reason it shrinks.",
  },
  {
    parts: ["Franklin noticed a problem.", "He wrote about it.", "He gathered neighbors to fix it."],
    correct: "Franklin noticed a problem, wrote about it, and gathered neighbors to fix it.",
    wrong: ["Franklin noticed a problem he wrote about it he gathered neighbors to fix it.", "Franklin noticed a problem, he wrote about it, he gathered neighbors to fix it.", "Franklin gathered neighbors to fix a problem, so he noticed it and wrote about it."],
    why: "Three actions by one person, in order, can share one subject: noticed, wrote, and gathered. The last version scrambles the order.",
  },
  {
    parts: ["The water in the creek was high.", "The gull could not catch any fish."],
    correct: "The water in the creek was high, so the gull could not catch any fish.",
    wrong: ["The water in the creek was high the gull could not catch any fish.", "The water in the creek was high, the gull could not catch any fish.", "The water in the creek was high because the gull could not catch any fish."],
    why: "The high water is the cause and the empty-handed gull is the result, so \"so\" fits. The \"because\" version makes the gull the cause of the high water.",
  },
  {
    parts: ["The hook is still growing.", "Waves carry sand northward every year."],
    correct: "The hook is still growing because waves carry sand northward every year.",
    wrong: ["The hook is still growing waves carry sand northward every year.", "The hook is still growing, waves carry sand northward every year.", "The hook is still growing, so waves carry sand northward every year."],
    why: "The waves are the reason the hook grows, so \"because\" fits. The \"so\" version makes the growing cause the waves.",
  },
  {
    parts: ["Nadia read the scorebook carefully.", "She figured out how the game ended."],
    correct: "Because Nadia read the scorebook carefully, she figured out how the game ended.",
    wrong: ["Nadia read the scorebook carefully she figured out how the game ended.", "Nadia read the scorebook carefully, she figured out how the game ended.", "Nadia read the scorebook carefully, but she figured out how the game ended."],
    why: "Reading carefully is the reason she figured it out, so \"because\" fits. \"But\" would signal a contrast that is not there.",
  },
  {
    parts: ["Hana looked left after the snap.", "The defender hesitated."],
    correct: "When Hana looked left after the snap, the defender hesitated.",
    wrong: ["Hana looked left after the snap the defender hesitated.", "Hana looked left after the snap, the defender hesitated.", "The defender hesitated, so Hana looked left after the snap."],
    why: "Her look came first and caused the hesitation, so \"when\" fits. The \"so\" version reverses the order.",
  },
  {
    parts: ["The closet plant was tall.", "It was thin and pale."],
    correct: "The closet plant was tall, but it was thin and pale.",
    wrong: ["The closet plant was tall it was thin and pale.", "The closet plant was tall, it was thin and pale.", "The closet plant was tall because it was thin and pale."],
    why: "Tall but weak is a contrast, so \"but\" fits. Being thin and pale is not the reason it was tall.",
  },
  {
    parts: ["Riders had to be light.", "The horses could run fast."],
    correct: "Riders had to be light so that the horses could run fast.",
    wrong: ["Riders had to be light the horses could run fast.", "Riders had to be light, the horses could run fast.", "Riders had to be light because the horses could run fast."],
    why: "Light riders were the way to get fast horses, so \"so that\" shows the purpose. The \"because\" version flips it.",
  },
  {
    parts: ["The tide drained.", "Fish were pulled through the gap."],
    correct: "When the tide drained, fish were pulled through the gap.",
    wrong: ["The tide drained fish were pulled through the gap.", "The tide drained, fish were pulled through the gap.", "Fish were pulled through the gap, so the tide drained."],
    why: "The draining came first and pulled the fish, so \"when\" fits. The \"so\" version reverses cause and result.",
  },
  {
    parts: ["A rectangle can be pushed into a lean.", "A triangle cannot."],
    correct: "A rectangle can be pushed into a lean, but a triangle cannot.",
    wrong: ["A rectangle can be pushed into a lean a triangle cannot.", "A rectangle can be pushed into a lean, a triangle cannot.", "A rectangle can be pushed into a lean because a triangle cannot."],
    why: "The two shapes behave in opposite ways, so \"but\" fits. One shape's strength is not the reason for the other's weakness.",
  },
  {
    parts: ["Theo moved his lunchbox to the top row.", "The next morning it was where he left it."],
    correct: "After Theo moved his lunchbox to the top row, it was where he left it the next morning.",
    wrong: ["Theo moved his lunchbox to the top row the next morning it was where he left it.", "Theo moved his lunchbox to the top row, the next morning it was where he left it.", "Theo moved his lunchbox to the top row because the next morning it was where he left it."],
    why: "The move came first, so \"after\" fits. The \"because\" version makes the next morning the reason for the move.",
  },
  {
    parts: ["The seams grab the air.", "The ball curves."],
    correct: "The seams grab the air, so the ball curves.",
    wrong: ["The seams grab the air the ball curves.", "The seams grab the air, the ball curves.", "The seams grab the air because the ball curves."],
    why: "The seams grabbing the air is the cause and the curve is the result, so \"so\" fits. The \"because\" version flips it.",
  },
];

const combineGen: Generator = (ctx) => {
  const { rng } = ctx;
  const item = pick(rng, COMBINE_ITEMS);
  const { options, answerIndex } = choiceOf(rng, item.correct, item.wrong);
  return {
    type: "choice",
    prompt: `Combine these sentences into one correct sentence.  ${item.parts.join("  ")}  Which choice does it correctly?`,
    options,
    answerIndex,
    explain: `${item.why} A run-on squashes two sentences together with nothing between them, and a comma by itself cannot join two sentences (that is a comma splice).`,
    hint: "Decide how the ideas are related: a reason (because), a contrast (but), a result (so), or a time (when). Then check for a comma with no joining word.",
  };
};

// ---------------------------------------------------------------------------
// wr.punctuation
// ---------------------------------------------------------------------------

type PunctFocus = "list" | "dialogue" | "apostrophe";

interface PunctItem {
  focus: PunctFocus;
  correct: string;
  wrong: readonly [string, string, string];
  why: string;
}

const PUNCT_RULE: Record<PunctFocus, string> = {
  list: "In a list of three or more, put a comma after each item except the last, including before \"and\" or \"or\". No comma goes before the first item.",
  dialogue: "Quotation marks wrap only the spoken words. The comma, question mark, or exclamation point that ends the speech goes inside the closing quotation mark, and a comma follows a tag such as \"Coach said\" before an opening quotation mark.",
  apostrophe: "An apostrophe shows owning (Biscuit's bed) or stands for missing letters in a contraction (did not = didn't). Plain plurals get no apostrophe, and \"its\" meaning \"belonging to it\" has none.",
};

const PUNCT_HINT: Record<PunctFocus, string> = {
  list: "Count the items. Each one except the last needs a comma right after it.",
  dialogue: "Which words were actually spoken? Only those go inside the quotation marks, and the comma stays inside too.",
  apostrophe: "Ask: does this word own something, or is it two words squeezed together? If neither, it gets no apostrophe.",
};

export const PUNCT_ITEMS: readonly PunctItem[] = [
  // commas in a list
  { focus: "list", correct: "Franklin started a library, a fire company, and a hospital.", wrong: ["Franklin started a library a fire company and a hospital.", "Franklin started a library, a fire company, and, a hospital.", "Franklin started, a library, a fire company and a hospital."], why: "Three things are listed: a library, a fire company, and a hospital." },
  { focus: "list", correct: "The octopus has eight arms, three hearts, and blue blood.", wrong: ["The octopus has eight arms three hearts and blue blood.", "The octopus has, eight arms, three hearts, and blue blood.", "The octopus has eight arms, three hearts and, blue blood."], why: "Three things are listed: eight arms, three hearts, and blue blood." },
  { focus: "list", correct: "Precipitation can be rain, snow, sleet, or hail.", wrong: ["Precipitation can be rain snow sleet or hail.", "Precipitation can be, rain, snow, sleet, or hail.", "Precipitation can be rain, snow, sleet, or, hail."], why: "Four kinds are listed, and the comma before \"or\" belongs there." },
  { focus: "list", correct: "Leo wrote down whether the shot went left, right, high, or low.", wrong: ["Leo wrote down whether the shot went left right high or low.", "Leo wrote down whether the shot went, left, right, high, or low.", "Leo wrote down whether the shot went left, right, high or, low."], why: "Four directions are listed; the commas go after left, right, and high." },
  { focus: "list", correct: "The lemonade stand needed lemons, sugar, and paper cups.", wrong: ["The lemonade stand needed lemons sugar and paper cups.", "The lemonade stand, needed lemons, sugar, and paper cups.", "The lemonade stand needed lemons, sugar, and, paper cups."], why: "Three supplies are listed: lemons, sugar, and paper cups." },
  { focus: "list", correct: "The river flows past farms, forests, and cities.", wrong: ["The river flows past farms forests and cities.", "The river flows past, farms, forests, and cities.", "The river flows past farms, forests and, cities."], why: "Three places are listed: farms, forests, and cities." },
  { focus: "list", correct: "Carver made peanut flour, peanut milk, and soap.", wrong: ["Carver made peanut flour peanut milk and soap.", "Carver made, peanut flour, peanut milk, and soap.", "Carver made peanut flour, peanut milk, and, soap."], why: "Three products are listed: peanut flour, peanut milk, and soap." },
  { focus: "list", correct: "The path climbed, dipped, and climbed again.", wrong: ["The path climbed dipped and climbed again.", "The path, climbed, dipped, and climbed again.", "The path climbed, dipped, and, climbed again."], why: "Three actions are listed; the subject \"The path\" is not part of the list." },
  // dialogue
  { focus: "dialogue", correct: "\"Look for clues,\" Dad said.", wrong: ["\"Look for clues\" Dad said.", "Look for clues, Dad said.", "\"Look for clues, Dad said.\""], why: "Only \"Look for clues\" was spoken, so only those words get quotation marks, with the comma inside." },
  { focus: "dialogue", correct: "Amara said, \"A good detective collects evidence first.\"", wrong: ["Amara said \"A good detective collects evidence first.\"", "Amara said, A good detective collects evidence first.", "Amara said, \"A good detective collects evidence first\"."], why: "A comma follows \"Amara said,\" and the period goes inside the closing quotation mark." },
  { focus: "dialogue", correct: "\"Where did it bend?\" Rosa asked.", wrong: ["\"Where did it bend\"? Rosa asked.", "\"Where did it bend?,\" Rosa asked.", "Where did it bend? Rosa asked."], why: "The question mark ends the spoken words and goes inside the quotation marks; no comma is added after it." },
  { focus: "dialogue", correct: "\"Fast is not the same as finished,\" Dash admitted.", wrong: ["\"Fast is not the same as finished\" Dash admitted.", "\"Fast is not the same as finished.\" Dash admitted.", "Fast is not the same as finished, Dash admitted."], why: "A comma, not a period, ends the speech when a tag like \"Dash admitted\" follows, and it goes inside the quotation marks." },
  { focus: "dialogue", correct: "Coach said, \"You're in.\"", wrong: ["Coach said \"You're in.\"", "Coach said, \"You're in\".", "Coach said, You're in."], why: "A comma follows the tag, the quotation marks wrap the spoken words, and the period goes inside." },
  { focus: "dialogue", correct: "\"Two blazes means a turn,\" Isaiah said. \"The top one points which way.\"", wrong: ["\"Two blazes means a turn, Isaiah said. The top one points which way.\"", "Two blazes means a turn, Isaiah said. The top one points which way.", "\"Two blazes means a turn\" Isaiah said. \"The top one points which way\"."], why: "Each spoken part gets its own quotation marks; \"Isaiah said\" is not spoken, so it stays outside." },
  { focus: "dialogue", correct: "\"I'm checking two sources too,\" said Priya's dad.", wrong: ["\"I'm checking two sources too\" said Priya's dad.", "\"I'm checking two sources too, said Priya's dad.\"", "I'm checking two sources too, said Priya's dad."], why: "The comma ends the speech inside the quotation marks, and the tag stays outside." },
  { focus: "dialogue", correct: "\"The fish are gone!\" the gull cried.", wrong: ["\"The fish are gone\"! the gull cried.", "\"The fish are gone!,\" the gull cried.", "The fish are gone! the gull cried."], why: "The exclamation point ends the speech and goes inside the quotation marks; no comma is added after it." },
  // apostrophes
  { focus: "apostrophe", correct: "Biscuit's bed was covered in mud from Owen's cleat.", wrong: ["Biscuits bed was covered in mud from Owens cleat.", "Biscuit's bed was covered in mud from Owens' cleat.", "Biscuits' bed was covered in mud from Owen's cleat."], why: "One dog, Biscuit, owns the bed, and one boy, Owen, owns the cleat, so each name gets 's." },
  { focus: "apostrophe", correct: "It's a long trip to Mexico, and the butterflies know the way.", wrong: ["Its a long trip to Mexico, and the butterflies know the way.", "It's a long trip to Mexico, and the butterflie's know the way.", "Its' a long trip to Mexico, and the butterflies know the way."], why: "\"It's\" means \"it is,\" so it needs the apostrophe. \"Butterflies\" is a plain plural, so it gets none." },
  { focus: "apostrophe", correct: "The moon reflects the sun's light.", wrong: ["The moon reflects the suns light.", "The moon reflect's the sun's light.", "The moon reflects the suns' light."], why: "The light belongs to one sun: sun's. The verb \"reflects\" never takes an apostrophe." },
  { focus: "apostrophe", correct: "The leader's turn ended, but the geese didn't stop honking.", wrong: ["The leaders turn ended, but the geese didnt stop honking.", "The leader's turn ended, but the geese did'nt stop honking.", "The leaders' turn ended, but the geese didn't stop honking."], why: "One leader owns the turn: leader's. \"Didn't\" is \"did not\" with the o missing, so the apostrophe goes where the o was." },
  { focus: "apostrophe", correct: "The two towers' shapes told sailors where they were.", wrong: ["The two tower's shapes told sailors where they were.", "The two towers shapes told sailors where they were.", "The two towers' shape's told sailors where they were."], why: "Two towers own the shapes, so the apostrophe goes after the plural s: towers'. \"Shapes\" is a plain plural." },
  { focus: "apostrophe", correct: "Grandpa's scorebook was in a box, and its cover had faded.", wrong: ["Grandpas scorebook was in a box, and it's cover had faded.", "Grandpa's scorebook was in a box, and it's cover had faded.", "Grandpas' scorebook was in a box, and its cover had faded."], why: "Grandpa owns the scorebook: Grandpa's. \"Its cover\" means the cover belonging to it, so no apostrophe." },
  { focus: "apostrophe", correct: "Hana couldn't see the defender, but he could see her eyes.", wrong: ["Hana could'nt see the defender, but he could see her eyes.", "Hana couldnt see the defender, but he could see her eye's.", "Hana couldn't see the defender, but he could see her eyes'."], why: "\"Couldn't\" is \"could not\" with the o missing. \"Eyes\" is a plain plural, so it gets no apostrophe." },
  { focus: "apostrophe", correct: "The pitcher's wrist snapped, and the ball's seams grabbed the air.", wrong: ["The pitchers wrist snapped, and the balls seams grabbed the air.", "The pitcher's wrist snapped, and the balls' seams grabbed the air.", "The pitchers' wrist snapped, and the ball's seam's grabbed the air."], why: "One pitcher owns the wrist and one ball owns the seams, so each gets 's. \"Seams\" is a plain plural." },
  { focus: "list", correct: "Jupiter has stripes, a giant red spot, and more than ninety moons.", wrong: ["Jupiter has stripes a giant red spot and more than ninety moons.", "Jupiter has, stripes, a giant red spot, and more than ninety moons.", "Jupiter has stripes, a giant red spot, and, more than ninety moons."], why: "Three things are listed: stripes, a giant red spot, and more than ninety moons." },
  { focus: "list", correct: "The scorebook used diamonds, letters, and numbers.", wrong: ["The scorebook used diamonds letters and numbers.", "The scorebook used, diamonds, letters, and numbers.", "The scorebook used diamonds, letters, and, numbers."], why: "Three kinds of marks are listed: diamonds, letters, and numbers." },
  { focus: "list", correct: "The water cycle has evaporation, condensation, and precipitation.", wrong: ["The water cycle has evaporation condensation and precipitation.", "The water cycle, has evaporation, condensation, and precipitation.", "The water cycle has evaporation, condensation and, precipitation."], why: "Three steps are listed; the comma goes after each step except the last." },
  { focus: "dialogue", correct: "\"Make a prediction,\" Ms. Alvarez said.", wrong: ["\"Make a prediction\" Ms. Alvarez said.", "Make a prediction, Ms. Alvarez said.", "\"Make a prediction, Ms. Alvarez said.\""], why: "Only \"Make a prediction\" was spoken, so the quotation marks close after the comma, before the tag." },
  { focus: "dialogue", correct: "Grandpa asked, \"How do you know?\"", wrong: ["Grandpa asked \"How do you know?\"", "Grandpa asked, \"How do you know\"?", "Grandpa asked, How do you know?"], why: "A comma follows the tag, and the question mark goes inside the closing quotation mark." },
  { focus: "dialogue", correct: "\"Case closed,\" Amara said.", wrong: ["\"Case closed\" Amara said.", "\"Case closed.\" Amara said.", "Case closed, Amara said."], why: "A comma, not a period, ends the speech when a tag follows, and it goes inside the quotation marks." },
  { focus: "apostrophe", correct: "The heron's patience paid off, and the gull's hurry did not.", wrong: ["The herons patience paid off, and the gulls hurry did not.", "The heron's patience paid off, and the gulls' hurry did not.", "The herons' patience paid off, and the gull's hurry did not."], why: "One heron owns the patience and one gull owns the hurry, so each gets 's before the s." },
  { focus: "apostrophe", correct: "Jupiter's day is short, and it's the biggest planet.", wrong: ["Jupiters day is short, and its the biggest planet.", "Jupiter's day is short, and its the biggest planet.", "Jupiters' day is short, and it's the biggest planet."], why: "Jupiter owns the day: Jupiter's. \"It's\" means \"it is,\" so it needs the apostrophe." },
  { focus: "apostrophe", correct: "Carver's wagon didn't stay in one town for long.", wrong: ["Carvers wagon didnt stay in one town for long.", "Carver's wagon did'nt stay in one town for long.", "Carvers' wagon didn't stay in one town for long."], why: "Carver owns the wagon: Carver's. \"Didn't\" is \"did not\" with the o missing, so the apostrophe goes where the o was." },
];

/** The sentence with its commas, quotation marks, and apostrophes removed, so the child punctuates it. */
function stripPunctuation(s: string): string {
  return s
    .replace(/[",“”]/g, "")
    .replace(/(\w)'(\w)/g, "$1$2")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const punctuationGen: Generator = (ctx) => {
  const { rng } = ctx;
  const item = pick(rng, PUNCT_ITEMS);
  const { options, answerIndex } = choiceOf(rng, item.correct, item.wrong);
  return {
    type: "choice",
    prompt: `Which version has the correct punctuation?  ${stripPunctuation(item.correct)}`,
    options,
    answerIndex,
    explain: `${item.why} ${PUNCT_RULE[item.focus]}`,
    hint: PUNCT_HINT[item.focus],
  };
};

// ---------------------------------------------------------------------------

export const generators: Record<string, Generator> = {
  "wr.sentence": sentenceGen,
  "wr.fragmentOrSentence": fragmentGen,
  "wr.combine": combineGen,
  "wr.punctuation": punctuationGen,
};
