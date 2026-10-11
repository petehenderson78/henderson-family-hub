/**
 * Mastery engine — pure functions, unit-testable, no DOM, relative imports only.
 * Every rule below is asserted by scripts/learn-selfcheck.mts. Numbers follow
 * the final program design (docs: PROGRAM-DESIGN §3-4, Appendix A).
 *
 * THE MASTERY RULE
 *   A skill is "mastered" when
 *     attempts >= 10  AND  accuracy over the last-10 window >= 0.9  AND  streak >= 3,
 *   where ONLY help_level "independent" correct answers count as correct in the
 *   window. A correct answer given after a hint or with a parent's help is still
 *   logged as correct (half XP — "DONE stays DONE even when help was needed")
 *   but enters the window as `false` and does not extend the streak (nor reset it).
 *   On mastery: intervalDays = 1 and the first spaced review is due tomorrow.
 *
 * GUESS FILTER
 *   On choice / tap / tiles items a WRONG answer given in under 1.5 s is a tap,
 *   not an answer: it is logged (learn_attempts) but not added to the window,
 *   does not break the streak and does not count as an attempt. The player
 *   serves a fresh item for the same slot, so review sets and skip checks stay
 *   4 / 10 real answers.
 *
 * SPACED REVIEW (4-item sets)
 *   Review dates are family calendar DATES (America/New_York): a review set or
 *   mastery on family date D schedules the next review for D + interval days,
 *   stored at family noon (reviewAtIso), so a DST change never moves it. It is
 *   due on that date, not at its clock time. Paused days (pausedUntil,
 *   vacations, "off" light weeks) stop the interval clock: isReviewDueOn /
 *   effectiveReviewDate add the paused days that fell between the day the
 *   review was scheduled and today (future pauses never move a date; a day
 *   covered twice counts once). planMission and chooseSkillForBlock use it;
 *   isReviewDue (no settings) stays for callers without settings.
 *   >= 3/4 independent-correct → interval advances along
 *   [1, 3, 7, 14, 30, 60] days (only when the review was actually due). < 3/4 →
 *   interval halves (min 1 day) and review_misses += 1. Two consecutive failed
 *   sets → status back to "learning" (review_misses keeps the count so the parent
 *   dashboard flags the demotion; it resets on re-mastery).
 *   Reviews before new learning: a school night runs at most 2 due sets per
 *   block before its new-skill portion; a third due set replaces the new-skill
 *   portion. Fridays and weekends run up to 4 due sets per block.
 *   The Friday "mix-up" (8 interleaved items over mastered skills, 12 on the
 *   last Friday of the month with the two weakest skills first) updates windows
 *   and streaks only — never the interval, whatever number of skills it covers
 *   (decide it with isMixupBlock(block), never from the skill count). It needs
 *   at least 2 mastered skills on generators tonight's other blocks did not use;
 *   otherwise Friday's brain block is planned like any other night's.
 *   No generator twice in a mission (new skill, review sets and mix-up alike):
 *   a due set whose generator is already planned tonight waits for the next
 *   night; a due set on the new skill's generator gives way to the next due set,
 *   or, when there is none, waits while the new skill keeps its slot.
 *
 * STUCK RULE (learn mode)
 *   isStuck takes one boolean per item, TRUE = THE FIRST TRY WAS CORRECT.
 *   3 consecutive items whose independent (first) answer was wrong → the block
 *   ends early with a kind card and 3 effort XP; progress gets needs_help = true
 *   and help_note = the last prompt. needs_help clears when the skill is mastered.
 *
 * SKIP CHECK (unit pretest, kid label "Skip check"; weekends)
 *   10 items, no hints, no retry. >= 9/10 → mastered with test_out = true and
 *   intervalDays = 3. Math 7-8/10 → learning, help_note "quick fill"; reading
 *   6-8/10 → learning, help_note "hole fill"; anything else → learning (full
 *   learn: an old "quick fill" / "hole fill" note is cleared, so no further
 *   skip check is offered). The window is pre-filled with the results.
 *
 * PLACEMENT SPRINT
 *   5-item probes up a subject's skills in catalog order. 5/5 → test-out;
 *   4/5 → one more 5-item set and the pair must reach 9/10; else learn. Stops
 *   after two consecutive failed skills.
 *
 * BLOCKS, DAYS, STREAK
 *   A learn block ends by minutes (soft, the current item finishes) with a
 *   floor of 5 items; review sets, mix-ups and skip checks run their fixed
 *   count. A block may not START unless it can finish before settings.stopBy.
 *   Vacation (pausedUntil, vacations, light weeks "off") pauses missions;
 *   light weeks "review-only" plan review sets only. The streak counts
 *   consecutive "done" days and FREEZES — never resets — on skipped / vacation /
 *   partial / paused days, weekend days and a Friday Free; a school night with
 *   nothing done (no row, or a row still "planned") breaks it (today excepted).
 *   A session with status "done" counts whatever its blocks say (the parent's
 *   "Weekend set done"). streakInfo also says whether the walk was complete or
 *   ran out of the sessions it was given.
 *
 * BRAIN ROTATION (design §9)
 *   The brain block's new skill prefers the weekday's reasoning family: Mon
 *   verbal, Tue paper folding / rotation, Wed number puzzles, Thu figures and
 *   logic (BRAIN_ROTATION); Fri is the mix-up, weekends any. Without a ready or
 *   learning skill in the family, any eligible reasoning skill.
 *
 * XP (drives the level ladder only; the currency is input points, see stats.ts)
 *   1 per independent correct item, 0.5 when helped; 3 effort XP when the stuck
 *   card ends a block. Replay decay: the second set of the same skill on the
 *   same day earns half, the third and later none. A level every 500 XP.
 */

import type {
  BlockKind,
  HelpLevel,
  LearnerSettings,
  LearnerTheme,
  LightWeek,
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
  addDaysToDateStr,
  dateInRange,
  daysBetweenDateStr,
  familyDateOfIso,
  familyNoonIso,
  isFriday,
  isLastFridayOfMonth,
  isWeekend,
  minutesSinceMidnightInFamilyTz,
  parseClock,
  todayInFamilyTz,
  weekdayIndexMon,
} from "./dates";

export const WINDOW_SIZE = 10;
export const MASTERY_MIN_ATTEMPTS = 10;
export const MASTERY_ACCURACY = 0.9;
export const MASTERY_MIN_STREAK = 3;
export const REVIEW_INTERVALS: readonly number[] = [1, 3, 7, 14, 30, 60];
export const REVIEW_SET_SIZE = 4;
export const REVIEW_SET_PASS = 3;
export const REVIEW_MAX_MISSES = 2;
/** Planned minutes of one 4-item review set inside a block. */
export const REVIEW_SET_MINUTES = 3;
/** School night: due sets per block before the new-skill portion. */
export const REVIEW_NIGHT_CAP = 2;
/** School night: this many due sets replace the new-skill portion. */
export const REVIEW_REPLACE_AT = 3;
export const REVIEW_FRIDAY_CAP = 4;
export const REVIEW_WEEKEND_CAP = 4;
export const MIXUP_SET_SIZE = 8;
export const MIXUP_LAST_FRIDAY_SIZE = 12;
/** Last Friday of the month: the two weakest mastered skills lead the mix-up. */
export const MIXUP_REOPEN_WEAKEST = 2;
/** A mix-up needs at least this many skills (one per generator); fewer → Friday's brain block runs as usual. */
export const MIXUP_MIN_SKILLS = 2;
export const SKIP_CHECK_ITEMS = 10;
export const SKIP_CHECK_PASS = 9;
export const MATH_QUICK_FILL: readonly [number, number] = [7, 8];
export const READING_HOLE_FILL: readonly [number, number] = [6, 8];
/** Placement probe size (5 items; 4/5 earns a second probe). */
export const TEST_OUT_ITEMS = 5;
export const PLACEMENT_PAIR_PASS = 9;
export const TEST_OUT_INTERVAL_DAYS = 3;
export const GUESS_MS = 1500;
/** After this many filtered taps in a row, the next fast wrong answer counts (no endless re-serving). */
export const GUESS_STREAK_LIMIT = 3;
export const STUCK_MISSES = 3;
export const MIN_BLOCK_ITEMS = 5;
/** A new-skill portion shorter than this is dropped (the block runs its review sets only). */
export const MIN_LEARN_MINUTES = 3;
export const PLACEMENT_MAX_FAILS = 2;
/** XP per level (Appendix A: levelXp 500). */
export const LEVEL_XP = 500;
/** Upper bound for day-by-day walks (streak, paused days): about 2.7 years. */
const MAX_DAY_WALK = 1000;

/** Item types where a sub-1.5 s wrong answer is treated as a tap, not an answer. */
export const GUESSABLE_TYPES: ReadonlySet<string> = new Set(["choice", "tap", "tiles"]);

export const XP = {
  /** per independent correct item */
  item: 1,
  /** a hinted / taught correct pays half */
  helpedFactor: 0.5,
  /** the stuck card ends a block */
  effort: 3,
} as const;

/** Replay decay: first set of a skill today full XP, second half, third and later none. */
export const REPLAY_XP: readonly number[] = [1, 0.5, 0];

export const LADDERS: Record<LearnerTheme["levels"], readonly string[]> = {
  baseball: ["Rookie Ball", "Single-A", "Double-A", "Triple-A", "Lightning 9U Blue", "All-Star"],
  ballet: ["Barre", "Centre", "Across the Floor", "Recital", "Prima"],
  generic: ["Rookie", "Explorer", "Builder", "Navigator", "Captain", "Legend"],
};

export const LEVEL_NAMES: readonly string[] = LADDERS.generic;

/** Planned light weeks (design §14.8): Dec 21 - Jan 1 off, Feb 15-26 review-only. */
export const DEFAULT_LIGHT_WEEKS: readonly LightWeek[] = [
  { from: "2026-12-21", to: "2027-01-01", mode: "off" },
  { from: "2027-02-15", to: "2027-02-26", mode: "review-only" },
];

export const TIME_BACK = {
  cole: "Done by 7:45 = catch in the yard",
  lily: "Done by 7:45 = dance party before bath",
} as const;

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

/**
 * Due when the family-timezone DATE of nextReviewAt is today or earlier. (Comparing
 * instants would slip every rung a day whenever tonight's session starts earlier
 * on the clock than the one that set it.)
 */
export function isReviewDue(p: SkillProgress | undefined, now: Date): boolean {
  if (!p || p.status !== "mastered") return false;
  if (!p.nextReviewAt) return true;
  const at = new Date(p.nextReviewAt);
  if (Number.isNaN(at.getTime())) return true;
  return todayInFamilyTz(at) <= todayInFamilyTz(now);
}

/**
 * The nextReviewAt for a review `intervalDays` family days after `now`: noon
 * (family time) of that family DATE. The arithmetic is on calendar dates, so a
 * DST change in between never moves the due day (now + n × 24 h landed a day
 * late after 23:00 before spring-forward, and on the same day after 00:00 on
 * the fall-back night).
 */
export function reviewAtIso(now: Date, intervalDays: number): string {
  return familyNoonIso(addDaysToDateStr(todayInFamilyTz(now), Math.max(0, Math.round(intervalDays))));
}

/**
 * The family date a review's interval started: nextReviewAt's family date minus
 * intervalDays (the engine always stores schedule day + interval). Without an
 * interval, the family date of lastPracticedAt (later practice — a mix-up, a
 * bonus review — moves that forward, so it is only the fallback). Never later
 * than the due date; null without a nextReviewAt.
 */
export function reviewScheduledOn(p: Pick<SkillProgress, "nextReviewAt" | "intervalDays" | "lastPracticedAt">): string | null {
  const due = familyDateOfIso(p.nextReviewAt);
  if (!due) return null;
  const from = p.intervalDays >= 1 ? addDaysToDateStr(due, -Math.round(p.intervalDays)) : familyDateOfIso(p.lastPracticedAt);
  return from && from < due ? from : due;
}

/**
 * Paused days (pausedUntil from pausedFrom, vacations, "off" light weeks) in
 * (afterDate, throughDate], each date counted once however many pauses cover
 * it. `today` resolves a legacy pause without pausedFrom (see isPaused).
 */
export function pausedDaysBetween(settings: PauseSettings | null | undefined, afterDate: string, throughDate: string, today: string = throughDate): number {
  if (!settings || !afterDate || !throughDate || throughDate <= afterDate) return 0;
  let n = 0;
  let d = afterDate;
  for (let i = 0; i < MAX_DAY_WALK; i++) {
    d = addDaysToDateStr(d, 1);
    if (d > throughDate) break;
    if (isPaused(settings, d, today)) n += 1;
  }
  return n;
}

/**
 * The family date a review is effectively due, seen from `today`: the interval
 * counts only days that were NOT paused between the day it was scheduled
 * (reviewScheduledOn) and today, so the due date is nextReviewAt's family date
 * plus the paused days in that stretch. Only days up to `today` are looked at:
 * a planned future vacation never moves a date, a pause that is shortened or
 * cleared stops counting the days it no longer covers, and days after today
 * count as plain days. Without settings (or a pause), nextReviewAt's family
 * date. null when there is no valid nextReviewAt.
 *
 * Do not combine with shiftReviewDates (the old save-time shift): that would
 * count the same pause twice.
 */
export function effectiveReviewDate(p: SkillProgress | undefined, today: string, settings?: PauseSettings | null): string | null {
  if (!p?.nextReviewAt) return null;
  const due = familyDateOfIso(p.nextReviewAt);
  if (!due) return null;
  const from = reviewScheduledOn(p);
  if (!settings || !from || from >= due) return due;
  const need = daysBetweenDateStr(from, due);
  let counted = 0;
  let d = from;
  for (let i = 0; i < MAX_DAY_WALK; i++) {
    d = addDaysToDateStr(d, 1);
    if (d > today) return addDaysToDateStr(d, need - counted - 1);
    if (!isPaused(settings, d, today)) counted += 1;
    if (counted >= need) return d;
  }
  return due;
}

/**
 * Pause-aware due test — use it wherever the learner's settings are at hand: a
 * mastered skill is due on `today` (family YYYY-MM-DD) when its effective review
 * date is today or earlier. A mastered skill without a (valid) nextReviewAt is
 * due. Without settings it equals isReviewDue.
 */
export function isReviewDueOn(p: SkillProgress | undefined, today: string, settings?: PauseSettings | null): boolean {
  if (!p || p.status !== "mastered") return false;
  if (!p.nextReviewAt) return true;
  const at = effectiveReviewDate(p, today, settings);
  return !at || at <= today;
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

/**
 * The player's guess filter: a fast wrong tap on the FIRST answer to an item is
 * re-served (logged, never scored), unless `guessStreak` taps in a row were
 * already filtered — then it counts like any answer. The learn-mode retry
 * (after the hint) is never filtered.
 */
export function shouldFilterGuess(a: AnswerInput, retrying: boolean, guessStreak: number): boolean {
  return !retrying && guessStreak < GUESS_STREAK_LIMIT && isGuess(a);
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
    nextReviewAt: reviewAtIso(now, intervalDays),
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
 * - test mode: counts only — applySkipCheck / applyTestOut fold the set.
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
 * A demotion keeps review_misses (2) so the parent sees the flag until re-mastery.
 */
export function applyReviewSet(p: SkillProgress, results: boolean[], now: Date, wasDue = true): SkillProgress {
  if (p.status !== "mastered") return p;
  if (reviewSetPassed(results)) {
    if (!wasDue) return { ...p, reviewMisses: 0 };
    const intervalDays = nextReviewInterval(p.intervalDays);
    return { ...p, intervalDays, nextReviewAt: reviewAtIso(now, intervalDays), reviewMisses: 0 };
  }
  const misses = (p.reviewMisses ?? 0) + 1;
  if (misses >= REVIEW_MAX_MISSES) {
    return { ...p, status: "learning", intervalDays: 0, nextReviewAt: null, masteredAt: null, reviewMisses: misses, testOut: false };
  }
  const intervalDays = Math.max(1, Math.floor(p.intervalDays / 2));
  return { ...p, intervalDays, nextReviewAt: reviewAtIso(now, intervalDays), reviewMisses: misses };
}

/** Master a skill from a passed test-out set (skip check or placement probe). */
function masterByTest(p: SkillProgress, taken: boolean[], now: Date): SkillProgress {
  let streak = p.streak;
  for (const r of taken) streak = r ? streak + 1 : 0;
  return master(
    {
      ...p,
      attempts: p.attempts + taken.length,
      correct: p.correct + taken.filter(Boolean).length,
      streak,
      window: [...p.window, ...taken].slice(-WINDOW_SIZE),
      lastPracticedAt: now.toISOString(),
    },
    now,
    TEST_OUT_INTERVAL_DAYS,
    true
  );
}

/** A failed test-out set never masters: status "learning" with the window pre-filled by the results. */
function foldIntoLearning(p: SkillProgress, taken: boolean[], now: Date): SkillProgress {
  const folded = taken.reduce<SkillProgress>((acc, r) => ({ ...applyResult(acc, r, now, "learn"), status: "learning" }), {
    ...p,
    status: p.status === "mastered" ? "learning" : p.status,
  });
  return { ...folded, status: "learning", masteredAt: null, intervalDays: 0, nextReviewAt: null, testOut: false };
}

/**
 * Placement probe verdict: 5/5 → pass; 4/5 → a second 5-item set; a pair (10
 * results) passes at >= 9/10; anything else fails.
 */
export function placementProbeResult(results: boolean[]): "pass" | "second-set" | "fail" {
  const score = results.filter(Boolean).length;
  if (results.length > TEST_OUT_ITEMS) return score >= PLACEMENT_PAIR_PASS ? "pass" : "fail";
  if (results.length < TEST_OUT_ITEMS) return "fail";
  if (score === TEST_OUT_ITEMS) return "pass";
  return score === TEST_OUT_ITEMS - 1 ? "second-set" : "fail";
}

/** A test-out passes: 5/5 on one probe, or >= 9/10 over a pair / a skip check. */
export function testOut(results: boolean[]): boolean {
  if (results.length >= SKIP_CHECK_ITEMS) return results.slice(0, SKIP_CHECK_ITEMS).filter(Boolean).length >= SKIP_CHECK_PASS;
  return results.length >= TEST_OUT_ITEMS && results.slice(0, TEST_OUT_ITEMS).every(Boolean);
}

/**
 * Fold a finished placement probe (5 results, or the 10 of a pair) into progress:
 * pass → mastered (test_out, interval 3d); otherwise "learning" with the window pre-filled.
 */
export function applyTestOut(p: SkillProgress, results: boolean[], now: Date): SkillProgress {
  const taken = results.slice(0, SKIP_CHECK_ITEMS);
  return testOut(taken) ? masterByTest(p, taken, now) : foldIntoLearning(p, taken, now);
}

export function isReadingSubject(subject: Subject): boolean {
  return subject === "reading" || subject === "phonics" || subject === "writing";
}

export type SkipCheckBand = "test-out" | "quick-fill" | "hole-fill" | "learn";

/** Skip check bands (design §3.2): >= 9/10 test-out; math 7-8 quick fill; reading 6-8 hole fill; else learn. */
export function skipCheckBand(results: boolean[], subject: Subject): SkipCheckBand {
  const taken = results.slice(0, SKIP_CHECK_ITEMS);
  const score = taken.filter(Boolean).length;
  if (taken.length >= SKIP_CHECK_ITEMS && score >= SKIP_CHECK_PASS) return "test-out";
  if (subject === "math" && score >= MATH_QUICK_FILL[0] && score <= MATH_QUICK_FILL[1]) return "quick-fill";
  if (isReadingSubject(subject) && score >= READING_HOLE_FILL[0] && score <= READING_HOLE_FILL[1]) return "hole-fill";
  return "learn";
}

/** A skill left in "learning" by a skip check's quick fill / hole fill: Learn-it card first, skip check again next weekend. */
export function needsSkipCheckFollowUp(p: SkillProgress | undefined): boolean {
  return !!p && p.status === "learning" && (p.helpNote === "quick fill" || p.helpNote === "hole fill");
}

/** Fold a finished 10-item skip check (independent-correct flags). */
export function applySkipCheck(p: SkillProgress, results: boolean[], now: Date, subject: Subject): SkillProgress {
  const taken = results.slice(0, SKIP_CHECK_ITEMS);
  const band = skipCheckBand(taken, subject);
  if (band === "test-out") return masterByTest(p, taken, now);
  const folded = foldIntoLearning(p, taken, now);
  if (band === "quick-fill") return { ...folded, helpNote: "quick fill" };
  if (band === "hole-fill") return { ...folded, helpNote: "hole fill" };
  // Full learn: a re-check that scored low ends the quick / hole fill (no skip check next weekend).
  return isSkipCheckNote(folded.helpNote) ? { ...folded, helpNote: null } : folded;
}

function isSkipCheckNote(note: string | null | undefined): boolean {
  return note === "quick fill" || note === "hole fill";
}

/**
 * The stuck rule: the last 3 items' independent (first-try) answers were all wrong.
 *
 * INPUT: ONE BOOLEAN PER ITEM, OLDEST FIRST. TRUE = THE FIRST TRY WAS CORRECT
 * (INDEPENDENT). FALSE = THE FIRST TRY WAS A MISS (EVEN IF THE RETRY LANDED).
 * RETURNS TRUE AFTER 3 CONSECUTIVE FALSE VALUES (3 FIRST-TRY MISSES IN A ROW);
 * NEVER TRUE WHEN THE LAST 3 INCLUDE A TRUE. Call it as
 * `isStuck(results.map((r) => r.firstTryCorrect))` — passing "missed" flags
 * inverts the rule (3 correct answers would end the block).
 */
export function isStuck(firstTryResults: boolean[]): boolean {
  if (firstTryResults.length < STUCK_MISSES) return false;
  return firstTryResults.slice(-STUCK_MISSES).every((r) => r === false);
}

/** Flag the skill for the parent (struggle flag + the prompt the child was stuck on). */
export function markNeedsHelp(p: SkillProgress, note: string): SkillProgress {
  return { ...p, needsHelp: true, helpNote: note.trim().slice(0, 240) || null };
}

/**
 * Shift every pending review by `days` family days (date arithmetic, DST-safe).
 * @deprecated Paused days are handled when the plan is built (isReviewDueOn /
 * effectiveReviewDate). Writing shifted dates as well counts a pause twice;
 * kept only for compatibility.
 */
export function shiftReviewDates(rows: SkillProgress[], days: number): SkillProgress[] {
  if (!days) return rows;
  return rows.map((p) => {
    const due = p.status === "mastered" ? familyDateOfIso(p.nextReviewAt) : "";
    return due ? { ...p, nextReviewAt: familyNoonIso(addDaysToDateStr(due, Math.round(days))) } : p;
  });
}

/** Parent "Mark mastered" (book work proved it): mastered, review in `intervalDays`, flags cleared. */
export function markMasteredByParent(p: SkillProgress, now: Date, intervalDays = 7): SkillProgress {
  const nowIso = now.toISOString();
  return {
    ...p,
    status: "mastered",
    masteredAt: nowIso,
    lastPracticedAt: p.lastPracticedAt ?? nowIso,
    intervalDays,
    nextReviewAt: reviewAtIso(now, intervalDays),
    reviewMisses: 0,
    needsHelp: false,
    helpNote: null,
    testOut: false,
  };
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
// Settings-derived day state: pause, vacations, light weeks
// ---------------------------------------------------------------------------

export type PauseSettings = Pick<LearnerSettings, "pausedUntil" | "pausedFrom" | "vacations" | "lightWeeks">;

/** The light-week mode covering `date`, if any. */
export function lightWeekMode(settings: Pick<LearnerSettings, "lightWeeks">, date: string): LightWeek["mode"] | null {
  const hit = (settings.lightWeeks ?? []).find((w) => dateInRange(date, w.from, w.to));
  return hit ? hit.mode : null;
}

/**
 * Vacation mode on `date`: inside "Pause until" (from pausedFrom; a legacy pause
 * without a start covers only `today` onward), a vacation range, or an "off"
 * light week. Pass `today` when asking about past days (the streak walk).
 */
export function isPaused(settings: PauseSettings, date: string, today?: string): boolean {
  if (settings.pausedUntil && date <= settings.pausedUntil) {
    const from = settings.pausedFrom ?? today ?? date;
    if (date >= from) return true;
  }
  if ((settings.vacations ?? []).some((v) => dateInRange(date, v.from, v.to))) return true;
  return lightWeekMode(settings, date) === "off";
}

/** The last paused day of the pause covering `date` (null when not paused). */
export function pauseEndDate(settings: PauseSettings, date: string): string | null {
  if (!isPaused(settings, date)) return null;
  let end = date;
  for (let i = 0; i < 400 && isPaused(settings, addDaysToDateStr(end, 1), date); i++) end = addDaysToDateStr(end, 1);
  return end;
}

/**
 * Settings editor save: a new / extended "Pause until" starts today (pausedFrom),
 * and the elapsed part of the previous pause is kept as a vacation range, so
 * clearing or changing a pause never unfreezes days that were paused.
 */
export function applyPauseEdit<T extends PauseSettings>(prev: PauseSettings, next: T, today: string): T {
  const changed = (prev.pausedUntil ?? null) !== (next.pausedUntil ?? null);
  let out: T = next;
  if (changed) out = { ...out, pausedFrom: next.pausedUntil ? today : null };
  if (changed && prev.pausedUntil) {
    const from = prev.pausedFrom ?? null;
    const yesterday = addDaysToDateStr(today, -1);
    const to = prev.pausedUntil < yesterday ? prev.pausedUntil : yesterday;
    if (from && from <= to) {
      const vacations = [...(out.vacations ?? [])];
      if (!vacations.some((v) => v.from <= from && v.to >= to)) vacations.push({ from, to });
      out = { ...out, vacations };
    }
  }
  return out;
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

/** Most overdue first by the pause-aware effective date, then by nextReviewAt. */
function byEffectiveReview(statuses: ProgressMap, today: string, settings: PauseSettings | null | undefined) {
  const raw = byNextReview(statuses);
  const cache = new Map<string, string>();
  const eff = (s: Skill): string => {
    let v = cache.get(s.id);
    if (v === undefined) {
      v = effectiveReviewDate(statuses[s.id], today, settings) ?? "";
      cache.set(s.id, v);
    }
    return v;
  };
  return (a: Skill, b: Skill) => {
    const ea = eff(a);
    const eb = eff(b);
    return ea < eb ? -1 : ea > eb ? 1 : raw(a, b);
  };
}

/** One skill per generator, in list order, skipping generators in `used` (no generator twice in a mission). */
function distinctGenerators(list: Skill[], used: ReadonlySet<string> = new Set()): Skill[] {
  const seen = new Set(used);
  const out: Skill[] = [];
  for (const s of list) {
    if (seen.has(s.generator)) continue;
    seen.add(s.generator);
    out.push(s);
  }
  return out;
}

interface Choice {
  skill: Skill;
  mode: PracticeMode;
  offerTestOut?: boolean;
}

/** Lowest-grade "learning" skill, else lowest-grade "ready" (null when neither). */
function learnableChoice(pool: Skill[], statuses: ProgressMap): Choice | null {
  const learning = pool.filter((s) => statuses[s.id]?.status === "learning").sort(byGrade);
  if (learning.length) return { skill: learning[0], mode: "learn" };
  const ready = pool.filter((s) => statuses[s.id]?.status === "ready").sort(byGrade);
  if (ready.length) return { skill: ready[0], mode: "learn", offerTestOut: ready[0].testOut };
  return null;
}

/**
 * Due reviews first (unless `skipDue`: the planner runs them as their own sets),
 * then lowest-grade "learning", then lowest-grade "ready", then a bonus review.
 * Pass `settings` (and `today`) to make the due test pause-aware (isReviewDueOn).
 */
export function chooseSkillForBlock(
  pool: Skill[],
  statuses: ProgressMap,
  now: Date,
  skipDue = false,
  settings?: PauseSettings | null,
  today?: string
): Choice | null {
  if (pool.length === 0) return null;
  const date = today ?? todayInFamilyTz(now);
  if (!skipDue) {
    const due = pool.filter((s) => isReviewDueOn(statuses[s.id], date, settings)).sort(byEffectiveReview(statuses, date, settings));
    if (due.length) return { skill: due[0], mode: "review" };
  }

  const learnable = learnableChoice(pool, statuses);
  if (learnable) return learnable;

  const mastered = pool.filter((s) => statuses[s.id]?.status === "mastered").sort(byNextReview(statuses));
  if (mastered.length) return { skill: mastered[0], mode: "review" };

  // Only locked skills left (catalog oddity) — practice the lowest one anyway.
  return { skill: pool.slice().sort(byGrade)[0], mode: "learn" };
}

/**
 * Friday "mix-up": mastered skills, most overdue first, up to `max`, ONE SKILL
 * PER GENERATOR (no generator twice; a second skill on a generator is left
 * out rather than served as the same item type again). With `reopenWeakest`
 * (last Friday of the month) the weakest skills (lowest window accuracy, one
 * per generator) lead the list — the silent monthly reopen.
 */
export function mixupSkills(catalog: Skill[], statuses: ProgressMap, max = MIXUP_SET_SIZE, reopenWeakest = 0): Skill[] {
  const mastered = catalog.filter((s) => statuses[s.id]?.status === "mastered").sort(byNextReview(statuses));
  const weakest =
    reopenWeakest > 0
      ? distinctGenerators(
          mastered
            .slice()
            .sort((a, b) => windowAccuracy(statuses[a.id].window) - windowAccuracy(statuses[b.id].window) || byNextReview(statuses)(a, b))
        ).slice(0, reopenWeakest)
      : [];
  return distinctGenerators([...weakest, ...mastered.filter((s) => !weakest.includes(s))]).slice(0, max);
}

/**
 * True for a Friday mix-up block (it carries skillIds), whatever the number of
 * skills in it. A mix-up's results update each skill's window and streak ONLY
 * (applyResult in review mode): they NEVER advance, halve or demote a spaced
 * review interval (no applyReviewSet), however many mastered skills it covers
 * and even when it ended up with a single skill. The player decides mix-up
 * grading with this, never with `skills.length > 1`.
 */
export function isMixupBlock(block: Pick<MissionBlock, "skillIds"> | null | undefined): boolean {
  return !!block && Array.isArray(block.skillIds);
}

export interface BrainRotationDay {
  /** CogAT family of the day */
  family: "verbal" | "spatial" | "quantitative" | "figural";
  /** parent-facing label */
  label: string;
  /** reasoning generator ids of the family */
  generators: readonly string[];
}

/**
 * Weekday brain rotation (design §9, parent guides), keyed by weekdayIndexMon
 * (0 = Monday). Friday is the mix-up and weekends are free choice, so they have
 * no entry.
 */
export const BRAIN_ROTATION: Readonly<Record<number, BrainRotationDay>> = {
  0: { family: "verbal", label: "Verbal: analogies, classification, sentences", generators: ["r.verbalAnalogies", "r.verbalClassification", "r.sentenceCompletion"] },
  1: { family: "spatial", label: "Paper folding and rotation", generators: ["r.paperFolding", "r.mentalRotation"] },
  2: { family: "quantitative", label: "Number puzzles: series, analogies, puzzles", generators: ["r.numberSeries", "r.numberAnalogies", "r.numberPuzzles"] },
  3: {
    family: "figural",
    label: "Figures and logic: matrices, classification, series, patterns, logic",
    generators: ["r.figureMatrix", "r.figureClassification", "r.figureSeries", "r.patternCompletion", "r.oddOneOut", "r.sudoku4", "r.logicGrid"],
  },
};

/** Today's brain-rotation family (Mon-Thu), or null on Friday and weekends. */
export function brainRotationFor(date: string): BrainRotationDay | null {
  return BRAIN_ROTATION[weekdayIndexMon(date)] ?? null;
}

export interface PlanOptions {
  /** Light week "review-only" (defaults to settings.lightWeeks for the date). */
  reviewOnly?: boolean;
  /** Lily's homework rule (design §14.7): tonight's app math is review-only. */
  mathReviewOnly?: boolean;
}

/** Due review sets a block may run before (or instead of) its new-skill portion. */
export function reviewCapFor(date: string): number {
  return isWeekend(date) ? REVIEW_WEEKEND_CAP : isFriday(date) ? REVIEW_FRIDAY_CAP : REVIEW_NIGHT_CAP;
}

/**
 * Build today's mission: Math → Reading/Phonics → Brain. Each kind becomes one
 * or more blocks: its due 4-item review sets first (reviews before new
 * learning, see the header for the caps), then the new-skill portion with the
 * remaining minutes. Works with any catalog (pass `catalogFor(slug)`), respects
 * settings.blocks / settings.weekend minutes and settings.targetGrade. Due
 * reviews are pause-aware (isReviewDueOn with `settings`).
 *
 * No generator twice in a mission: review sets, the new skill and the mix-up
 * each take a generator once. A due set whose generator is already planned
 * tonight waits for the next night (it stays due). When a due set shares the
 * generator of the block's new skill (typically the prerequisite of the skill
 * that just unlocked), the next due set takes its place; when there is none,
 * the review waits and the new skill keeps its slot. A school night with three
 * due sets (one per generator) still drops the new skill for them.
 *
 * Friday's brain block is the mix-up when at least MIXUP_MIN_SKILLS mastered
 * skills on unused generators exist; otherwise it is planned like any other
 * night's brain block. Mon-Thu the brain block's new skill prefers the
 * weekday's reasoning family (BRAIN_ROTATION), else any eligible reasoning
 * skill. The skip check is offered on weekends only. `today` is the YYYY-MM-DD
 * date in the family timezone (derived from `now` when omitted).
 */
export function planMission(
  catalog: Skill[],
  progressMap: ProgressMap,
  settings: LearnerSettings,
  now: Date,
  today?: string,
  opts: PlanOptions = {}
): Mission {
  const statuses = deriveStatuses(catalog, progressMap);
  const blocks: MissionBlock[] = [];
  const date = today ?? todayInFamilyTz(now);
  const weekend = isWeekend(date);
  const friday = isFriday(date);
  const reviewOnlyDay = opts.reviewOnly ?? lightWeekMode(settings, date) === "review-only";
  const cap = reviewCapFor(date);
  const usedGenerators = new Set<string>();
  const usedSkills = new Set<string>();
  const sortDue = byEffectiveReview(statuses, date, settings);

  for (const kind of BLOCK_ORDER) {
    const planned = weekend ? (settings.weekend?.[kind] ?? settings.blocks?.[kind]) : settings.blocks?.[kind];
    const minutes = Math.max(0, Math.round(planned ?? 0));
    if (minutes <= 0) continue;
    const subjectPool = catalog.filter((s) => BLOCK_SUBJECTS[kind].includes(s.subject));

    if (kind === "brain" && friday) {
      const last = isLastFridayOfMonth(date);
      const size = last ? MIXUP_LAST_FRIDAY_SIZE : MIXUP_SET_SIZE;
      const mixPool = catalog.filter((s) => !usedGenerators.has(s.generator) && !usedSkills.has(s.id));
      const mix = mixupSkills(mixPool, statuses, size, last ? MIXUP_REOPEN_WEAKEST : 0);
      if (mix.length >= MIXUP_MIN_SKILLS) {
        for (const s of mix) usedGenerators.add(s.generator);
        blocks.push({
          kind,
          subject: mix[0].subject,
          skillId: mix[0].id,
          skillIds: mix.map((s) => s.id),
          mode: "review",
          minutes,
          items: size,
          label: `${BLOCK_LABEL[kind]} · Mix-up Review`,
          offerTestOut: false,
        });
        continue;
      }
      // Fewer than 2 skills left for a mix-up: tonight's brain block is an ordinary one (below).
    }

    const reviewOnly = reviewOnlyDay || (kind === "math" && !!opts.mathReviewOnly);
    const due = subjectPool.filter((s) => !usedSkills.has(s.id) && isReviewDueOn(statuses[s.id], date, settings)).sort(sortDue);
    // One due set per generator, never on a generator an earlier block planned; the rest stay due for the next night.
    const dueSets = distinctGenerators(due, usedGenerators);

    const target =
      kind === "math"
        ? settings.targetGrade?.math
        : kind === "reading"
          ? settings.targetGrade?.reading
          : settings.targetGrade?.reasoning;

    let pool = subjectPool.filter((s) => !usedSkills.has(s.id));
    if (kind === "reading") {
      const writing = pool.filter((s) => s.subject === "writing" && ["ready", "learning"].includes(statuses[s.id]?.status ?? ""));
      // Writing prompts are a weekly thing: prefer them on the writing day, skip them otherwise.
      pool = friday && writing.length ? writing : pool.filter((s) => s.subject !== "writing");
    }
    const graded = typeof target === "number" ? pool.filter((s) => s.grade <= target) : pool;
    const scoped = graded.length ? graded : pool;

    // Tonight's new skill (before the review sets, so a same-generator due set cannot knock it out).
    let candidate: Choice | null = null;
    if (!reviewOnly) {
      const freshPool = scoped.filter((s) => !usedGenerators.has(s.generator));
      const rotation = kind === "brain" ? brainRotationFor(date) : null;
      if (rotation) candidate = learnableChoice(freshPool.filter((s) => rotation.generators.includes(s.generator)), statuses);
      candidate = candidate ?? learnableChoice(freshPool, statuses);
    }

    let sets: Skill[];
    let learn: boolean;
    if (reviewOnly) {
      sets = dueSets.slice(0, weekend || friday ? cap : REVIEW_REPLACE_AT);
      if (sets.length === 0) {
        const left = subjectPool.filter((s) => !usedSkills.has(s.id) && statuses[s.id]?.status === "mastered").sort(sortDue);
        const bonus = left.find((s) => !usedGenerators.has(s.generator)) ?? left[0];
        if (bonus) sets = [bonus];
      }
      learn = false;
    } else if (!weekend && !friday && dueSets.length >= REVIEW_REPLACE_AT) {
      sets = dueSets.slice(0, REVIEW_REPLACE_AT);
      learn = false;
    } else {
      // A due set on the new skill's generator gives way to the next due set; with none left it waits a night.
      const newGenerator = candidate?.skill.generator;
      sets = dueSets.filter((s) => s.generator !== newGenerator).slice(0, cap);
      learn = true;
    }
    let learnMinutes = learn ? minutes - sets.length * REVIEW_SET_MINUTES : 0;
    if (learn && sets.length > 0 && learnMinutes < MIN_LEARN_MINUTES) {
      learn = false;
      learnMinutes = 0;
    }
    const setMinutes = learn ? REVIEW_SET_MINUTES : Math.max(2, Math.round(minutes / Math.max(1, sets.length)));
    for (const s of sets) {
      usedGenerators.add(s.generator);
      usedSkills.add(s.id);
      blocks.push({
        kind,
        subject: s.subject,
        skillId: s.id,
        mode: "review",
        minutes: setMinutes,
        items: REVIEW_SET_SIZE,
        label: `${BLOCK_LABEL[kind]} · Review · ${s.kidTitle}`,
        offerTestOut: false,
      });
    }
    if (!learn) continue;

    let choice = candidate;
    if (!choice) {
      // Nothing ready or learning on a free generator: a bonus review (or, failing that, any skill).
      const left = scoped.filter((s) => !usedSkills.has(s.id));
      const fresh = left.filter((s) => !usedGenerators.has(s.generator));
      choice = chooseSkillForBlock(fresh.length ? fresh : left, statuses, now, true, settings, date);
    }
    if (!choice) continue;
    usedGenerators.add(choice.skill.generator);
    usedSkills.add(choice.skill.id);

    blocks.push({
      kind,
      subject: choice.skill.subject,
      skillId: choice.skill.id,
      mode: choice.mode,
      minutes: learnMinutes,
      items: choice.mode === "review" ? REVIEW_SET_SIZE : undefined,
      label: `${BLOCK_LABEL[kind]} · ${choice.skill.kidTitle}`,
      // Skip checks and level-ups belong to the weekend set (design §14.4); a quick / hole fill is re-checked.
      offerTestOut: weekend && ((choice.offerTestOut ?? false) || needsSkipCheckFollowUp(statuses[choice.skill.id])),
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

/** The kinds a mission's blocks cover, in order, and whether each is fully done (a "base" / "petal"). */
export function kindProgress(blocks: { kind: BlockKind; done: boolean }[]): { kind: BlockKind; done: boolean; total: number; doneCount: number }[] {
  return BLOCK_ORDER.filter((k) => blocks.some((b) => b.kind === k)).map((kind) => {
    const of = blocks.filter((b) => b.kind === kind);
    const doneCount = of.filter((b) => b.done).length;
    return { kind, done: doneCount === of.length, total: of.length, doneCount };
  });
}

/** Four school-night stars Monday-Thursday make Friday optional ("Friday Free"). */
export const FRIDAY_FREE_NIGHTS = 4;

function isDoneSession(s: SessionRecord): boolean {
  return s.completed || s.status === "done";
}

/** Friday Free for the week of `friday` (sessions Mon-Thu closed). */
export function isFridayFree(sessions: SessionRecord[], date: string): boolean {
  if (!isFriday(date)) return false;
  const done = new Set(sessions.filter(isDoneSession).map((s) => s.date));
  let nights = 0;
  for (let i = 1; i <= 4; i++) if (done.has(addDaysToDateStr(date, -i))) nights += 1;
  return nights >= FRIDAY_FREE_NIGHTS;
}

/**
 * Streak flame: consecutive "done" days ending today (or yesterday when today is
 * not done yet). Skipped / vacation / partial days, paused days, weekend days
 * and a Friday Free FREEZE the count (stepped over, not reset); days before the
 * first session end the walk; a school night with nothing done breaks it.
 * Same walk as streakInfo (without a loaded window); kept for compatibility.
 */
export function streakFromSessions(sessions: SessionRecord[], today: string, settings?: PauseSettings | null): number {
  return streakInfo(sessions, today, settings).streak;
}

export interface StreakInfo {
  /** consecutive done days (the streakFromSessions rule) */
  streak: number;
  /**
   * true when the walk ended on a real break (a school night with nothing done)
   * or at the start of the learner's history; false when it ran past
   * `loadedFrom` without a break — older sessions that were not loaded could
   * make the streak longer (it is then a lower bound: load more and recompute).
   */
  complete: boolean;
}

/**
 * The streak plus whether it is complete. Pass `loadedFrom`, the lower date
 * bound of the sessions query, whenever `sessions` is a window (e.g. the last
 * 60 days); every session on or after it must be included. The walk then
 * continues below the oldest row down to `loadedFrom` (an empty school night
 * there breaks it), and reaching `loadedFrom` unbroken gives complete = false.
 * Without `loadedFrom` the sessions are taken as the whole history: days before
 * the first session end the walk and the result is complete.
 */
export function streakInfo(sessions: SessionRecord[], today: string, settings?: PauseSettings | null, loadedFrom?: string | null): StreakInfo {
  const byDate = new Map<string, SessionRecord>();
  for (const s of sessions) byDate.set(s.date, s);
  if (byDate.size === 0 && !loadedFrom) return { streak: 0, complete: true };
  const first = [...byDate.keys()].sort()[0] ?? today;
  // With a window, the walk may go below the oldest row (those days are known to be empty) down to the window's start.
  const floor = loadedFrom && loadedFrom < first ? loadedFrom : first;
  const isFrozen = (date: string, s: SessionRecord | undefined) =>
    (s ? s.status === "skipped" || s.status === "vacation" || s.status === "partial" : false) ||
    isWeekend(date) ||
    isFridayFree(sessions, date) ||
    (!!settings && isPaused(settings, date, today));

  let streak = 0;
  let cursor = today;
  for (let i = 0; i < MAX_DAY_WALK; i++) {
    if (cursor < floor) return { streak, complete: !loadedFrom };
    const s = byDate.get(cursor);
    if (s && isDoneSession(s)) streak += 1;
    else if (cursor === today || isFrozen(cursor, s)) {
      // today not finished yet, or a frozen day: neither counts nor breaks
    } else return { streak, complete: true };
    cursor = addDaysToDateStr(cursor, -1);
  }
  return { streak, complete: false };
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

/** XP for one answer: 1 independent, 0.5 helped (hint / taught), 0 for a miss. */
export function xpFor(correct: boolean, helpLevel: HelpLevel = "independent"): number {
  if (!correct) return 0;
  return helpLevel === "independent" ? XP.item : XP.item * XP.helpedFactor;
}

/** Replay decay factor for a set when `setsBefore` sets of the same skill were already done today. */
export function replayFactor(setsBefore: number): number {
  const i = Math.max(0, Math.floor(setsBefore || 0));
  return REPLAY_XP[Math.min(i, REPLAY_XP.length - 1)];
}

/** A finished set's XP (whole number for the ledger): item XP × replay factor, plus effort XP when stuck. */
export function blockXp(itemXp: number, setsBefore: number, stuck = false): number {
  return Math.round(Math.max(0, itemXp) * replayFactor(setsBefore)) + (stuck ? XP.effort : 0);
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

/** The level ladder for a theme (custom ladder first, else the levels theme's default). */
export function ladderFor(theme: Pick<LearnerTheme, "ladder" | "levels"> | undefined): readonly string[] {
  if (theme?.ladder && theme.ladder.length > 0) return theme.ladder;
  return LADDERS[theme?.levels ?? "generic"] ?? LEVEL_NAMES;
}

/** A level every 500 XP, named from the ladder ("All-Star 2" past its end). */
export function levelFor(xp: number, ladder: readonly string[] = LEVEL_NAMES): LevelInfo {
  const names = ladder.length > 0 ? ladder : LEVEL_NAMES;
  const safe = Math.max(0, Math.floor(xp || 0));
  const level = Math.floor(safe / LEVEL_XP) + 1;
  const xpStart = (level - 1) * LEVEL_XP;
  const xpNext = level * LEVEL_XP;
  const name = level <= names.length ? names[level - 1] : `${names[names.length - 1]} ${level - names.length + 1}`;
  return { level, name, xpStart, xpNext, progress: (safe - xpStart) / LEVEL_XP };
}

/**
 * How many questions a block should run. Review = the 4-item set, skip check =
 * 10, learn ≈ 1.2 items per minute (floor 5, no ceiling: the timer ends a learn
 * block once it has 5 items). `items` (from the mission block) wins when given.
 */
export function questionTargetFor(mode: PracticeMode, minutes: number, items?: number): number {
  if (typeof items === "number" && items > 0) return items;
  if (mode === "test") return SKIP_CHECK_ITEMS;
  if (mode === "review") return REVIEW_SET_SIZE;
  return Math.max(MIN_BLOCK_ITEMS, Math.round(minutes * 1.2));
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
    pausedFrom: null,
    vacations: [],
    lightWeeks: DEFAULT_LIGHT_WEEKS.map((w) => ({ ...w })),
    theme: early
      ? { currency: "Sparkle Points", levels: "ballet", ladder: [...LADDERS.ballet], timeBack: TIME_BACK.lily, screen: "tutu" }
      : { currency: "Lightning Bucks", levels: "baseball", ladder: [...LADDERS.baseball], timeBack: TIME_BACK.cole, screen: "diamond" },
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
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const vacations = Array.isArray(r.vacations)
    ? r.vacations
        .map((v) => obj(v))
        .filter((v) => isDate(v.from) && isDate(v.to) && (v.from as string) <= (v.to as string))
        .map((v) => ({ from: v.from as string, to: v.to as string }))
    : [];
  const lightWeeks: LightWeek[] = Array.isArray(r.lightWeeks)
    ? r.lightWeeks
        .map((v) => obj(v))
        .filter((v) => isDate(v.from) && isDate(v.to) && (v.from as string) <= (v.to as string))
        .map((v) => ({ from: v.from as string, to: v.to as string, mode: v.mode === "off" ? ("off" as const) : ("review-only" as const) }))
    : (d.lightWeeks ?? []);
  const levels = theme.levels === "baseball" || theme.levels === "ballet" || theme.levels === "generic" ? theme.levels : d.theme.levels;
  const ladder = Array.isArray(theme.ladder)
    ? theme.ladder.filter((n): n is string => typeof n === "string" && n.trim().length > 0).map((n) => n.trim().slice(0, 40)).slice(0, 12)
    : [];
  const screen = theme.screen === "diamond" || theme.screen === "tutu" || theme.screen === "generic" ? theme.screen : d.theme.screen;
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
    pausedFrom: dateOrNull(r.pausedFrom),
    vacations,
    lightWeeks,
    theme: {
      currency: text(theme.currency, 40) ?? d.theme.currency,
      levels,
      ladder: ladder.length > 0 ? ladder : [...(levels === d.theme.levels ? (d.theme.ladder ?? LADDERS[levels]) : LADDERS[levels])],
      timeBack: typeof theme.timeBack === "string" ? theme.timeBack.trim().slice(0, 120) : d.theme.timeBack,
      screen,
    },
    autoSpeak: typeof r.autoSpeak === "boolean" ? r.autoSpeak : d.autoSpeak,
  };
}
