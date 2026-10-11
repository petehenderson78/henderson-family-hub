"use client";

import { levelFor } from "@/lib/learn/mastery";

interface XpBarProps {
  xp: number;
  compact?: boolean;
}

export default function XpBar({ xp, compact = false }: XpBarProps) {
  const lv = levelFor(xp);
  const pct = Math.round(lv.progress * 100);
  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <p className={`font-bold text-slate-900 ${compact ? "text-sm" : "text-base"}`}>
          <span className="mr-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-1.5 text-xs font-bold text-white">
            {lv.level}
          </span>
          {lv.name}
        </p>
        <p className="text-xs font-semibold text-slate-400">
          {xp - lv.xpStart} / {lv.xpNext - lv.xpStart} XP
        </p>
      </div>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600"
          style={{ width: `${Math.max(3, pct)}%`, transition: "width 600ms cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </div>
      {!compact && (
        <p className="mt-1.5 text-[11px] font-medium text-slate-400">
          {lv.xpNext - xp} XP to level {lv.level + 1}
        </p>
      )}
    </div>
  );
}
