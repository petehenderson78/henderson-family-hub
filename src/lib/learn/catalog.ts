/**
 * Skill catalog.
 *
 * HOW TO EXTEND (content agents): add `Skill` objects to a per-subject array
 * (catalog-math.ts, catalog-reading-cole.ts, catalog-reasoning.ts, …) and
 * spread it into CATALOG below. Keep the shape exactly as `Skill` in ./types. Every `generator` id must exist in
 * ./generators/index.ts (`generators` record). Order the array so prereqs come
 * before dependents — the mission planner uses array order to break grade ties
 * and the map renders in array order.
 *
 * Tracks: "cole" | "lily" | "both". `catalogFor(slug)` returns the learner's
 * tree; for "both" skills it injects `params.level` (1 for Lily, 3 for Cole)
 * unless the skill already sets one, so reasoning generators can scale.
 */

import type { Skill, Subject } from "./types";
import { MATH_SKILLS } from "./catalog-math";
import { COLE_READING_SKILLS } from "./catalog-reading-cole";
import { LILY_READING_SKILLS } from "./catalog-reading-lily";
import { REASONING_SKILLS } from "./catalog-reasoning";

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
  // Math (grades 1-2 Lily; grades 3-5 Cole) — ./catalog-math.ts
  ...MATH_SKILLS,
  // Reading / writing (Cole) — ./catalog-reading-cole.ts
  ...COLE_READING_SKILLS,
  // Phonics, sight words and decodable reading (Lily) — ./catalog-reading-lily.ts
  ...LILY_READING_SKILLS,
  // Reasoning ("Brain"), per-learner levels — ./catalog-reasoning.ts
  ...REASONING_SKILLS,
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
