/**
 * Browser-side Supabase helpers for the Learn module (call from client
 * components only). Every function throws on a Supabase error so callers can
 * retry/toast. Rows are converted to the camelCase types in ./types.
 *
 * ERRORS
 *   Writes throw LearnWriteError: `code` says what happened ("not-allowed",
 *   "duplicate", "not-enough-points", "blocked", "setup", "failed", …) and
 *   `message` is safe to show. A write the database silently skipped (an
 *   UPDATE that RLS filtered to zero rows, an INSERT a trigger dropped) is
 *   detected from the returned rows, never reported as success.
 *
 * WRITE CONTRACT
 *   learn_attempts / learn_rewards are INSERT-only ledgers. Each row carries a
 *   client-generated uuid (client_id); the write is an upsert ON CONFLICT
 *   (client_id) DO NOTHING, so the retry queue in the player can replay a
 *   failed write without double-counting. recorded_by is filled by the DB
 *   default auth.uid() and checked by RLS, which also requires the login to be
 *   a parent or the learner's own account (migration 009, learn_can_write).
 *   learn_skill_progress and learn_sessions are upserted on their natural keys.
 *
 * LEDGER
 *   learn_rewards holds two kinds of rows: XP (reason "<mode>:<skill>", drives
 *   the level ladder only) and input points (reason "pt:<kind>[:detail]", the
 *   currency). Points are written through awardPoints, which applies the daily
 *   caps and the 25-a-week cap before inserting. Migration 009 re-checks all
 *   of it in a trigger (server clock, per-kind maximum, parent-only kinds), so
 *   two devices cannot overshoot and the stored amount is what is returned.
 */

import { createClient } from "@/lib/supabase/client";
import type { AttemptRecord, Learner, LearnerSettings, RewardRecord, SessionRecord, SkillProgress } from "./types";
import { isPointRow, pointReason, pointsAllowed, POINTS, type PointKind } from "./stats";
import {
  attemptToRow,
  learnerFromRow,
  newClientId,
  progressFromRow,
  progressToRow,
  rewardFromRow,
  selectAllPages,
  sessionFromRow,
  sessionToRow,
  type DbError,
  type LearnerRow,
  type ProgressRow,
  type RewardRow,
  type SessionRow,
} from "./rows";
import { addDaysToDateStr, familyMidnightIso, weekStartDate } from "./dates";

export { newClientId };

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type LearnWriteErrorCode =
  /** RLS or a trigger refused it for this login (Postgres 42501): parent-only, or another child's rows */
  | "not-allowed"
  /** unique violation (Postgres 23505), e.g. a reward title that already exists */
  | "duplicate"
  /** the redemption guard: the balance is short */
  | "not-enough-points"
  /** the redemption guard: the item is inactive or belongs to the other learner */
  | "not-in-store"
  /** nothing was written and no error came back (zero rows updated / insert skipped) */
  | "blocked"
  /** markNightSkipped on a night that is already done */
  | "already-done"
  /** a table, column or function is missing: migrations 007-009 not applied */
  | "setup"
  /** anything else: network, timeout, server error */
  | "failed";

export class LearnWriteError extends Error {
  readonly code: LearnWriteErrorCode;
  /** the Postgres / PostgREST error code when the database sent one (e.g. "23505") */
  readonly pgCode: string | null;

  constructor(code: LearnWriteErrorCode, message: string, pgCode: string | null = null) {
    super(message);
    this.name = "LearnWriteError";
    this.code = code;
    this.pgCode = pgCode;
  }
}

export function isLearnWriteError(e: unknown): e is LearnWriteError {
  return e instanceof LearnWriteError;
}

const SETUP_PG_CODES = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"]);
const SETUP_MESSAGE = /relation "[^"]+" does not exist|column "?[\w.]+"? (of relation "[^"]+" )?does not exist|could not find the (table|function|'[^']+' column)/i;

const DEFAULT_MESSAGES: Record<LearnWriteErrorCode, string> = {
  "not-allowed": "This login isn't allowed to do that.",
  duplicate: "That already exists.",
  "not-enough-points": "Not enough points for this reward.",
  "not-in-store": "That reward isn't in this store anymore.",
  blocked: "Nothing was saved. This login may not be allowed to change it.",
  "already-done": "That night is already done.",
  setup: "Run the Supabase setup scripts 007, 008 and 009 first.",
  failed: "Couldn't save. Check the connection and try again.",
};

/**
 * Classify a Supabase error. `messages` overrides the text per code; "failed"
 * keeps the database's own message after `what` for the logs.
 */
export function toWriteError(error: DbError, what: string, messages: Partial<Record<LearnWriteErrorCode, string>> = {}): LearnWriteError {
  const pgCode = error.code ? String(error.code) : null;
  const raw = error.message ?? "";
  let code: LearnWriteErrorCode = "failed";
  if (pgCode === "42501" || /row-level security|only a parent|cannot write points/i.test(raw)) code = "not-allowed";
  else if (pgCode === "23505") code = "duplicate";
  else if (/not enough points/i.test(raw)) code = "not-enough-points";
  else if (/not in this learner/i.test(raw)) code = "not-in-store";
  else if ((pgCode && SETUP_PG_CODES.has(pgCode)) || SETUP_MESSAGE.test(raw)) code = "setup";
  const text = messages[code] ?? (code === "failed" ? `${what}: ${raw || DEFAULT_MESSAGES.failed}` : DEFAULT_MESSAGES[code]);
  return new LearnWriteError(code, text, pgCode);
}

function client() {
  return createClient();
}

function check(error: DbError | null, what: string): void {
  if (error) throw toWriteError(error, what);
}

/** For reads: throw a plain Error with the database message. */
function checkRead(error: DbError | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function loadLearners(): Promise<Learner[]> {
  const { data, error } = await client().from("learners").select("*").order("grade", { ascending: false });
  checkRead(error, "loadLearners");
  return ((data ?? []) as LearnerRow[]).map(learnerFromRow);
}

export async function loadProgress(learnerId: string): Promise<SkillProgress[]> {
  const sb = client();
  const { data, error } = await selectAllPages<ProgressRow>((from, to) =>
    sb.from("learn_skill_progress").select("*").eq("learner_id", learnerId).order("skill_id").range(from, to)
  );
  checkRead(error, "loadProgress");
  return data.map(progressFromRow);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Upsert one or many progress rows on (learner_id, skill_id). */
export async function saveProgress(learnerId: string, progress: SkillProgress | SkillProgress[]): Promise<void> {
  const list = Array.isArray(progress) ? progress : [progress];
  if (list.length === 0) return;
  const rows = list.map((p) => progressToRow(learnerId, p));
  const { data, error } = await client().from("learn_skill_progress").upsert(rows, { onConflict: "learner_id,skill_id" }).select("skill_id");
  check(error, "saveProgress");
  if (!data || data.length < rows.length) throw new LearnWriteError("blocked", "Progress wasn't saved. This login may not be allowed to change it.");
}

/**
 * Move review dates without touching anything else on the row (a vacation
 * shift from the Parent view): unlike saveProgress, a stale copy of the row can
 * never put back old windows, intervals or statuses. One UPDATE per skill;
 * throws LearnWriteError "blocked" when a row was not updated (no such row, or
 * a login that may not write this learner).
 */
export async function setNextReviewDates(learnerId: string, updates: { skillId: string; nextReviewAt: string | null }[]): Promise<void> {
  const sb = client();
  for (const u of updates) {
    const { data, error } = await sb
      .from("learn_skill_progress")
      .update({ next_review_at: u.nextReviewAt, updated_at: new Date().toISOString() })
      .eq("learner_id", learnerId)
      .eq("skill_id", u.skillId)
      .select("skill_id");
    check(error, "setNextReviewDates");
    if (!data || data.length === 0) throw new LearnWriteError("blocked", "Review dates weren't saved. This login may not be allowed to change them.");
  }
}

/**
 * Insert-only. Give the record a `clientId` (newClientId()) when it is created
 * so a retried call is a no-op; without one a fresh id is generated per call.
 */
export async function logAttempt(attempt: AttemptRecord): Promise<void> {
  const row = attemptToRow(attempt);
  const { error } = await client().from("learn_attempts").upsert(row, { onConflict: "client_id", ignoreDuplicates: true });
  check(error, "logAttempt");
}

export async function loadTodaySession(learnerId: string, date: string): Promise<SessionRecord | null> {
  const { data, error } = await client()
    .from("learn_sessions")
    .select("*")
    .eq("learner_id", learnerId)
    .eq("date", date)
    .maybeSingle();
  checkRead(error, "loadTodaySession");
  return data ? sessionFromRow(data as SessionRow) : null;
}

/** Upsert on (learner_id, date), writing status/skip_reason. Returns the stored record. */
export async function upsertSession(session: SessionRecord): Promise<SessionRecord> {
  const { data, error } = await client()
    .from("learn_sessions")
    .upsert(sessionToRow(session), { onConflict: "learner_id,date" })
    .select("*");
  check(error, "upsertSession");
  const row = (data ?? [])[0] as SessionRow | undefined;
  if (!row) throw new LearnWriteError("blocked", "Tonight's session wasn't saved. This login may not be allowed to change it.");
  return sessionFromRow(row);
}

/**
 * Insert one ledger row (retry-safe on client_id) and return the amount the
 * database stored: the points trigger may trim a point row or skip it (cap
 * reached, unknown kind) → 0. A replay of a row that is already stored returns
 * that row's amount. Throws LearnWriteError "not-allowed" when the login may
 * not write it (parent-only kinds, the other child's ledger).
 */
async function insertLedgerRow(row: RewardRow, what: string): Promise<number> {
  const sb = client();
  const { data, error } = await sb.from("learn_rewards").upsert(row, { onConflict: "client_id", ignoreDuplicates: true }).select("delta");
  check(error, what);
  const stored = (data ?? [])[0] as { delta: number } | undefined;
  if (stored) return Number(stored.delta) || 0;
  // No row back: either this client_id was written by an earlier try, or the trigger skipped it.
  const { data: existing, error: readError } = await sb.from("learn_rewards").select("delta").eq("client_id", row.client_id ?? "").maybeSingle();
  check(readError, what);
  return existing ? Number((existing as { delta: number }).delta) || 0 : 0;
}

/**
 * Insert-only ledger row; pass a stable `clientId` so retries are ignored.
 * Returns the amount stored (0 when the points trigger skipped a point row).
 */
export async function addReward(learnerId: string, delta: number, reason: string, clientId?: string): Promise<number> {
  if (!delta) return 0;
  const row: RewardRow = { learner_id: learnerId, delta: Math.round(delta), reason, client_id: clientId ?? newClientId() };
  return insertLedgerRow(row, "addReward");
}

/** Sessions from the last 7 days (today inclusive), newest first. */
export async function loadWeekSessions(learnerId: string, today: string): Promise<SessionRecord[]> {
  return loadRecentSessions(learnerId, today, 7);
}

export async function loadRecentSessions(learnerId: string, today: string, days = 60): Promise<SessionRecord[]> {
  const since = addDaysToDateStr(today, -(days - 1));
  const sb = client();
  const { data, error } = await selectAllPages<SessionRow>((from, to) =>
    sb.from("learn_sessions").select("*").eq("learner_id", learnerId).gte("date", since).order("date", { ascending: false }).range(from, to)
  );
  checkRead(error, "loadRecentSessions");
  return data.map(sessionFromRow);
}

/** Total XP = sum of the XP rows of the ledger (points and legacy redemptions excluded). Paged: the ledger passes 1000 rows. */
export async function loadXpTotal(learnerId: string): Promise<number> {
  const sb = client();
  const { data, error } = await selectAllPages<{ delta: number; reason: string | null }>((from, to) =>
    sb.from("learn_rewards").select("delta, reason").eq("learner_id", learnerId).order("created_at").order("id").range(from, to)
  );
  checkRead(error, "loadXpTotal");
  return data
    .filter((r) => !isPointRow({ reason: r.reason ?? "" }) && !(r.reason ?? "").startsWith("redeem:"))
    .reduce((sum, r) => sum + (Number(r.delta) || 0), 0);
}

/** Ledger rows written since local midnight on this week's Monday (family time). */
export async function loadWeekRewards(learnerId: string, today: string): Promise<RewardRecord[]> {
  return loadRewardsSince(learnerId, familyMidnightIso(weekStartDate(today)));
}

// Points awards run one at a time per page so two awards finishing together see each other's rows.
let pointsChain: Promise<unknown> = Promise.resolve();

/**
 * Award input points (design §4). Loads this week's ledger, applies the daily
 * caps (block 3, on-time 1, surprise bonus 1) and the weekly cap of 25, and
 * inserts what is allowed with `clientId` (pass a stable one so the player's
 * retry queue can replay the call). Returns the points the database stored:
 * 0 when a cap is full; a replay returns the amount stored the first time.
 * Book, workshop and bonus points need a parent login: anything else throws
 * LearnWriteError "not-allowed".
 */
export function awardPoints(
  learnerId: string,
  kind: PointKind,
  opts: { today: string; detail?: string; amount?: number; clientId?: string }
): Promise<number> {
  const clientId = opts.clientId ?? newClientId();
  const run = async () => {
    const week = await loadWeekRewards(learnerId, opts.today);
    const earlier = week.find((r) => r.clientId === clientId);
    if (earlier) return Math.max(0, earlier.delta); // already written by an earlier try
    const allowed = pointsAllowed(week, kind, opts.amount ?? POINTS[kind], opts.today);
    if (allowed <= 0) return 0;
    const row: RewardRow = { learner_id: learnerId, delta: allowed, reason: pointReason(kind, opts.detail), client_id: clientId };
    return insertLedgerRow(row, "awardPoints");
  };
  const next = pointsChain.then(run, run);
  pointsChain = next.catch(() => undefined);
  return next;
}

export async function loadRewardsSince(learnerId: string, sinceIso: string): Promise<RewardRecord[]> {
  const sb = client();
  const { data, error } = await selectAllPages<RewardRow>((from, to) =>
    sb.from("learn_rewards").select("*").eq("learner_id", learnerId).gte("created_at", sinceIso).order("created_at", { ascending: false }).order("id").range(from, to)
  );
  checkRead(error, "loadRewardsSince");
  return data.map(rewardFromRow);
}

/**
 * Parent-only by RLS (learn_is_parent()). Throws LearnWriteError "blocked"
 * when no row was updated (a login that is not on the parent list), so the
 * caller never shows "Saved" for a save that did not happen.
 */
export async function updateLearnerSettings(learnerId: string, settings: LearnerSettings): Promise<void> {
  const { data, error } = await client().from("learners").update({ settings }).eq("id", learnerId).select("id");
  check(error, "updateLearnerSettings");
  if (!data || data.length === 0) {
    throw new LearnWriteError("blocked", "Settings weren't saved: only a parent login can change them.");
  }
}
