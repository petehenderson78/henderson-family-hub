"use client";

import type { WeeklyRing as WeeklyRingData } from "@/lib/learn/stats";
import type { ThemeScreen } from "@/lib/learn/types";
import ProgressRing from "./progress-ring";

interface WeeklyRingProps {
  ring: WeeklyRingData;
  size?: number;
  /** show the Mon..Sun dots under the ring */
  dots?: boolean;
  /** theme words: a W on the scoreboard (diamond) or a blue ribbon (tutu) when the ring closes */
  screen?: ThemeScreen;
}

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const CLOSED_WORD: Record<ThemeScreen, string> = {
  diamond: "Ring closed — a W! 🏆",
  tutu: "Ring closed — blue ribbon! 🎀",
  generic: "Ring closed! 🎉",
};

/**
 * The kid-facing primary signal: five stars a week — one per closed school
 * night, one per weekend set. Nothing is owed and nothing carries over.
 */
export default function WeeklyRing({ ring, size = 88, dots = true, screen = "generic" }: WeeklyRingProps) {
  return (
    <div className="flex flex-col items-center">
      <ProgressRing value={ring.stars / ring.target} size={size} stroke={9} color={ring.closed ? "#10b981" : "#4f46e5"}>
        <div className="text-center leading-none">
          <p className="text-2xl font-bold tabular-nums text-slate-900">
            {ring.stars}
            <span className="text-sm font-semibold text-slate-400">/{ring.target}</span>
          </p>
          <p className="mt-0.5 text-[10px] font-bold text-amber-500" aria-hidden>
            ★
          </p>
        </div>
      </ProgressRing>
      <p className="mt-1.5 text-center text-[11px] font-semibold text-slate-500">
        {ring.closed ? CLOSED_WORD[screen] : `${ring.stars} of ${ring.target} stars`}
      </p>
      {ring.fridayFree && !ring.closed && <p className="mt-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Friday Free ✓</p>}
      {dots && (
        <div className="mt-1.5 flex gap-1" aria-label={`Stars this week: ${ring.days.filter(Boolean).length}`}>
          {ring.days.map((d, i) => (
            <span
              key={i}
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                d ? (i >= 5 ? "bg-amber-400 text-white" : "bg-emerald-500 text-white") : i >= 5 ? "bg-slate-50 text-slate-300" : "bg-slate-100 text-slate-400"
              }`}
            >
              {d ? "★" : DAY_LETTERS[i]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
