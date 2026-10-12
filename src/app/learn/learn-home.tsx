"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Learner } from "@/lib/learn/types";
import { formatClockLabel, minutesUntil, type TodayStatus } from "@/lib/learn/stats";
import { ladderFor, levelFor } from "@/lib/learn/mastery";
import ProgressRing from "./components/progress-ring";
import StreakFlame from "./components/streak-flame";

export interface KidSummary {
  learner: Learner;
  status: TodayStatus;
  blocksDone: number;
  blocksTotal: number;
  streak: number;
  /** the streak is a lower bound (its walk reached the oldest loaded day unbroken) */
  streakAtLeast?: boolean;
  xp: number;
  paused?: boolean;
}

export const KID_EMOJI: Record<string, string> = { cole: "🚀", lily: "🌈" };

const STATUS_TEXT: Record<TodayStatus, string> = {
  done: "Mission done!",
  "in-progress": "Mission in progress",
  "not-started": "Mission not started",
};

interface LearnHomeProps {
  kids: KidSummary[];
  /** YYYY-MM-DD in the family timezone */
  today?: string;
  nowIso?: string;
}

/** Parent landing: Tonight first, then each kid, then the parent view. (Kid logins never reach this page.) */
export default function LearnHome({ kids, nowIso }: LearnHomeProps) {
  const stopBy = kids.reduce<string | null>((e, k) => (e === null || k.learner.settings.stopBy < e ? k.learner.settings.stopBy : e), null) ?? "20:30";
  // Minute resolution: the page re-renders at most once a minute.
  const [nowMs, setNowMs] = useState(() => (nowIso ? Math.floor(new Date(nowIso).getTime() / 60_000) * 60_000 : 0));
  useEffect(() => {
    const tick = () => setNowMs(Math.floor(Date.now() / 60_000) * 60_000);
    const t = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, []);
  const minutesLeft = nowMs ? minutesUntil(stopBy, new Date(nowMs)) : null;

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
      <div className="mx-auto max-w-lg px-4 pt-10">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900">Learn</h1>
        <p className="mt-1.5 text-sm font-medium text-slate-400">30 minutes each, one adult, stop by {formatClockLabel(stopBy)}.</p>

        {/* Tonight — the parent's main entry */}
        {kids.length > 0 && (
          <Link
            href="/learn/tonight"
            className="tab-press mt-6 block rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white shadow-lg shadow-blue-500/25 active:scale-[0.99]"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">Run the evening</p>
                <p className="text-2xl font-bold">🌙 Tonight</p>
              </div>
              <span className="text-2xl text-white/70">→</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {kids.map((k) => (
                <span key={k.learner.id} className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold">
                  <span aria-hidden>{KID_EMOJI[k.learner.slug] ?? "⭐"}</span> {k.learner.name}:{" "}
                  {k.paused ? "vacation" : k.status === "done" ? "done ✓" : k.status === "in-progress" ? `${k.blocksDone}/${k.blocksTotal} blocks` : "not started"}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold text-white/80" suppressHydrationWarning>
              {minutesLeft === null ? `Blocks must finish by ${formatClockLabel(stopBy)}` : minutesLeft > 0 ? `Blocks must finish by ${formatClockLabel(stopBy)} · ${minutesLeft} min left · rotation, scripts, homework, log` : "Past the stop time — tomorrow is a fresh start"}
            </p>
          </Link>
        )}

        {kids.length === 0 ? (
          <div className="mt-7 rounded-2xl border border-dashed border-slate-200 bg-white/50 p-6 text-center">
            <p className="text-sm font-semibold text-slate-600">No learners yet</p>
            <p className="mt-1 text-xs text-slate-400">Run supabase/migrations/007_learn.sql to seed Cole and Lily.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {kids.map((k) => {
              const lv = levelFor(k.xp, ladderFor(k.learner.settings.theme));
              const ringValue = k.status === "done" ? 1 : k.blocksTotal > 0 ? k.blocksDone / k.blocksTotal : 0;
              return (
                <Link
                  key={k.learner.id}
                  href={`/learn/${k.learner.slug}`}
                  className="tab-press flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm active:bg-slate-50"
                >
                  <ProgressRing value={ringValue} size={72} stroke={7} color={k.status === "done" ? "#10b981" : "#4f46e5"}>
                    <span className="text-3xl" aria-hidden>
                      {KID_EMOJI[k.learner.slug] ?? "⭐"}
                    </span>
                  </ProgressRing>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-bold text-slate-900">{k.learner.name}</p>
                    <p className="text-xs font-semibold text-indigo-600">
                      {lv.name}
                    </p>
                    <p className={`mt-1 text-sm font-medium ${k.status === "done" ? "text-emerald-600" : "text-slate-400"}`}>
                      {k.paused ? "🏖️ Vacation mode" : (
                        <>
                          {k.status === "done" ? "✓ " : ""}
                          {STATUS_TEXT[k.status]}
                          {k.status === "in-progress" && k.blocksTotal > 0 ? ` · ${k.blocksDone}/${k.blocksTotal}` : ""}
                        </>
                      )}
                    </p>
                  </div>
                  <StreakFlame streak={k.streak} size="sm" atLeast={k.streakAtLeast} />
                </Link>
              );
            })}
          </div>
        )}

        <Link
          href="/learn/parent"
          className="mt-6 flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm active:scale-[0.98] active:bg-slate-50"
        >
          👨‍👩‍👧‍👦 Parent view · settings, flags, reports
        </Link>
      </div>
    </div>
  );
}
