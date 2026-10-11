"use client";

import { useState } from "react";
import Link from "next/link";
import type { Learner, Workshop } from "@/lib/learn/types";
import { WORKSHOPS, featuredWorkshops } from "@/lib/learn/workshops";
import { isoWeekNumber } from "@/lib/learn/dates";
import { POINTS } from "@/lib/learn/stats";
import { awardPoints, newClientId } from "@/lib/learn/store";
import { addNote } from "@/lib/learn/store-notes";
import HoldToConfirm from "../../components/hold-to-confirm";

interface WorkshopsViewProps {
  learner: Learner;
  doneThisWeek: string[];
  /** points earned this week (cap 25) */
  weekPoints: number;
  today: string;
  /** signed in as the kid: marking done needs a parent's hold */
  isKid: boolean;
}

export default function WorkshopsView({ learner, doneThisWeek, weekPoints, today, isKid }: WorkshopsViewProps) {
  const [done, setDone] = useState<Set<string>>(() => new Set(doneThisWeek));
  const [openId, setOpenId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [shows, setShows] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<Record<string, number>>({});
  const [justDone, setJustDone] = useState<string | null>(null);
  const currency = learner.settings.theme.currency;

  const featured = featuredWorkshops(isoWeekNumber(today));
  const featuredIds = new Set(featured.map((w) => w.id));
  const rest = WORKSHOPS.filter((w) => !featuredIds.has(w.id));
  const base = `/learn/${learner.slug}`;

  /** Done = every step checked AND the Show logged (a learn_notes row), then pt:workshop (3, within the weekly cap). */
  async function markDone(w: Workshop) {
    const show = (shows[w.id] ?? "").trim();
    if (done.has(w.id) || saving || !show) return;
    setSaving(w.id);
    setError(null);
    try {
      await addNote({
        learnerId: learner.id,
        date: today,
        kind: "other",
        subject: "workshop",
        text: `Workshop Show — ${w.title}: ${show}`,
        minutes: w.minutes,
        score: null,
        total: null,
        standards: [],
      });
      const points = await awardPoints(learner.id, "workshop", { today, detail: w.id, clientId: newClientId() });
      setPaid((p) => ({ ...p, [w.id]: points }));
      setDone((d) => new Set(d).add(w.id));
      setJustDone(w.id);
    } catch {
      setError("Couldn't save. Check the connection and try again.");
    } finally {
      setSaving(null);
    }
  }

  // A render function, not a nested component: a component defined in render remounts on every
  // keystroke and the Show input would lose focus.
  function renderCard(w: Workshop, featuredCard: boolean) {
    const isOpen = openId === w.id;
    const isDone = done.has(w.id);
    const stepKey = (i: number) => `${w.id}:${i}`;
    const allChecked = w.steps.every((_, i) => checked[stepKey(i)]);
    const show = shows[w.id] ?? "";
    const ready = allChecked && show.trim().length > 0 && saving !== w.id;
    return (
      <div key={w.id} className={`rounded-2xl border bg-white shadow-sm ${isDone ? "border-emerald-200" : featuredCard ? "border-indigo-100" : "border-slate-100"}`}>
        <button type="button" onClick={() => setOpenId(isOpen ? null : w.id)} className="flex min-h-[72px] w-full items-center gap-3 p-4 text-left">
          <span className={`text-3xl ${justDone === w.id ? "animate-pop" : ""}`} aria-hidden>
            {isDone ? "✅" : w.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold text-slate-900">{w.title}</span>
            <span className="block text-xs font-medium text-slate-400">
              {w.minutes} min · +{w.points} {currency} with a Show{isDone ? " · done this week" : ""}
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
              <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700">
                Done! {paid[w.id] !== undefined ? (paid[w.id] > 0 ? `+${paid[w.id]} ${currency} 🎉` : "This week's points are all in — great work 🎉") : "🎉"}
              </p>
            ) : (
              <div className="mt-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Grown-up: the Show (who saw it, what was shown)</span>
                  <input
                    value={show}
                    maxLength={200}
                    onChange={(e) => setShows((m) => ({ ...m, [w.id]: e.target.value }))}
                    placeholder="Showed Grandpa the bridge holding 41 coins"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none focus:border-indigo-400"
                  />
                </label>
                {isKid ? (
                  <div className="mt-2">
                    <HoldToConfirm
                      label={ready ? "Parent: hold to mark done" : !allChecked ? "Check off every step first" : "Log the Show first"}
                      disabled={!ready}
                      onConfirm={() => void markDone(w)}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={() => void markDone(w)}
                    className="mt-2 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-bold text-white shadow-lg shadow-blue-500/20 disabled:opacity-40"
                  >
                    {saving === w.id ? "Saving…" : !allChecked ? "Check off every step first" : !show.trim() ? "Log the Show first" : `Mark done · +${w.points} ${currency}`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
      <div className="mx-auto max-w-lg px-4 pt-8">
        <Link href={base} className="text-xs font-semibold text-slate-400">
          ← Mission Control
        </Link>
        <h1 className="mt-3 text-[28px] font-bold tracking-tight text-slate-900">Workshops 🛠️</h1>
        <p className="mt-1.5 text-sm font-medium text-slate-400">
          The weekend brain block. Pick one, do every step, then show someone what you made. {Math.min(weekPoints, POINTS.weeklyCap)} of {POINTS.weeklyCap}{" "}
          {currency} this week.
        </p>

        {error && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{error}</p>}

        <h2 className="mt-7 mb-3 text-base font-bold text-slate-900">This week&apos;s picks</h2>
        <div className="space-y-3">
          {featured.map((w) => renderCard(w, true))}
        </div>

        {rest.length > 0 && (
          <>
            <h2 className="mt-8 mb-3 text-base font-bold text-slate-900">More workshops</h2>
            <div className="space-y-3">
              {rest.map((w) => renderCard(w, false))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
