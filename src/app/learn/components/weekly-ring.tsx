"use client";

import type { WeeklyRing as WeeklyRingData } from "@/lib/learn/stats";
import ProgressRing from "./progress-ring";

interface WeeklyRingProps {
  ring: WeeklyRingData;
  size?: number;
  /** show the Mon..Sun dots under the ring */
  dots?: boolean;
}

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** The kid-facing primary signal: "3 of 5 school nights". Weekend days are a bonus, never owed. */
export default function WeeklyRing({ ring, size = 88, dots = true }: WeeklyRingProps) {
  const full = ring.done >= ring.target;
  return (
    <div className="flex flex-col items-center">
      <ProgressRing value={ring.done / ring.target} size={size} stroke={9} color={full ? "#10b981" : "#4f46e5"}>
        <div className="text-center leading-none">
          <p className="text-2xl font-bold tabular-nums text-slate-900">
            {ring.done}
            <span className="text-sm font-semibold text-slate-400">/{ring.target}</span>
          </p>
        </div>
      </ProgressRing>
      <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
        {full ? "All 5 school nights!" : `${ring.done} of ${ring.target} school nights`}
        {ring.extra > 0 ? ` · +${ring.extra} weekend` : ""}
      </p>
      {dots && (
        <div className="mt-1.5 flex gap-1" aria-hidden>
          {ring.days.map((d, i) => (
            <span
              key={i}
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                d ? (i >= 5 ? "bg-amber-400 text-white" : "bg-emerald-500 text-white") : i >= 5 ? "bg-slate-50 text-slate-300" : "bg-slate-100 text-slate-400"
              }`}
            >
              {DAY_LETTERS[i]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
