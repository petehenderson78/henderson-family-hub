/**
 * Afternoon workshops — Alpha-style life-skills menu. Three are featured each
 * week (rotated by ISO week number); all stay available. Marking one done
 * awards `xp` via learn_rewards (reason "workshop:<id>").
 *
 * Content agents: enrich or replace entries; keep the `Workshop` shape.
 */

import type { Workshop } from "./types";
import { XP } from "./mastery";

export const WORKSHOPS: Workshop[] = [
  {
    id: "kitchen-chemist",
    title: "Kitchen Chemist",
    emoji: "🧪",
    minutes: 25,
    blurb: "Fizz, foam, and find out why. A real experiment with stuff from the pantry.",
    steps: [
      "Put 2 spoons of baking soda in a cup. Guess what will happen when vinegar hits it.",
      "Pour in vinegar slowly. Watch, then describe what you see in one sentence.",
      "Try again with warm vinegar vs. cold. Which fizzes more?",
      "Draw what happened and write the 'why' (a gas called carbon dioxide).",
    ],
    xp: XP.workshop,
  },
  {
    id: "lemonade-math",
    title: "Lemonade Stand Math",
    emoji: "🍋",
    minutes: 30,
    blurb: "Plan a stand: cost, price, and profit. Then make change like a pro.",
    steps: [
      "List what you need (lemons, sugar, cups) and guess the cost of each.",
      "Pick a price per cup. How many cups to earn back the cost?",
      "Make a sign with the price in big letters.",
      "Practice making change for $5 and $10 with real coins and bills.",
    ],
    xp: XP.workshop,
  },
  {
    id: "backyard-scientist",
    title: "Backyard Scientist",
    emoji: "🔍",
    minutes: 20,
    blurb: "Go outside, pick one small thing, and observe it like a naturalist.",
    steps: [
      "Choose one living thing (a bug, a leaf, a bird) and watch it for 3 minutes.",
      "Draw it with labels: at least 3 parts.",
      "Write 2 questions you have about it.",
      "Ask a grown-up or look one up together.",
    ],
    xp: XP.workshop,
  },
  {
    id: "bridge-builder",
    title: "Bridge Builder",
    emoji: "🌉",
    minutes: 30,
    blurb: "Build a bridge from paper or craft sticks that holds as many coins as possible.",
    steps: [
      "Set two books 6 inches apart. That's the gap to cross.",
      "Build a bridge with paper, tape, or craft sticks. Try a triangle shape for strength.",
      "Load coins one at a time until it bends. Count them.",
      "Change one thing and rebuild. Did it hold more?",
    ],
    xp: XP.workshop,
  },
  {
    id: "story-studio",
    title: "Story Studio",
    emoji: "🎬",
    minutes: 25,
    blurb: "Make up a one-minute story with a beginning, a problem, and a fix. Then perform it.",
    steps: [
      "Pick a hero, a place, and a problem (roll dice or draw cards for fun).",
      "Plan 3 pictures: start, problem, ending.",
      "Tell the story out loud in under a minute.",
      "Perform it for someone (voices and props encouraged).",
    ],
    xp: XP.workshop,
  },
  {
    id: "map-maker",
    title: "Map Maker",
    emoji: "🗺️",
    minutes: 20,
    blurb: "Draw a map of the house or the block with a legend and a compass rose.",
    steps: [
      "Walk the space once and count your steps between landmarks.",
      "Draw the map with at least 5 landmarks.",
      "Add a legend with symbols and a compass rose (N, S, E, W).",
      "Hide a 'treasure' and mark it with an X for someone to find.",
    ],
    xp: XP.workshop,
  },
  {
    id: "chefs-helper",
    title: "Chef's Helper",
    emoji: "🍳",
    minutes: 30,
    blurb: "Follow a simple recipe, measure everything, and double one ingredient on purpose.",
    steps: [
      "Read the whole recipe first and gather every ingredient.",
      "Measure each ingredient yourself (cups, spoons, counting).",
      "Say what would change if you doubled the recipe.",
      "Clean up your station before you taste.",
    ],
    xp: XP.workshop,
  },
  {
    id: "tidy-titan",
    title: "Tidy Titan",
    emoji: "🧹",
    minutes: 20,
    blurb: "Pick one messy spot and turn it into a sorted, labeled system.",
    steps: [
      "Choose one drawer, shelf, or bin.",
      "Take everything out and sort into groups (keep, give away, trash).",
      "Put the keep pile back in groups and label each group.",
      "Take a before/after photo and show someone.",
    ],
    xp: XP.workshop,
  },
];

export function workshopById(id: string): Workshop | undefined {
  return WORKSHOPS.find((w) => w.id === id);
}

/** Three featured workshops for the week (rotates weekly). */
export function featuredWorkshops(isoWeek: number, count = 3): Workshop[] {
  if (WORKSHOPS.length === 0) return [];
  const start = (isoWeek * count) % WORKSHOPS.length;
  return Array.from({ length: Math.min(count, WORKSHOPS.length) }, (_, i) => WORKSHOPS[(start + i) % WORKSHOPS.length]);
}
