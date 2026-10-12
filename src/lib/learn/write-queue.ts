/**
 * Persistent write queue for the practice player (and Mission Control).
 *
 * Every write the player makes (attempt rows, skill progress, the day's session
 * row, XP and point ledger rows, Lily's pony names) is first stored here, in
 * localStorage under `learn:pending:<slug>`, and only removed once Supabase
 * accepted it. A Wi-Fi blip, a reload or leaving the page therefore never loses
 * a write: the queue is flushed again when a page that uses it loads, when the
 * browser comes back 'online', when the tab becomes visible and after each block.
 *
 * Replays are safe because every write is idempotent: attempt and ledger rows
 * carry their client id (ON CONFLICT (client_id) DO NOTHING; awardPoints also
 * skips a client id it already finds), and progress / session rows are upserts
 * on their natural keys. A newer progress or session write for the same skill /
 * date REPLACES the queued one (only the latest state is ever sent), and the
 * queue runs one entry at a time in order, so an older state can never land
 * after a newer one from this device.
 *
 * A write the database refuses for good (the executor throws a
 * permanentWriteFailure: RLS / trigger refusals) is DROPPED from
 * the queue and recorded in the status (`dropped`) so the page can say so
 * calmly; anything else (network, timeout, server error) stays and is retried.
 *
 * Pure module: type-only imports and no Supabase, so the self-check / Node
 * probes can import it. The executor that talks to Supabase is passed in
 * (src/app/learn/components/use-write-queue.ts). Storage access is wrapped in
 * try/catch; without storage (private mode, quota) an in-memory copy keeps the
 * queue for this page-load.
 */

import type { AttemptRecord, SessionRecord, SkillProgress } from "./types";
import type { PointKind } from "./stats";

export type PendingWrite =
  | { op: "attempt"; attempt: AttemptRecord & { clientId: string } }
  | { op: "progress"; learnerId: string; progress: SkillProgress }
  | { op: "session"; session: SessionRecord }
  | { op: "reward"; learnerId: string; delta: number; reason: string; clientId: string }
  | { op: "points"; learnerId: string; kind: PointKind; today: string; detail?: string; clientId: string }
  | { op: "pony"; learnerId: string; today: string; skillId: string; name: string; standards: string[]; clientId?: string };

export interface QueuedWrite {
  /** unique per enqueue */
  id: string;
  /** dedupe key: a later write with the same key replaces this one */
  key: string;
  /** epoch ms */
  createdAt: number;
  /** executions started (a replay after a reload / failure has tries > 0) */
  tries: number;
  write: PendingWrite;
}

export interface FlushResult {
  ok: number;
  /** transient failures (kept for a retry) */
  failed: number;
  /** permanent failures (removed from the queue) */
  dropped: number;
  remaining: number;
}

/** A write removed from the queue because the database refused it for good. */
export interface DroppedWrite {
  id: string;
  op: PendingWrite["op"];
  code: string;
  message: string;
}

export interface QueueStatus {
  /** ids currently queued for the slug (oldest first) */
  ids: readonly string[];
  /** a flush pass is running */
  flushing: boolean;
  /** the last finished pass had at least one transient failure (cleared by a pass without one) */
  lastFailed: boolean;
  /** writes dropped as permanent failures during this page-load (newest last, capped) */
  dropped: readonly DroppedWrite[];
}

/** Marks an executor error as permanent: the entry is dropped instead of retried. */
export interface PermanentWriteFailure extends Error {
  permanent: true;
  code: string;
}

export function permanentWriteFailure(code: string, message: string): PermanentWriteFailure {
  return Object.assign(new Error(message), { permanent: true as const, code });
}

export function isPermanentWriteFailure(e: unknown): e is PermanentWriteFailure {
  return e instanceof Error && (e as Partial<PermanentWriteFailure>).permanent === true;
}

const DROPPED_KEEP = 50;

export type QueueStorage = Pick<Storage, "getItem" | "setItem">;

const OPS = new Set(["attempt", "progress", "session", "reward", "points", "pony"]);
/** Entries older than this are dropped on read (a write refused for good must not live forever). */
export const QUEUE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Safety cap on the stored list (a few blocks' worth is ~100 entries). */
export const QUEUE_MAX_ENTRIES = 2000;

export function queueStorageKey(slug: string): string {
  return `learn:pending:${slug}`;
}

/** The dedupe key: ledger rows by client id, progress by skill, the session by date, a pony by skill. */
export function writeKey(w: PendingWrite): string {
  switch (w.op) {
    case "attempt":
      return `attempt:${w.attempt.clientId}`;
    case "progress":
      return `progress:${w.learnerId}:${w.progress.skillId}`;
    case "session":
      return `session:${w.session.learnerId}:${w.session.date}`;
    case "reward":
      return `reward:${w.clientId}`;
    case "points":
      return `points:${w.clientId}`;
    case "pony":
      return `pony:${w.learnerId}:${w.skillId}`;
  }
}

function defaultStorage(): QueueStorage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** In-memory copy per slug: the source of truth when storage is unavailable. */
const memory = new Map<string, QueuedWrite[]>();

function isEntry(x: unknown): x is QueuedWrite {
  if (!x || typeof x !== "object") return false;
  const e = x as Partial<QueuedWrite>;
  return (
    typeof e.id === "string" &&
    typeof e.key === "string" &&
    typeof e.createdAt === "number" &&
    typeof e.tries === "number" &&
    !!e.write &&
    typeof e.write === "object" &&
    OPS.has((e.write as { op?: unknown }).op as string)
  );
}

function clean(list: QueuedWrite[], now: number): QueuedWrite[] {
  return list.filter((e) => now - e.createdAt <= QUEUE_MAX_AGE_MS).slice(-QUEUE_MAX_ENTRIES);
}

/** Slugs whose last storage write failed: their in-memory copy is newer than what storage holds. */
const storageBehind = new Set<string>();

export function readQueue(slug: string, storage: QueueStorage | null = defaultStorage(), now = Date.now()): QueuedWrite[] {
  if (storage && !storageBehind.has(slug)) {
    try {
      const raw = storage.getItem(queueStorageKey(slug));
      if (raw === null) return clean(memory.get(slug) ?? [], now);
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? clean(parsed.filter(isEntry), now) : [];
    } catch {
      // unreadable / corrupt: fall back to this page-load's copy
    }
  }
  return clean(memory.get(slug) ?? [], now);
}

function saveQueue(slug: string, list: QueuedWrite[], storage: QueueStorage | null): void {
  memory.set(slug, list);
  if (!storage) return;
  try {
    storage.setItem(queueStorageKey(slug), JSON.stringify(list));
    storageBehind.delete(slug);
  } catch {
    // quota / private mode: the in-memory copy (now the newer one) still retries during this page-load
    storageBehind.add(slug);
  }
}

let seq = 0;
function newId(): string {
  seq += 1;
  return `${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- status + listeners (useSyncExternalStore-friendly: a snapshot object only changes when something changed)

const listeners = new Map<string, Set<() => void>>();
const flags = new Map<string, { flushing: boolean; lastFailed: boolean }>();
const droppedLog = new Map<string, DroppedWrite[]>();
const snapshots = new Map<string, QueueStatus>();
const EMPTY_STATUS: QueueStatus = Object.freeze({
  ids: Object.freeze([]) as readonly string[],
  flushing: false,
  lastFailed: false,
  dropped: Object.freeze([]) as readonly DroppedWrite[],
});

export function emptyQueueStatus(): QueueStatus {
  return EMPTY_STATUS;
}

/** Recompute the slug's snapshot; returns true when it changed. Never notifies (safe during render). */
function recompute(slug: string, storage: QueueStorage | null): boolean {
  const ids = readQueue(slug, storage).map((e) => e.id);
  const f = flags.get(slug) ?? { flushing: false, lastFailed: false };
  const dropped = droppedLog.get(slug) ?? EMPTY_STATUS.dropped;
  const prev = snapshots.get(slug);
  const same =
    !!prev &&
    prev.flushing === f.flushing &&
    prev.lastFailed === f.lastFailed &&
    prev.dropped === dropped &&
    prev.ids.length === ids.length &&
    prev.ids.every((id, i) => id === ids[i]);
  if (!same) snapshots.set(slug, { ids, flushing: f.flushing, lastFailed: f.lastFailed, dropped });
  return !same;
}

function refresh(slug: string, storage: QueueStorage | null): void {
  if (recompute(slug, storage)) for (const fn of listeners.get(slug) ?? []) fn();
}

/** The current status snapshot (same object until something changes). */
export function getQueueStatus(slug: string): QueueStatus {
  if (!snapshots.has(slug)) recompute(slug, defaultStorage());
  return snapshots.get(slug) ?? EMPTY_STATUS;
}

export function subscribeQueue(slug: string, fn: () => void): () => void {
  let set = listeners.get(slug);
  if (!set) listeners.set(slug, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

/** Store a write (replacing a queued write with the same key) and return its entry. */
export function enqueueWrite(slug: string, write: PendingWrite, storage: QueueStorage | null = defaultStorage()): QueuedWrite {
  const key = writeKey(write);
  const entry: QueuedWrite = { id: newId(), key, createdAt: Date.now(), tries: 0, write };
  const list = readQueue(slug, storage).filter((e) => e.key !== key);
  list.push(entry);
  saveQueue(slug, list, storage);
  refresh(slug, storage);
  return entry;
}

function removeEntry(slug: string, id: string, storage: QueueStorage | null): void {
  const list = readQueue(slug, storage);
  const next = list.filter((e) => e.id !== id);
  if (next.length !== list.length) saveQueue(slug, next, storage);
}

function markTried(slug: string, id: string, storage: QueueStorage | null): void {
  const list = readQueue(slug, storage);
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], tries: list[i].tries + 1 };
  saveQueue(slug, list, storage);
}

/**
 * Runs one write; `replay` is true when an earlier execution of this entry was started (it may have
 * landed). Resolve = stored (or already stored); throw a permanentWriteFailure = refused for good
 * (dropped); throw anything else = transient (kept and retried).
 */
export type WriteExecutor = (write: PendingWrite, replay: boolean) => Promise<unknown>;

/** True when the browser reports no network (false in Node and when unknown). */
function browserIsOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function runPass(slug: string, exec: WriteExecutor, storage: QueueStorage | null): Promise<FlushResult> {
  flags.set(slug, { ...(flags.get(slug) ?? { lastFailed: false }), flushing: true });
  refresh(slug, storage);
  let ok = 0;
  let failed = 0;
  let dropped = 0;
  try {
    for (const entry of readQueue(slug, storage)) {
      // Skip an entry that a newer write replaced (or another tab finished) since the pass started.
      if (!readQueue(slug, storage).some((e) => e.id === entry.id)) continue;
      markTried(slug, entry.id, storage);
      try {
        await exec(entry.write, entry.tries > 0);
        removeEntry(slug, entry.id, storage);
        ok += 1;
      } catch (err) {
        if (isPermanentWriteFailure(err)) {
          removeEntry(slug, entry.id, storage);
          const log = [...(droppedLog.get(slug) ?? []), { id: entry.id, op: entry.write.op, code: err.code, message: err.message }];
          droppedLog.set(slug, log.slice(-DROPPED_KEEP));
          dropped += 1;
        } else {
          failed += 1;
          // Offline: every later write would fail the same way. Stop this pass (the
          // queue stays in order and retries on 'online'); a one-off server error
          // still lets the writes behind it through.
          if (browserIsOffline()) {
            refresh(slug, storage);
            break;
          }
        }
      }
      refresh(slug, storage);
    }
  } finally {
    flags.set(slug, { flushing: false, lastFailed: failed > 0 });
    refresh(slug, storage);
  }
  return { ok, failed, dropped, remaining: readQueue(slug, storage).length };
}

const running = new Map<string, Promise<FlushResult>>();
const waiting = new Map<string, Promise<FlushResult>>();

/**
 * Flush the slug's queue: one pass at a time; a call while a pass runs schedules
 * ONE more pass after it (calls in between share it), so every write enqueued
 * before the call is attempted.
 */
export function flushWriteQueue(slug: string, exec: WriteExecutor, storage: QueueStorage | null = defaultStorage()): Promise<FlushResult> {
  const queued = waiting.get(slug);
  if (queued) return queued;
  const start = (): Promise<FlushResult> => {
    waiting.delete(slug);
    const pass = runPass(slug, exec, storage);
    running.set(slug, pass);
    void pass.finally(() => {
      if (running.get(slug) === pass) running.delete(slug);
    });
    return pass;
  };
  const current = running.get(slug);
  if (!current) return start();
  const next = current.catch(() => undefined).then(start);
  waiting.set(slug, next);
  return next;
}

/**
 * Writes still waiting for this learner, for a page built from server props that
 * do not have them yet (a reload before they landed): the latest queued progress
 * per skill and the queued session row for `date`.
 */
export function pendingOverlay(
  slug: string,
  learnerId: string,
  date: string,
  storage: QueueStorage | null = defaultStorage()
): { progress: SkillProgress[]; session: SessionRecord | null } {
  const progress = new Map<string, SkillProgress>();
  let session: SessionRecord | null = null;
  for (const { write } of readQueue(slug, storage)) {
    if (write.op === "progress" && write.learnerId === learnerId) progress.set(write.progress.skillId, write.progress);
    else if (write.op === "session" && write.session.learnerId === learnerId && write.session.date === date) session = write.session;
  }
  return { progress: [...progress.values()], session };
}
