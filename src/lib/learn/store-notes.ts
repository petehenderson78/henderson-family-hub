/**
 * Browser-side Supabase helpers for the parent-led side of the Learn module:
 * the notes log (book work, school homework, Together cards), the reward
 * store and redemptions, and the parent's night actions (skip tonight,
 * weekend set done). Client components only. Every write throws
 * LearnWriteError (see ./store) so callers can show `message` or branch on
 * `code`; reads throw a plain Error.
 *
 * Tables: supabase/migrations/008_learn_notes.sql (+ 009: kind 'pony',
 * learn_notes.client_id, learn_redemptions.client_id / priced_in, the balance
 * trigger, parent-only redemptions and learn_log_finished_book()).
 * snake_case ⇄ camelCase is converted inline here.
 */

import { createClient } from "@/lib/supabase/client";
import { newClientId, selectAllPages, sessionFromRow, type DbError, type SessionRow } from "./rows";
import { LearnWriteError, toWriteError, loadTodaySession, isLearnWriteError, type LearnWriteErrorCode } from "./store";
import type { SessionRecord } from "./types";

export { LearnWriteError, isLearnWriteError, type LearnWriteErrorCode };

export type NoteKind = "book" | "homework" | "together" | "read-aloud" | "fluency" | "other" | "pony";

export const NOTE_KINDS: readonly NoteKind[] = ["book", "homework", "together", "read-aloud", "fluency", "other", "pony"];

/** Kinds a parent picks in the log form (pony names come from Lily's summary card). */
export const LOGGABLE_NOTE_KINDS: readonly NoteKind[] = ["book", "homework", "together", "read-aloud", "fluency", "other"];

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  book: "Book work",
  homework: "School homework",
  together: "Together card",
  "read-aloud": "Read-aloud",
  fluency: "Fluency check",
  other: "Other",
  pony: "Pony name",
};

export interface LearnNote {
  id?: string;
  learnerId: string;
  /** YYYY-MM-DD in the family timezone */
  date: string;
  kind: NoteKind;
  subject: string | null;
  text: string | null;
  minutes: number;
  score: number | null;
  total: number | null;
  standards: string[];
  recordedBy?: string | null;
  createdAt?: string;
  /**
   * Optional client-generated uuid (newClientId()). With it, addNote is
   * retry-safe: a second call with the same id returns the stored note
   * instead of logging it twice. Needs migration 009.
   */
  clientId?: string | null;
}

export interface RewardItem {
  id?: string;
  learnerId: string;
  title: string;
  cost: number;
  active: boolean;
  createdAt?: string;
}

export interface Redemption {
  id?: string;
  learnerId: string;
  itemId: string;
  cost: number;
  redeemedBy?: string | null;
  createdAt?: string;
  /** 'points' (the design §4 store) or 'xp' (the retired XP-priced store); migration 009 */
  pricedIn?: "points" | "xp";
}

/** Why a parent skipped a night (design: sick, travel, game night; streak freezes). */
export type SkipReason = "sick" | "travel" | "game" | "other";

export const SKIP_REASONS: readonly SkipReason[] = ["sick", "travel", "game", "other"];

interface NoteRow {
  id?: string;
  learner_id: string;
  date: string;
  kind: string;
  subject: string | null;
  text: string | null;
  minutes: number | null;
  score: number | null;
  total: number | null;
  standards: unknown;
  recorded_by?: string | null;
  created_at?: string;
  client_id?: string | null;
}

interface RewardItemRow {
  id?: string;
  learner_id: string;
  title: string;
  cost: number;
  active: boolean;
  created_at?: string;
}

interface RedemptionRow {
  id?: string;
  learner_id: string;
  item_id: string;
  cost: number;
  redeemed_by?: string | null;
  created_at?: string;
  priced_in?: string | null;
}

function client() {
  return createClient();
}

function checkRead(error: DbError | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export function isNoteKind(v: unknown): v is NoteKind {
  return typeof v === "string" && (NOTE_KINDS as readonly string[]).includes(v);
}

/** "1.OA.C.6, 3.OA.C.7 MP.7" → ["1.OA.C.6", "3.OA.C.7", "MP.7"] */
export function parseStandards(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20)
    )
  );
}

export function noteFromRow(row: NoteRow): LearnNote {
  return {
    id: row.id,
    learnerId: row.learner_id,
    date: typeof row.date === "string" ? row.date.slice(0, 10) : String(row.date),
    kind: isNoteKind(row.kind) ? row.kind : "other",
    subject: row.subject ?? null,
    text: row.text ?? null,
    minutes: Number(row.minutes) || 0,
    score: typeof row.score === "number" ? row.score : null,
    total: typeof row.total === "number" ? row.total : null,
    standards: Array.isArray(row.standards) ? row.standards.filter((s): s is string => typeof s === "string") : [],
    recordedBy: row.recorded_by ?? null,
    createdAt: row.created_at,
    clientId: row.client_id ?? null,
  };
}

function noteToRow(n: LearnNote): Omit<NoteRow, "id" | "created_at" | "recorded_by"> {
  const row: Omit<NoteRow, "id" | "created_at" | "recorded_by"> = {
    learner_id: n.learnerId,
    date: n.date,
    kind: n.kind,
    subject: n.subject?.trim() ? n.subject.trim().slice(0, n.kind === "pony" ? 80 : 40) : null,
    text: n.text?.trim() ? n.text.trim().slice(0, 500) : null,
    minutes: Math.max(0, Math.min(600, Math.round(n.minutes || 0))),
    score: typeof n.score === "number" && Number.isFinite(n.score) ? Math.max(0, Math.round(n.score)) : null,
    total: typeof n.total === "number" && Number.isFinite(n.total) ? Math.max(0, Math.round(n.total)) : null,
    standards: n.standards.slice(0, 20),
  };
  // Only sent when given, so a database without migration 009 still takes plain notes.
  if (n.clientId) row.client_id = n.clientId;
  return row;
}

export function rewardItemFromRow(row: RewardItemRow): RewardItem {
  return {
    id: row.id,
    learnerId: row.learner_id,
    title: row.title,
    cost: Math.max(1, Number(row.cost) || 1),
    active: row.active !== false,
    createdAt: row.created_at,
  };
}

export function redemptionFromRow(row: RedemptionRow): Redemption {
  return {
    id: row.id,
    learnerId: row.learner_id,
    itemId: row.item_id,
    cost: Number(row.cost) || 0,
    redeemedBy: row.redeemed_by ?? null,
    createdAt: row.created_at,
    pricedIn: row.priced_in === "xp" ? "xp" : row.priced_in === "points" ? "points" : undefined,
  };
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/** Notes for a learner between two YYYY-MM-DD dates (inclusive), newest first. Paged past 1000 rows. */
export async function loadNotes(learnerId: string, range: { from: string; to: string }): Promise<LearnNote[]> {
  const sb = client();
  const { data, error } = await selectAllPages<NoteRow>((from, to) =>
    sb
      .from("learn_notes")
      .select("*")
      .eq("learner_id", learnerId)
      .gte("date", range.from)
      .lte("date", range.to)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
  );
  checkRead(error, "loadNotes");
  return data.map(noteFromRow);
}

const NOTE_MESSAGES: Partial<Record<LearnWriteErrorCode, string>> = {
  "not-allowed": "This login can't add notes for that learner.",
};

/**
 * Insert one note (INSERT-only table; recorded_by defaults to auth.uid()).
 * Returns the stored row. With `note.clientId` a retry returns the note
 * stored by the first try. Throws LearnWriteError.
 */
export async function addNote(note: LearnNote): Promise<LearnNote> {
  const sb = client();
  const row = noteToRow(note);
  const { data, error } = row.client_id
    ? await sb.from("learn_notes").upsert(row, { onConflict: "client_id", ignoreDuplicates: true }).select("*")
    : await sb.from("learn_notes").insert(row).select("*");
  if (error) throw toWriteError(error, "addNote", NOTE_MESSAGES);
  const stored = (data ?? [])[0] as NoteRow | undefined;
  if (stored) return noteFromRow(stored);
  if (row.client_id) {
    const { data: again, error: readError } = await sb.from("learn_notes").select("*").eq("client_id", row.client_id).maybeSingle();
    if (readError) throw toWriteError(readError, "addNote", NOTE_MESSAGES);
    if (again) return noteFromRow(again as NoteRow);
  }
  throw new LearnWriteError("blocked", "The note wasn't saved. This login may not be allowed to add it.");
}

// ---------------------------------------------------------------------------
// Reward store
// ---------------------------------------------------------------------------

export async function loadRewardItems(learnerId: string): Promise<RewardItem[]> {
  const { data, error } = await client()
    .from("learn_reward_items")
    .select("*")
    .eq("learner_id", learnerId)
    .order("cost", { ascending: true })
    .order("title");
  checkRead(error, "loadRewardItems");
  return ((data ?? []) as RewardItemRow[]).map(rewardItemFromRow);
}

const STORE_MESSAGES: Partial<Record<LearnWriteErrorCode, string>> = {
  duplicate: "That reward already exists",
  "not-allowed": "Only a parent login can change the reward store.",
  blocked: "The reward store wasn't changed: only a parent login can change it.",
};

function firstItem(data: unknown, what: string): RewardItem {
  const row = (Array.isArray(data) ? data[0] : null) as RewardItemRow | null | undefined;
  if (!row) throw new LearnWriteError("blocked", STORE_MESSAGES.blocked ?? what);
  return rewardItemFromRow(row);
}

/**
 * Insert (no id) or update (id) a reward item. Parents only (RLS). Throws
 * LearnWriteError: code "duplicate" (pgCode "23505", message "That reward
 * already exists") when the learner already has an item with that title,
 * "not-allowed" / "blocked" for a login that is not a parent.
 */
export async function upsertRewardItem(item: RewardItem): Promise<RewardItem> {
  const row = {
    learner_id: item.learnerId,
    title: item.title.trim().slice(0, 80),
    cost: Math.max(1, Math.round(item.cost)),
    active: item.active,
  };
  const sb = client();
  const { data, error } = item.id
    ? await sb.from("learn_reward_items").update(row).eq("id", item.id).select("*")
    : await sb.from("learn_reward_items").insert(row).select("*");
  if (error) throw toWriteError(error, "upsertRewardItem", STORE_MESSAGES);
  return firstItem(data, "upsertRewardItem");
}

/**
 * Change an existing item's price and/or whether it is on sale (parents only).
 * Returns the stored item; throws LearnWriteError ("blocked" when no row was
 * updated, e.g. a login that is not a parent).
 */
export async function updateRewardItem(id: string, patch: { cost?: number; active?: boolean }): Promise<RewardItem> {
  const update: { cost?: number; active?: boolean } = {};
  if (typeof patch.cost === "number" && Number.isFinite(patch.cost)) update.cost = Math.max(1, Math.round(patch.cost));
  if (typeof patch.active === "boolean") update.active = patch.active;
  const sb = client();
  if (Object.keys(update).length === 0) {
    const { data, error } = await sb.from("learn_reward_items").select("*").eq("id", id);
    if (error) throw toWriteError(error, "updateRewardItem", STORE_MESSAGES);
    return firstItem(data, "updateRewardItem");
  }
  const { data, error } = await sb.from("learn_reward_items").update(update).eq("id", id).select("*");
  if (error) throw toWriteError(error, "updateRewardItem", STORE_MESSAGES);
  return firstItem(data, "updateRewardItem");
}

const REDEEM_MESSAGES: Partial<Record<LearnWriteErrorCode, string>> = {
  "not-allowed": "Only a parent can cash in rewards. Ask Mom or Dad.",
  "not-enough-points": "Not enough points for this reward yet.",
  "not-in-store": "That reward isn't in the store anymore.",
  blocked: "The reward wasn't redeemed. Try again from a parent login.",
};

/**
 * Redeem a reward (design §4: a parent approves): ONE learn_redemptions row.
 * The balance is points earned − points redemptions, so nothing is written to
 * the XP ledger. Pass a stable `clientId` per redemption so a retry is a
 * no-op; migration 009's trigger prices the row from the item and re-checks
 * the balance under a lock. Works only from a parent login. Returns the
 * stored redemption (cost from the item); throws LearnWriteError with code
 * "not-allowed" (a child's login), "not-enough-points", "not-in-store",
 * "setup" (migration 009 missing) or "failed".
 */
export async function redeemReward(learnerId: string, item: RewardItem, clientId: string = newClientId()): Promise<Redemption> {
  if (!item.id) throw new LearnWriteError("not-in-store", REDEEM_MESSAGES["not-in-store"] ?? "That reward isn't in the store.");
  const sb = client();
  const row = { learner_id: learnerId, item_id: item.id, cost: Math.max(1, Math.round(item.cost)), client_id: clientId };
  const { data, error } = await sb.from("learn_redemptions").upsert(row, { onConflict: "client_id", ignoreDuplicates: true }).select("*");
  if (error) throw toWriteError(error, "redeemReward", REDEEM_MESSAGES);
  const stored = (data ?? [])[0] as RedemptionRow | undefined;
  if (stored) return redemptionFromRow(stored);
  // No row back: the trigger skips a replay of a redemption that is already stored.
  const { data: earlier, error: readError } = await sb.from("learn_redemptions").select("*").eq("client_id", clientId).maybeSingle();
  if (readError) throw toWriteError(readError, "redeemReward", REDEEM_MESSAGES);
  if (earlier) return redemptionFromRow(earlier as RedemptionRow);
  throw new LearnWriteError("blocked", REDEEM_MESSAGES.blocked ?? "The reward wasn't redeemed.");
}

/**
 * "Finished a book" (design §4: 2 points per book finished and retold): a book
 * note whose text starts with "Finished:" plus the pt:book row, written in one
 * database transaction (learn_log_finished_book, migration 009). Both rows are
 * keyed by `actionId`: keep one id per logged book in component state and pass
 * it again on a retry, which then returns the first result (no second note, no
 * second award). Parent logins only (a child's login gets "not-allowed" and
 * nothing is written). `points` is 0 when the weekly cap is full; the book is
 * still logged.
 */
export async function logFinishedBook(
  learnerId: string,
  today: string,
  title: string,
  actionId: string = newClientId()
): Promise<{ note: LearnNote; points: number }> {
  const { data, error } = await client().rpc("learn_log_finished_book", {
    p_learner_id: learnerId,
    p_date: today,
    p_title: title.trim().slice(0, 200),
    p_action_id: actionId,
  });
  if (error) {
    throw toWriteError(error, "logFinishedBook", {
      "not-allowed": "Only a parent login can log a finished book.",
      duplicate: "That book was already logged.",
    });
  }
  const result = (data ?? null) as { note?: NoteRow | null; points?: number } | null;
  if (!result?.note) throw new LearnWriteError("blocked", "The book wasn't logged. Try again from a parent login.");
  return { note: noteFromRow(result.note), points: Math.max(0, Number(result.points) || 0) };
}

/** Name a mastered skill's pony (Lily's stable): a learn_notes row kind 'pony' (subject = skill id). */
/** Name a mastered skill's pony. Pass a stable `clientId` so a retried write cannot add a second note. */
export async function namePony(
  learnerId: string,
  today: string,
  skillId: string,
  name: string,
  standards: string[] = [],
  clientId?: string
): Promise<LearnNote> {
  return addNote({ learnerId, date: today, kind: "pony", subject: skillId, text: name, minutes: 0, score: null, total: null, standards, clientId });
}

export async function loadRedemptions(learnerId: string, limit = 50): Promise<Redemption[]> {
  const { data, error } = await client()
    .from("learn_redemptions")
    .select("*")
    .eq("learner_id", learnerId)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(limit);
  checkRead(error, "loadRedemptions");
  return ((data ?? []) as RedemptionRow[]).map(redemptionFromRow);
}

// ---------------------------------------------------------------------------
// Parent night actions (Tonight): skip a night, close the weekend set
// ---------------------------------------------------------------------------

const SESSION_MESSAGES: Partial<Record<LearnWriteErrorCode, string>> = {
  "not-allowed": "This login can't change that learner's night.",
  blocked: "The night wasn't saved. This login may not be allowed to change it.",
};

/**
 * Upsert only the given columns of (learner_id, date): columns that are not
 * sent (blocks, minutes, xp) keep their stored values on an existing row and
 * take the table defaults on a new one.
 */
async function patchSession(learnerId: string, date: string, patch: Partial<Omit<SessionRow, "learner_id" | "date">>, what: string): Promise<SessionRecord> {
  const { data, error } = await client()
    .from("learn_sessions")
    .upsert({ learner_id: learnerId, date, ...patch }, { onConflict: "learner_id,date" })
    .select("*");
  if (error) throw toWriteError(error, what, SESSION_MESSAGES);
  const row = (data ?? [])[0] as SessionRow | undefined;
  if (!row) throw new LearnWriteError("blocked", SESSION_MESSAGES.blocked ?? what);
  return sessionFromRow(row);
}

/**
 * "Skip tonight" (design G1): the night carries no debt and the streak
 * freezes. Writes status 'skipped' + skip_reason, keeping any blocks already
 * stored. Refuses a night that is already done (code "already-done"), so a
 * stale Tonight screen cannot take away an earned star.
 */
export async function markNightSkipped(learnerId: string, date: string, reason: SkipReason): Promise<SessionRecord> {
  if (!SKIP_REASONS.includes(reason)) throw new LearnWriteError("failed", `markNightSkipped: unknown reason "${String(reason)}"`);
  let existing: SessionRecord | null;
  try {
    existing = await loadTodaySession(learnerId, date);
  } catch (e) {
    throw e instanceof LearnWriteError ? e : new LearnWriteError("failed", "Couldn't check tonight's session. Check the connection and try again.");
  }
  if (existing && (existing.status === "done" || existing.completed)) {
    throw new LearnWriteError("already-done", "That night is already done, so there is nothing to skip.");
  }
  return patchSession(learnerId, date, { status: "skipped", skip_reason: reason, completed: false }, "markNightSkipped");
}

/**
 * "Weekend set done" (design G2): a parent closes the weekend set, which is
 * mostly off-app (book, workshop, Beast Academy). Writes status 'done' and
 * completed true, keeping the stored blocks (app blocks stay available).
 */
export async function markWeekendSetDone(learnerId: string, date: string): Promise<SessionRecord> {
  return patchSession(learnerId, date, { status: "done", completed: true, skip_reason: null }, "markWeekendSetDone");
}
