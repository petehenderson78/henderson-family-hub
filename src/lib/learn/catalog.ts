/**
 * Skill catalog.
 *
 * HOW TO EXTEND (content agents): append `Skill` objects to CATALOG below (or
 * split into per-subject arrays and spread them in). Keep the shape exactly as
 * `Skill` in ./types. Every `generator` id must exist in
 * ./generators/index.ts (`generators` record). Order the array so prereqs come
 * before dependents — the mission planner uses array order to break grade ties
 * and the map renders in array order.
 *
 * Tracks: "cole" | "lily" | "both". `catalogFor(slug)` returns the learner's
 * tree; for "both" skills it injects `params.level` (1 for Lily, 3 for Cole)
 * unless the skill already sets one, so reasoning generators can scale.
 */

import type { Skill, Subject } from "./types";

export const TRACK_LEVEL: Record<string, number> = { lily: 1, cole: 3 };

export const SUBJECT_LABEL: Record<Subject, string> = {
  math: "Math",
  reading: "Reading",
  phonics: "Phonics",
  reasoning: "Brain",
  writing: "Writing",
};

export const SUBJECT_EMOJI: Record<Subject, string> = {
  math: "🧮",
  reading: "📖",
  phonics: "🔤",
  reasoning: "🧠",
  writing: "✏️",
};

export const SUBJECT_ORDER: readonly Subject[] = ["math", "phonics", "reading", "writing", "reasoning"];

export const CATALOG: Skill[] = [
  // ---- Lily: grade 1 math -------------------------------------------------
  {
    id: "m1.count.next",
    subject: "math",
    grade: 1,
    title: "Counting on to 120 (what comes next)",
    kidTitle: "Number Train",
    standards: ["1.NBT.A.1"],
    prereqs: [],
    generator: "countNext",
    params: { max: 120 },
    estMinutes: 10,
    testOut: true,
    parentTip: "Have her say the three numbers out loud, then keep going. Point at the tens when she crosses 29→30, 39→40.",
    track: "lily",
  },
  {
    id: "m1.add.within10",
    subject: "math",
    grade: 1,
    title: "Addition within 10 (ten frame)",
    kidTitle: "Ten-Frame Adder",
    standards: ["1.OA.C.6", "K.OA.A.5"],
    prereqs: ["m1.count.next"],
    generator: "addWithin10",
    params: { max: 10 },
    estMinutes: 12,
    testOut: true,
    parentTip: "Say 'start at the bigger number and count on'. Use fingers or the dots in the frame.",
    track: "lily",
  },

  // ---- Cole: multiplication chain -----------------------------------------
  {
    id: "m4.mult.facts",
    subject: "math",
    grade: 3,
    title: "Multiplication facts 0–12",
    kidTitle: "Times-Table Blaster",
    standards: ["3.OA.C.7"],
    prereqs: [],
    generator: "multFacts",
    params: { min: 0, max: 12 },
    estMinutes: 10,
    testOut: true,
    parentTip: "Aim for 3-second recall. For stuck facts, use the turn-around fact (7×8 = 8×7) or build from a known one (7×8 = 7×7 + 7).",
    track: "cole",
  },
  {
    id: "m4.mult.2x1",
    subject: "math",
    grade: 4,
    title: "Multiply 2-digit by 1-digit",
    kidTitle: "Big Number Multiplier",
    standards: ["4.NBT.B.5"],
    prereqs: ["m4.mult.facts"],
    generator: "mult2x1",
    estMinutes: 12,
    testOut: true,
    parentTip: "Have him split the 2-digit number into tens and ones (23 × 4 = 20×4 + 3×4) and say both partial products before adding.",
    track: "cole",
  },

  // ---- Both: reasoning (level is injected per track) ----------------------
  {
    id: "r.number.series",
    subject: "reasoning",
    grade: 1,
    title: "Number series (what comes next)",
    kidTitle: "Pattern Detective",
    standards: ["MP.7", "MP.8"],
    prereqs: [],
    generator: "numberSeries",
    estMinutes: 6,
    testOut: false,
    parentTip: "Ask 'what changed from this number to the next one?' Have them check the rule on every step before choosing.",
    track: "both",
  },
  {
    id: "r.figure.matrix",
    subject: "reasoning",
    grade: 1,
    title: "Figure matrix (2×2 picture rules)",
    kidTitle: "Shape Puzzle",
    standards: ["MP.7"],
    prereqs: [],
    generator: "figureMatrix",
    estMinutes: 6,
    testOut: false,
    parentTip: "Say the rule out loud: 'Across, it turns. Down, it changes shape.' Then do the same to the bottom-left picture.",
    track: "both",
  },
];

/** The learner's tree (track === slug or "both"), with reasoning level injected for shared skills. */
export function catalogFor(slug: string): Skill[] {
  const level = TRACK_LEVEL[slug] ?? 3;
  return CATALOG.filter((s) => s.track === slug || s.track === "both").map((s) => {
    if (s.track !== "both" || (s.params && typeof s.params.level === "number")) return s;
    return { ...s, params: { ...(s.params ?? {}), level } };
  });
}

export function skillById(id: string): Skill | undefined {
  return CATALOG.find((s) => s.id === id);
}

/** Group a catalog by subject in display order. */
export function groupBySubject(catalog: Skill[]): { subject: Subject; skills: Skill[] }[] {
  return SUBJECT_ORDER.map((subject) => ({ subject, skills: catalog.filter((s) => s.subject === subject) })).filter(
    (g) => g.skills.length > 0
  );
}
