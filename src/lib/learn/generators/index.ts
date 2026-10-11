/**
 * Generator registry.
 *
 * HOW TO REGISTER (content agents): create a file in this folder exporting
 * `const generators: Record<string, Generator>` and spread it into the record
 * below. Ids must be unique across files; `skill.generator` in the catalog
 * refers to these ids. Keep every generator pure (ctx.rng only), with
 * relative imports and `import type`, so `npm run selfcheck` can run them in
 * plain Node.
 *
 * Files: math-early (grades 1-2), math-upper / math-upper-frac /
 * math-upper-geo (grades 3-5), reasoning, reading, writing, phonics (Lily).
 */

import type { Generator, Question, Skill } from "../types";
import { mulberry32 } from "../rng";
import { generators as mathEarly } from "./math-early";
import { generators as mathUpper } from "./math-upper";
import { generators as mathUpperFrac } from "./math-upper-frac";
import { generators as mathUpperGeo } from "./math-upper-geo";
import { generators as reasoning } from "./reasoning";
import { generators as reading } from "./reading";
import { generators as writing } from "./writing";
import { generators as phonics } from "./phonics";

export const generators: Record<string, Generator> = {
  ...mathEarly,
  ...mathUpper,
  ...mathUpperFrac,
  ...mathUpperGeo,
  ...reasoning,
  ...reading,
  ...writing,
  ...phonics,
};

export function getGenerator(id: string): Generator | undefined {
  return generators[id];
}

export function listGeneratorIds(): string[] {
  return Object.keys(generators);
}

/**
 * Build a question for a skill from a numeric seed (see rng.questionSeed).
 * `level` overrides skill.params.level (reasoning generators read ctx.level).
 */
export function makeQuestion(skill: Skill, seed: number, level?: number): Question {
  const gen = generators[skill.generator];
  if (!gen) {
    throw new Error(`Unknown generator "${skill.generator}" for skill "${skill.id}"`);
  }
  const paramLevel = typeof skill.params?.level === "number" ? (skill.params.level as number) : undefined;
  return gen({ rng: mulberry32(seed), level: level ?? paramLevel, params: skill.params });
}
