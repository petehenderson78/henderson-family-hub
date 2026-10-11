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
import { addDaysToDateStr, familyMidnightIso, todayInFamilyTz, weekStartDate } from "./dates";
import type { LearnNote, RewardItem, Redemption } from "./store-notes";
import type { AttemptSummary } from "./report";
import { isPointRow, walletFrom, weekPoints, type Wallet } from "./stats";

/**
 * Read every page of a query: PostgREST caps one response at the project's
 * max_rows (1000 on Supabase), so whole-history reads (ledger, redemptions,
 * attempts) must page or their sums silently truncate. `build(from, to)` must
 * apply a stable order. Returns null when the first page fails.
 */
async function selectAllPages<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, max = 50000, page = 1000): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; from < max; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) return from === 0 ? null : out;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

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

/** XP for the level ladder: the ledger without point rows ("pt:") and legacy redemptions ("redeem:"). */
export async function loadXpTotalServer(learnerId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const data = await selectAllPages<{ delta: number; reason: string | null }>((from, to) =>
      supabase.from("learn_rewards").select("delta, reason").eq("learner_id", learnerId).order("created_at").order("id").range(from, to)
    );
    if (!data) return 0;
    return data
      .filter((r) => !isPointRow({ reason: r.reason ?? "" }) && !(r.reason ?? "").startsWith("redeem:"))
      .reduce((sum, r) => sum + (Number(r.delta) || 0), 0);
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

/** Ledger rows since local midnight on this family week's Monday (points caps, replay decay, workshops). */
export async function loadWeekRewardsServer(learnerId: string, today = todayInFamilyTz()): Promise<RewardRecord[]> {
  return loadRewardsSinceServer(learnerId, familyMidnightIso(weekStartDate(today)));
}

export interface LearnerBundle {
  learner: Learner;
  progress: SkillProgress[];
  sessions: SessionRecord[];
  /** learn_notes of the last 8 days (Lily's homework rule reads tonight and the previous school night) */
  notes: LearnNote[];
  /** this week's ledger rows */
  weekRewards: RewardRecord[];
}

/** Everything a kid page needs, in parallel. */
export async function loadLearnerBundleServer(slug: string, today = todayInFamilyTz()): Promise<LearnerBundle | null> {
  const learner = await loadLearnerBySlugServer(slug);
  if (!learner) return null;
  const [progress, sessions, notes, weekRewards] = await Promise.all([
    loadProgressServer(learner.id),
    loadRecentSessionsServer(learner.id, 60, today),
    loadNotesServer(learner.id, addDaysToDateStr(today, -7), today),
    loadWeekRewardsServer(learner.id, today),
  ]);
  return { learner, progress, sessions, notes, weekRewards };
}

// ---------------------------------------------------------------------------
// Notes, reward store, attempts, ledger (migration 008). Same contract as
// above: DB errors → empty data, never a render crash.
// ---------------------------------------------------------------------------

const NOTE_KINDS = ["book", "homework", "together", "read-aloud", "fluency", "other", "pony"] as const;

function noteFromRowServer(row: Record<string, unknown>): LearnNote {
  const kind = row.kind;
  const date = row.date;
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    learnerId: String(row.learner_id ?? ""),
    date: typeof date === "string" ? date.slice(0, 10) : String(date ?? ""),
    kind: (NOTE_KINDS as readonly string[]).includes(String(kind)) ? (kind as LearnNote["kind"]) : "other",
    subject: typeof row.subject === "string" ? row.subject : null,
    text: typeof row.text === "string" ? row.text : null,
    minutes: Number(row.minutes) || 0,
    score: typeof row.score === "number" ? row.score : null,
    total: typeof row.total === "number" ? row.total : null,
    standards: Array.isArray(row.standards) ? row.standards.filter((v): v is string => typeof v === "string") : [],
    recordedBy: typeof row.recorded_by === "string" ? row.recorded_by : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
  };
}

/** Notes between two YYYY-MM-DD dates (inclusive), newest first. */
export async function loadNotesServer(learnerId: string, from: string, to: string): Promise<LearnNote[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("learn_notes")
      .select("*")
      .eq("learner_id", learnerId)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return [];
    return ((data ?? []) as Record<string, unknown>[]).map(noteFromRowServer);
  } catch {
    return [];
  }
}

export async function loadRewardItemsServer(learnerId: string): Promise<RewardItem[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("learn_reward_items").select("*").eq("learner_id", learnerId).order("cost", { ascending: true });
    if (error) return [];
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: typeof row.id === "string" ? row.id : undefined,
      learnerId: String(row.learner_id ?? ""),
      title: String(row.title ?? ""),
      cost: Math.max(1, Number(row.cost) || 1),
      active: row.active !== false,
      createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    }));
  } catch {
    return [];
  }
}

export async function loadRedemptionsServer(learnerId: string, limit = 50): Promise<Redemption[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("learn_redemptions")
      .select("*")
      .eq("learner_id", learnerId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: typeof row.id === "string" ? row.id : undefined,
      learnerId: String(row.learner_id ?? ""),
      itemId: String(row.item_id ?? ""),
      cost: Number(row.cost) || 0,
      redeemedBy: typeof row.redeemed_by === "string" ? row.redeemed_by : null,
      createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    }));
  } catch {
    return [];
  }
}

/** Attempt rows for the evidence pack (newest first, capped). Optional columns (help_level, hint_used) are read if present. */
export async function loadAttemptsServer(learnerId: string, limit = 20000): Promise<AttemptSummary[]> {
  try {
    const supabase = await createClient();
    // Paged: one PostgREST response stops at max_rows (1000), which a year of evenings passes in weeks.
    const full = await selectAllPages<Record<string, unknown>>(
      (from, to) =>
        supabase
          .from("learn_attempts")
          .select("skill_id, mode, correct, created_at, help_level, hint_used, ms, qtype:question->>type")
          .eq("learner_id", learnerId)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      limit
    );
    const rows =
      full ??
      // Columns from the pending 007 edit may not exist yet → retry with the base columns.
      (await selectAllPages<Record<string, unknown>>(
        (from, to) => supabase.from("learn_attempts").select("skill_id, mode, correct, created_at").eq("learner_id", learnerId).order("created_at", { ascending: false }).order("id").range(from, to),
        limit
      ));
    return ((rows ?? []) as Record<string, unknown>[]).map((row) => ({
      skillId: String(row.skill_id ?? ""),
      mode: typeof row.mode === "string" ? row.mode : "learn",
      correct: row.correct === true,
      helpLevel: typeof row.help_level === "string" ? row.help_level : null,
      hintUsed: typeof row.hint_used === "boolean" ? row.hint_used : null,
      ms: typeof row.ms === "number" ? row.ms : null,
      questionType: typeof row.qtype === "string" ? row.qtype : null,
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
    }));
  } catch {
    return [];
  }
}

export interface WalletTotals extends Wallet {
  /** points earned this family week (cap 25) */
  weekPoints: number;
}

const EMPTY_WALLET: WalletTotals = { xp: 0, earned: 0, spent: 0, balance: 0, weekPoints: 0 };

/**
 * XP (level ladder) and the points wallet: balance = points earned (pt: rows) −
 * points-era redemptions. Never throws (empty wallet on a DB error).
 */
export async function loadWalletServer(learnerId: string, today = todayInFamilyTz()): Promise<WalletTotals> {
  try {
    const supabase = await createClient();
    const [ledger, redemptions] = await Promise.all([
      selectAllPages<RewardRow>((from, to) =>
        supabase.from("learn_rewards").select("delta, reason, created_at").eq("learner_id", learnerId).order("created_at").order("id").range(from, to)
      ),
      selectAllPages<{ cost: number; created_at?: string }>((from, to) =>
        supabase.from("learn_redemptions").select("cost, created_at").eq("learner_id", learnerId).order("created_at").order("id").range(from, to)
      ),
    ]);
    if (!ledger) return EMPTY_WALLET;
    const rows = ledger.map(rewardFromRow);
    const spent = (redemptions ?? []).map((r) => ({ cost: Number(r.cost) || 0, createdAt: r.created_at }));
    return { ...walletFrom(rows, spent), weekPoints: weekPoints(rows, today) };
  } catch {
    return EMPTY_WALLET;
  }
}

/** Pony names (learn_notes kind 'pony'), newest first. */
export async function loadPonyNotesServer(learnerId: string): Promise<LearnNote[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("learn_notes")
      .select("*")
      .eq("learner_id", learnerId)
      .eq("kind", "pony")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return [];
    return ((data ?? []) as Record<string, unknown>[]).map(noteFromRowServer);
  } catch {
    return [];
  }
}

export interface TonightKidBundle {
  learner: Learner;
  progress: SkillProgress[];
  sessions: SessionRecord[];
  /** learn_notes of the last 8 days (today's homework ticks, Together cards, books; the homework rule) */
  notes: LearnNote[];
  /** this week's ledger rows (points, surprise bonus given today) */
  weekRewards: RewardRecord[];
}

/** Both kids for the Tonight runner, in parallel. */
export async function loadTonightBundleServer(today = todayInFamilyTz()): Promise<TonightKidBundle[]> {
  const learners = await loadLearnersServer();
  return Promise.all(
    learners.map(async (learner) => {
      const [progress, sessions, notes, weekRewards] = await Promise.all([
        loadProgressServer(learner.id),
        loadRecentSessionsServer(learner.id, 14, today),
        loadNotesServer(learner.id, addDaysToDateStr(today, -7), today),
        loadWeekRewardsServer(learner.id, today),
      ]);
      return { learner, progress, sessions, notes, weekRewards };
    })
  );
}
