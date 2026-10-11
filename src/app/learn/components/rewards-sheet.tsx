"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isLearnWriteError, redeemReward, type RewardItem } from "@/lib/learn/store-notes";
import { newClientId } from "@/lib/learn/store";
import { isParentEmail } from "@/lib/learn/stats";

interface RewardsSheetProps {
  learnerId: string;
  learnerName: string;
  currency: string;
  balance: number;
  items: RewardItem[];
  open: boolean;
  onClose: () => void;
  /** called after a successful redemption so the parent view can update the balance */
  onRedeemed: (item: RewardItem) => void;
  /**
   * Who is looking: true for a parent login, false for a kid login. Left undefined,
   * the sheet reads the signed-in email itself (as the bottom nav does).
   */
  viewerIsParent?: boolean;
}

/**
 * The reward store as a bottom sheet. Kids see the store, their balance and what
 * each reward still needs; cashing in is a parent's job (the database only lets a
 * parent login insert learn_redemptions), so a kid login gets "Ask Mom or Dad to
 * cash in a reward" and no redeem button. On a parent login: Redeem → a confirm
 * step in the sheet → one learn_redemptions row (balance = input points earned −
 * redemptions). The client id makes a retried confirm a no-op, and migration
 * 009's trigger refuses a redemption the points cannot cover.
 */
export default function RewardsSheet({ learnerId, learnerName, currency, balance, items, open, onClose, onRedeemed, viewerIsParent }: RewardsSheetProps) {
  const [pending, setPending] = useState<RewardItem | null>(null);
  /** one id per pending redemption, reused on retry */
  const [clientId, setClientId] = useState<string>("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error" | "short" | "denied" | "refused">("idle");
  /** the store's own calm text for any other refusal (not in the store, blocked, setup) */
  const [refusal, setRefusal] = useState("");
  /** the signed-in email's verdict when the page did not say (null = not known yet → kid view) */
  const [sessionIsParent, setSessionIsParent] = useState<boolean | null>(null);

  useEffect(() => {
    if (viewerIsParent !== undefined || !open) return;
    let alive = true;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (alive) setSessionIsParent(isParentEmail(data.session?.user?.email));
      })
      .catch(() => {
        if (alive) setSessionIsParent(false);
      });
    return () => {
      alive = false;
    };
  }, [viewerIsParent, open]);

  if (!open) return null;
  const active = items.filter((i) => i.active);
  const isParent = viewerIsParent ?? sessionIsParent === true;

  async function confirm() {
    if (!pending || state === "saving") return;
    setState("saving");
    try {
      await redeemReward(learnerId, pending, clientId || undefined);
      setState("done");
      onRedeemed(pending);
    } catch (err) {
      // store-notes throws LearnWriteError: "failed" is worth a retry, every other code is a refusal.
      if (!isLearnWriteError(err) || err.code === "failed") setState("error");
      else if (err.code === "not-enough-points") setState("short");
      else if (err.code === "not-allowed") setState("denied");
      else {
        setRefusal(err.message);
        setState("refused");
      }
    }
  }

  function reset() {
    setPending(null);
    setState("idle");
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 animate-fade-in" onClick={onClose} role="dialog" aria-modal="true" aria-label="Rewards">
      <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" aria-hidden />
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">🎁 Rewards</h2>
          <button type="button" onClick={onClose} className="min-h-[44px] rounded-full px-3 text-sm font-bold text-slate-400">
            Close
          </button>
        </div>
        <p className="mt-1 text-sm font-semibold text-indigo-700">
          {learnerName} has <span className="tabular-nums">{balance}</span> {currency}
        </p>
        {!isParent && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800">Ask Mom or Dad to cash in a reward 🙋</p>}

        {pending && isParent ? (
          <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
            <p className="text-base font-bold text-slate-900">{pending.title}</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Costs {pending.cost} {currency}
              {state === "done" ? ` · ${balance} left` : ` · ${balance - pending.cost} left after`}
            </p>
            {state === "done" ? (
              <>
                <p className="mt-3 rounded-xl bg-emerald-500 px-3 py-3 text-center text-sm font-bold text-white">Redeemed! Enjoy it, {learnerName} 🎉</p>
                <button type="button" onClick={reset} className="mt-2 flex min-h-[44px] w-full items-center justify-center text-sm font-bold text-slate-500">
                  Back to rewards
                </button>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm font-semibold text-slate-600">
                  Cash in &ldquo;{pending.title}&rdquo; for {learnerName}?
                </p>
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={state === "saving"}
                  className="mt-2 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-indigo-600 text-base font-bold text-white shadow-sm disabled:opacity-60"
                >
                  {state === "saving" ? "Saving…" : `Yes, cash it in · −${pending.cost} ${currency}`}
                </button>
                {state === "error" && <p className="mt-2 text-xs font-semibold text-rose-600">Couldn&apos;t save — tap again to retry.</p>}
                {state === "short" && <p className="mt-2 text-xs font-semibold text-rose-600">Not enough {currency} yet for this one.</p>}
                {state === "denied" && <p className="mt-2 text-xs font-semibold text-rose-600">Only a parent login can cash in rewards.</p>}
                {state === "refused" && <p className="mt-2 text-xs font-semibold text-rose-600">{refusal}</p>}
                <button type="button" onClick={reset} disabled={state === "saving"} className="mt-2 flex min-h-[44px] w-full items-center justify-center text-sm font-bold text-slate-400">
                  Cancel
                </button>
              </>
            )}
          </div>
        ) : active.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">No rewards in the store yet. A parent can add some in Parent view.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {active.map((item) => {
              const can = balance >= item.cost;
              return (
                <li key={item.id ?? item.title} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">{item.title}</p>
                    <p className="text-xs font-semibold text-slate-400">
                      {item.cost} {currency}
                      {!can ? ` · ${item.cost - balance} more to go` : !isParent ? " · you have enough!" : ""}
                    </p>
                  </div>
                  {isParent && (
                    <button
                      type="button"
                      disabled={!can}
                      onClick={() => {
                        setPending(item);
                        setClientId(newClientId());
                        setState("idle");
                      }}
                      className="min-h-[44px] rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      Redeem
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
