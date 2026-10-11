"use client";

import Link from "next/link";
import type { Learner, SessionBlock, SessionRecord, SkillProgress } from "@/lib/learn/types";
import { catalogFor } from "@/lib/learn/catalog";
import { mergeProgress, planMission } from "@/lib/learn/mastery";
import { computeStreak, reviewDueCount, sessionForDate } from "@/lib/learn/stats";
import { KID_EMOJI } from "../learn-home";
import XpBar from "../components/xp-bar";
import StreakFlame from "../components/streak-flame";
import MissionCard from "../components/mission-card";
import CoachSheet from "../components/coach-sheet";
import { useCoach } from "../components/use-coach";

interface MissionViewProps {
  learner: Learner;
  progressRows: SkillProgress[];
  sessions: SessionRecord[];
  xpTotal: number;
  today: string;
  nowIso: string;
  /** from the server page: Boolean(ANTHROPIC_API_KEY) */
  coachEnabled: boolean;
}

export default function MissionView({ learner, progressRows, sessions, xpTotal, today, nowIso, coachEnabled }: MissionViewProps) {
  const catalog = catalogFor(learner.slug);
  const progressMap = mergeProgress(catalog, progressRows);
  const now = new Date(nowIso);
  const session = sessionForDate(sessions, today);
  const blocks: SessionBlock[] =
    session && session.blocks.length > 0
      ? session.blocks
      : planMission(catalog, progressMap, learner.settings, now).blocks.map((b) => ({ ...b, done: false }));
  const streak = computeStreak(sessions, today);
  const due = reviewDueCount(catalog, progressMap, now);
  const base = `/learn/${learner.slug}`;

  const coach = useCoach(learner.slug);
  const nextBlock = blocks.find((b) => !b.done);
  const doneCount = blocks.filter((b) => b.done).length;
  function cheer() {
    const note = [
      `Streak: ${streak} day${streak === 1 ? "" : "s"}.`,
      blocks.length > 0 ? `Today: ${doneCount} of ${blocks.length} blocks done.` : "No mission planned yet.",
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
        <Link href="/learn" className="text-xs font-semibold text-slate-400">
          ← All learners
        </Link>

        {/* Greeting */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[28px] font-bold tracking-tight text-slate-900">
              Hi, {learner.name}! <span aria-hidden>{KID_EMOJI[learner.slug] ?? "⭐"}</span>
            </h1>
            <p className="mt-0.5 text-sm font-medium text-slate-400">Mission Control</p>
          </div>
          <StreakFlame streak={streak} />
        </div>

        {/* XP */}
        <div className="mt-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <XpBar xp={xpTotal} />
        </div>

        {/* Mission */}
        <div className="mt-4">
          <MissionCard slug={learner.slug} blocks={blocks} completed={!!session?.completed} />
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
          <Link href="/learn/parent" className="text-xs font-semibold text-slate-400">
            Parent view →
          </Link>
        </div>
      </div>

      <CoachSheet state={coach.state} onClose={coach.close} bigText={learner.grade <= 1} />
    </div>
  );
}
