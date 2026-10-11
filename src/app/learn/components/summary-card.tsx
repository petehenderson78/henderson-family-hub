"use client";

import Link from "next/link";
import type { SkillStatus } from "@/lib/learn/types";

export interface MasteryChange {
  kidTitle: string;
  from: SkillStatus;
  to: SkillStatus;
}

interface SummaryCardProps {
  title: string;
  subtitle?: string;
  correct: number;
  total: number;
  xp: number;
  /** family currency earned this block, e.g. { amount: 1.5, name: "Lightning Bucks" } */
  currency?: { amount: number; name: string };
  /** streak flame after this block (frozen days never reset it) */
  streak?: { days: number; label: string };
  masteryChanges: MasteryChange[];
  confetti?: boolean;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  /** extra line under the title (e.g. placement results) */
  note?: string;
}

const CONFETTI_COLORS = ["#3b82f6", "#6366f1", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6"];

const STATUS_WORD: Record<SkillStatus, string> = {
  locked: "Locked",
  ready: "Ready",
  learning: "Learning",
  mastered: "Mastered ⭐",
};

export default function SummaryCard({
  title,
  subtitle,
  correct,
  total,
  xp,
  currency,
  streak,
  masteryChanges,
  confetti = false,
  primary,
  secondary,
  note,
}: SummaryCardProps) {
  const pct = total > 0 ? Math.round((100 * correct) / total) : 0;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      {confetti && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {Array.from({ length: 28 }, (_, i) => (
            <span
              key={i}
              className="confetti-piece"
              style={{
                left: `${(i * 37) % 100}%`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${(i % 7) * 0.15}s`,
                animationDuration: `${2.2 + (i % 5) * 0.3}s`,
                width: i % 3 === 0 ? 10 : 7,
                height: i % 2 === 0 ? 12 : 8,
              }}
            />
          ))}
        </div>
      )}

      <div className="relative text-center">
        <p className="animate-pop text-5xl" aria-hidden>
          {pct >= 90 ? "🏆" : pct >= 70 ? "🌟" : "💪"}
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm font-medium text-slate-400">{subtitle}</p>}
        {note && <p className="mt-2 text-sm font-semibold text-slate-600">{note}</p>}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Score</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {correct}
              <span className="text-lg text-slate-400">/{total}</span>
            </p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">XP earned</p>
            <p className="mt-1 text-3xl font-bold">+{xp}</p>
            {currency && currency.amount > 0 && (
              <p className="mt-0.5 text-xs font-semibold text-white/80">
                = {currency.amount} {currency.name}
              </p>
            )}
          </div>
        </div>

        {streak && (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-orange-50 px-3 py-2.5 text-sm font-semibold text-orange-800">
            <span className="animate-flame text-xl" aria-hidden>
              🔥
            </span>
            {streak.days} day{streak.days === 1 ? "" : "s"} · {streak.label}
          </div>
        )}

        {masteryChanges.length > 0 && (
          <ul className="mt-4 space-y-2 text-left">
            {masteryChanges.map((c) => (
              <li
                key={c.kidTitle}
                className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${c.to === "mastered" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
              >
                {c.to === "mastered" ? "⭐" : "📝"} {c.kidTitle}: {STATUS_WORD[c.from]} → {STATUS_WORD[c.to]}
              </li>
            ))}
          </ul>
        )}

        <Link
          href={primary.href}
          className="mt-6 flex min-h-[60px] items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]"
        >
          {primary.label}
        </Link>
        {secondary && (
          <Link href={secondary.href} className="mt-3 flex min-h-[48px] items-center justify-center rounded-2xl text-sm font-semibold text-slate-500">
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  );
}
