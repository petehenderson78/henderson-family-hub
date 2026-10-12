"use client";

interface StreakFlameProps {
  streak: number;
  size?: "sm" | "lg";
  /**
   * The count is a lower bound (computeStreakInfo → complete: false: the walk
   * reached the oldest loaded day unbroken). Shown as "N+".
   */
  atLeast?: boolean;
}

export default function StreakFlame({ streak, size = "lg", atLeast = false }: StreakFlameProps) {
  const lit = streak > 0;
  const big = size === "lg";
  const more = atLeast && lit;
  return (
    <div
      className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-2xl ${big ? "px-3 py-2" : "px-2 py-1"} ${
        lit ? "bg-orange-50 text-orange-600" : "bg-slate-100 text-slate-400"
      }`}
      title={lit ? `${more ? "At least " : ""}${streak}-day streak` : "No streak yet"}
    >
      <span className={`${big ? "text-2xl" : "text-base"} ${lit ? "animate-flame" : "grayscale opacity-60"}`} aria-hidden>
        🔥
      </span>
      <span className={`${big ? "text-lg" : "text-sm"} font-bold tabular-nums`}>
        {streak}
        {more ? "+" : ""}
      </span>
      {big && <span className="text-xs font-semibold">{streak === 1 && !more ? "day" : "days"}</span>}
    </div>
  );
}
