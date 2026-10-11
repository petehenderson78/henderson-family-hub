/**
 * snake_case DB rows ⇄ camelCase types. Pure; shared by store.ts (browser)
 * and server.ts (server components).
 */

import type { Learner, RewardRecord, SessionBlock, SessionRecord, SkillProgress, SkillStatus } from "./types";
import { normalizeSettings } from "./mastery";

export interface LearnerRow {
  id: string;
  slug: string;
  name: string;
  grade: number;
  settings: unknown;
  created_at: string;
}

export interface ProgressRow {
  learner_id: string;
  skill_id: string;
  status: string;
  attempts: number;
  correct: number;
  streak: number;
  window: unknown;
  interval_days: number;
  next_review_at: string | null;
  last_practiced_at: string | null;
  mastered_at: string | null;
  updated_at?: string;
}

export interface SessionRow {
  id?: string;
  learner_id: string;
  date: string;
  minutes: number;
  xp: number;
  blocks: unknown;
  completed: boolean;
  created_at?: string;
}

export interface RewardRow {
  id?: string;
  learner_id: string;
  delta: number;
  reason: string;
  created_at?: string;
}

const STATUSES: SkillStatus[] = ["locked", "ready", "learning", "mastered"];

export function learnerFromRow(row: LearnerRow): Learner {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    grade: Number(row.grade) || 1,
    settings: normalizeSettings(row.settings, Number(row.grade) || 1),
    createdAt: row.created_at,
  };
}

export function progressFromRow(row: ProgressRow): SkillProgress {
  const status = STATUSES.includes(row.status as SkillStatus) ? (row.status as SkillStatus) : "ready";
  const window = Array.isArray(row.window) ? row.window.map((v) => v === true) : [];
  return {
    skillId: row.skill_id,
    status,
    attempts: Number(row.attempts) || 0,
    correct: Number(row.correct) || 0,
    streak: Number(row.streak) || 0,
    window,
    intervalDays: Number(row.interval_days) || 0,
    nextReviewAt: row.next_review_at ?? null,
    lastPracticedAt: row.last_practiced_at ?? null,
    masteredAt: row.mastered_at ?? null,
  };
}

export function progressToRow(learnerId: string, p: SkillProgress): ProgressRow {
  return {
    learner_id: learnerId,
    skill_id: p.skillId,
    status: p.status,
    attempts: p.attempts,
    correct: p.correct,
    streak: p.streak,
    window: p.window,
    interval_days: p.intervalDays,
    next_review_at: p.nextReviewAt,
    last_practiced_at: p.lastPracticedAt,
    mastered_at: p.masteredAt,
    updated_at: new Date().toISOString(),
  };
}

export function sessionFromRow(row: SessionRow): SessionRecord {
  const blocks = Array.isArray(row.blocks) ? (row.blocks as SessionBlock[]) : [];
  return {
    id: row.id,
    learnerId: row.learner_id,
    date: typeof row.date === "string" ? row.date.slice(0, 10) : String(row.date),
    minutes: Number(row.minutes) || 0,
    xp: Number(row.xp) || 0,
    blocks,
    completed: !!row.completed,
    createdAt: row.created_at,
  };
}

export function sessionToRow(s: SessionRecord): SessionRow {
  return {
    learner_id: s.learnerId,
    date: s.date,
    minutes: Math.max(0, Math.round(s.minutes)),
    xp: Math.max(0, Math.round(s.xp)),
    blocks: s.blocks,
    completed: s.completed,
  };
}

export function rewardFromRow(row: RewardRow): RewardRecord {
  return {
    id: row.id,
    learnerId: row.learner_id,
    delta: Number(row.delta) || 0,
    reason: row.reason ?? "",
    createdAt: row.created_at,
  };
}
