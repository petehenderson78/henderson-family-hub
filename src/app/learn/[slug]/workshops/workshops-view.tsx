"use client";

import { useState } from "react";
import Link from "next/link";
import type { Learner, Workshop } from "@/lib/learn/types";
import { WORKSHOPS, featuredWorkshops } from "@/lib/learn/workshops";
import { isoWeekNumber } from "@/lib/learn/dates";
import { addReward } from "@/lib/learn/store";

interface WorkshopsViewProps {
  learner: Learner;
  doneThisWeek: string[];
  today: string;
}

export default function WorkshopsView({ learner, doneThisWeek, today }: WorkshopsViewProps) {
  const [done, setDone] = useState<Set<string>>(() => new Set(doneThisWeek));
  const [openId, setOpenId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);

  const featured = featuredWorkshops(isoWeekNumber(today));
  const featuredIds = new Set(featured.map((w) => w.id));
  const rest = WORKSHOPS.filter((w) => !featuredIds.has(w.id));
  const base = `/learn/${learner.slug}`;

  async function markDone(w: Workshop) {
    if (done.has(w.id) || saving) return;
    setSaving(w.id);
    setError(null);
    try {
      await addReward(learner.id, w.xp, `workshop:${w.id}`);
      setDone((d) => new Set(d).add(w.id));
      setJustDone(w.id);
    } catch {
      setError("Couldn't save. Check the connection and try again.");
    } finally {
      setSaving(null);
    }
  }

  const Card = ({ w, featuredCard }: { w: Workshop; featuredCard: boolean }) => {
    const isOpen = openId === w.id;
    const isDone = done.has(w.id);
    const stepKey = (i: number) => `${w.id}:${i}`;
    const allChecked = w.steps.every((_, i) => checked[stepKey(i)]);
    return (
      <div className={`rounded-2xl border bg-white shadow-sm ${isDone ? "border-emerald-200" : featuredCard ? "border-indigo-100" : "border-slate-100"}`}>
        <button type="button" onClick={() => setOpenId(isOpen ? null : w.id)} className="flex min-h-[72px] w-full items-center gap-3 p-4 text-left">
          <span className={`text-3xl ${justDone === w.id ? "animate-pop" : ""}`} aria-hidden>
            {isDone ? "✅" : w.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold text-slate-900">{w.title}</span>
            <span className="block text-xs font-medium text-slate-400">
              {w.minutes} min · +{w.xp} XP{isDone ? " · done this week" : ""}
            </span>
          </span>
          <span className="text-slate-300">{isOpen ? "▴" : "▾"}</span>
        </button>
        {isOpen && (
          <div className="border-t border-slate-100 px-4 pb-4 pt-3">
            <p className="text-sm text-slate-600">{w.blurb}</p>
            <ul className="mt-3 space-y-2">
              {w.steps.map((step, i) => (
                <li key={i}>
                  <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl bg-slate-50 px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 flex-shrink-0 accent-indigo-600"
                      checked={!!checked[stepKey(i)] || isDone}
                      disabled={isDone}
                      onChange={(e) => setChecked((c) => ({ ...c, [stepKey(i)]: e.target.checked }))}
                    />
                    <span className={`text-sm ${isDone ? "text-slate-400 line-through" : "text-slate-700"}`}>{step}</span>
                  </label>
                </li>
              ))}
            </ul>
            {isDone ? (
              <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700">Done! +{w.xp} XP 🎉</p>
            ) : (
              <button
                type="button"
                disabled={!allChecked || saving === w.id}
                onClick={() => markDone(w)}
                className="mt-3 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-bold text-white shadow-lg shadow-blue-500/20 disabled:opacity-40"
              >
                {saving === w.id ? "Saving…" : allChecked ? `Mark done · +${w.xp} XP` : "Check off every step first"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
      <div className="mx-auto max-w-lg px-4 pt-8">
        <Link href={base} className="text-xs font-semibold text-slate-400">
          ← Mission Control
        </Link>
        <h1 className="mt-3 text-[28px] font-bold tracking-tight text-slate-900">Workshops 🛠️</h1>
        <p className="mt-1.5 text-sm font-medium text-slate-400">Afternoon projects. Pick one, do every step, earn XP.</p>

        {error && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{error}</p>}

        <h2 className="mt-7 mb-3 text-base font-bold text-slate-900">This week&apos;s picks</h2>
        <div className="space-y-3">
          {featured.map((w) => (
            <Card key={w.id} w={w} featuredCard />
          ))}
        </div>

        {rest.length > 0 && (
          <>
            <h2 className="mt-8 mb-3 text-base font-bold text-slate-900">More workshops</h2>
            <div className="space-y-3">
              {rest.map((w) => (
                <Card key={w.id} w={w} featuredCard={false} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
