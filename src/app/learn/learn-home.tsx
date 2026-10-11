"use client";

import Link from "next/link";
import type { Learner } from "@/lib/learn/types";
import type { TodayStatus } from "@/lib/learn/stats";
import { levelFor } from "@/lib/learn/mastery";
import ProgressRing from "./components/progress-ring";
import StreakFlame from "./components/streak-flame";

export interface KidSummary {
  learner: Learner;
  status: TodayStatus;
  blocksDone: number;
  blocksTotal: number;
  streak: number;
  xp: number;
}

export const KID_EMOJI: Record<string, string> = { cole: "🚀", lily: "🌈" };

const STATUS_TEXT: Record<TodayStatus, string> = {
  done: "Mission done!",
  "in-progress": "Mission in progress",
  "not-started": "Mission not started",
};

export default function LearnHome({ kids }: { kids: KidSummary[] }) {
  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
      <div className="mx-auto max-w-lg px-4 pt-10">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900">Learn</h1>
        <p className="mt-1.5 text-sm font-medium text-slate-400">Pick a mission to start today&apos;s 30 minutes.</p>

        {kids.length === 0 ? (
          <div className="mt-7 rounded-2xl border border-dashed border-slate-200 bg-white/50 p-6 text-center">
            <p className="text-sm font-semibold text-slate-600">No learners yet</p>
            <p className="mt-1 text-xs text-slate-400">Run supabase/migrations/007_learn.sql to seed Cole and Lily.</p>
          </div>
        ) : (
          <div className="mt-7 space-y-3">
            {kids.map((k) => {
              const lv = levelFor(k.xp);
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
                      Level {lv.level} · {lv.name}
                    </p>
                    <p className={`mt-1 text-sm font-medium ${k.status === "done" ? "text-emerald-600" : "text-slate-400"}`}>
                      {k.status === "done" ? "✓ " : ""}
                      {STATUS_TEXT[k.status]}
                      {k.status === "in-progress" && k.blocksTotal > 0 ? ` · ${k.blocksDone}/${k.blocksTotal}` : ""}
                    </p>
                  </div>
                  <StreakFlame streak={k.streak} size="sm" />
                </Link>
              );
            })}
          </div>
        )}

        <Link
          href="/learn/parent"
          className="mt-6 flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm active:scale-[0.98] active:bg-slate-50"
        >
          👨‍👩‍👧‍👦 Parent view
        </Link>
      </div>
    </div>
  );
}
