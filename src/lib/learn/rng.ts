/**
 * Seeded randomness for deterministic, reproducible questions.
 * Pure — no DOM, no imports.
 */

/** mulberry32: tiny, fast 32-bit PRNG. Returns a function producing [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a style string hash → unsigned 32-bit int. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Inclusive integer in [min, max]. */
export function int(rng: () => number, min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** One element of a non-empty array. */
export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(rng: () => number, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** n distinct elements (fewer if the array is shorter). */
export function sample<T>(rng: () => number, arr: readonly T[], n: number): T[] {
  return shuffle(rng, arr).slice(0, Math.max(0, Math.min(n, arr.length)));
}

/**
 * Seed for a question: hash32(slug | skillId | mode | localDate | n).
 * `n` is a per-play counter the player keeps in component state + sessionStorage
 * (key `learn:n:<slug>:<skillId>:<date>`), NEVER derived from DB row counts, so a
 * retried write or a lost network round-trip can never replay an item. The seed
 * is stored on the attempt row so the report can rebuild the exact question.
 */
export function questionSeed(learnerSlug: string, skillId: string, mode: string, localDate: string, n: number): number {
  return hashString(`${learnerSlug}|${skillId}|${mode}|${localDate}|${n}`);
}

/** sessionStorage key for the per-play counter behind questionSeed. */
export function questionCounterKey(learnerSlug: string, skillId: string, localDate: string): string {
  return `learn:n:${learnerSlug}:${skillId}:${localDate}`;
}
