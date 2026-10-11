/**
 * snake_case DB rows ⇄ camelCase types. Pure; shared by store.ts (browser)
 * and server.ts (server components).
 */

import type {
  AttemptRecord,
  HelpLevel,
  Learner,
  Question,
  RewardRecord,
  SessionBlock,
  SessionRecord,
  SessionStatus,
  SkillProgress,
  SkillStatus,
} from "./types";
import { normalizeSettings } from "./mastery";

export interface LearnerRow {
  id: string;
  slug: string;
  name: string;
  grade: number;
  settings: unknown;
  email?: string | null;
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
  review_misses?: number | null;
  needs_help?: boolean | null;
  help_note?: string | null;
  test_out?: boolean | null;
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
  status?: string | null;
  skip_reason?: string | null;
  created_at?: string;
}

export interface RewardRow {
  id?: string;
  learner_id: string;
  delta: number;
  reason: string;
  client_id?: string | null;
  created_at?: string;
}

export interface AttemptRow {
  id?: string;
  learner_id: string;
  skill_id: string;
  mode: string;
  question: unknown;
  answer: string | null;
  correct: boolean;
  ms: number | null;
  seed?: number | null;
  hint_used?: boolean | null;
  help_level?: string | null;
  client_id?: string | null;
  created_at?: string;
}

const STATUSES: SkillStatus[] = ["locked", "ready", "learning", "mastered"];
const SESSION_STATUSES: SessionStatus[] = ["planned", "partial", "done", "skipped", "vacation"];
const HELP_LEVELS: HelpLevel[] = ["independent", "hint", "taught"];
const MODES = ["learn", "review", "test"] as const;

/**
 * Client-generated UUID v4 for insert-only rows (attempts, rewards): the DB
 * ignores a second write with the same id, so retries never double-count.
 */
export function newClientId(): string {
  const c = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function learnerFromRow(row: LearnerRow): Learner {
  const rawSettings = (row.settings && typeof row.settings === "object" ? row.settings : {}) as Record<string, unknown>;
  const email = typeof row.email === "string" ? row.email : typeof rawSettings.email === "string" ? rawSettings.email : null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    grade: Number(row.grade) || 1,
    settings: normalizeSettings(row.settings, Number(row.grade) || 1),
    email,
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
    reviewMisses: Number(row.review_misses) || 0,
    needsHelp: row.needs_help === true,
    helpNote: typeof row.help_note === "string" && row.help_note ? row.help_note : null,
    testOut: row.test_out === true,
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
    review_misses: p.reviewMisses ?? 0,
    needs_help: p.needsHelp ?? false,
    help_note: p.helpNote ?? null,
    test_out: p.testOut ?? false,
    updated_at: new Date().toISOString(),
  };
}

export function sessionFromRow(row: SessionRow): SessionRecord {
  const blocks = Array.isArray(row.blocks) ? (row.blocks as SessionBlock[]) : [];
  const status = SESSION_STATUSES.includes(row.status as SessionStatus) ? (row.status as SessionStatus) : row.completed ? "done" : "planned";
  return {
    id: row.id,
    learnerId: row.learner_id,
    date: typeof row.date === "string" ? row.date.slice(0, 10) : String(row.date),
    minutes: Number(row.minutes) || 0,
    xp: Number(row.xp) || 0,
    blocks,
    completed: !!row.completed,
    status,
    skipReason: row.skip_reason ?? null,
    createdAt: row.created_at,
  };
}

export function sessionToRow(s: SessionRecord): SessionRow {
  const status: SessionStatus = s.status ?? (s.completed ? "done" : s.blocks.some((b) => b.done) ? "partial" : "planned");
  return {
    learner_id: s.learnerId,
    date: s.date,
    minutes: Math.max(0, Math.round(s.minutes)),
    xp: Math.max(0, Math.round(s.xp)),
    blocks: s.blocks,
    completed: s.completed || status === "done",
    status,
    skip_reason: s.skipReason ?? null,
  };
}

export function rewardFromRow(row: RewardRow): RewardRecord {
  return {
    id: row.id,
    learnerId: row.learner_id,
    delta: Number(row.delta) || 0,
    reason: row.reason ?? "",
    clientId: row.client_id ?? undefined,
    createdAt: row.created_at,
  };
}

/** The question as stored: never svg markup (regenerate from `seed` instead). */
export function questionForStorage(q: Question): Question {
  if (!q.display) return q;
  const display = { ...q.display };
  delete display.svg;
  if (q.type === "choice") {
    const options = q.options.map((o) => (o.svg ? { ...o, svg: undefined } : o));
    return { ...q, display, options };
  }
  return { ...q, display };
}

export function attemptToRow(a: AttemptRecord): AttemptRow {
  return {
    learner_id: a.learnerId,
    skill_id: a.skillId,
    mode: a.mode,
    question: questionForStorage(a.question),
    answer: a.answer,
    correct: a.correct,
    ms: Math.max(0, Math.round(a.ms)),
    seed: typeof a.seed === "number" && Number.isFinite(a.seed) ? Math.round(a.seed) : null,
    hint_used: a.hintUsed ?? false,
    help_level: a.helpLevel ?? "independent",
    client_id: a.clientId ?? newClientId(),
  };
}

export function attemptFromRow(row: AttemptRow): AttemptRecord {
  const mode = (MODES as readonly string[]).includes(row.mode) ? (row.mode as AttemptRecord["mode"]) : "learn";
  const helpLevel = HELP_LEVELS.includes(row.help_level as HelpLevel) ? (row.help_level as HelpLevel) : "independent";
  return {
    id: row.id,
    learnerId: row.learner_id,
    skillId: row.skill_id,
    mode,
    question: (row.question ?? { type: "text", prompt: "", answer: "", explain: "", hint: "" }) as Question,
    answer: row.answer ?? "",
    correct: !!row.correct,
    ms: Number(row.ms) || 0,
    seed: typeof row.seed === "number" ? row.seed : undefined,
    hintUsed: row.hint_used === true,
    helpLevel,
    clientId: row.client_id ?? undefined,
    createdAt: row.created_at,
  };
}
