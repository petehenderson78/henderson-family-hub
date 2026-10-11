/**
 * Session / dashboard statistics — pure helpers shared by server pages and
 * client views. Relative imports only.
 */

import type { LearnerSettings, Mission, MissionBlock, ProgressMap, SessionBlock, SessionRecord, Skill } from "./types";
import { addDaysToDateStr, isWeekend, minutesSinceMidnightInFamilyTz, weekDates } from "./dates";
import { isPaused, isReviewDue, minutesUntilStopBy, streakFromSessions, windowAccuracy } from "./mastery";

export { isPaused, isWeekend };

export type TodayStatus = "done" | "in-progress" | "not-started";

export function sessionForDate(sessions: SessionRecord[], date: string): SessionRecord | null {
  return sessions.find((s) => s.date === date) ?? null;
}

export function todayStatus(session: SessionRecord | null): {
  status: TodayStatus;
  blocksDone: number;
  blocksTotal: number;
} {
  if (!session) return { status: "not-started", blocksDone: 0, blocksTotal: 0 };
  const blocksTotal = session.blocks.length;
  const blocksDone = session.blocks.filter((b) => b.done).length;
  if (session.completed || (blocksTotal > 0 && blocksDone >= blocksTotal)) {
    return { status: "done", blocksDone, blocksTotal };
  }
  return { status: blocksDone > 0 || session.minutes > 0 ? "in-progress" : "not-started", blocksDone, blocksTotal };
}

/**
 * Streak flame: consecutive "done" days ending today or yesterday. Skipped,
 * partial and vacation days freeze it (pass the learner's settings so paused
 * days are stepped over). The rule lives in the engine (streakFromSessions).
 */
export function computeStreak(sessions: SessionRecord[], today: string, settings?: Pick<LearnerSettings, "pausedUntil" | "vacations"> | null): number {
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

export function masteredThisWeek(catalog: Skill[], progressMap: ProgressMap, today: string): Skill[] {
  const week = new Set(weekDates(today));
  return catalog.filter((s) => {
    const at = progressMap[s.id]?.masteredAt;
    return !!at && week.has(at.slice(0, 10));
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
  block: MissionBlock;
  /** which slice of the block this is (1-based) */
  part: number;
  parts: number;
  minutes: number;
}

/**
 * Split every mission block into `turnMinutes` slices and alternate between the
 * kids: Cole Math 1 → Lily Math 1 → Cole Math 2 → Lily Math 2 → Cole Reading 1 → …
 * One parent coaches the active kid; the other kid works independently.
 */
export function rotationPlan(
  kids: { slug: string; name: string; mission: Mission }[],
  turnMinutes = 6
): RotationTurn[] {
  const slices = kids.map((kid) =>
    kid.mission.blocks.flatMap((block) => {
      const parts = Math.max(1, Math.round(block.minutes / turnMinutes));
      const per = Math.round(block.minutes / parts);
      return Array.from({ length: parts }, (_, i) => ({
        learnerSlug: kid.slug,
        learnerName: kid.name,
        block,
        part: i + 1,
        parts,
        minutes: per,
      }));
    })
  );
  const turns: RotationTurn[] = [];
  const maxLen = Math.max(0, ...slices.map((s) => s.length));
  for (let i = 0; i < maxLen; i++) {
    for (const kidSlices of slices) {
      const slice = kidSlices[i];
      if (slice) turns.push({ index: turns.length + 1, ...slice });
    }
  }
  return turns;
}

// ---------------------------------------------------------------------------
// Weekly ring, vacation, stop-by clock (kid-facing primary signal)
// ---------------------------------------------------------------------------

/** A night "counts" when the mission finished or at least one block was done (DONE stays DONE). */
export function sessionCounts(s: SessionRecord | null | undefined): boolean {
  if (!s) return false;
  if (s.status === "skipped" || s.status === "vacation") return false;
  return s.completed || s.status === "done" || s.blocks.some((b) => b.done);
}

export interface WeeklyRing {
  /** school nights (Mon–Fri) done this week */
  done: number;
  /** always 5 */
  target: number;
  /** weekend days done (shown as a bonus, never required) */
  extra: number;
  /** Mon..Sun */
  days: boolean[];
}

/** "3 of 5 school nights" — Mon–Fri count; Saturday/Sunday are extra. */
export function weeklyRing(sessions: SessionRecord[], today: string): WeeklyRing {
  const byDate = new Map(sessions.map((s) => [s.date, s]));
  const days = weekDates(today).map((d) => sessionCounts(byDate.get(d)));
  const done = days.slice(0, 5).filter(Boolean).length;
  const extra = days.slice(5).filter(Boolean).length;
  return { done, target: 5, extra, days };
}

/** The first day after the pause, formatted ("Oct 12"). */
export function vacationReturnLabel(pausedUntil: string): string {
  const back = addDaysToDateStr(pausedUntil, 1);
  return formatDateStr(back);
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
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

// ---------------------------------------------------------------------------
// Parent signals: struggle flags, quick-reply summary, kid routing
// ---------------------------------------------------------------------------

export interface StruggleFlag {
  skill: Skill;
  reasons: string[];
}

/**
 * Skills that need a parent's eyes: needs_help set by the stuck rule, two or
 * more failed review sets, or under 60% over the last ten answers (only once
 * there are at least five answers to judge from). The fields the engine may add
 * later (needsHelp, reviewMisses) are read defensively.
 */
export function struggleFlags(catalog: Skill[], progressMap: ProgressMap): StruggleFlag[] {
  const out: StruggleFlag[] = [];
  for (const skill of catalog) {
    const p = progressMap[skill.id] as (ProgressMap[string] & { needsHelp?: boolean; reviewMisses?: number }) | undefined;
    if (!p) continue;
    const reasons: string[] = [];
    if (p.needsHelp === true) reasons.push("hit the stuck rule (3 misses in a row)");
    if ((p.reviewMisses ?? 0) >= 2) reasons.push(`${p.reviewMisses} failed review sets`);
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

function blockWord(b: SessionBlock): string {
  return b.kind === "brain" ? "thinking" : b.kind;
}

/**
 * The family's email quick-reply, from tonight's data:
 *   "Cole all done. Lily math partly done, reading not done."
 */
export function quickReply(kids: QuickReplyKid[]): string {
  return kids
    .map((k) => {
      if (k.paused) return `${k.name}: vacation — not started.`;
      const extras = (k.extras ?? []).filter(Boolean);
      if (k.blocks.length === 0) return `${k.name} not started${extras.length ? ` (${extras.join(", ")} done)` : ""}.`;
      const done = k.blocks.filter((b) => b.done);
      if (done.length === k.blocks.length) return `${k.name} all done${extras.length ? ` (plus ${extras.join(", ")})` : ""}.`;
      const partly = k.blocks.filter((b) => !b.done && ((b.minutes_spent ?? 0) > 0 || (b.total ?? 0) > 0));
      const notDone = k.blocks.filter((b) => !b.done && !partly.includes(b));
      if (done.length === 0 && partly.length === 0 && extras.length === 0) return `${k.name} not started.`;
      const parts: string[] = [];
      if (done.length) parts.push(`${done.map(blockWord).join(" and ")} done`);
      if (partly.length) parts.push(`${partly.map(blockWord).join(" and ")} partly done`);
      if (notDone.length) parts.push(`${notDone.map(blockWord).join(" and ")} not done`);
      if (extras.length) parts.push(`${extras.join(", ")} done`);
      return `${k.name} ${parts.join(", ")}.`;
    })
    .join(" ");
}

/** "cole@henderson.family" → "cole"; parents → null. Shared by server pages and the nav. */
export function kidSlugForEmail(email: string | null | undefined): "cole" | "lily" | null {
  const e = (email ?? "").toLowerCase();
  if (e.startsWith("cole")) return "cole";
  if (e.startsWith("lily")) return "lily";
  return null;
}
