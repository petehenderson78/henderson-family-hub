/**
 * Mastery engine — pure functions, unit-testable, no DOM, relative imports only.
 * Every rule below is asserted by scripts/learn-selfcheck.mts.
 *
 * THE MASTERY RULE
 *   A skill is "mastered" when
 *     attempts >= 10  AND  accuracy over the last-10 window >= 0.9  AND  streak >= 3,
 *   where ONLY help_level "independent" correct answers count as correct in the
 *   window. A correct answer given after a hint or with a parent's help is still
 *   logged as correct (the child keeps the point and half the XP — "DONE stays
 *   DONE even when help was needed") but enters the window as `false` and does
 *   not extend the streak (nor reset it).
 *   On mastery: intervalDays = 1 and the first spaced review is due tomorrow.
 *
 * GUESS FILTER
 *   On choice / tap / tiles items a WRONG answer given in under 1.5 s is a tap,
 *   not an answer: it is logged (learn_attempts) but not added to the window,
 *   does not break the streak and does not count as an attempt.
 *
 * SPACED REVIEW (4-item sets)
 *   A due review is a 4-item set on the skill. >= 3/4 independent-correct →
 *   interval advances along [1, 3, 7, 14, 30, 60] days (only when the review
 *   was actually due, so a bonus review never jumps the ladder). < 3/4 →
 *   interval halves (min 1 day) and review_misses += 1. Two consecutive failed
 *   sets (review_misses reaching 2) → status back to "learning", review_misses
 *   reset, interval cleared. The Friday "mix-up" block (6 interleaved items over
 *   mastered skills) updates windows/streaks only — never the interval.
 *
 * STUCK RULE (learn mode)
 *   3 consecutive items whose independent (first) answer was wrong → the block
 *   ends early with a kind card and effort XP; progress gets needs_help = true and
 *   help_note = the last prompt, so the parent sees a struggle flag + parentTip.
 *   needs_help clears when the skill is mastered.
 *
 * TEST-OUT (compacting)
 *   A 5-item pretest. 5/5 → mastered with test_out = true and intervalDays = 3.
 *   Anything less → never mastered by the pretest: status "learning" with the
 *   window pre-filled by the results (a 4/5 child is 4 answers closer).
 *
 * PLACEMENT SPRINT
 *   Test-outs up a subject's skills in catalog order starting from the first
 *   non-mastered, unlocked skill (skipping skills with testOut: false); stops
 *   after two consecutive failed test-outs.
 *
 * BLOCKS, DAYS, STREAK
 *   A block ends by minutes (soft, the current item finishes) with a floor of 5
 *   items. A block may not START unless it can finish before settings.stopBy
 *   (family rule 20:30 ET). Vacation (pausedUntil / vacations) pauses missions.
 *   The streak (streakFromSessions) counts consecutive "done" days and FREEZES —
 *   never resets — on skipped / vacation / partial days and on days before the
 *   first session; a planned day with nothing done breaks it (today excepted).
 *
 * XP
 *   10 base per correct answer, +5 at streak >= 3, +10 at streak >= 5 (15 / 20);
 *   pretest items pay the flat base; helped answers pay half (rounded up).
 *   Mastery bonus 100, review set completion 20, stuck-rule effort 10, workshop 50.
 */

import type {
  BlockKind,
  HelpLevel,
  LearnerSettings,
  Mission,
  MissionBlock,
  PracticeMode,
  ProgressMap,
  Question,
  SessionRecord,
  Skill,
  SkillProgress,
  SkillStatus,
  Subject,
} from "./types";
import {
  addDays,
  addDaysToDateStr,
  dateInRange,
  isFriday,
  isWeekend,
  minutesSinceMidnightInFamilyTz,
  parseClock,
  todayInFamilyTz,
} from "./dates";

export const WINDOW_SIZE = 10;
export const MASTERY_MIN_ATTEMPTS = 10;
export const MASTERY_ACCURACY = 0.9;
export const MASTERY_MIN_STREAK = 3;
export const REVIEW_INTERVALS: readonly number[] = [1, 3, 7, 14, 30, 60];
export const REVIEW_SET_SIZE = 4;
export const REVIEW_SET_PASS = 3;
export const REVIEW_MAX_MISSES = 2;
export const MIXUP_SET_SIZE = 6;
export const TEST_OUT_ITEMS = 5;
export const TEST_OUT_INTERVAL_DAYS = 3;
export const GUESS_MS = 1500;
export const STUCK_MISSES = 3;
export const MIN_BLOCK_ITEMS = 5;
export const MAX_BLOCK_ITEMS = 20;
export const PLACEMENT_MAX_FAILS = 2;

/** Item types where a sub-1.5 s wrong answer is treated as a tap, not an answer. */
export const GUESSABLE_TYPES: ReadonlySet<string> = new Set(["choice", "tap", "tiles"]);

export const XP = {
  base: 10,
  streak3Bonus: 5,
  streak5Bonus: 10,
  mastery: 100,
  reviewComplete: 20,
  effort: 10,
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
    reviewMisses: 0,
    needsHelp: false,
    helpNote: null,
    testOut: false,
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

/** One answered item, as the player reports it to the engine. */
export interface AnswerInput {
  correct: boolean;
  /** default "independent" */
  helpLevel?: HelpLevel;
  /** time from the question appearing to this answer */
  ms?: number;
  /** needed for the guess filter (choice / tap / tiles) */
  questionType?: Question["type"];
}

function toAnswer(a: boolean | AnswerInput): Required<Pick<AnswerInput, "correct" | "helpLevel">> & AnswerInput {
  const base = typeof a === "boolean" ? { correct: a } : a;
  return { ...base, helpLevel: base.helpLevel ?? "independent" };
}

/** A wrong, sub-1.5 s answer on a tappable item: logged, never scored. */
export function isGuess(a: boolean | AnswerInput): boolean {
  const ans = toAnswer(a);
  return !ans.correct && typeof ans.ms === "number" && ans.ms >= 0 && ans.ms < GUESS_MS && GUESSABLE_TYPES.has(ans.questionType ?? "");
}

/** True when this answer enters the mastery window as a success. */
export function countsAsIndependent(a: boolean | AnswerInput): boolean {
  const ans = toAnswer(a);
  return ans.correct && ans.helpLevel === "independent";
}

function master(p: SkillProgress, now: Date, intervalDays: number, viaTestOut: boolean): SkillProgress {
  const nowIso = now.toISOString();
  return {
    ...p,
    status: "mastered",
    masteredAt: nowIso,
    intervalDays,
    nextReviewAt: addDays(now, intervalDays).toISOString(),
    reviewMisses: 0,
    needsHelp: false,
    helpNote: null,
    testOut: viaTestOut,
  };
}

/**
 * Apply one answered question (see the header for the rules).
 * - learn mode: counts, window, streak; promotes ready→learning; checks the mastery rule.
 * - review mode on a mastered skill: counts, window and streak only — the
 *   interval is moved by applyReviewSet once the 4-item set is complete.
 * - test mode: counts only — applyTestOut folds the pretest.
 * A filtered guess only touches lastPracticedAt.
 */
export function applyResult(
  p: SkillProgress,
  answer: boolean | AnswerInput,
  now: Date,
  mode: PracticeMode = "learn"
): SkillProgress {
  const nowIso = now.toISOString();
  if (isGuess(answer)) return { ...p, lastPracticedAt: nowIso };

  const a = toAnswer(answer);
  const independent = countsAsIndependent(a);
  const window = [...p.window, independent].slice(-WINDOW_SIZE);
  const streak = !a.correct ? 0 : independent ? p.streak + 1 : p.streak;
  const next: SkillProgress = {
    ...p,
    attempts: p.attempts + 1,
    correct: p.correct + (a.correct ? 1 : 0),
    streak,
    window,
    lastPracticedAt: nowIso,
  };

  // Mastered skills (reviews, free practice) and pretest items only update the counts:
  // the review set / pretest fold decides status.
  if (p.status === "mastered" || mode === "test") return next;

  next.status = "learning";
  if (meetsMastery(next)) return master(next, now, 1, false);
  return next;
}

/** >= 3 of the 4 set items independent-correct. */
export function reviewSetPassed(results: boolean[]): boolean {
  return results.filter(Boolean).length >= REVIEW_SET_PASS;
}

/**
 * Fold a completed 4-item review set into a mastered skill's spaced-review
 * state. `results` are per-item "independent correct" flags (the window values).
 * Pass → interval advances (when the review was due); fail → halve / demote.
 */
export function applyReviewSet(p: SkillProgress, results: boolean[], now: Date, wasDue = true): SkillProgress {
  if (p.status !== "mastered") return p;
  if (reviewSetPassed(results)) {
    if (!wasDue) return { ...p, reviewMisses: 0 };
    const intervalDays = nextReviewInterval(p.intervalDays);
    return { ...p, intervalDays, nextReviewAt: addDays(now, intervalDays).toISOString(), reviewMisses: 0 };
  }
  const misses = (p.reviewMisses ?? 0) + 1;
  if (misses >= REVIEW_MAX_MISSES) {
    return { ...p, status: "learning", intervalDays: 0, nextReviewAt: null, masteredAt: null, reviewMisses: 0, testOut: false };
  }
  const intervalDays = Math.max(1, Math.floor(p.intervalDays / 2));
  return { ...p, intervalDays, nextReviewAt: addDays(now, intervalDays).toISOString(), reviewMisses: misses };
}

/** 5/5 on the pretest compacts the skill. */
export function testOut(results: boolean[]): boolean {
  return results.length >= TEST_OUT_ITEMS && results.slice(0, TEST_OUT_ITEMS).every(Boolean);
}

/**
 * Fold a completed pretest into progress: 5/5 → mastered (test_out, interval 3d);
 * anything less → "learning" with the window pre-filled by the results.
 */
export function applyTestOut(p: SkillProgress, results: boolean[], now: Date): SkillProgress {
  const nowIso = now.toISOString();
  const taken = results.slice(0, TEST_OUT_ITEMS);
  if (testOut(taken)) {
    return master(
      {
        ...p,
        attempts: p.attempts + taken.length,
        correct: p.correct + taken.length,
        streak: p.streak + taken.length,
        window: [...p.window, ...taken].slice(-WINDOW_SIZE),
        lastPracticedAt: nowIso,
      },
      now,
      TEST_OUT_INTERVAL_DAYS,
      true
    );
  }
  const folded = taken.reduce<SkillProgress>((acc, r) => ({ ...applyResult(acc, r, now, "learn"), status: "learning" }), {
    ...p,
    status: p.status === "mastered" ? "learning" : p.status,
  });
  return { ...folded, status: "learning", masteredAt: null, intervalDays: 0, nextReviewAt: null, testOut: false };
}

/** The stuck rule: the last 3 items' independent answers were all wrong. */
export function isStuck(firstTryResults: boolean[]): boolean {
  if (firstTryResults.length < STUCK_MISSES) return false;
  return firstTryResults.slice(-STUCK_MISSES).every((r) => r === false);
}

/** Flag the skill for the parent (struggle flag + the prompt the child was stuck on). */
export function markNeedsHelp(p: SkillProgress, note: string): SkillProgress {
  return { ...p, needsHelp: true, helpNote: note.trim().slice(0, 240) || null };
}

/** Shift every pending review by `days` (vacation: due dates move with the pause). */
export function shiftReviewDates(rows: SkillProgress[], days: number): SkillProgress[] {
  if (!days) return rows;
  return rows.map((p) => (p.status === "mastered" && p.nextReviewAt ? { ...p, nextReviewAt: addDays(new Date(p.nextReviewAt), days).toISOString() } : p));
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

/**
 * Placement sprint order for a subject: catalog order from the first
 * non-mastered unlocked skill, every later non-mastered skill included (passing
 * one unlocks the next), skills that cannot be tested out skipped.
 */
export function placementPlan(catalog: Skill[], subject: Subject, progressMap: ProgressMap): Skill[] {
  const statuses = deriveStatuses(catalog, progressMap);
  const inSubject = catalog.filter((s) => s.subject === subject);
  const start = inSubject.findIndex((s) => {
    const st = statuses[s.id]?.status;
    return st === "ready" || st === "learning";
  });
  if (start < 0) return [];
  return inSubject.slice(start).filter((s) => s.testOut && statuses[s.id]?.status !== "mastered");
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

/** Friday "mix-up": up to 6 mastered skills (most overdue first), interleaved. */
export function mixupSkills(catalog: Skill[], statuses: ProgressMap): Skill[] {
  return catalog
    .filter((s) => statuses[s.id]?.status === "mastered")
    .sort(byNextReview(statuses))
    .slice(0, MIXUP_SET_SIZE);
}

/**
 * Build today's mission: Math → Reading/Phonics → Brain. Works with any catalog
 * (pass `catalogFor(slug)`), respects settings.blocks / settings.weekend minutes
 * and settings.targetGrade. Never schedules the same generator twice in one
 * mission. `today` is the YYYY-MM-DD date in the family timezone (derived from
 * `now` when omitted); weekends use settings.weekend, Fridays turn the brain
 * block into the mix-up review when the learner has mastered skills.
 */
export function planMission(
  catalog: Skill[],
  progressMap: ProgressMap,
  settings: LearnerSettings,
  now: Date,
  today?: string
): Mission {
  const statuses = deriveStatuses(catalog, progressMap);
  const blocks: MissionBlock[] = [];
  const date = today ?? todayInFamilyTz(now);
  const weekend = isWeekend(date);
  const friday = isFriday(date);
  const usedGenerators = new Set<string>();

  for (const kind of BLOCK_ORDER) {
    const planned = weekend ? (settings.weekend?.[kind] ?? settings.blocks?.[kind]) : settings.blocks?.[kind];
    const minutes = Math.max(0, Math.round(planned ?? 0));
    if (minutes <= 0) continue;

    if (kind === "brain" && friday) {
      const mix = mixupSkills(catalog, statuses);
      if (mix.length > 0) {
        blocks.push({
          kind,
          subject: mix[0].subject,
          skillId: mix[0].id,
          skillIds: mix.map((s) => s.id),
          mode: "review",
          minutes,
          items: MIXUP_SET_SIZE,
          label: `${BLOCK_LABEL[kind]} · Mix-up Review`,
          offerTestOut: false,
        });
        continue;
      }
    }

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
      subjectPool = friday && writing.length ? writing : subjectPool.filter((s) => s.subject !== "writing");
    }
    const graded = typeof target === "number" ? subjectPool.filter((s) => s.grade <= target) : subjectPool;
    const pool = graded.length ? graded : subjectPool;
    const fresh = pool.filter((s) => !usedGenerators.has(s.generator));

    const choice = chooseSkillForBlock(fresh.length ? fresh : pool, statuses, now);
    if (!choice) continue;
    usedGenerators.add(choice.skill.generator);

    blocks.push({
      kind,
      subject: choice.skill.subject,
      skillId: choice.skill.id,
      mode: choice.mode,
      minutes,
      items: choice.mode === "review" ? REVIEW_SET_SIZE : undefined,
      label: `${BLOCK_LABEL[kind]} · ${choice.skill.kidTitle}`,
      offerTestOut: choice.offerTestOut ?? false,
    });
  }
  return { blocks };
}

// ---------------------------------------------------------------------------
// Blocks, days, streak
// ---------------------------------------------------------------------------

/** Minutes until settings.stopBy in the family timezone (negative once past it). */
export function minutesUntilStopBy(now: Date, stopBy: string): number {
  const stop = parseClock(stopBy);
  if (stop === null) return Number.POSITIVE_INFINITY;
  return stop - minutesSinceMidnightInFamilyTz(now);
}

/** A block may start only when it can finish before stopBy. */
export function canStartBlock(now: Date, stopBy: string, minutes: number): boolean {
  return minutesUntilStopBy(now, stopBy) >= Math.max(1, Math.round(minutes));
}

/** Vacation mode: pausedUntil (inclusive) or any vacation range containing today. */
export function isPaused(settings: Pick<LearnerSettings, "pausedUntil" | "vacations">, today: string): boolean {
  if (settings.pausedUntil && today <= settings.pausedUntil) return true;
  return (settings.vacations ?? []).some((v) => dateInRange(today, v.from, v.to));
}

/**
 * Streak flame: consecutive "done" days ending today (or yesterday when today is
 * not done yet). Skipped / vacation / partial days and paused days FREEZE the
 * count (they are stepped over, not reset); days before the first session end
 * the walk; a planned day with nothing done breaks it.
 */
export function streakFromSessions(
  sessions: SessionRecord[],
  today: string,
  settings?: Pick<LearnerSettings, "pausedUntil" | "vacations"> | null
): number {
  const byDate = new Map<string, SessionRecord>();
  for (const s of sessions) byDate.set(s.date, s);
  if (byDate.size === 0) return 0;
  const first = [...byDate.keys()].sort()[0];
  const isDone = (s: SessionRecord) => s.completed || s.status === "done";
  const isFrozen = (date: string, s: SessionRecord | undefined) =>
    (s ? s.status === "skipped" || s.status === "vacation" || s.status === "partial" : false) || (!!settings && isPaused(settings, date));

  let streak = 0;
  let cursor = today;
  for (let i = 0; i < 400; i++) {
    if (cursor < first) break;
    const s = byDate.get(cursor);
    if (s && isDone(s)) streak += 1;
    else if (cursor === today || isFrozen(cursor, s)) {
      // today not finished yet, or a frozen day: neither counts nor breaks
    } else break;
    cursor = addDaysToDateStr(cursor, -1);
  }
  return streak;
}

/** planned → partial → done, from the blocks. */
export function sessionStatusFor(blocks: { done: boolean }[]): "planned" | "partial" | "done" {
  const done = blocks.filter((b) => b.done).length;
  if (blocks.length > 0 && done >= blocks.length) return "done";
  return done > 0 ? "partial" : "planned";
}

// ---------------------------------------------------------------------------
// XP + levels
// ---------------------------------------------------------------------------

/**
 * XP for one answer. Pretests (mode "test") pay the flat base, no streak bonus.
 * A helped correct answer (hint / taught) pays half, rounded up.
 */
export function xpFor(correct: boolean, streak: number, mode: PracticeMode = "learn", helpLevel: HelpLevel = "independent"): number {
  if (!correct) return 0;
  let xp: number = XP.base;
  if (mode !== "test") {
    if (streak >= 5) xp = XP.base + XP.streak5Bonus;
    else if (streak >= 3) xp = XP.base + XP.streak3Bonus;
  }
  return helpLevel === "independent" ? xp : Math.ceil(xp / 2);
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

/** Family currency earned for an XP amount (settings.rewardRate XP per unit), one decimal. */
export function currencyFor(xp: number, rewardRate: number): number {
  const rate = rewardRate > 0 ? rewardRate : 100;
  return Math.round((xp / rate) * 10) / 10;
}

/**
 * How many questions a block should run: a soft cap — the timer also ends the
 * block after MIN_BLOCK_ITEMS. Review = the 4-item set, test = 5, learn ≈ one
 * item per minute (5..20). `items` (from the mission block) wins when given.
 */
export function questionTargetFor(mode: PracticeMode, minutes: number, items?: number): number {
  if (typeof items === "number" && items > 0) return items;
  if (mode === "test") return TEST_OUT_ITEMS;
  if (mode === "review") return REVIEW_SET_SIZE;
  return Math.max(MIN_BLOCK_ITEMS, Math.min(MAX_BLOCK_ITEMS, Math.round(minutes * 1.2)));
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
    vacations: [],
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
  const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const dateOrNull = (v: unknown) => (isDate(v) ? v : null);
  const vacations = Array.isArray(r.vacations)
    ? r.vacations
        .map((v) => obj(v))
        .filter((v) => isDate(v.from) && isDate(v.to) && (v.from as string) <= (v.to as string))
        .map((v) => ({ from: v.from as string, to: v.to as string }))
    : [];
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
    vacations,
    theme: {
      currency: typeof theme.currency === "string" && theme.currency.trim() ? theme.currency.trim().slice(0, 40) : d.theme.currency,
      levels: levels === "baseball" || levels === "ballet" || levels === "generic" ? levels : d.theme.levels,
    },
    autoSpeak: typeof r.autoSpeak === "boolean" ? r.autoSpeak : d.autoSpeak,
  };
}
