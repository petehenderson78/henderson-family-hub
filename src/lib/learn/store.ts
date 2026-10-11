/**
 * Browser-side Supabase helpers for the Learn module (call from client
 * components only). Every function throws on a Supabase error so callers can
 * retry/toast. Rows are converted to the camelCase types in ./types.
 *
 * WRITE CONTRACT
 *   learn_attempts / learn_rewards are INSERT-only ledgers. Each row carries a
 *   client-generated uuid (client_id); the write is an upsert ON CONFLICT
 *   (client_id) DO NOTHING, so the retry queue in the player can replay a
 *   failed write without double-counting. recorded_by is filled by the DB
 *   default auth.uid() (and checked by RLS). learn_skill_progress and
 *   learn_sessions are upserted on their natural keys.
 */

import { createClient } from "@/lib/supabase/client";
import type { AttemptRecord, Learner, LearnerSettings, RewardRecord, SessionRecord, SkillProgress } from "./types";
import {
  attemptToRow,
  learnerFromRow,
  newClientId,
  progressFromRow,
  progressToRow,
  rewardFromRow,
  sessionFromRow,
  sessionToRow,
  type LearnerRow,
  type ProgressRow,
  type RewardRow,
  type SessionRow,
} from "./rows";
import { addDaysToDateStr } from "./dates";

export { newClientId };

function client() {
  return createClient();
}

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function loadLearners(): Promise<Learner[]> {
  const { data, error } = await client().from("learners").select("*").order("grade", { ascending: false });
  check(error, "loadLearners");
  return ((data ?? []) as LearnerRow[]).map(learnerFromRow);
}

export async function loadProgress(learnerId: string): Promise<SkillProgress[]> {
  const { data, error } = await client().from("learn_skill_progress").select("*").eq("learner_id", learnerId);
  check(error, "loadProgress");
  return ((data ?? []) as ProgressRow[]).map(progressFromRow);
}

/** Upsert one or many progress rows on (learner_id, skill_id). */
export async function saveProgress(learnerId: string, progress: SkillProgress | SkillProgress[]): Promise<void> {
  const list = Array.isArray(progress) ? progress : [progress];
  if (list.length === 0) return;
  const rows = list.map((p) => progressToRow(learnerId, p));
  const { error } = await client().from("learn_skill_progress").upsert(rows, { onConflict: "learner_id,skill_id" });
  check(error, "saveProgress");
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
  check(error, "loadTodaySession");
  return data ? sessionFromRow(data as SessionRow) : null;
}

/** Upsert on (learner_id, date), writing status/skip_reason. Returns the stored record. */
export async function upsertSession(session: SessionRecord): Promise<SessionRecord> {
  const { data, error } = await client()
    .from("learn_sessions")
    .upsert(sessionToRow(session), { onConflict: "learner_id,date" })
    .select("*")
    .single();
  check(error, "upsertSession");
  return data ? sessionFromRow(data as SessionRow) : session;
}

/** Insert-only XP ledger row; pass a stable `clientId` so retries are ignored. */
export async function addReward(learnerId: string, delta: number, reason: string, clientId?: string): Promise<void> {
  if (!delta) return;
  const row: RewardRow = { learner_id: learnerId, delta: Math.round(delta), reason, client_id: clientId ?? newClientId() };
  const { error } = await client().from("learn_rewards").upsert(row, { onConflict: "client_id", ignoreDuplicates: true });
  check(error, "addReward");
}

/** Sessions from the last 7 days (today inclusive), newest first. */
export async function loadWeekSessions(learnerId: string, today: string): Promise<SessionRecord[]> {
  return loadRecentSessions(learnerId, today, 7);
}

export async function loadRecentSessions(learnerId: string, today: string, days = 60): Promise<SessionRecord[]> {
  const since = addDaysToDateStr(today, -(days - 1));
  const { data, error } = await client()
    .from("learn_sessions")
    .select("*")
    .eq("learner_id", learnerId)
    .gte("date", since)
    .order("date", { ascending: false });
  check(error, "loadRecentSessions");
  return ((data ?? []) as SessionRow[]).map(sessionFromRow);
}

/** Total XP = sum of the reward ledger. */
export async function loadXpTotal(learnerId: string): Promise<number> {
  const { data, error } = await client().from("learn_rewards").select("delta").eq("learner_id", learnerId);
  check(error, "loadXpTotal");
  return ((data ?? []) as { delta: number }[]).reduce((sum, r) => sum + (Number(r.delta) || 0), 0);
}

export async function loadRewardsSince(learnerId: string, sinceIso: string): Promise<RewardRecord[]> {
  const { data, error } = await client()
    .from("learn_rewards")
    .select("*")
    .eq("learner_id", learnerId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });
  check(error, "loadRewardsSince");
  return ((data ?? []) as RewardRow[]).map(rewardFromRow);
}

/** Parent-only by RLS (learn_is_parent()). */
export async function updateLearnerSettings(learnerId: string, settings: LearnerSettings): Promise<void> {
  const { error } = await client().from("learners").update({ settings }).eq("id", learnerId);
  check(error, "updateLearnerSettings");
}
