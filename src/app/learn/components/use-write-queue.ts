"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { addReward, awardPoints, isLearnWriteError, loadProgress, loadTodaySession, logAttempt, saveProgress, upsertSession } from "@/lib/learn/store";
import { namePony } from "@/lib/learn/store-notes";
import {
  emptyQueueStatus,
  enqueueWrite,
  flushWriteQueue,
  getQueueStatus,
  permanentWriteFailure,
  readQueue,
  subscribeQueue,
  type FlushResult,
  type PendingWrite,
} from "@/lib/learn/write-queue";

/** While own writes are failing (and the browser says it is online), retry this often. */
const RETRY_MS = 5000;

const doneCount = (blocks: { done: boolean }[]) => blocks.filter((b) => b.done).length;

/** Calm, kid-safe line for writes the database refused for good (the codes go to the console). */
export const DROPPED_MESSAGE = "A few answers couldn't be saved on this login — a grown-up can look into it. Keep going!";

async function signedIn(): Promise<boolean> {
  try {
    const { data } = await createClient().auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

/**
 * Sends one queued write and sorts a failure by its store.ts LearnWriteError code:
 * - "failed", or anything that is not a LearnWriteError (network, timeout, server
 *   error) → rethrown: the entry stays queued and is retried;
 * - "setup" (a Supabase setup script is missing) → rethrown: kept and retried, so
 *   the work lands once a parent runs the script;
 * - "duplicate" / "already-done" → the row is already there: counts as saved;
 * - "not-allowed" / "blocked" while NOBODY is signed in (an expired session looks
 *   like an RLS refusal) → rethrown: kept until someone signs in again;
 * - any other code ("not-allowed", "blocked", …) → permanentWriteFailure:
 *   dropped from the queue, and the page shows DROPPED_MESSAGE instead of retrying forever.
 */
export async function executeWrite(w: PendingWrite, replay: boolean): Promise<void> {
  try {
    await runWrite(w, replay);
  } catch (e) {
    if (!isLearnWriteError(e) || e.code === "failed" || e.code === "setup") throw e;
    if (e.code === "duplicate" || e.code === "already-done") return;
    if ((e.code === "not-allowed" || e.code === "blocked") && !(await signedIn())) throw e;
    console.error(`Learn: dropped a ${w.op} write the database refused (${e.code}): ${e.message}`);
    throw permanentWriteFailure(e.code, e.message);
  }
}

/**
 * Every write is idempotent (client ids / upserts). On a REPLAY (an earlier try
 * was started, so it may have landed, and another device may have written since)
 * a progress or session row is skipped when the server already holds a newer
 * state, so a late replay never rolls back work done elsewhere.
 */
async function runWrite(w: PendingWrite, replay: boolean): Promise<void> {
  switch (w.op) {
    case "attempt":
      await logAttempt(w.attempt);
      return;
    case "progress": {
      if (replay) {
        const server = (await loadProgress(w.learnerId)).find((p) => p.skillId === w.progress.skillId);
        if (server?.lastPracticedAt && w.progress.lastPracticedAt && server.lastPracticedAt > w.progress.lastPracticedAt) return;
      }
      await saveProgress(w.learnerId, w.progress);
      return;
    }
    case "session": {
      const server = await loadTodaySession(w.session.learnerId, w.session.date);
      if (replay && server && doneCount(server.blocks) > doneCount(w.session.blocks)) return;
      // A night a parent closed meanwhile ("Weekend set done" on Tonight) stays done.
      const session = server?.status === "done" && w.session.status !== "done" ? { ...w.session, status: "done" as const, completed: true } : w.session;
      await upsertSession(session);
      return;
    }
    case "reward":
      await addReward(w.learnerId, w.delta, w.reason, w.clientId);
      return;
    case "points":
      await awardPoints(w.learnerId, w.kind, { today: w.today, detail: w.detail, clientId: w.clientId });
      return;
    case "pony":
      await namePony(w.learnerId, w.today, w.skillId, w.name, w.standards, w.clientId);
      return;
  }
}

/** saved · saving · failed (kept, retrying) · dropped (some refused for good; nothing left to wait for) */
export type SaveState = "saved" | "saving" | "failed" | "dropped";

/**
 * The learner's persistent write queue for a page: flushes on mount (writes left
 * over from an earlier visit), on 'online', when the tab becomes visible, and
 * every few seconds while this page's own writes are failing. `state` covers the
 * writes enqueued through THIS hook only (older leftovers are flushed but never
 * block the page); "dropped" means some of them were refused for good.
 */
export function useWriteQueue(slug: string, opts: { onFlushed?: (r: FlushResult) => void } = {}) {
  const { onFlushed } = opts;
  const status = useSyncExternalStore(
    useCallback((fn: () => void) => subscribeQueue(slug, fn), [slug]),
    () => getQueueStatus(slug),
    emptyQueueStatus
  );
  const [own, setOwn] = useState<string[]>([]);
  // Kept in a ref so `flush` (and the listeners below) stay stable when the caller passes an inline callback.
  const onFlushedRef = useRef(onFlushed);
  useEffect(() => {
    onFlushedRef.current = onFlushed;
  }, [onFlushed]);

  const flush = useCallback(() => {
    const p = flushWriteQueue(slug, executeWrite);
    void p.then((r) => onFlushedRef.current?.(r)).catch(() => undefined);
    return p;
  }, [slug]);

  const enqueue = useCallback(
    (write: PendingWrite) => {
      const entry = enqueueWrite(slug, write);
      // Kept for the page's lifetime (one block: a few hundred ids at most), so dropped ones are still recognised.
      setOwn((prev) => [...prev, entry.id]);
      void flush();
      return entry.id;
    },
    [slug, flush]
  );

  // Leftovers from an earlier visit / a reload, and every reconnect or return to the tab.
  useEffect(() => {
    const flushIfPending = () => {
      if (readQueue(slug).length > 0) void flush();
    };
    flushIfPending();
    const onOnline = () => flushIfPending();
    const onVisible = () => {
      if (document.visibilityState === "visible") flushIfPending();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug, flush]);

  const queued = new Set(status.ids);
  const ownPending = own.filter((id) => queued.has(id)).length;
  const ownIds = new Set(own);
  const ownDropped = status.dropped.filter((d) => ownIds.has(d.id)).length;
  const state: SaveState = ownPending > 0 ? (status.lastFailed ? "failed" : "saving") : ownDropped > 0 ? "dropped" : "saved";

  // A failed write retries on its own while the page is open (the 'online' event covers real outages).
  useEffect(() => {
    if (state !== "failed") return;
    const id = window.setInterval(() => {
      if (typeof navigator === "undefined" || navigator.onLine !== false) void flush();
    }, RETRY_MS);
    return () => window.clearInterval(id);
  }, [state, flush]);

  return { enqueue, flush, state, ownPending, ownDropped };
}
