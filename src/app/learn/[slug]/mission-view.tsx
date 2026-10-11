"use client";

import { useState } from "react";
import Link from "next/link";
import type { Learner, SessionBlock, SessionRecord, SkillProgress } from "@/lib/learn/types";
import { catalogFor } from "@/lib/learn/catalog";
import { mergeProgress, planMission } from "@/lib/learn/mastery";
import { computeStreak, isPaused, reviewDueCount, sessionForDate, vacationReturnLabel, weeklyRing } from "@/lib/learn/stats";
import type { RewardItem } from "@/lib/learn/store-notes";
import { KID_EMOJI } from "../learn-home";
import XpBar from "../components/xp-bar";
import StreakFlame from "../components/streak-flame";
import WeeklyRing from "../components/weekly-ring";
import MissionCard from "../components/mission-card";
import RewardsSheet from "../components/rewards-sheet";
import CoachSheet from "../components/coach-sheet";
import { useCoach } from "../components/use-coach";

interface MissionViewProps {
  learner: Learner;
  progressRows: SkillProgress[];
  sessions: SessionRecord[];
  /** XP earned (positive ledger entries) — drives the level */
  xpTotal: number;
  /** spendable balance (sum of the whole ledger) in the kid's currency */
  balance: number;
  rewardItems: RewardItem[];
  today: string;
  nowIso: string;
  /** from the server page: Boolean(ANTHROPIC_API_KEY) */
  coachEnabled: boolean;
  /** signed in as cole@/lily@ → no parent links */
  isKid: boolean;
}

export default function MissionView({ learner, progressRows, sessions, xpTotal, balance: initialBalance, rewardItems, today, nowIso, coachEnabled, isKid }: MissionViewProps) {
  const catalog = catalogFor(learner.slug);
  const progressMap = mergeProgress(catalog, progressRows);
  const now = new Date(nowIso);
  const session = sessionForDate(sessions, today);
  const paused = isPaused(learner.settings, today);
  const blocks: SessionBlock[] =
    session && session.blocks.length > 0
      ? session.blocks
      : paused
        ? []
        : planMission(catalog, progressMap, learner.settings, now, today).blocks.map((b) => ({ ...b, done: false }));
  const streak = computeStreak(sessions, today, learner.settings);
  const ring = weeklyRing(sessions, today);
  const due = reviewDueCount(catalog, progressMap, now);
  const base = `/learn/${learner.slug}`;
  const currency = learner.settings.theme.currency;

  const [balance, setBalance] = useState(initialBalance);
  const [storeOpen, setStoreOpen] = useState(false);

  const coach = useCoach(learner.slug);
  const nextBlock = blocks.find((b) => !b.done);
  const doneCount = blocks.filter((b) => b.done).length;
  function cheer() {
    const note = [
      `This week: ${ring.done} of ${ring.target} school nights.`,
      `Streak: ${streak} day${streak === 1 ? "" : "s"}.`,
      blocks.length > 0 ? `Today: ${doneCount} of ${blocks.length} blocks done.` : paused ? "Vacation mode." : "No mission planned yet.",
      nextBlock ? `Next up: ${nextBlock.label}.` : blocks.length > 0 ? "Mission complete!" : "",
      due > 0 ? `${due} review${due === 1 ? "" : "s"} due.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    void coach.ask("Coach says", { action: "cheer", skillTitle: nextBlock?.label, childText: note });
  }

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
      <div className="mx-auto max-w-lg px-4 pt-8">
        {!isKid && (
          <Link href="/learn" className="text-xs font-semibold text-slate-400">
            ← All learners
          </Link>
        )}

        {/* Greeting + weekly ring (primary signal) */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[28px] font-bold tracking-tight text-slate-900">
              Hi, {learner.name}! <span aria-hidden>{KID_EMOJI[learner.slug] ?? "⭐"}</span>
            </h1>
            <p className="mt-0.5 text-sm font-medium text-slate-400">Mission Control</p>
            <div className="mt-2 flex items-center gap-2">
              <StreakFlame streak={streak} size="sm" />
              <span className="text-[11px] font-semibold text-slate-400">{paused ? "streak frozen" : "day streak"}</span>
            </div>
          </div>
          <WeeklyRing ring={ring} size={92} />
        </div>

        {/* XP + currency */}
        <div className="mt-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <XpBar xp={xpTotal} />
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{currency}</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900">
                <span aria-hidden>{learner.settings.theme.levels === "ballet" ? "✨" : learner.settings.theme.levels === "baseball" ? "⚡" : "🪙"}</span> {balance}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStoreOpen(true)}
              className="tab-press flex min-h-[48px] items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 text-sm font-bold text-white shadow-md shadow-orange-500/20"
            >
              🎁 Rewards
            </button>
          </div>
        </div>

        {/* Mission or vacation */}
        <div className="mt-4">
          {paused ? (
            <div className="rounded-2xl bg-gradient-to-r from-sky-400 to-cyan-500 p-6 text-center text-white shadow-lg shadow-sky-500/20">
              <p className="text-4xl" aria-hidden>
                🏖️
              </p>
              <p className="mt-2 text-xl font-bold">Vacation mode — see you on {vacationReturnLabel(learner.settings.pausedUntil ?? today)}!</p>
              <p className="mt-1 text-sm font-medium text-white/85">Your streak is frozen, not lost. No catch-up when you&apos;re back.</p>
            </div>
          ) : (
            <MissionCard slug={learner.slug} blocks={blocks} completed={!!session?.completed} />
          )}
        </div>

        {/* Links */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link
            href={`${base}/map`}
            className="tab-press flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border border-slate-100 bg-white shadow-sm active:bg-slate-50"
          >
            <span className="text-2xl" aria-hidden>
              🗺️
            </span>
            <span className="text-sm font-bold text-slate-800">Skill Map</span>
            {due > 0 && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">{due} review due</span>}
          </Link>
          <Link
            href={`${base}/workshops`}
            className="tab-press flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border border-slate-100 bg-white shadow-sm active:bg-slate-50"
          >
            <span className="text-2xl" aria-hidden>
              🛠️
            </span>
            <span className="text-sm font-bold text-slate-800">Workshops</span>
          </Link>
        </div>

        <div className="mt-4 flex items-center justify-between">
          {coachEnabled ? (
            <button
              type="button"
              onClick={cheer}
              className="tab-press inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-4 text-xs font-bold text-indigo-700 shadow-sm active:bg-indigo-50"
            >
              🤖 Coach
            </button>
          ) : (
            <span />
          )}
          {!isKid && (
            <Link href="/learn/parent" className="text-xs font-semibold text-slate-400">
              Parent view →
            </Link>
          )}
        </div>
      </div>

      <RewardsSheet
        learnerId={learner.id}
        learnerName={learner.name}
        currency={currency}
        balance={balance}
        items={rewardItems}
        open={storeOpen}
        onClose={() => setStoreOpen(false)}
        onRedeemed={(item) => setBalance((b) => b - item.cost)}
      />
      <CoachSheet state={coach.state} onClose={coach.close} bigText={learner.grade <= 1} />
    </div>
  );
}
