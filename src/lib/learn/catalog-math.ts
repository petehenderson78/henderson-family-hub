/**
 * MATH skill catalog (NJSLS-M 2023), both tracks:
 *   - Lily (track "lily"): grades 1-2 — ./catalog-math-lily.ts
 *   - Cole (track "cole"): grade 3 review/gate layer (no prereqs, reviewOnly),
 *     grade 4 (full year) and grade 5 — ./catalog-math-cole.ts
 *
 * Generators live in ./generators/math-early.ts, math-upper.ts,
 * math-upper-frac.ts and math-upper-geo.ts. Prereqs always come earlier in
 * the array; ./catalog.ts spreads MATH_SKILLS into CATALOG.
 */

import type { Skill } from "./types";
import { LILY_MATH_SKILLS } from "./catalog-math-lily";
import { COLE_MATH_SKILLS } from "./catalog-math-cole";

export const MATH_SKILLS: Skill[] = [...LILY_MATH_SKILLS, ...COLE_MATH_SKILLS];
