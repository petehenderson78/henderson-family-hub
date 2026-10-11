"use client";

import Link from "next/link";
import type { SessionBlock } from "@/lib/learn/types";
import { BLOCK_EMOJI } from "@/lib/learn/mastery";

interface MissionCardProps {
  slug: string;
  blocks: SessionBlock[];
  /** when true the mission is fully done */
  completed: boolean;
}

export default function MissionCard({ slug, blocks, completed }: MissionCardProps) {
  const nextIndex = blocks.findIndex((b) => !b.done);
  const total = blocks.reduce((sum, b) => sum + b.minutes, 0);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Today&apos;s Mission</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{total} min</span>
      </div>

      {blocks.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No blocks yet — the skill catalog is still being loaded.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {blocks.map((b, i) => {
            const isNext = i === nextIndex;
            return (
              <li
                key={`${b.kind}-${i}`}
                className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
                  b.done
                    ? "border-emerald-100 bg-emerald-50/60"
                    : isNext
                      ? "border-indigo-200 bg-indigo-50/60"
                      : "border-slate-100 bg-slate-50/60"
                }`}
              >
                <span className="text-2xl" aria-hidden>
                  {BLOCK_EMOJI[b.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{b.label}</p>
                  <p className="text-xs font-medium text-slate-400">
                    {b.minutes} min · {b.mode === "review" ? "Review" : b.mode === "test" ? "Test out" : "Learn"}
                    {b.done && typeof b.correct === "number" && typeof b.total === "number" ? ` · ${b.correct}/${b.total}` : ""}
                  </p>
                </div>
                <span
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    b.done ? "bg-emerald-500 text-white" : isNext ? "bg-indigo-600 text-white" : "bg-white text-slate-300 border border-slate-200"
                  }`}
                >
                  {b.done ? "✓" : isNext ? "▶" : i + 1}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {completed || (blocks.length > 0 && nextIndex === -1) ? (
        <div className="mt-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 p-4 text-center text-white shadow-lg shadow-emerald-500/20">
          <p className="text-lg font-bold">Mission complete! 🎉</p>
          <p className="mt-0.5 text-xs font-medium text-white/80">Come back tomorrow for a new one.</p>
        </div>
      ) : (
        blocks.length > 0 && (
          <Link
            href={`/learn/${slug}/play?block=${Math.max(0, nextIndex)}`}
            className="mt-5 flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-blue-500/25 active:scale-[0.98] active:shadow-md"
          >
            {nextIndex > 0 ? "Keep going" : "Start"} 🚀
          </Link>
        )
      )}
    </div>
  );
}
