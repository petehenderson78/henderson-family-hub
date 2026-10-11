/**
 * Parent-led "Together" cards and the evening scripts the Tonight runner
 * prints next to each block. No timer, no grading: the parent reads the
 * script, listens, and taps "Did it" (→ a learn_notes row, kind 'together').
 *
 * Pure data + helpers, relative imports only (Node-importable like the engine).
 */

import type { Skill, Subject } from "./types";

export interface TogetherCard {
  id: string;
  /** learner slug */
  track: "cole" | "lily";
  title: string;
  emoji: string;
  minutes: number;
  /** what the adult says, in order */
  script: string[];
  /** what a good answer sounds like */
  listenFor: string;
  subject: Subject;
  standards: string[];
}

export const TOGETHER_CARDS: TogetherCard[] = [
  // ---- Cole ---------------------------------------------------------------
  {
    id: "cole.number-talk.24",
    track: "cole",
    title: "Number talk: ways to make 24",
    emoji: "💬",
    minutes: 5,
    script: [
      "How many ways can you make 24 with multiplication? Say one.",
      "Good. Is there another one using a 1-digit times a 2-digit number?",
      "Which pair is easiest to remember, and why?",
    ],
    listenFor: "At least three pairs (1×24, 2×12, 3×8, 4×6) and a turn-around fact (6×4 = 4×6). Listen for 'because' when he explains.",
    subject: "math",
    standards: ["3.OA.B.5", "3.OA.C.7"],
  },
  {
    id: "cole.estimate.baseballs",
    track: "cole",
    title: "Estimation: baseballs in the car",
    emoji: "⚾",
    minutes: 5,
    script: [
      "How many baseballs would fit in our car? Don't count — give a too-low guess, a too-high guess, then your real guess.",
      "What did you use to decide? (A box of balls? A seat?)",
      "If a milk crate holds about 50 balls, how many crates fit in the car?",
    ],
    listenFor: "A reasonable range, a unit he chose (crate, seat, bag), and multiplying that unit instead of guessing wildly.",
    subject: "math",
    standards: ["4.OA.A.3", "MP.2"],
  },
  {
    id: "cole.wodb.numbers",
    track: "cole",
    title: "Which one doesn't belong? 9 · 16 · 25 · 43",
    emoji: "🔎",
    minutes: 5,
    script: [
      "Four numbers: 9, 16, 25, 43. Pick one that doesn't belong and tell me why.",
      "Now pick a different one. Every number can be the odd one out — find a reason for each.",
      "Make your own set of four for me.",
    ],
    listenFor: "A math reason for each choice (43 isn't a square; 16 is the only even; 9 is the only 1-digit; 25 ends in 5). Any correct reason counts.",
    subject: "reasoning",
    standards: ["MP.3", "MP.7"],
  },
  {
    id: "cole.wodb.shapes",
    track: "cole",
    title: "Which one doesn't belong? Shapes",
    emoji: "🔷",
    minutes: 5,
    script: [
      "Draw four shapes on scrap paper: a square, a rectangle, a rhombus, and a triangle.",
      "Which one doesn't belong? Why? Now find a reason for a different one.",
      "Which two are the most alike? What makes them a pair?",
    ],
    listenFor: "Attribute words: sides, corners, equal, parallel, right angle. Push for 'all four sides equal' instead of 'it looks like a diamond'.",
    subject: "reasoning",
    standards: ["3.G.A.1", "MP.3"],
  },

  // ---- Lily ----------------------------------------------------------------
  {
    id: "lily.dictation.decodable",
    track: "lily",
    title: "Dictation: one decodable sentence",
    emoji: "✏️",
    minutes: 5,
    script: [
      "I'll say a sentence. Say it back to me first: 'The cat sat on a big mat.'",
      "Now write it. Tap out each word's sounds on your fingers before you write it.",
      "Read it back to me with your finger under each word. Capital at the start, period at the end?",
    ],
    listenFor: "Every sound represented (c-a-t, s-a-t, b-i-g, m-a-t), spaces between words, a capital T and a period. Spelling 'the' from memory is fine.",
    subject: "phonics",
    standards: ["L.1.2.B", "RF.1.3.B"],
  },
  {
    id: "lily.counting-walk.tens",
    track: "lily",
    title: "Counting walk: by 10s from 37",
    emoji: "🚶",
    minutes: 5,
    script: [
      "Let's walk and count. Start at 37 and count by tens: 37, 47 … one step per number.",
      "Stop at 97. What comes next? (107!) Keep going to 127.",
      "Now backwards by tens from 92.",
    ],
    listenFor: "The ones digit stays the same (7, 7, 7) while the tens go up; no stumble crossing 100. If she says '100' after 97, count the ten together: 97, 98, 99, 100 … 107.",
    subject: "math",
    standards: ["1.NBT.A.1", "1.NBT.C.5"],
  },
  {
    id: "lily.ten-frame.flash",
    track: "lily",
    title: "Ten-frame flash",
    emoji: "⚡",
    minutes: 5,
    script: [
      "Draw a ten frame (two rows of five). I'll put dots in and cover it fast — you say how many without counting.",
      "Show 7. How did you see it? (Five and two? Ten take away three?)",
      "Now I'll show a number and you tell me how many more to make 10.",
    ],
    listenFor: "Subitizing in chunks ('five and three') instead of counting one by one, and quick 'how many more to ten' answers.",
    subject: "math",
    standards: ["K.OA.A.4", "1.OA.C.6"],
  },
  {
    id: "lily.which-is-more",
    track: "lily",
    title: "Which is more?",
    emoji: "⚖️",
    minutes: 5,
    script: [
      "Two numbers: 46 and 64. Which is more? How do you know?",
      "Now 58 and 53. Same tens — so what do we look at?",
      "Give me a number that's more than 70 but less than 75.",
    ],
    listenFor: "Comparing the tens first, then the ones; the words 'more', 'less', 'tens', 'ones'. Have her point to the digit she's comparing.",
    subject: "math",
    standards: ["1.NBT.B.3"],
  },
];

export function togetherCardsFor(slug: string): TogetherCard[] {
  return TOGETHER_CARDS.filter((c) => c.track === slug);
}

export function togetherCardById(id: string): TogetherCard | undefined {
  return TOGETHER_CARDS.find((c) => c.id === id);
}

/** Today's pick for a learner: rotates daily by date so the same card shows all evening. */
export function togetherCardOfDay(slug: string, dateStr: string, offset = 0): TogetherCard | null {
  const cards = togetherCardsFor(slug);
  if (cards.length === 0) return null;
  const dayNum = Math.floor(Date.parse(`${dateStr}T00:00:00Z`) / 86400000) || 0;
  const idx = (((dayNum + offset) % cards.length) + cards.length) % cards.length;
  return cards[idx];
}

// ---------------------------------------------------------------------------
// Evening scripts: "Say this / If stuck / If flying" per block
// ---------------------------------------------------------------------------

export interface BlockScript {
  sayThis: string;
  ifStuck: string;
  ifFlying: string;
}

const GENERIC_STUCK: Record<Subject, string> = {
  math: "Do one together: you say each step out loud, then ask 'what does that number count?' Then one more alone. Stop at the timer — fewer items, never more.",
  reading: "Read the first sentence to them, then they read the next one. Find the one word that blocks the meaning and decode it together.",
  phonics: "Tap the sounds on your fingers together, then blend. Three misses in a row? Switch to tiles: build the word, then read it.",
  writing: "Say the sentence out loud first, count the words on fingers, then write. One sentence done well beats three rushed.",
  reasoning: "Say the rule you see ('across it turns, down it grows'). Check the rule on every row before picking. One puzzle is enough.",
};

const GENERIC_FLYING: Record<Subject, string> = {
  math: "Ask 'how do you know?' and have them explain the same answer a second way. No extra pages — explanation is the stretch.",
  reading: "Ask for the evidence: 'which sentence tells you that?' Then one inference question the passage does not say outright.",
  phonics: "Make it a nonsense word with the same pattern and have them read it. Then they write a sentence using two of the words.",
  writing: "Add one detail that answers 'why?' Then reread it aloud and fix one thing on their own.",
  reasoning: "Have them make up the next puzzle for you to solve, and explain the rule before you answer.",
};

/** Script lines for a block. Uses skill-level lines when the catalog provides them, else per-subject defaults. */
export function blockScript(skill: Skill): BlockScript {
  const extra = skill as Skill & { ifStuck?: string; ifFlying?: string };
  return {
    sayThis: skill.parentTip,
    ifStuck: extra.ifStuck ?? GENERIC_STUCK[skill.subject],
    ifFlying: extra.ifFlying ?? GENERIC_FLYING[skill.subject],
  };
}

/** What the other child does on their own while the adult is busy ("Meanwhile"). */
export function meanwhileText(name: string, skill: Skill | undefined, kidTitle?: string): string {
  const title = kidTitle ?? skill?.kidTitle ?? "their next block";
  switch (skill?.subject) {
    case "math":
      return `${name}: ${title} practice on the iPad (independent items — answer key stays closed).`;
    case "reading":
      return `${name}: reads the passage and writes answer 1 on their own.`;
    case "phonics":
      return `${name}: taps the word tiles on the iPad and reads each word aloud.`;
    case "writing":
      return `${name}: drafts the writing prompt alone — one sentence at a time.`;
    case "reasoning":
      return `${name}: ${title} puzzles on the iPad — pick the rule first, then answer.`;
    default:
      return `${name}: reads a familiar book quietly until it's their turn.`;
  }
}
