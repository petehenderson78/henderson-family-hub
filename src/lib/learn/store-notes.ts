/**
 * Browser-side Supabase helpers for the parent-led side of the Learn module:
 * the notes log (book work, school homework, Together cards), the reward
 * store and redemptions. Client components only. Every function throws on a
 * Supabase error so callers can retry/toast.
 *
 * Tables: supabase/migrations/008_learn_notes.sql. snake_case ⇄ camelCase is
 * converted inline here (rows.ts is owned by the engine).
 */

import { createClient } from "@/lib/supabase/client";

export type NoteKind = "book" | "homework" | "together" | "read-aloud" | "fluency" | "other";

export const NOTE_KINDS: readonly NoteKind[] = ["book", "homework", "together", "read-aloud", "fluency", "other"];

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  book: "Book work",
  homework: "School homework",
  together: "Together card",
  "read-aloud": "Read-aloud",
  fluency: "Fluency check",
  other: "Other",
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
    subject: n.subject?.trim() ? n.subject.trim().slice(0, 40) : null,
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
 * Redeem a reward: one learn_redemptions row AND one learn_rewards row with a
 * negative delta (reason "redeem:<itemId>") so the XP ledger stays the single
 * source of truth for the balance. Callers check balance >= cost first.
 */
export async function redeemReward(learnerId: string, item: RewardItem): Promise<Redemption> {
  if (!item.id) throw new Error("redeemReward: item has no id");
  const cost = Math.max(1, Math.round(item.cost));
  const { data, error } = await client()
    .from("learn_redemptions")
    .insert({ learner_id: learnerId, item_id: item.id, cost })
    .select("*")
    .single();
  check(error, "redeemReward");
  const { error: ledgerError } = await client()
    .from("learn_rewards")
    .insert({ learner_id: learnerId, delta: -cost, reason: `redeem:${item.id}` });
  check(ledgerError, "redeemReward (ledger)");
  return data ? redemptionFromRow(data as RedemptionRow) : { learnerId, itemId: item.id, cost };
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
