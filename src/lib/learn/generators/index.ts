/**
 * Generator registry.
 *
 * HOW TO REGISTER (content agents): create a file in this folder exporting
 * `const generators: Record<string, Generator>` and spread it into the record
 * below. Ids must be unique across files; `skill.generator` in the catalog
 * refers to these ids. Keep every generator pure (ctx.rng only), with
 * relative imports and `import type`, so `npm run selfcheck` can run them in
 * plain Node.
 */

import type { Generator, Question, Skill } from "../types";
import { mulberry32 } from "../rng";
import { generators as starter } from "./starter";

export const generators: Record<string, Generator> = {
  ...starter,
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
