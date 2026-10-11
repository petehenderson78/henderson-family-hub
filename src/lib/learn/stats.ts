/**
 * Session / dashboard statistics — pure helpers shared by server pages and
 * client views. Relative imports only.
 */

import type { Mission, MissionBlock, ProgressMap, SessionRecord, Skill } from "./types";
import { addDaysToDateStr, weekDates } from "./dates";
import { isReviewDue } from "./mastery";

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
 * Consecutive days (ending today or yesterday) with a completed session.
 * Today not being done yet does not break the streak.
 */
export function computeStreak(sessions: SessionRecord[], today: string): number {
  const done = new Set(sessions.filter((s) => s.completed).map((s) => s.date));
  let cursor = done.has(today) ? today : addDaysToDateStr(today, -1);
  let streak = 0;
  while (done.has(cursor)) {
    streak += 1;
    cursor = addDaysToDateStr(cursor, -1);
  }
  return streak;
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
