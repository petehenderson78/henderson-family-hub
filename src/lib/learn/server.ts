/**
 * Server-side loaders (server components only — uses next/headers cookies).
 * All loaders swallow DB errors (e.g. migration not applied yet) and return
 * empty data so pages never crash at render time.
 */

import { createClient } from "@/lib/supabase/server";
import type { Learner, RewardRecord, SessionRecord, SkillProgress } from "./types";
import {
  learnerFromRow,
  progressFromRow,
  rewardFromRow,
  sessionFromRow,
  type LearnerRow,
  type ProgressRow,
  type RewardRow,
  type SessionRow,
} from "./rows";
import { addDaysToDateStr, todayInFamilyTz } from "./dates";

export async function loadLearnersServer(): Promise<Learner[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("learners").select("*").order("grade", { ascending: false });
    if (error) return [];
    return ((data ?? []) as LearnerRow[]).map(learnerFromRow);
  } catch {
    return [];
  }
}

export async function loadLearnerBySlugServer(slug: string): Promise<Learner | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("learners").select("*").eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    return learnerFromRow(data as LearnerRow);
  } catch {
    return null;
  }
}

export async function loadProgressServer(learnerId: string): Promise<SkillProgress[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("learn_skill_progress").select("*").eq("learner_id", learnerId);
    if (error) return [];
    return ((data ?? []) as ProgressRow[]).map(progressFromRow);
  } catch {
    return [];
  }
}

export async function loadRecentSessionsServer(learnerId: string, days = 60, today = todayInFamilyTz()): Promise<SessionRecord[]> {
  try {
    const supabase = await createClient();
    const since = addDaysToDateStr(today, -(days - 1));
    const { data, error } = await supabase
      .from("learn_sessions")
      .select("*")
      .eq("learner_id", learnerId)
      .gte("date", since)
      .order("date", { ascending: false });
    if (error) return [];
    return ((data ?? []) as SessionRow[]).map(sessionFromRow);
  } catch {
    return [];
  }
}

export async function loadXpTotalServer(learnerId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("learn_rewards").select("delta").eq("learner_id", learnerId);
    if (error) return 0;
    return ((data ?? []) as { delta: number }[]).reduce((sum, r) => sum + (Number(r.delta) || 0), 0);
  } catch {
    return 0;
  }
}

export async function loadRewardsSinceServer(learnerId: string, sinceIso: string): Promise<RewardRecord[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("learn_rewards")
      .select("*")
      .eq("learner_id", learnerId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false });
    if (error) return [];
    return ((data ?? []) as RewardRow[]).map(rewardFromRow);
  } catch {
    return [];
  }
}

export interface LearnerBundle {
  learner: Learner;
  progress: SkillProgress[];
  sessions: SessionRecord[];
  xpTotal: number;
}

/** Everything a kid page needs, in parallel. */
export async function loadLearnerBundleServer(slug: string, today = todayInFamilyTz()): Promise<LearnerBundle | null> {
  const learner = await loadLearnerBySlugServer(slug);
  if (!learner) return null;
  const [progress, sessions, xpTotal] = await Promise.all([
    loadProgressServer(learner.id),
    loadRecentSessionsServer(learner.id, 60, today),
    loadXpTotalServer(learner.id),
  ]);
  return { learner, progress, sessions, xpTotal };
}
