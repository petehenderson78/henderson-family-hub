"use client";

interface StreakFlameProps {
  streak: number;
  size?: "sm" | "lg";
}

export default function StreakFlame({ streak, size = "lg" }: StreakFlameProps) {
  const lit = streak > 0;
  const big = size === "lg";
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-2xl ${big ? "px-3 py-2" : "px-2 py-1"} ${
        lit ? "bg-orange-50 text-orange-600" : "bg-slate-100 text-slate-400"
      }`}
      title={lit ? `${streak}-day streak` : "No streak yet"}
    >
      <span className={`${big ? "text-2xl" : "text-base"} ${lit ? "animate-flame" : "grayscale opacity-60"}`} aria-hidden>
        🔥
      </span>
      <span className={`${big ? "text-lg" : "text-sm"} font-bold tabular-nums`}>{streak}</span>
      {big && <span className="text-xs font-semibold">{streak === 1 ? "day" : "days"}</span>}
    </div>
  );
}
