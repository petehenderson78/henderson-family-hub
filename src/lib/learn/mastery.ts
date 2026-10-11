/**
 * Mastery engine — pure functions, unit-testable, no DOM, relative imports only.
 *
 * THE MASTERY RULE
 *   A skill is "mastered" when
 *     attempts >= 8  AND  accuracy over the last 10 answers >= 0.9  AND  current streak >= 3.
 *   On mastery: intervalDays = 1 and the first spaced review is due tomorrow.
 *
 * SPACED REVIEW
 *   Review intervals climb through [1, 3, 7, 14, 30, 60] days.
 *   A correct answer in a *due* review advances to the next interval (only once per
 *   due date, so a 10-question review block does not jump several steps).
 *   A review miss halves the interval (min 1 day).
 *   Two consecutive review misses demote the skill back to "learning".
 *
 * TEST-OUT (compacting)
 *   A 5-item pretest. 5/5 → mastered with intervalDays = 3.
 *
 * XP
 *   10 base per correct answer, +5 at streak >= 3, +10 at streak >= 5 (so 15 / 20).
 *   Mastery bonus 100, review block completion 20, workshop 50.
 */

import type {
  BlockKind,
  LearnerSettings,
  Mission,
  MissionBlock,
  PracticeMode,
  ProgressMap,
  Skill,
  SkillProgress,
  SkillStatus,
  Subject,
} from "./types";
import { addDays } from "./dates";

export const WINDOW_SIZE = 10;
export const MASTERY_MIN_ATTEMPTS = 8;
export const MASTERY_ACCURACY = 0.9;
export const MASTERY_MIN_STREAK = 3;
export const REVIEW_INTERVALS: readonly number[] = [1, 3, 7, 14, 30, 60];
export const TEST_OUT_ITEMS = 5;
export const TEST_OUT_INTERVAL_DAYS = 3;

export const XP = {
  base: 10,
  streak3Bonus: 5,
  streak5Bonus: 10,
  mastery: 100,
  reviewComplete: 20,
  workshop: 50,
} as const;

export const LEVEL_NAMES: readonly string[] = [
  "Rookie",
  "Explorer",
  "Builder",
  "Navigator",
  "Captain",
  "Legend",
  "Champion",
  "Wizard",
  "Titan",
  "Galaxy Brain",
];

// ---------------------------------------------------------------------------
// Progress primitives
// ---------------------------------------------------------------------------

export function emptyProgress(skillId: string): SkillProgress {
  return {
    skillId,
    status: "ready",
    attempts: 0,
    correct: 0,
    streak: 0,
    window: [],
    intervalDays: 0,
    nextReviewAt: null,
    lastPracticedAt: null,
    masteredAt: null,
  };
}

/** Accuracy over the stored window (0 when empty). */
export function windowAccuracy(window: boolean[]): number {
  if (window.length === 0) return 0;
  return window.filter(Boolean).length / window.length;
}

export function meetsMastery(p: SkillProgress): boolean {
  return (
    p.attempts >= MASTERY_MIN_ATTEMPTS &&
    windowAccuracy(p.window) >= MASTERY_ACCURACY &&
    p.streak >= MASTERY_MIN_STREAK
  );
}

/** Next review interval after a successful review (caps at the last value). */
export function nextReviewInterval(current: number): number {
  for (const n of REVIEW_INTERVALS) {
    if (n > current) return n;
  }
  return REVIEW_INTERVALS[REVIEW_INTERVALS.length - 1];
}

export function isReviewDue(p: SkillProgress | undefined, now: Date): boolean {
  if (!p || p.status !== "mastered") return false;
  if (!p.nextReviewAt) return true;
  return new Date(p.nextReviewAt).getTime() <= now.getTime();
}

/**
 * Apply one answered question.
 * - learn/test mode: counts, window, streak; promotes ready→learning; checks the mastery rule.
 * - review mode on a mastered skill: adjusts the spaced-review interval (see header comment).
 */
export function applyResult(
  p: SkillProgress,
  correct: boolean,
  now: Date,
  mode: PracticeMode = "learn"
): SkillProgress {
  const nowIso = now.toISOString();
  const window = [...p.window, correct].slice(-WINDOW_SIZE);
  const next: SkillProgress = {
    ...p,
    attempts: p.attempts + 1,
    correct: p.correct + (correct ? 1 : 0),
    streak: correct ? p.streak + 1 : 0,
    window,
    lastPracticedAt: nowIso,
  };

  if (mode === "review" && p.status === "mastered") {
    if (correct) {
      // Advance only when this review was actually due (once per due date).
      const wasDue = !p.nextReviewAt || new Date(p.nextReviewAt).getTime() <= now.getTime();
      if (wasDue) {
        next.intervalDays = nextReviewInterval(p.intervalDays);
        next.nextReviewAt = addDays(now, next.intervalDays).toISOString();
      }
    } else {
      const previousWasMiss = p.window.length > 0 && p.window[p.window.length - 1] === false;
      if (previousWasMiss) {
        // Two consecutive review misses → back to learning.
        next.status = "learning";
        next.intervalDays = 0;
        next.nextReviewAt = null;
        next.masteredAt = null;
      } else {
        next.intervalDays = Math.max(1, Math.floor(p.intervalDays / 2));
        next.nextReviewAt = addDays(now, next.intervalDays).toISOString();
      }
    }
    return next;
  }

  if (p.status !== "mastered") {
    next.status = "learning";
    if (meetsMastery(next)) {
      next.status = "mastered";
      next.masteredAt = nowIso;
      next.intervalDays = 1;
      next.nextReviewAt = addDays(now, 1).toISOString();
    }
  }
  return next;
}

/** 5/5 on the pretest compacts the skill. */
export function testOut(results: boolean[]): boolean {
  return results.length >= TEST_OUT_ITEMS && results.slice(0, TEST_OUT_ITEMS).every(Boolean);
}

/** Fold a completed pretest into progress: pass → mastered (interval 3d); fail → counts as practice. */
export function applyTestOut(p: SkillProgress, results: boolean[], now: Date): SkillProgress {
  if (testOut(results)) {
    const nowIso = now.toISOString();
    return {
      ...p,
      status: "mastered",
      attempts: p.attempts + results.length,
      correct: p.correct + results.filter(Boolean).length,
      streak: p.streak + results.length,
      window: [...p.window, ...results].slice(-WINDOW_SIZE),
      intervalDays: TEST_OUT_INTERVAL_DAYS,
      nextReviewAt: addDays(now, TEST_OUT_INTERVAL_DAYS).toISOString(),
      lastPracticedAt: nowIso,
      masteredAt: nowIso,
    };
  }
  return results.reduce((acc, r) => applyResult(acc, r, now, "learn"), p);
}

// ---------------------------------------------------------------------------
// Catalog-level derivations
// ---------------------------------------------------------------------------

/**
 * Unlock skills whose prereqs are all mastered (or that have no prereqs) → "ready";
 * otherwise "locked". Skills already learning/mastered are left alone.
 * A prereq that is not in the given catalog is treated as satisfied.
 */
export function deriveStatuses(catalog: Skill[], progressMap: ProgressMap): ProgressMap {
  const ids = new Set(catalog.map((s) => s.id));
  const out: ProgressMap = {};
  for (const skill of catalog) {
    const p = progressMap[skill.id] ?? emptyProgress(skill.id);
    if (p.status === "learning" || p.status === "mastered") {
      out[skill.id] = p;
      continue;
    }
    const unlocked = skill.prereqs.every((pre) => {
      if (!ids.has(pre)) return true;
      return progressMap[pre]?.status === "mastered";
    });
    const status: SkillStatus = unlocked ? "ready" : "locked";
    out[skill.id] = p.status === status ? p : { ...p, status };
  }
  return out;
}

/** Fill missing skills with emptyProgress and derive locked/ready statuses. */
export function mergeProgress(catalog: Skill[], rows: SkillProgress[]): ProgressMap {
  const map: ProgressMap = {};
  for (const row of rows) map[row.skillId] = row;
  for (const skill of catalog) {
    if (!map[skill.id]) map[skill.id] = emptyProgress(skill.id);
  }
  return deriveStatuses(catalog, map);
}

// ---------------------------------------------------------------------------
// Mission planning
// ---------------------------------------------------------------------------

export const BLOCK_ORDER: readonly BlockKind[] = ["math", "reading", "brain"];

export const BLOCK_SUBJECTS: Record<BlockKind, Subject[]> = {
  math: ["math"],
  reading: ["reading", "phonics", "writing"],
  brain: ["reasoning"],
};

export const BLOCK_LABEL: Record<BlockKind, string> = {
  math: "Math",
  reading: "Reading",
  brain: "Brain",
};

export const BLOCK_EMOJI: Record<BlockKind, string> = {
  math: "🧮",
  reading: "📖",
  brain: "🧠",
};

/** Weekly writing day (0 = Sunday … 5 = Friday) for Cole's reading block. */
export const WRITING_WEEKDAY = 5;

function byGrade(a: Skill, b: Skill): number {
  return a.grade - b.grade;
}

function byNextReview(statuses: ProgressMap) {
  return (a: Skill, b: Skill) => {
    const ta = statuses[a.id]?.nextReviewAt ? new Date(statuses[a.id].nextReviewAt as string).getTime() : 0;
    const tb = statuses[b.id]?.nextReviewAt ? new Date(statuses[b.id].nextReviewAt as string).getTime() : 0;
    return ta - tb;
  };
}

interface Choice {
  skill: Skill;
  mode: PracticeMode;
  offerTestOut?: boolean;
}

/** Due reviews first, then lowest-grade "learning", then lowest-grade "ready", then a bonus review. */
export function chooseSkillForBlock(pool: Skill[], statuses: ProgressMap, now: Date): Choice | null {
  if (pool.length === 0) return null;
  const due = pool.filter((s) => isReviewDue(statuses[s.id], now)).sort(byNextReview(statuses));
  if (due.length) return { skill: due[0], mode: "review" };

  const learning = pool.filter((s) => statuses[s.id]?.status === "learning").sort(byGrade);
  if (learning.length) return { skill: learning[0], mode: "learn" };

  const ready = pool.filter((s) => statuses[s.id]?.status === "ready").sort(byGrade);
  if (ready.length) return { skill: ready[0], mode: "learn", offerTestOut: ready[0].testOut };

  const mastered = pool.filter((s) => statuses[s.id]?.status === "mastered").sort(byNextReview(statuses));
  if (mastered.length) return { skill: mastered[0], mode: "review" };

  // Only locked skills left (catalog oddity) — practice the lowest one anyway.
  return { skill: pool.slice().sort(byGrade)[0], mode: "learn" };
}

/**
 * Build today's mission: Math → Reading/Phonics → Brain. Works with any catalog
 * (pass `catalogFor(slug)`), respects settings.blocks minutes and settings.targetGrade.
 */
export function planMission(
  catalog: Skill[],
  progressMap: ProgressMap,
  settings: LearnerSettings,
  now: Date
): Mission {
  const statuses = deriveStatuses(catalog, progressMap);
  const blocks: MissionBlock[] = [];
  const isWritingDay = now.getDay() === WRITING_WEEKDAY;

  for (const kind of BLOCK_ORDER) {
    const minutes = Math.max(0, Math.round(settings.blocks?.[kind] ?? 0));
    if (minutes <= 0) continue;

    const target =
      kind === "math"
        ? settings.targetGrade?.math
        : kind === "reading"
          ? settings.targetGrade?.reading
          : settings.targetGrade?.reasoning;

    let subjectPool = catalog.filter((s) => BLOCK_SUBJECTS[kind].includes(s.subject));
    if (kind === "reading") {
      const writing = subjectPool.filter(
        (s) => s.subject === "writing" && ["ready", "learning"].includes(statuses[s.id]?.status ?? "")
      );
      // Writing prompts are a weekly thing: prefer them on the writing day, skip them otherwise.
      subjectPool = isWritingDay && writing.length ? writing : subjectPool.filter((s) => s.subject !== "writing");
    }
    const graded = typeof target === "number" ? subjectPool.filter((s) => s.grade <= target) : subjectPool;
    const pool = graded.length ? graded : subjectPool;

    const choice = chooseSkillForBlock(pool, statuses, now);
    if (!choice) continue;

    blocks.push({
      kind,
      subject: choice.skill.subject,
      skillId: choice.skill.id,
      mode: choice.mode,
      minutes,
      label: `${BLOCK_LABEL[kind]} · ${choice.skill.kidTitle}`,
      offerTestOut: choice.offerTestOut ?? false,
    });
  }
  return { blocks };
}

// ---------------------------------------------------------------------------
// XP + levels
// ---------------------------------------------------------------------------

/** XP for one answer. Pretests (mode "test") pay the flat base, no streak bonus. */
export function xpFor(correct: boolean, streak: number, mode: PracticeMode = "learn"): number {
  if (!correct) return 0;
  if (mode === "test") return XP.base;
  if (streak >= 5) return XP.base + XP.streak5Bonus;
  if (streak >= 3) return XP.base + XP.streak3Bonus;
  return XP.base;
}

export interface LevelInfo {
  level: number;
  name: string;
  /** XP at which this level started */
  xpStart: number;
  /** XP needed to reach the next level */
  xpNext: number;
  /** 0..1 within the current level */
  progress: number;
}

/** level = floor(sqrt(xp / 100)) + 1, with named levels. */
export function levelFor(xp: number): LevelInfo {
  const safe = Math.max(0, Math.floor(xp || 0));
  const level = Math.floor(Math.sqrt(safe / 100)) + 1;
  const xpStart = 100 * (level - 1) * (level - 1);
  const xpNext = 100 * level * level;
  const name =
    level <= LEVEL_NAMES.length
      ? LEVEL_NAMES[level - 1]
      : `${LEVEL_NAMES[LEVEL_NAMES.length - 1]} ${level - LEVEL_NAMES.length + 1}`;
  return { level, name, xpStart, xpNext, progress: (safe - xpStart) / (xpNext - xpStart) };
}

/** How many questions a block should run (soft cap; the timer also ends it). */
export function questionTargetFor(mode: PracticeMode, minutes: number): number {
  if (mode === "test") return TEST_OUT_ITEMS;
  return Math.max(5, Math.min(12, Math.round(minutes * 0.8)));
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function defaultSettings(grade: number): LearnerSettings {
  const early = grade <= 2;
  return {
    dailyMinutes: 30,
    blocks: { math: 12, reading: 12, brain: 6 },
    weekend: { math: 30, reading: 30, brain: 45 },
    targetGrade: early
      ? { math: 2, reading: 2, reasoning: 1 }
      : { math: 5, reading: 4, reasoning: 3 },
    rewardRate: 100,
    stopBy: "20:30",
    pausedUntil: null,
    theme: early
      ? { currency: "Sparkle Points", levels: "ballet" }
      : { currency: "Lightning Bucks", levels: "baseball" },
    autoSpeak: early,
  };
}

/** Merge a settings JSON blob from the DB with defaults (tolerates partial/legacy shapes). */
export function normalizeSettings(raw: unknown, grade: number): LearnerSettings {
  const d = defaultSettings(grade);
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const blocks = obj(r.blocks);
  const weekend = obj(r.weekend);
  const tg = obj(r.targetGrade);
  const theme = obj(r.theme);
  const num = (v: unknown, fallback: number, min = 0, max = 240) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  const time = (v: unknown, fallback: string) =>
    typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback;
  const dateOrNull = (v: unknown) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const levels = theme.levels;
  return {
    dailyMinutes: num(r.dailyMinutes, d.dailyMinutes),
    blocks: {
      math: num(blocks.math, d.blocks.math),
      reading: num(blocks.reading, d.blocks.reading),
      brain: num(blocks.brain, d.blocks.brain),
    },
    weekend: {
      math: num(weekend.math, d.weekend.math),
      reading: num(weekend.reading, d.weekend.reading),
      brain: num(weekend.brain, d.weekend.brain),
    },
    targetGrade: {
      math: num(tg.math, d.targetGrade.math, 1, 8),
      reading: num(tg.reading, d.targetGrade.reading, 1, 8),
      reasoning: num(tg.reasoning, d.targetGrade.reasoning, 1, 8),
    },
    rewardRate: num(r.rewardRate, d.rewardRate, 1, 100000),
    stopBy: time(r.stopBy, d.stopBy),
    pausedUntil: dateOrNull(r.pausedUntil),
    theme: {
      currency: typeof theme.currency === "string" && theme.currency.trim() ? theme.currency.trim().slice(0, 40) : d.theme.currency,
      levels: levels === "baseball" || levels === "ballet" || levels === "generic" ? levels : d.theme.levels,
    },
    autoSpeak: typeof r.autoSpeak === "boolean" ? r.autoSpeak : d.autoSpeak,
  };
}
