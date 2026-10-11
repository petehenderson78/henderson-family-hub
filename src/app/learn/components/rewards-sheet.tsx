"use client";

import { useState } from "react";
import { redeemReward, type RewardItem } from "@/lib/learn/store-notes";
import { newClientId } from "@/lib/learn/store";
import HoldToConfirm from "./hold-to-confirm";

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
}

/**
 * The reward store as a bottom sheet. Redeem needs balance >= cost and a
 * parent's 1.5 s hold. The redemption is one learn_redemptions row (balance =
 * input points earned − redemptions); the client id makes a retried hold a
 * no-op, and migration 009's trigger refuses a redemption the points cannot cover.
 */
export default function RewardsSheet({ learnerId, learnerName, currency, balance, items, open, onClose, onRedeemed }: RewardsSheetProps) {
  const [pending, setPending] = useState<RewardItem | null>(null);
  /** one id per pending redemption, reused on retry */
  const [clientId, setClientId] = useState<string>("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error" | "short">("idle");

  if (!open) return null;
  const active = items.filter((i) => i.active);

  async function confirm() {
    if (!pending) return;
    setState("saving");
    try {
      await redeemReward(learnerId, pending, clientId || undefined);
      setState("done");
      onRedeemed(pending);
    } catch (err) {
      setState(/not enough points/i.test(err instanceof Error ? err.message : "") ? "short" : "error");
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

        {pending ? (
          <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
            <p className="text-base font-bold text-slate-900">{pending.title}</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Costs {pending.cost} {currency} · {balance - pending.cost} left after
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
                <p className="mt-3 text-xs font-semibold text-slate-500">Hand the phone to a grown-up.</p>
                <div className="mt-2">
                  <HoldToConfirm label="Parent: hold to confirm" holdingLabel="Keep holding…" disabled={state === "saving"} onConfirm={() => void confirm()} />
                </div>
                {state === "error" && <p className="mt-2 text-xs font-semibold text-rose-600">Couldn&apos;t save — hold again to retry.</p>}
                {state === "short" && <p className="mt-2 text-xs font-semibold text-rose-600">Not enough {currency} yet for this one.</p>}
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
                      {!can ? ` · ${item.cost - balance} more to go` : ""}
                    </p>
                  </div>
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
