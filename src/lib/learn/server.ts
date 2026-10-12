/**
 * Server-side loaders (server components only — uses next/headers cookies).
 *
 * ERRORS: the loaders a page renders from THROW LearnLoadError when the
 * database answers with an error or cannot be reached. An empty result with no
 * error is returned as empty data (a fresh install renders normally). Pages
 * catch it and return learnLoadErrorPage(): a screen must never start from
 * empty progress or sessions after a failed read, because its next write would
 * overwrite the real rows. kind "setup" means a table/column/function is
 * missing (run migrations 007-009); "unreachable" is everything else.
 *
 * loadLearnerBySlugServer() keeps its old contract (null on any error) for the
 * coach API route.
 *
 * Every read that can pass PostgREST's 1000-row cap is paged (selectAllPages).
 *
 * STREAK: the flame walks back over every evening since the program began, so
 * pages read a separate, lightweight streak history (loadStreakSessionsServer:
 * date / status / completed from max(LEARN_PROGRAM_START, today − 399 days))
 * and pass its `loadedFrom` to computeStreakInfo. The 14- / 60-day session
 * windows stay as they are for everything else (ring, homework rule, missions).
 */

import { createElement, type ReactElement } from "react";
import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Learner, RewardRecord, SessionRecord, SkillProgress } from "./types";
import {
  learnerFromRow,
  progressFromRow,
  rewardFromRow,
  selectAllPages,
  sessionFromRow,
  type DbError,
  type LearnerRow,
  type ProgressRow,
  type RewardRow,
  type SessionRow,
} from "./rows";
import { addDaysToDateStr, familyMidnightIso, todayInFamilyTz, weekStartDate } from "./dates";
import type { LearnNote, RewardItem, Redemption } from "./store-notes";
import type { AttemptSummary } from "./report";
import { isPointRow, kidSlugForEmail, walletFrom, weekPoints, type Wallet } from "./stats";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type LearnLoadErrorKind = "setup" | "unreachable";

const SETUP_PG_CODES = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"]);
const SETUP_MESSAGE = /relation "[^"]+" does not exist|column "?[\w.]+"? (of relation "[^"]+" )?does not exist|could not find the (table|function|'[^']+' column)/i;

export class LearnLoadError extends Error {
  readonly kind: LearnLoadErrorKind;
  /** Postgres / PostgREST error code when the database sent one */
  readonly code: string | null;

  constructor(what: string, cause: { message?: string; code?: string | null } | null | undefined) {
    const message = cause?.message ?? "unknown error";
    super(`${what}: ${message}`);
    this.name = "LearnLoadError";
    this.code = cause?.code ? String(cause.code) : null;
    this.kind = (this.code && SETUP_PG_CODES.has(this.code)) || SETUP_MESSAGE.test(message) ? "setup" : "unreachable";
  }
}

/** Run a loader body; anything thrown that is not a Next.js control-flow error becomes a LearnLoadError. */
async function guarded<T>(what: string, body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } catch (e) {
    if (e instanceof LearnLoadError) throw e;
    unstable_rethrow(e);
    throw new LearnLoadError(what, { message: e instanceof Error ? e.message : String(e) });
  }
}

function fail(what: string, error: DbError): never {
  throw new LearnLoadError(what, error);
}

/**
 * The calm full-page card a server page returns instead of its client view
 * when a load failed. Re-throws anything that is not a LearnLoadError (so
 * redirect()/notFound() and real bugs keep their normal handling).
 */
export function learnLoadErrorPage(error: unknown, reloadHref: string): ReactElement {
  if (!(error instanceof LearnLoadError)) throw error;
  console.error(`[learn] ${error.message}`);
  const setup = error.kind === "setup";
  const h = createElement;
  return h(
    "main",
    { className: "flex min-h-[100dvh] items-center justify-center bg-[#F8FAFC] px-4 pb-28 pt-10" },
    h(
      "div",
      { role: "alert", className: "w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm" },
      h("p", { className: "text-3xl", "aria-hidden": true }, setup ? "🛠️" : "📡"),
      h("h1", { className: "mt-3 text-lg font-bold text-slate-900" }, setup ? "Learn isn't set up yet" : "Couldn't reach the family database."),
      h(
        "p",
        { className: "mt-2 text-sm text-slate-500" },
        setup ? "Run the Supabase setup scripts 007, 008 and 009 first." : "Check the connection and try again."
      ),
      h(
        "div",
        { className: "mt-5 flex flex-col items-center gap-2" },
        h(
          "a",
          {
            href: reloadHref,
            className: "inline-flex min-h-[44px] min-w-[140px] items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white active:bg-indigo-700",
          },
          "Reload"
        ),
        h("a", { href: "/", className: "inline-flex min-h-[44px] items-center justify-center px-4 text-sm font-medium text-slate-500" }, "Home")
      )
    )
  );
}

// ---------------------------------------------------------------------------
// Who is signed in
// ---------------------------------------------------------------------------

/** Mirrors learn_is_parent() in migration 009 (exact addresses, case-insensitive). */
const PARENT_LOGINS = new Set(["peter@henderson.family", "nicole@henderson.family", "pete.henderson@gmail.com", "nicole.stein78@gmail.com"]);

export function isParentLogin(email: string | null | undefined): boolean {
  return PARENT_LOGINS.has((email ?? "").trim().toLowerCase());
}

/**
 * The learner slug when `email` is a child's login: the cole@/lily@ prefix
 * rule (kidSlugForEmail) or the learners.email of a learner. `learners` may
 * be passed when the page already loaded them; otherwise they are loaded
 * (only for a login that is neither a parent nor a cole@/lily@ address).
 * Throws LearnLoadError when that load fails.
 */
export async function kidSlugForLoginServer(email: string | null | undefined, learners?: Learner[]): Promise<string | null> {
  const byPrefix = kidSlugForEmail(email);
  if (byPrefix) return byPrefix;
  const e = (email ?? "").trim().toLowerCase();
  if (!e || isParentLogin(e)) return null;
  const list = learners ?? (await loadLearnersServer());
  return list.find((l) => (l.email ?? "").trim().toLowerCase() === e)?.slug ?? null;
}

/**
 * True for a child's login (cole@/lily@, or a learner's email). For guarding
 * parent-only routes such as the family finances: when the Learn tables are
 * missing or unreachable, the cole@/lily@ rule still applies.
 */
export async function isKidLoginServer(email: string | null | undefined): Promise<boolean> {
  if (kidSlugForEmail(email)) return true;
  try {
    return (await kidSlugForLoginServer(email)) !== null;
  } catch (e) {
    if (e instanceof LearnLoadError) return false;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Learners, progress, sessions, ledger
// ---------------------------------------------------------------------------

export async function loadLearnersServer(): Promise<Learner[]> {
  return guarded("loadLearners", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("learners").select("*").order("grade", { ascending: false });
    if (error) fail("loadLearners", error);
    return ((data ?? []) as LearnerRow[]).map(learnerFromRow);
  });
}

/** One learner by slug: null when there is no such learner; throws LearnLoadError on a DB error. */
export async function loadLearnerServer(slug: string): Promise<Learner | null> {
  return guarded("loadLearner", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("learners").select("*").eq("slug", slug).maybeSingle();
    if (error) fail("loadLearner", error);
    return data ? learnerFromRow(data as LearnerRow) : null;
  });
}

/** Coach API contract: null when the learner is missing OR the read failed (never throws). */
export async function loadLearnerBySlugServer(slug: string): Promise<Learner | null> {
  try {
    return await loadLearnerServer(slug);
  } catch (e) {
    unstable_rethrow(e);
    return null;
  }
}

export async function loadProgressServer(learnerId: string): Promise<SkillProgress[]> {
  return guarded("loadProgress", async () => {
    const supabase = await createClient();
    const { data, error } = await selectAllPages<ProgressRow>((from, to) =>
      supabase.from("learn_skill_progress").select("*").eq("learner_id", learnerId).order("skill_id").range(from, to)
    );
    if (error) fail("loadProgress", error);
    return data.map(progressFromRow);
  });
}

export async function loadRecentSessionsServer(learnerId: string, days = 60, today = todayInFamilyTz()): Promise<SessionRecord[]> {
  return guarded("loadRecentSessions", async () => {
    const supabase = await createClient();
    const since = addDaysToDateStr(today, -(days - 1));
    const { data, error } = await selectAllPages<SessionRow>((from, to) =>
      supabase.from("learn_sessions").select("*").eq("learner_id", learnerId).gte("date", since).order("date", { ascending: false }).range(from, to)
    );
    if (error) fail("loadRecentSessions", error);
    return data.map(sessionFromRow);
  });
}

/** The first evening of the program (Mon Oct 12, 2026): the streak never counts a day before it. */
export const LEARN_PROGRAM_START = "2026-10-12";

/** Days of session history read for the streak (FR-15): a 60-day window stopped it growing after two months. */
export const STREAK_HISTORY_DAYS = 400;

/** The session rows the streak walks, and where that read started. */
export interface StreakSessions {
  /** learn_sessions on or after the window start (date, status, completed, skip_reason; blocks empty), newest first */
  sessions: SessionRecord[];
  /**
   * The read's lower date bound for computeStreakInfo(…, loadedFrom): null when
   * the window reaches back to LEARN_PROGRAM_START (the rows are the whole
   * history, so the walk is complete), else the first date read (a streak that
   * reaches it unbroken is a lower bound).
   */
  loadedFrom: string | null;
}

/** The streak window for `today`: from max(LEARN_PROGRAM_START, today − 399 days). */
export function streakWindowFor(today: string): { from: string; loadedFrom: string | null } {
  const back = addDaysToDateStr(today, -(STREAK_HISTORY_DAYS - 1));
  return back > LEARN_PROGRAM_START ? { from: back, loadedFrom: back } : { from: LEARN_PROGRAM_START, loadedFrom: null };
}

/**
 * The streak's session history (see StreakSessions): a lightweight paged read
 * without blocks, minutes or xp. Pass the result to
 * computeStreakInfo(sessions, today, learner.settings, loadedFrom). Throws LearnLoadError.
 */
export async function loadStreakSessionsServer(learnerId: string, today = todayInFamilyTz()): Promise<StreakSessions> {
  return guarded("loadStreakSessions", async () => {
    const supabase = await createClient();
    const { from, loadedFrom } = streakWindowFor(today);
    const { data, error } = await selectAllPages<Pick<SessionRow, "learner_id" | "date" | "status" | "completed" | "skip_reason">>((start, end) =>
      supabase
        .from("learn_sessions")
        .select("learner_id, date, status, completed, skip_reason")
        .eq("learner_id", learnerId)
        .gte("date", from)
        .lte("date", today)
        .order("date", { ascending: false })
        .range(start, end)
    );
    if (error) fail("loadStreakSessions", error);
    const sessions = data.map((row) => sessionFromRow({ ...row, minutes: 0, xp: 0, blocks: [] }));
    return { sessions, loadedFrom };
  });
}

/** XP for the level ladder: the ledger without point rows ("pt:") and legacy redemptions ("redeem:"). */
export async function loadXpTotalServer(learnerId: string): Promise<number> {
  return guarded("loadXpTotal", async () => {
    const supabase = await createClient();
    const { data, error } = await selectAllPages<{ delta: number; reason: string | null }>((from, to) =>
      supabase.from("learn_rewards").select("delta, reason").eq("learner_id", learnerId).order("created_at").order("id").range(from, to)
    );
    if (error) fail("loadXpTotal", error);
    return data
      .filter((r) => !isPointRow({ reason: r.reason ?? "" }) && !(r.reason ?? "").startsWith("redeem:"))
      .reduce((sum, r) => sum + (Number(r.delta) || 0), 0);
  });
}

export async function loadRewardsSinceServer(learnerId: string, sinceIso: string): Promise<RewardRecord[]> {
  return guarded("loadRewardsSince", async () => {
    const supabase = await createClient();
    const { data, error } = await selectAllPages<RewardRow>((from, to) =>
      supabase
        .from("learn_rewards")
        .select("*")
        .eq("learner_id", learnerId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    );
    if (error) fail("loadRewardsSince", error);
    return data.map(rewardFromRow);
  });
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
  /** the streak's history (loadStreakSessionsServer): computeStreakInfo(streak.sessions, today, settings, streak.loadedFrom) */
  streak: StreakSessions;
}

/** Everything a kid page needs, in parallel. null when there is no such learner; throws LearnLoadError. */
export async function loadLearnerBundleServer(slug: string, today = todayInFamilyTz()): Promise<LearnerBundle | null> {
  const learner = await loadLearnerServer(slug);
  if (!learner) return null;
  const [progress, sessions, notes, weekRewards, streak] = await Promise.all([
    loadProgressServer(learner.id),
    loadRecentSessionsServer(learner.id, 60, today),
    loadNotesServer(learner.id, addDaysToDateStr(today, -7), today),
    loadWeekRewardsServer(learner.id, today),
    loadStreakSessionsServer(learner.id, today),
  ]);
  return { learner, progress, sessions, notes, weekRewards, streak };
}

// ---------------------------------------------------------------------------
// Notes, reward store, attempts, wallet (migrations 008 / 009)
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
    clientId: typeof row.client_id === "string" ? row.client_id : null,
  };
}

/** Notes between two YYYY-MM-DD dates (inclusive), newest first. Paged: a year of notes passes 1000 rows. */
export async function loadNotesServer(learnerId: string, from: string, to: string): Promise<LearnNote[]> {
  return guarded("loadNotes", async () => {
    const supabase = await createClient();
    const { data, error } = await selectAllPages<Record<string, unknown>>((start, end) =>
      supabase
        .from("learn_notes")
        .select("*")
        .eq("learner_id", learnerId)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id")
        .range(start, end)
    );
    if (error) fail("loadNotes", error);
    return data.map(noteFromRowServer);
  });
}

export async function loadRewardItemsServer(learnerId: string): Promise<RewardItem[]> {
  return guarded("loadRewardItems", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("learn_reward_items").select("*").eq("learner_id", learnerId).order("cost", { ascending: true }).order("title");
    if (error) fail("loadRewardItems", error);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: typeof row.id === "string" ? row.id : undefined,
      learnerId: String(row.learner_id ?? ""),
      title: String(row.title ?? ""),
      cost: Math.max(1, Number(row.cost) || 1),
      active: row.active !== false,
      createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    }));
  });
}

/** The latest redemptions, newest first (the parent's Friday Close list). */
export async function loadRedemptionsServer(learnerId: string, limit = 50): Promise<Redemption[]> {
  return guarded("loadRedemptions", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("learn_redemptions")
      .select("*")
      .eq("learner_id", learnerId)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(limit);
    if (error) fail("loadRedemptions", error);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: typeof row.id === "string" ? row.id : undefined,
      learnerId: String(row.learner_id ?? ""),
      itemId: String(row.item_id ?? ""),
      cost: Number(row.cost) || 0,
      redeemedBy: typeof row.redeemed_by === "string" ? row.redeemed_by : null,
      createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
      pricedIn: row.priced_in === "xp" ? "xp" : row.priced_in === "points" ? "points" : undefined,
    }));
  });
}

/** Attempt rows for the evidence pack (newest first, capped). Optional columns (help_level, hint_used) are read if present. */
export async function loadAttemptsServer(learnerId: string, limit = 20000): Promise<AttemptSummary[]> {
  return guarded("loadAttempts", async () => {
    const supabase = await createClient();
    // Paged: one PostgREST response stops at max_rows (1000), which a year of evenings passes in weeks.
    let result = await selectAllPages<Record<string, unknown>>(
      (from, to) =>
        supabase
          .from("learn_attempts")
          .select("skill_id, mode, correct, created_at, help_level, hint_used, ms, qtype:question->>type")
          .eq("learner_id", learnerId)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      { max: limit }
    );
    if (result.error && new LearnLoadError("loadAttempts", result.error).kind === "setup") {
      // Columns from the pending 007 edit may not exist yet → retry with the base columns.
      result = await selectAllPages<Record<string, unknown>>(
        (from, to) =>
          supabase.from("learn_attempts").select("skill_id, mode, correct, created_at").eq("learner_id", learnerId).order("created_at", { ascending: false }).order("id").range(from, to),
        { max: limit }
      );
    }
    if (result.error) fail("loadAttempts", result.error);
    return result.data.map((row) => ({
      skillId: String(row.skill_id ?? ""),
      mode: typeof row.mode === "string" ? row.mode : "learn",
      correct: row.correct === true,
      helpLevel: typeof row.help_level === "string" ? row.help_level : null,
      hintUsed: typeof row.hint_used === "boolean" ? row.hint_used : null,
      ms: typeof row.ms === "number" ? row.ms : null,
      questionType: typeof row.qtype === "string" ? row.qtype : null,
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
    }));
  });
}

export interface WalletTotals extends Wallet {
  /** points earned this family week (cap 25) */
  weekPoints: number;
}

/**
 * XP (level ladder) and the points wallet: balance = points earned (pt: rows)
 * − redemptions paid in points (learn_redemptions.priced_in = 'points',
 * migration 009). No timestamps are compared, so a client-set created_at can
 * never hide a redemption. Throws LearnLoadError.
 */
export async function loadWalletServer(learnerId: string, today = todayInFamilyTz()): Promise<WalletTotals> {
  return guarded("loadWallet", async () => {
    const supabase = await createClient();
    const [ledger, redemptions] = await Promise.all([
      selectAllPages<RewardRow>((from, to) =>
        supabase.from("learn_rewards").select("delta, reason, created_at").eq("learner_id", learnerId).order("created_at").order("id").range(from, to)
      ),
      selectAllPages<{ cost: number }>((from, to) =>
        supabase.from("learn_redemptions").select("cost").eq("learner_id", learnerId).eq("priced_in", "points").order("id").range(from, to)
      ),
    ]);
    if (ledger.error) fail("loadWallet", ledger.error);
    if (redemptions.error) fail("loadWallet", redemptions.error);
    const rows = ledger.data.map(rewardFromRow);
    // No createdAt: walletFrom then charges every one of them (they are all points redemptions).
    const spent = redemptions.data.map((r) => ({ cost: Number(r.cost) || 0 }));
    return { ...walletFrom(rows, spent), weekPoints: weekPoints(rows, today) };
  });
}

/** Pony names (learn_notes kind 'pony'), newest first. */
export async function loadPonyNotesServer(learnerId: string): Promise<LearnNote[]> {
  return guarded("loadPonyNotes", async () => {
    const supabase = await createClient();
    const { data, error } = await selectAllPages<Record<string, unknown>>((from, to) =>
      supabase.from("learn_notes").select("*").eq("learner_id", learnerId).eq("kind", "pony").order("created_at", { ascending: false }).order("id").range(from, to)
    );
    if (error) fail("loadPonyNotes", error);
    return data.map(noteFromRowServer);
  });
}

export interface TonightKidBundle {
  learner: Learner;
  progress: SkillProgress[];
  sessions: SessionRecord[];
  /** learn_notes of the last 8 days (today's homework ticks, Together cards, books; the homework rule) */
  notes: LearnNote[];
  /** this week's ledger rows (points, surprise bonus given today) */
  weekRewards: RewardRecord[];
  /** the streak's history (loadStreakSessionsServer) */
  streak: StreakSessions;
  /** spendable points (points earned − redemptions) for the parent's Rewards sheet */
  balance: number;
  /** the learner's reward store (active and inactive; the sheet shows the active ones) */
  rewardItems: RewardItem[];
}

/** Both kids for the Tonight runner, in parallel. Throws LearnLoadError. */
export async function loadTonightBundleServer(today = todayInFamilyTz()): Promise<TonightKidBundle[]> {
  const learners = await loadLearnersServer();
  return Promise.all(
    learners.map(async (learner) => {
      const [progress, sessions, notes, weekRewards, streak, wallet, rewardItems] = await Promise.all([
        loadProgressServer(learner.id),
        loadRecentSessionsServer(learner.id, 14, today),
        loadNotesServer(learner.id, addDaysToDateStr(today, -7), today),
        loadWeekRewardsServer(learner.id, today),
        loadStreakSessionsServer(learner.id, today),
        loadWalletServer(learner.id, today),
        loadRewardItemsServer(learner.id),
      ]);
      return { learner, progress, sessions, notes, weekRewards, streak, balance: wallet.balance, rewardItems };
    })
  );
}
