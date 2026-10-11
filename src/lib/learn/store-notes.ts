/**
 * Browser-side Supabase helpers for the parent-led side of the Learn module:
 * the notes log (book work, school homework, Together cards), the reward
 * store and redemptions. Client components only. Every function throws on a
 * Supabase error so callers can retry/toast.
 *
 * Tables: supabase/migrations/008_learn_notes.sql (+ 009: kind 'pony',
 * learn_redemptions.client_id and the balance trigger). snake_case ⇄ camelCase
 * is converted inline here.
 */

import { createClient } from "@/lib/supabase/client";
import { newClientId } from "./rows";
import { awardPoints } from "./store";
import { BOOK_FINISHED_PREFIX } from "./stats";

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
}

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
}

function client() {
  return createClient();
}

function check(error: { message: string } | null, what: string): void {
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
  };
}

function noteToRow(n: LearnNote): Omit<NoteRow, "id" | "created_at" | "recorded_by"> {
  return {
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
  };
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/** Notes for a learner between two YYYY-MM-DD dates (inclusive), newest first. */
export async function loadNotes(learnerId: string, range: { from: string; to: string }): Promise<LearnNote[]> {
  const { data, error } = await client()
    .from("learn_notes")
    .select("*")
    .eq("learner_id", learnerId)
    .gte("date", range.from)
    .lte("date", range.to)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  check(error, "loadNotes");
  return ((data ?? []) as NoteRow[]).map(noteFromRow);
}

/** Insert one note (INSERT-only table; recorded_by defaults to auth.uid()). Returns the stored row. */
export async function addNote(note: LearnNote): Promise<LearnNote> {
  const { data, error } = await client().from("learn_notes").insert(noteToRow(note)).select("*").single();
  check(error, "addNote");
  return data ? noteFromRow(data as NoteRow) : note;
}

// ---------------------------------------------------------------------------
// Reward store
// ---------------------------------------------------------------------------

export async function loadRewardItems(learnerId: string): Promise<RewardItem[]> {
  const { data, error } = await client()
    .from("learn_reward_items")
    .select("*")
    .eq("learner_id", learnerId)
    .order("cost", { ascending: true });
  check(error, "loadRewardItems");
  return ((data ?? []) as RewardItemRow[]).map(rewardItemFromRow);
}

/** Insert (no id) or update (id) a reward item. Parents only (RLS). */
export async function upsertRewardItem(item: RewardItem): Promise<RewardItem> {
  const row = {
    learner_id: item.learnerId,
    title: item.title.trim().slice(0, 80),
    cost: Math.max(1, Math.round(item.cost)),
    active: item.active,
  };
  if (item.id) {
    const { data, error } = await client().from("learn_reward_items").update(row).eq("id", item.id).select("*").single();
    check(error, "upsertRewardItem");
    return data ? rewardItemFromRow(data as RewardItemRow) : item;
  }
  const { data, error } = await client().from("learn_reward_items").insert(row).select("*").single();
  check(error, "upsertRewardItem");
  return data ? rewardItemFromRow(data as RewardItemRow) : item;
}

/**
 * Redeem a reward: ONE learn_redemptions row (the balance is points earned −
 * redemptions, so nothing is written to the XP ledger and there is no second
 * write that could fail half-way). `clientId` makes a retried redemption a
 * no-op; migration 009's trigger re-checks the balance and the item's price.
 * Callers check balance >= cost first.
 */
export async function redeemReward(learnerId: string, item: RewardItem, clientId: string = newClientId()): Promise<Redemption> {
  if (!item.id) throw new Error("redeemReward: item has no id");
  const cost = Math.max(1, Math.round(item.cost));
  const row = { learner_id: learnerId, item_id: item.id, cost, client_id: clientId };
  let { error } = await client().from("learn_redemptions").upsert(row, { onConflict: "client_id", ignoreDuplicates: true });
  if (error && /client_id/i.test(error.message)) {
    // Migration 009 not applied yet: plain insert (no retry protection).
    ({ error } = await client().from("learn_redemptions").insert({ learner_id: learnerId, item_id: item.id, cost }));
  }
  check(error, "redeemReward");
  return { learnerId, itemId: item.id, cost };
}

/**
 * "Finished a book" (design §4: 2 points per book finished and retold): a book
 * note whose text starts with "Finished:" plus the pt:book row.
 */
export async function logFinishedBook(learnerId: string, today: string, title: string): Promise<{ note: LearnNote; points: number }> {
  const clean = title.trim().slice(0, 200);
  const note = await addNote({
    learnerId,
    date: today,
    kind: "book",
    subject: "reading",
    text: `${BOOK_FINISHED_PREFIX} ${clean || "a book"}`,
    minutes: 0,
    score: null,
    total: null,
    standards: [],
  });
  const points = await awardPoints(learnerId, "book", { today, clientId: newClientId() });
  return { note, points };
}

/** Name a mastered skill's pony (Lily's stable): a learn_notes row kind 'pony' (subject = skill id). */
export async function namePony(learnerId: string, today: string, skillId: string, name: string, standards: string[] = []): Promise<LearnNote> {
  return addNote({ learnerId, date: today, kind: "pony", subject: skillId, text: name, minutes: 0, score: null, total: null, standards });
}

export async function loadRedemptions(learnerId: string, limit = 50): Promise<Redemption[]> {
  const { data, error } = await client()
    .from("learn_redemptions")
    .select("*")
    .eq("learner_id", learnerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  check(error, "loadRedemptions");
  return ((data ?? []) as RedemptionRow[]).map(redemptionFromRow);
}
