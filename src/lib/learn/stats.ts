/**
 * Session / dashboard statistics — pure helpers shared by server pages and
 * client views. Relative imports only (Node-importable: the self-check runs them).
 */

import type { BlockKind, Learner, LearnerSettings, Mission, MissionBlock, ProgressMap, RewardRecord, SessionBlock, SessionRecord, Skill } from "./types";
import {
  addDaysToDateStr,
  familyDateOfIso,
  formatClockMinutes,
  isFriday,
  isWeekend,
  minutesSinceMidnightInFamilyTz,
  parseClock,
  previousSchoolDay,
  weekDates,
} from "./dates";
import {
  BLOCK_ORDER,
  isFridayFree,
  isPaused,
  isReviewDue,
  kindProgress,
  minutesUntilStopBy,
  pauseEndDate,
  planMission,
  streakFromSessions,
  windowAccuracy,
  type PauseSettings,
} from "./mastery";

export { isPaused, isWeekend };

export type TodayStatus = "done" | "in-progress" | "not-started";

export function sessionForDate(sessions: SessionRecord[], date: string): SessionRecord | null {
  return sessions.find((s) => s.date === date) ?? null;
}

/** Today's status by kind ("bases"): blocksDone / blocksTotal count math / reading / brain, not review sets. */
export function todayStatus(session: SessionRecord | null): {
  status: TodayStatus;
  blocksDone: number;
  blocksTotal: number;
} {
  if (!session) return { status: "not-started", blocksDone: 0, blocksTotal: 0 };
  const kinds = kindProgress(session.blocks);
  const blocksTotal = kinds.length;
  const blocksDone = kinds.filter((k) => k.done).length;
  if (session.completed || session.status === "done" || (blocksTotal > 0 && blocksDone >= blocksTotal)) {
    return { status: "done", blocksDone, blocksTotal };
  }
  const started = session.blocks.some((b) => b.done) || session.minutes > 0;
  return { status: started ? "in-progress" : "not-started", blocksDone, blocksTotal };
}

/**
 * Streak flame: consecutive "done" days ending today or yesterday. Skipped,
 * partial, vacation, weekend and Friday-Free days freeze it (pass the learner's
 * settings so paused days are stepped over). The rule lives in the engine.
 */
export function computeStreak(sessions: SessionRecord[], today: string, settings?: PauseSettings | null): number {
  return streakFromSessions(sessions, today, settings ?? null);
}

export function minutesThisWeek(sessions: SessionRecord[], today: string): number {
  const week = new Set(weekDates(today));
  return sessions.filter((s) => week.has(s.date)).reduce((sum, s) => sum + (s.minutes || 0), 0);
}

export function xpThisWeek(sessions: SessionRecord[], today: string): number {
  const week = new Set(weekDates(today));
  return sessions.filter((s) => week.has(s.date)).reduce((sum, s) => sum + (s.xp || 0), 0);
}

export function daysPracticedThisWeek(sessions: SessionRecord[], today: string): boolean[] {
  const byDate = new Map(sessions.map((s) => [s.date, s]));
  return weekDates(today).map((d) => {
    const s = byDate.get(d);
    return !!s && (s.completed || s.minutes > 0);
  });
}

export function masteryPercent(catalog: Skill[], progressMap: ProgressMap): number {
  if (catalog.length === 0) return 0;
  const mastered = catalog.filter((s) => progressMap[s.id]?.status === "mastered").length;
  return Math.round((100 * mastered) / catalog.length);
}

export function masteredCount(catalog: Skill[], progressMap: ProgressMap): number {
  return catalog.filter((s) => progressMap[s.id]?.status === "mastered").length;
}

export function reviewDueCount(catalog: Skill[], progressMap: ProgressMap, now: Date): number {
  return catalog.filter((s) => isReviewDue(progressMap[s.id], now)).length;
}

/** Skills mastered this family week (masteredAt read as a family-timezone date, not UTC). */
export function masteredThisWeek(catalog: Skill[], progressMap: ProgressMap, today: string): Skill[] {
  const week = new Set(weekDates(today));
  return catalog.filter((s) => {
    const p = progressMap[s.id];
    return p?.status === "mastered" && week.has(familyDateOfIso(p.masteredAt));
  });
}

// ---------------------------------------------------------------------------
// One-adult rotation plan
// ---------------------------------------------------------------------------

export interface RotationTurn {
  /** 1-based */
  index: number;
  learnerSlug: string;
  learnerName: string;
  kind: BlockKind;
  /** the kid's main block of this kind (the new-skill portion when there is one) */
  block: MissionBlock;
  /** every block of this kind for the kid (review sets + new skill) */
  blocks: MissionBlock[];
  /** which of this kid's turns in the kind this is (1-based) */
  part: number;
  parts: number;
  minutes: number;
  /** minutes from the start of the evening */
  startMinute: number;
}

/**
 * The one-adult rotation (design §2.1): the kids work the same kind of block in
 * parallel; the adult splits that block's wall time between them, younger
 * child first ("0-6 Lily math, 6-12 Cole math, … 24-27 Lily brain, 27-30 Cole
 * brain"). A kind's wall time is the longest of the kids' minutes for it; each
 * kid's share is cut into turns of about `turnMinutes` (weekday 6, weekend 7-8).
 * Pass the kids youngest first.
 */
export function rotationPlan(kids: { slug: string; name: string; mission: Mission }[], turnMinutes = 6): RotationTurn[] {
  const turns: RotationTurn[] = [];
  let clock = 0;
  for (const kind of BLOCK_ORDER) {
    const active = kids
      .map((k) => ({ kid: k, blocks: k.mission.blocks.filter((b) => b.kind === kind) }))
      .filter((x) => x.blocks.length > 0);
    if (active.length === 0) continue;
    const wall = Math.max(...active.map((x) => x.blocks.reduce((s, b) => s + b.minutes, 0)));
    const share = wall / active.length;
    const parts = Math.max(1, Math.round(share / Math.max(1, turnMinutes)));
    const per = share / parts;
    for (let part = 1; part <= parts; part++) {
      for (const x of active) {
        const start = Math.round(clock);
        clock += per;
        const main = x.blocks.find((b) => b.mode !== "review" || !!b.skillIds) ?? x.blocks[0];
        turns.push({
          index: turns.length + 1,
          learnerSlug: x.kid.slug,
          learnerName: x.kid.name,
          kind,
          block: main,
          blocks: x.blocks,
          part,
          parts,
          minutes: Math.round(clock) - start,
          startMinute: start,
        });
      }
    }
  }
  return turns;
}

/** A school night starting at or after this clock is a fallback night: no movement break (lead ruling, design §2.1). */
export const FALLBACK_NO_BREAK_FROM = "19:55";

/**
 * When tonight's evening started (minutes since midnight, family time): the
 * first block finished today minus its minutes, else `now` (nothing started yet).
 */
export function eveningStartMinutes(todaySessions: (SessionRecord | null | undefined)[], now: Date): number {
  let start = minutesSinceMidnightInFamilyTz(now);
  for (const s of todaySessions) {
    if (!s?.createdAt || !s.blocks.some((b) => b.done)) continue;
    const created = new Date(s.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    const firstDone = s.blocks.find((b) => b.done);
    start = Math.min(start, minutesSinceMidnightInFamilyTz(created) - (firstDone?.minutes_spent ?? firstDone?.minutes ?? 0));
  }
  return Math.max(0, start);
}

/**
 * The break the rotation shows after a block, outside the 30 / 105 minutes:
 * school nights 2 minutes after math (none on a fallback night starting at or
 * after 19:55); the weekend set 10 minutes after math and after reading.
 */
export function breakAfter(kind: BlockKind, weekend: boolean, eveningStart: number): number {
  if (weekend) return kind === "brain" ? 0 : 10;
  if (kind !== "math") return 0;
  return eveningStart >= (parseClock(FALLBACK_NO_BREAK_FROM) ?? 1195) ? 0 : 2;
}

// ---------------------------------------------------------------------------
// Weekly ring (five stars), Friday Free, bonus set
// ---------------------------------------------------------------------------

/** A star: the day's mission was closed (every block done). Skipped / vacation rows never count. */
export function sessionCounts(s: SessionRecord | null | undefined): boolean {
  if (!s) return false;
  if (s.status === "skipped" || s.status === "vacation") return false;
  if (s.completed || s.status === "done") return true;
  return s.blocks.length > 0 && s.blocks.every((b) => b.done);
}

export const RING_CLOSE_AT = 5;

export interface WeeklyRing {
  /** stars this week, capped at 5 (closed school nights + completed weekend sets) */
  stars: number;
  /** always 5 */
  target: number;
  /** closed school nights (Mon-Fri) */
  nights: number;
  /** completed weekend sets (Sat/Sun) */
  sets: number;
  /** five stars in */
  closed: boolean;
  /** four night stars by Thursday: Friday's mission is optional */
  fridayFree: boolean;
  /** Mon..Sun: a star that day */
  days: boolean[];
}

/** Five stars a week (design §0): one per closed school night, one per completed weekend set; closes at 5. */
export function weeklyRing(sessions: SessionRecord[], today: string): WeeklyRing {
  const byDate = new Map(sessions.map((s) => [s.date, s]));
  const week = weekDates(today);
  const days = week.map((d) => sessionCounts(byDate.get(d)));
  const nights = days.slice(0, 5).filter(Boolean).length;
  const sets = days.slice(5).filter(Boolean).length;
  const stars = Math.min(RING_CLOSE_AT, nights + sets);
  return { stars, target: RING_CLOSE_AT, nights, sets, closed: nights + sets >= RING_CLOSE_AT, fridayFree: isFridayFree(sessions, week[4]), days };
}

export type MissionRole = "required" | "optional" | "bonus";

/**
 * What today's mission is for the ring: "optional" on a Friday Free, "bonus" on
 * a weekend day once the ring closed before today, else "required".
 */
export function missionRole(sessions: SessionRecord[], today: string): MissionRole {
  if (isFriday(today) && isFridayFree(sessions, today)) return "optional";
  if (isWeekend(today)) {
    const before = weeklyRing(
      sessions.filter((s) => s.date < today),
      today
    );
    if (before.closed) return "bonus";
  }
  return "required";
}

/** The first day after the pause covering `today`, formatted ("Jan 2"); works for pausedUntil, vacations and "off" light weeks. */
export function vacationReturnLabel(settings: PauseSettings, today: string): string {
  const end = pauseEndDate(settings, today) ?? today;
  return formatDateStr(addDaysToDateStr(end, 1));
}

/** "Oct 12" / "Oct 12, 2026" for a YYYY-MM-DD string (no timezone drift). */
export function formatDateStr(dateStr: string, withYear = false): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

/** Minutes since midnight for `now` in the family timezone. */
export function familyClockMinutes(now: Date): number {
  return minutesSinceMidnightInFamilyTz(now);
}

/** Minutes left until `stopBy` ("HH:MM") in the family timezone; negative once it has passed. */
export function minutesUntil(stopBy: string, now: Date): number {
  const left = minutesUntilStopBy(now, stopBy);
  return Number.isFinite(left) ? left : 0;
}

/** "20:30" → "8:30 pm" */
export function formatClockLabel(hhmm: string): string {
  const m = parseClock(hhmm);
  return m === null ? hhmm : formatClockMinutes(m);
}

// ---------------------------------------------------------------------------
// Input points (the currency) — design §4
// ---------------------------------------------------------------------------

export type PointKind = "block" | "ontime" | "review" | "book" | "workshop" | "bonus";

export const POINTS = {
  block: 1,
  /** pt:block at most 3 a day */
  blockMaxPerDay: 3,
  ontime: 1,
  /** the first block of the day must start by this family-time clock */
  onTimeBy: "19:20",
  review: 1,
  book: 2,
  workshop: 3,
  bonus: 1,
  weeklyCap: 25,
} as const;

/** Per-day caps by kind (undefined = no daily cap, only the weekly one). */
const DAILY_CAP: Partial<Record<PointKind, number>> = { block: POINTS.blockMaxPerDay, ontime: 1, bonus: 1 };

/** A learn_notes "book" row whose text starts with this marks a finished book (2 points). */
export const BOOK_FINISHED_PREFIX = "Finished:";

export function isPointRow(r: Pick<RewardRecord, "reason">): boolean {
  return r.reason.startsWith("pt:");
}

/** "pt:block:math" → "block" */
export function pointKindOf(r: Pick<RewardRecord, "reason">): string {
  return isPointRow(r) ? (r.reason.split(":")[1] ?? "") : "";
}

/** The ledger reason for a point row: "pt:<kind>" plus an optional detail ("pt:block:math", "pt:workshop:map-maker"). */
export function pointReason(kind: PointKind, detail?: string): string {
  return detail ? `pt:${kind}:${detail}` : `pt:${kind}`;
}

/** Points earned this family week (Mon-Sun) from ledger rows. */
export function weekPoints(rows: RewardRecord[], today: string): number {
  const week = new Set(weekDates(today));
  return rows.filter((r) => isPointRow(r) && week.has(familyDateOfIso(r.createdAt))).reduce((s, r) => s + Math.max(0, r.delta), 0);
}

/**
 * How many of `amount` points of `kind` may be written now: daily caps (block 3,
 * ontime 1, bonus 1 per day) and the weekly cap of 25 (Mon-Sun, family time).
 * `rows` are the learner's ledger rows (any range covering this week); rows
 * without createdAt count as written today.
 */
export function pointsAllowed(rows: RewardRecord[], kind: PointKind, amount: number, today: string): number {
  if (!(amount > 0)) return 0;
  const week = new Set(weekDates(today));
  const pts = rows.filter(isPointRow).map((r) => ({ r, date: r.createdAt ? familyDateOfIso(r.createdAt) : today }));
  const weekTotal = pts.filter((x) => week.has(x.date)).reduce((s, x) => s + Math.max(0, x.r.delta), 0);
  let allowed = Math.floor(amount);
  const dayCap = DAILY_CAP[kind];
  if (dayCap !== undefined) {
    const dayTotal = pts.filter((x) => x.date === today && pointKindOf(x.r) === kind).reduce((s, x) => s + Math.max(0, x.r.delta), 0);
    allowed = Math.min(allowed, dayCap - dayTotal);
  }
  allowed = Math.min(allowed, POINTS.weeklyCap - weekTotal);
  return Math.max(0, allowed);
}

/** On time: the day's first block started by 19:20 family time. */
export function startedOnTime(startedAt: Date): boolean {
  const by = parseClock(POINTS.onTimeBy) ?? 0;
  return minutesSinceMidnightInFamilyTz(startedAt) <= by;
}

export interface Wallet {
  /** XP for the level ladder: every non-point, non-redeem ledger row */
  xp: number;
  /** points ever earned (pt: rows) */
  earned: number;
  /** points spent on rewards (redemptions in the points era) */
  spent: number;
  /** earned − spent */
  balance: number;
}

/**
 * Wallet from the ledger and the redemptions. Redemptions made before the
 * learner's first point row belong to the retired XP-priced store (they were
 * paid with a negative XP row) and are not charged against points.
 */
export function walletFrom(rows: RewardRecord[], redemptions: { cost: number; createdAt?: string }[]): Wallet {
  let xp = 0;
  let earned = 0;
  let firstPt: string | null = null;
  for (const r of rows) {
    if (isPointRow(r)) {
      earned += Math.max(0, r.delta);
      if (r.createdAt && (firstPt === null || r.createdAt < firstPt)) firstPt = r.createdAt;
    } else if (!r.reason.startsWith("redeem:")) {
      xp += r.delta;
    }
  }
  const spent =
    earned > 0
      ? redemptions.filter((d) => firstPt === null || !d.createdAt || new Date(d.createdAt).getTime() >= new Date(firstPt).getTime()).reduce((s, d) => s + Math.max(0, d.cost), 0)
      : 0;
  return { xp: Math.max(0, xp), earned, spent, balance: earned - spent };
}

// ---------------------------------------------------------------------------
// Lily's homework rule, today's blocks, the two-line launch
// ---------------------------------------------------------------------------

/** The smallest note shape these helpers read (LearnNote satisfies it). */
export interface NoteLike {
  date: string;
  kind: string;
  subject: string | null;
  text: string | null;
  minutes: number;
}

/** Homework that takes more than this many of her 12 math minutes counts toward the rule. */
export const HOMEWORK_MATH_LIMIT = 8;

export function homeworkMathMinutes(notes: NoteLike[], date: string): number {
  return notes.filter((n) => n.kind === "homework" && n.subject === "math" && n.date === date).reduce((s, n) => s + (n.minutes || 0), 0);
}

/**
 * Design §14.7: when the school sheet took more than 8 of her 12 math minutes two
 * nights running (tonight and the previous school night), tonight's app math is
 * review-only and new learning waits for the weekend set.
 */
export function homeworkReviewOnly(notes: NoteLike[], today: string): boolean {
  if (isWeekend(today)) return false;
  return homeworkMathMinutes(notes, today) > HOMEWORK_MATH_LIMIT && homeworkMathMinutes(notes, previousSchoolDay(today)) > HOMEWORK_MATH_LIMIT;
}

/** The homework rule applies to the child whose school homework comes first (grade 2 and below). */
export function homeworkFirst(learner: Pick<Learner, "grade">): boolean {
  return learner.grade <= 2;
}

/**
 * Today's blocks, one rule for every screen: the stored mission when the day has
 * one, nothing while paused, else a fresh plan (light weeks and the homework rule
 * applied). When the homework rule switches on after the mission was stored, the
 * not-yet-started math blocks are swapped for review sets.
 */
export function todaysBlocks(input: {
  learner: Pick<Learner, "grade" | "settings">;
  catalog: Skill[];
  progressMap: ProgressMap;
  sessions: SessionRecord[];
  now: Date;
  today: string;
  notes?: NoteLike[];
}): SessionBlock[] {
  const { learner, catalog, progressMap, sessions, now, today } = input;
  const mathReviewOnly = homeworkFirst(learner) && homeworkReviewOnly(input.notes ?? [], today);
  const session = sessionForDate(sessions, today);
  const plan = () => planMission(catalog, progressMap, learner.settings, now, today, { mathReviewOnly }).blocks.map((b) => ({ ...b, done: false }));
  if (session && session.blocks.length > 0) {
    const math = session.blocks.filter((b) => b.kind === "math");
    const mathStarted = math.some((b) => b.done);
    if (!mathReviewOnly || mathStarted || !math.some((b) => b.mode !== "review")) return session.blocks;
    const reviewMath = plan().filter((b) => b.kind === "math");
    const at = session.blocks.findIndex((b) => b.kind === "math");
    const rest = session.blocks.filter((b) => b.kind !== "math");
    return [...rest.slice(0, Math.max(0, at)), ...reviewMath, ...rest.slice(Math.max(0, at))];
  }
  if (isPaused(learner.settings, today)) return [];
  return plan();
}

/**
 * Which mission block a /play?block=… URL runs. A finished block is never run
 * again ("done"; "complete" when the whole mission is done) — history / reload
 * must not pay XP, points and minutes twice. A missing index means the first open block.
 */
export function resolveBlockIndex(blocks: { done: boolean }[], param: string | undefined): { index: number; state: "open" | "done" | "complete" | "empty" } {
  if (blocks.length === 0) return { index: -1, state: "empty" };
  const firstOpen = blocks.findIndex((b) => !b.done);
  const parsed = Number.parseInt(param ?? "", 10);
  const index = Number.isFinite(parsed) ? Math.min(blocks.length - 1, Math.max(0, parsed)) : Math.max(0, firstOpen);
  if (!blocks[index].done) return { index, state: "open" };
  return { index, state: firstOpen >= 0 ? "done" : "complete" };
}

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

/**
 * The two-line launch, line 1 (design §2.1): "Tonight: 1 new skill · 1 review set ·
 * 1 passage — about 30 minutes." Counts the blocks not done yet.
 */
export function missionLaunchLine(blocks: (MissionBlock & { done?: boolean })[], weekend = false): string {
  const open = blocks.filter((b) => !b.done);
  if (open.length === 0) return weekend ? "Today's set is done." : "Tonight's mission is done.";
  const parts: string[] = [];
  const learn = open.filter((b) => b.kind !== "reading" && b.mode !== "review" && !b.skillIds);
  const newSkills = learn.filter((b) => b.kind === "math").length;
  const brain = open.filter((b) => b.kind === "brain" && !b.skillIds && b.mode !== "review").length;
  const reviews = open.filter((b) => b.mode === "review" && !b.skillIds).length;
  const mixups = open.filter((b) => !!b.skillIds).length;
  const reading = open.filter((b) => b.kind === "reading" && b.mode !== "review");
  if (newSkills) parts.push(plural(newSkills, "new skill"));
  if (reviews) parts.push(plural(reviews, "review set"));
  for (const b of reading) parts.push(b.subject === "phonics" ? "1 word game" : b.subject === "writing" ? "1 writing prompt" : "1 passage");
  if (brain) parts.push(plural(brain, "brain game"));
  if (mixups) parts.push("1 mix-up");
  const minutes = open.reduce((s, b) => s + b.minutes, 0);
  return `${weekend ? "Today" : "Tonight"}: ${parts.join(" · ")} — about ${minutes} minutes.`;
}

/** Pony names for Lily's mastered skills (learn_notes kind "pony": subject = skill id, text = name; latest wins). */
export function ponyNames(notes: NoteLike[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of [...notes].reverse()) {
    if (n.kind === "pony" && n.subject && n.text) out[n.subject] = n.text;
  }
  return out;
}

/** XP ledger reason for a finished set: "<mode>:<skill>" ("mixup:<first skill>" for the Friday mix-up). */
export function xpReason(mode: "learn" | "review" | "test" | "placement" | "mixup", skillId: string): string {
  return `${mode}:${skillId}`;
}

/** Sets of `skillId` already finished today, from the XP ledger (replay decay). */
export function setsDoneToday(rows: RewardRecord[], skillId: string, today: string): number {
  const re = /^(learn|review|test|placement):(.+)$/;
  return rows.filter((r) => {
    if (isPointRow(r)) return false;
    const m = re.exec(r.reason);
    return !!m && m[2] === skillId && (r.createdAt ? familyDateOfIso(r.createdAt) === today : true);
  }).length;
}

export const PONY_NAMES: readonly string[] = [
  "Clover", "Pirouette", "Daisy", "Comet", "Biscuit", "Sparkle", "Maple", "Juniper", "Pebble", "Willow", "Starlight", "Peaches",
  "Button", "Hazel", "Twinkle", "Marshmallow", "Ribbon", "Sunny", "Velvet", "Bluebell", "Coco", "Poppy", "Snowdrop", "Tulip",
];

/** Six pony names to tap (no free text for Lily), stable per skill, skipping names already in her stable. */
export function ponyNameChoices(skillId: string, taken: string[] = [], n = 6): string[] {
  const free = PONY_NAMES.filter((name) => !taken.includes(name));
  const pool = free.length >= n ? free : [...PONY_NAMES];
  let h = 2166136261;
  for (let i = 0; i < skillId.length; i++) h = Math.imul(h ^ skillId.charCodeAt(i), 16777619) >>> 0;
  const start = h % pool.length;
  return Array.from({ length: Math.min(n, pool.length) }, (_, i) => pool[(start + i) % pool.length]);
}

/** A finished book (2 points) — a "book" note whose text starts with "Finished:". */
export function isFinishedBook(n: NoteLike): boolean {
  return n.kind === "book" && (n.text ?? "").startsWith(BOOK_FINISHED_PREFIX);
}

// ---------------------------------------------------------------------------
// Parent signals: struggle flags, quick-reply summary, kid routing
// ---------------------------------------------------------------------------

export interface StruggleFlag {
  skill: Skill;
  reasons: string[];
}

/**
 * Skills that need a parent's eyes: needs_help set by the stuck rule, two
 * failed review sets in a row (the demotion; review_misses stays at 2 until the
 * skill is mastered again), or under 60% over the last ten answers (once there
 * are at least five answers to judge from).
 */
export function struggleFlags(catalog: Skill[], progressMap: ProgressMap): StruggleFlag[] {
  const out: StruggleFlag[] = [];
  for (const skill of catalog) {
    const p = progressMap[skill.id];
    if (!p) continue;
    const reasons: string[] = [];
    if (p.needsHelp === true) reasons.push("hit the stuck rule (3 misses in a row)");
    const misses = p.reviewMisses ?? 0;
    if (misses >= 2) reasons.push(p.status === "mastered" ? `${misses} failed review sets` : `back to learning after ${misses} failed review sets`);
    if (p.window.length >= 5 && windowAccuracy(p.window) < 0.6) {
      reasons.push(`${Math.round(100 * windowAccuracy(p.window))}% over the last ${p.window.length}`);
    }
    if (reasons.length) out.push({ skill, reasons });
  }
  return out;
}

export interface QuickReplyKid {
  name: string;
  blocks: SessionBlock[];
  paused?: boolean;
  /** extra done items logged tonight, e.g. "math sheet", "OG packet" */
  extras?: string[];
}

function kindWord(kind: BlockKind): string {
  return kind === "brain" ? "thinking" : kind;
}

/**
 * The family's email quick-reply, from tonight's data (one word per kind, so
 * review sets and the new skill read as one "math"):
 *   "Cole all done. Lily math partly done, reading not done."
 */
export function quickReply(kids: QuickReplyKid[]): string {
  return kids
    .map((k) => {
      if (k.paused) return `${k.name}: vacation — not started.`;
      const extras = (k.extras ?? []).filter(Boolean);
      const kinds = BLOCK_ORDER.filter((kind) => k.blocks.some((b) => b.kind === kind)).map((kind) => {
        const of = k.blocks.filter((b) => b.kind === kind);
        const done = of.every((b) => b.done);
        const partly = !done && of.some((b) => b.done || (b.minutes_spent ?? 0) > 0 || (b.total ?? 0) > 0);
        return { kind, done, partly };
      });
      if (kinds.length === 0) return `${k.name} not started${extras.length ? ` (${extras.join(", ")} done)` : ""}.`;
      const done = kinds.filter((x) => x.done);
      if (done.length === kinds.length) return `${k.name} all done${extras.length ? ` (plus ${extras.join(", ")})` : ""}.`;
      const partly = kinds.filter((x) => x.partly);
      const notDone = kinds.filter((x) => !x.done && !x.partly);
      if (done.length === 0 && partly.length === 0 && extras.length === 0) return `${k.name} not started.`;
      const parts: string[] = [];
      if (done.length) parts.push(`${done.map((x) => kindWord(x.kind)).join(" and ")} done`);
      if (partly.length) parts.push(`${partly.map((x) => kindWord(x.kind)).join(" and ")} partly done`);
      if (notDone.length) parts.push(`${notDone.map((x) => kindWord(x.kind)).join(" and ")} not done`);
      if (extras.length) parts.push(`${extras.join(", ")} done`);
      return `${k.name} ${parts.join(", ")}.`;
    })
    .join(" ");
}

/** "cole@henderson.family" → "cole"; parents (and anyone else) → null. Shared by server pages and the nav. */
export function kidSlugForEmail(email: string | null | undefined): "cole" | "lily" | null {
  const e = (email ?? "").trim().toLowerCase();
  if (isParentEmail(e)) return null;
  if (e.startsWith("cole")) return "cole";
  if (e.startsWith("lily")) return "lily";
  return null;
}

/** Mirrors learn_is_parent() in SQL: peter@… / nicole@… or the two family Gmail addresses. */
export function isParentEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  const local = e.split("@")[0];
  return (e.includes("@") && (local === "peter" || local === "nicole")) || e === "pete.henderson@gmail.com" || e === "nicole.stein78@gmail.com";
}

/** Settings type re-export for callers that only need the pause fields. */
export type { PauseSettings };
export type { LearnerSettings };
