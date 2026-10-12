"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Learner, SessionBlock, SessionRecord, SkillProgress } from "@/lib/learn/types";
import { catalogFor } from "@/lib/learn/catalog";
import { kindProgress, ladderFor, mergeProgress } from "@/lib/learn/mastery";
import {
  POINTS,
  computeStreakInfo,
  isPaused,
  isWeekend,
  missionLaunchLine,
  missionRole,
  reviewDueCount,
  sessionForDate,
  todaysBlocks,
  vacationReturnLabel,
  weeklyRing,
} from "@/lib/learn/stats";
import type { LearnNote, RewardItem } from "@/lib/learn/store-notes";
import { KID_EMOJI } from "../learn-home";
import XpBar from "../components/xp-bar";
import StreakFlame from "../components/streak-flame";
import WeeklyRing from "../components/weekly-ring";
import MissionCard from "../components/mission-card";
import MissionScreen from "../components/mission-screen";
import RewardsSheet from "../components/rewards-sheet";
import CoachSheet from "../components/coach-sheet";
import { useCoach } from "../components/use-coach";
import { useWriteQueue } from "../components/use-write-queue";

interface MissionViewProps {
  learner: Learner;
  progressRows: SkillProgress[];
  sessions: SessionRecord[];
  /** the streak's history (date / status / completed since the program start or 400 days) */
  streakSessions: SessionRecord[];
  /** that read's lower date bound for computeStreakInfo (null = the whole history) */
  streakFrom: string | null;
  /** recent learn_notes (Lily's homework rule) */
  notes: LearnNote[];
  /** XP (level ladder only) */
  xpTotal: number;
  /** spendable input points (points earned − redemptions) */
  balance: number;
  /** points earned this week (cap 25) */
  weekPoints: number;
  rewardItems: RewardItem[];
  today: string;
  nowIso: string;
  /** from the server page: Boolean(ANTHROPIC_API_KEY) */
  coachEnabled: boolean;
  /** signed in as cole@/lily@ → no parent links */
  isKid: boolean;
}

export default function MissionView({
  learner,
  progressRows,
  sessions,
  streakSessions,
  streakFrom,
  notes,
  xpTotal,
  balance: initialBalance,
  weekPoints,
  rewardItems,
  today,
  nowIso,
  coachEnabled,
  isKid,
}: MissionViewProps) {
  const catalog = catalogFor(learner.slug);
  const progressMap = mergeProgress(catalog, progressRows);
  const now = new Date(nowIso);
  const session = sessionForDate(sessions, today);
  const settings = learner.settings;
  const theme = settings.theme;
  const screen = theme.screen ?? "generic";
  const paused = isPaused(settings, today);
  const weekend = isWeekend(today);
  const blocks: SessionBlock[] = todaysBlocks({ learner, catalog, progressMap, sessions, now, today, notes });
  const kinds = kindProgress(blocks);
  // Today's row from the 60-day read wins (same row; the streak read has no blocks).
  const streakInfo = computeStreakInfo(
    session ? [...streakSessions.filter((s) => s.date !== today), session] : streakSessions,
    today,
    settings,
    streakFrom
  );
  const streak = streakInfo.streak;
  const ring = weeklyRing(sessions, today);
  const role = missionRole(sessions, today);
  const due = reviewDueCount(catalog, progressMap, now, settings, today);
  const base = `/learn/${learner.slug}`;
  const currency = theme.currency;
  const ladder = ladderFor(theme);

  const [balance, setBalance] = useState(initialBalance);
  const [storeOpen, setStoreOpen] = useState(false);

  // Practice writes still waiting on this device (Wi-Fi blip, "Continue anyway") are sent on load and on
  // reconnect; when any land, the server props are refreshed so the mission shows the finished blocks.
  const router = useRouter();
  useWriteQueue(learner.slug, {
    onFlushed: (r) => {
      if (r.ok > 0) router.refresh();
    },
  });

  const coach = useCoach(learner.slug);
  const nextBlock = blocks.find((b) => !b.done);
  const doneCount = kinds.filter((k) => k.done).length;
  function cheer() {
    const note = [
      `This week: ${ring.stars} of ${ring.target} stars.`,
      `Streak: ${streakInfo.complete ? "" : "at least "}${streak} day${streak === 1 ? "" : "s"}.`,
      kinds.length > 0 ? `Today: ${doneCount} of ${kinds.length} blocks done.` : paused ? "Vacation mode." : "No mission planned yet.",
      nextBlock ? `Next up: ${nextBlock.label}.` : kinds.length > 0 ? "Mission complete!" : "",
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
          <Link href="/learn" className="-ml-1 inline-flex min-h-[44px] items-center pl-1 pr-3 text-xs font-semibold text-slate-400">
            ← All learners
          </Link>
        )}

        {/* Greeting + weekly ring (primary signal) */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[28px] font-bold tracking-tight text-slate-900">
              Hi, {learner.name}! <span aria-hidden>{KID_EMOJI[learner.slug] ?? "⭐"}</span>
            </h1>
            <p className="mt-0.5 text-sm font-medium text-slate-400">{screen === "diamond" ? "Lightning Dash" : screen === "tutu" ? "Sparkle Stage" : "Mission Control"}</p>
            <div className="mt-2 flex items-center gap-2">
              <StreakFlame streak={streak} size="sm" atLeast={!streakInfo.complete} />
              <span className="text-[11px] font-semibold text-slate-400">{paused ? "streak frozen" : "day streak"}</span>
            </div>
          </div>
          <WeeklyRing ring={ring} size={92} screen={screen} />
        </div>

        {/* Tonight: the two-line mission, the night's screen, the time-back line */}
        <div className="mt-4">
          {paused ? (
            <div className="rounded-2xl bg-gradient-to-r from-sky-400 to-cyan-500 p-6 text-center text-white shadow-lg shadow-sky-500/20">
              <p className="text-4xl" aria-hidden>
                🏖️
              </p>
              <p className="mt-2 text-xl font-bold">Vacation mode — see you on {vacationReturnLabel(settings, today)}!</p>
              <p className="mt-1 text-sm font-medium text-white/85">Your streak is frozen, not lost. No catch-up when you&apos;re back.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              {role !== "required" && (
                <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-sm font-bold text-emerald-700">
                  {role === "optional" ? "Friday Free! Four stars are in — tonight is optional." : "Bonus set — your ring is already closed. Only if you want to!"}
                </p>
              )}
              <p className="text-base font-bold text-slate-900">{missionLaunchLine(blocks, weekend)}</p>
              {theme.timeBack && <p className="mt-1 text-sm font-semibold text-indigo-600">{theme.timeBack}</p>}
              {kinds.length > 0 && (
                <div className="mt-4">
                  <MissionScreen screen={screen} kinds={kinds} />
                </div>
              )}
            </div>
          )}
        </div>

        {!paused && (
          <div className="mt-4">
            <MissionCard slug={learner.slug} blocks={blocks} completed={!!session?.completed || (blocks.length > 0 && blocks.every((b) => b.done))} />
          </div>
        )}

        {/* Level ladder + points */}
        <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <XpBar xp={xpTotal} ladder={ladder} />
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{currency}</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900">
                <span aria-hidden>{theme.levels === "ballet" ? "✨" : theme.levels === "baseball" ? "⚡" : "🪙"}</span> {balance}
              </p>
              <p className="text-[11px] font-medium text-slate-400">
                {Math.min(weekPoints, POINTS.weeklyCap)} of {POINTS.weeklyCap} this week
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

        {/* Links */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link
            href={`${base}/map`}
            className="tab-press flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border border-slate-100 bg-white shadow-sm active:bg-slate-50"
          >
            <span className="text-2xl" aria-hidden>
              {screen === "tutu" ? "🐴" : "🗺️"}
            </span>
            <span className="text-sm font-bold text-slate-800">{screen === "tutu" ? "Skill Map & stable" : screen === "diamond" ? "Skill Map & cards" : "Skill Map"}</span>
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
            <Link href="/learn/parent" className="-mr-1 inline-flex min-h-[44px] items-center pl-3 pr-1 text-xs font-semibold text-slate-400">
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
        viewerIsParent={isKid ? false : undefined}
      />
      <CoachSheet state={coach.state} onClose={coach.close} bigText={learner.grade <= 1} />
    </div>
  );
}
