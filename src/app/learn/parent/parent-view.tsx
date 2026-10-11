"use client";

import { useState } from "react";
import Link from "next/link";
import type { Learner, LearnerSettings, SessionBlock, SessionRecord, SkillProgress } from "@/lib/learn/types";
import { catalogFor } from "@/lib/learn/catalog";
import { BLOCK_EMOJI, levelFor, mergeProgress, planMission } from "@/lib/learn/mastery";
import {
  computeStreak,
  daysPracticedThisWeek,
  masteredCount,
  masteredThisWeek,
  masteryPercent,
  minutesThisWeek,
  reviewDueCount,
  rotationPlan,
  sessionForDate,
  todayStatus,
  xpThisWeek,
} from "@/lib/learn/stats";
import { weekDates, weekdayShort } from "@/lib/learn/dates";
import { updateLearnerSettings } from "@/lib/learn/store";
import { fetchCoachLog } from "@/lib/learn/coach-client";
import type { CoachLogMessage } from "@/lib/learn/coach-types";
import { KID_EMOJI } from "../learn-home";
import ProgressRing from "../components/progress-ring";
import StreakFlame from "../components/streak-flame";

export interface ParentKid {
  learner: Learner;
  progressRows: SkillProgress[];
  sessions: SessionRecord[];
  xpTotal: number;
}

interface ParentViewProps {
  kids: ParentKid[];
  today: string;
  nowIso: string;
  /** from the server page: Boolean(ANTHROPIC_API_KEY) */
  coachEnabled: boolean;
}

const DOCS_URL = "https://github.com/petehenderson78/henderson-family-hub/blob/main/docs/learning/README.md";

export default function ParentView({ kids, today, nowIso, coachEnabled }: ParentViewProps) {
  const now = new Date(nowIso);
  const week = weekDates(today);

  const derived = kids.map((k) => {
    const catalog = catalogFor(k.learner.slug);
    const progressMap = mergeProgress(catalog, k.progressRows);
    const session = sessionForDate(k.sessions, today);
    const blocks: SessionBlock[] =
      session && session.blocks.length > 0
        ? session.blocks
        : planMission(catalog, progressMap, k.learner.settings, now).blocks.map((b) => ({ ...b, done: false }));
    return {
      ...k,
      catalog,
      progressMap,
      session,
      blocks,
      status: todayStatus(session),
      masteryPct: masteryPercent(catalog, progressMap),
      mastered: masteredCount(catalog, progressMap),
      minutesWeek: minutesThisWeek(k.sessions, today),
      xpWeek: xpThisWeek(k.sessions, today),
      streak: computeStreak(k.sessions, today),
      due: reviewDueCount(catalog, progressMap, now),
      days: daysPracticedThisWeek(k.sessions, today),
      masteredWeek: masteredThisWeek(catalog, progressMap, today),
    };
  });

  const turns = rotationPlan(derived.map((d) => ({ slug: d.learner.slug, name: d.learner.name, mission: { blocks: d.blocks } })));
  const totalPlanMinutes = turns.reduce((s, t) => s + t.minutes, 0);

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
      <div className="mx-auto max-w-lg px-4 pt-8">
        <Link href="/learn" className="text-xs font-semibold text-slate-400">
          ← Learn
        </Link>
        <h1 className="mt-3 text-[28px] font-bold tracking-tight text-slate-900">Parent view</h1>
        <p className="mt-1.5 text-sm font-medium text-slate-400">Both kids at a glance, today&apos;s plan, and settings.</p>

        {derived.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white/50 p-6 text-center text-sm text-slate-400">
            No learners found. Run supabase/migrations/007_learn.sql.
          </div>
        )}

        {/* Per-kid summary */}
        <div className="mt-6 space-y-3">
          {derived.map((d) => (
            <div key={d.learner.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <ProgressRing value={d.masteryPct / 100} size={68} color="#10b981">
                  <span className="text-sm font-bold text-slate-800">{d.masteryPct}%</span>
                </ProgressRing>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold text-slate-900">
                    <span aria-hidden>{KID_EMOJI[d.learner.slug] ?? "⭐"}</span> {d.learner.name}
                    <span className="ml-2 text-xs font-semibold text-indigo-600">
                      Lv {levelFor(d.xpTotal).level} · {levelFor(d.xpTotal).name}
                    </span>
                  </p>
                  <p className="text-xs font-medium text-slate-400">
                    {d.mastered}/{d.catalog.length} skills mastered · {d.xpTotal} XP
                  </p>
                  <p className={`mt-1 text-xs font-semibold ${d.status.status === "done" ? "text-emerald-600" : "text-slate-500"}`}>
                    Today: {d.status.status === "done" ? "✓ done" : d.status.status === "in-progress" ? `${d.status.blocksDone}/${d.status.blocksTotal} blocks` : "not started"}
                  </p>
                </div>
                <StreakFlame streak={d.streak} size="sm" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">This week</p>
                  <p className="text-lg font-bold text-slate-900">
                    {d.minutesWeek}
                    <span className="text-xs text-slate-400"> min</span>
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Review due</p>
                  <p className={`text-lg font-bold ${d.due > 0 ? "text-violet-700" : "text-slate-900"}`}>{d.due}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">XP week</p>
                  <p className="text-lg font-bold text-slate-900">{d.xpWeek}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Link href={`/learn/${d.learner.slug}`} className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-slate-50 text-xs font-bold text-slate-700">
                  Mission Control
                </Link>
                <Link href={`/learn/${d.learner.slug}/map`} className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-slate-50 text-xs font-bold text-slate-700">
                  Skill Map
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Today's plan */}
        {turns.length > 0 && (
          <section className="mt-8">
            <div className="flex items-end justify-between">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Today&apos;s plan (one adult)</h2>
              <span className="text-xs font-semibold text-slate-400">{totalPlanMinutes} min</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Alternate 6-minute turns. The other kid works on their own until it&apos;s their turn.</p>
            <ol className="mt-3 space-y-2">
              {turns.map((t) => {
                const skill = catalogFor(t.learnerSlug).find((s) => s.id === t.block.skillId);
                const kidDone = derived.find((d) => d.learner.slug === t.learnerSlug)?.blocks.find((b) => b.skillId === t.block.skillId && b.kind === t.block.kind)?.done;
                return (
                  <li key={t.index} className={`flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm ${kidDone ? "opacity-50" : ""}`}>
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">{t.index}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        <span aria-hidden>{KID_EMOJI[t.learnerSlug] ?? "⭐"}</span> {t.learnerName} · {BLOCK_EMOJI[t.block.kind]} {t.block.label}
                        {t.parts > 1 ? ` (${t.part}/${t.parts})` : ""}
                        {kidDone ? " ✓" : ""}
                      </p>
                      {skill && <p className="mt-0.5 text-xs text-slate-500">{skill.parentTip}</p>}
                    </div>
                    <span className="flex-shrink-0 text-xs font-bold text-slate-400">{t.minutes} min</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* Weekly report */}
        {derived.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">This week</h2>
            <div className="mt-3 space-y-3">
              {derived.map((d) => (
                <div key={d.learner.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900">{d.learner.name}</p>
                    <p className="text-xs font-semibold text-slate-400">
                      {d.days.filter(Boolean).length}/7 days · {d.minutesWeek} min · {d.xpWeek} XP
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-7 gap-1.5">
                    {week.map((date, i) => (
                      <div key={date} className="text-center">
                        <div className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${d.days[i] ? "bg-emerald-500 text-white" : date === today ? "border-2 border-indigo-300 text-indigo-500" : "bg-slate-100 text-slate-300"}`}>
                          {d.days[i] ? "✓" : date > today ? "" : "·"}
                        </div>
                        <p className="mt-1 text-[10px] font-semibold text-slate-400">{weekdayShort(date)}</p>
                      </div>
                    ))}
                  </div>
                  {d.masteredWeek.length > 0 && (
                    <p className="mt-3 text-xs font-medium text-emerald-700">⭐ Mastered this week: {d.masteredWeek.map((s) => s.kidTitle).join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Settings */}
        {derived.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Settings</h2>
            <div className="mt-3 space-y-3">
              {derived.map((d) => (
                <SettingsEditor key={d.learner.id} learner={d.learner} />
              ))}
            </div>
          </section>
        )}

        {/* Coach log */}
        {derived.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Coach log</h2>
            <p className="mt-1 text-xs text-slate-400">
              {coachEnabled
                ? "What the AI coach said to each kid, newest first."
                : "The AI coach is off (set ANTHROPIC_API_KEY to turn it on). Earlier messages still show here."}
            </p>
            <div className="mt-3 space-y-3">
              {derived.map((d) => (
                <CoachLog key={d.learner.id} learner={d.learner} />
              ))}
            </div>
          </section>
        )}

        {/* Docs */}
        <section className="mt-8">
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[56px] items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm"
          >
            <span>📚 Program guide, plans &amp; G&amp;T roadmap</span>
            <span className="text-slate-300">↗</span>
          </a>
          <p className="mt-2 text-center text-[11px] text-slate-400">docs/learning on GitHub</p>
        </section>
      </div>
    </div>
  );
}

function SettingsEditor({ learner }: { learner: Learner }) {
  const [form, setForm] = useState<LearnerSettings>(learner.settings);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const set = (path: "dailyMinutes" | "math" | "reading" | "brain" | "rewardRate", raw: string) => {
    const v = Math.max(0, Math.min(120, Number.parseInt(raw || "0", 10) || 0));
    setState("idle");
    setForm((f) => {
      if (path === "dailyMinutes") return { ...f, dailyMinutes: v };
      if (path === "rewardRate") return { ...f, rewardRate: Math.max(1, v) };
      return { ...f, blocks: { ...f.blocks, [path]: v } };
    });
  };

  async function save() {
    setState("saving");
    try {
      await updateLearnerSettings(learner.id, form);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  const blockTotal = form.blocks.math + form.blocks.reading + form.blocks.brain;
  const field = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-base font-bold text-slate-900 outline-none focus:border-indigo-400";

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">
        <span aria-hidden>{KID_EMOJI[learner.slug] ?? "⭐"}</span> {learner.name}
      </p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {(
          [
            ["dailyMinutes", "Daily", form.dailyMinutes],
            ["math", "Math", form.blocks.math],
            ["reading", "Reading", form.blocks.reading],
            ["brain", "Brain", form.blocks.brain],
          ] as const
        ).map(([key, label, value]) => (
          <label key={key} className="block">
            <span className="mb-1 block text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
            <input type="number" inputMode="numeric" min={0} max={120} value={value} onChange={(e) => set(key, e.target.value)} className={field} />
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className={`text-[11px] font-medium ${blockTotal !== form.dailyMinutes ? "text-amber-600" : "text-slate-400"}`}>
          Blocks add up to {blockTotal} min{blockTotal !== form.dailyMinutes ? ` (daily target ${form.dailyMinutes})` : ""}
        </p>
        <label className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
          XP per buck
          <input type="number" inputMode="numeric" min={1} value={form.rewardRate} onChange={(e) => set("rewardRate", e.target.value)} className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-center text-xs font-bold text-slate-900" />
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={state === "saving"}
        className={`mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl text-sm font-bold ${
          state === "saved" ? "bg-emerald-500 text-white" : state === "error" ? "bg-rose-500 text-white" : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20"
        } disabled:opacity-60`}
      >
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : state === "error" ? "Couldn't save — tap to retry" : "Save settings"}
      </button>
    </div>
  );
}

type CoachLogState = { status: "idle" | "loading" | "error" | "ready"; messages: CoachLogMessage[] };

function questionPromptOf(context: CoachLogMessage["context"]): string | null {
  const q = context?.question;
  if (typeof q !== "object" || q === null) return null;
  const prompt = (q as Record<string, unknown>).prompt;
  return typeof prompt === "string" && prompt.trim() ? prompt : null;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Collapsible per-kid list of the last 20 coach messages (fetched on expand). */
function CoachLog({ learner }: { learner: Learner }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CoachLogState>({ status: "idle", messages: [] });

  async function load() {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const messages = await fetchCoachLog(learner.slug, 20);
      setState({ status: "ready", messages });
    } catch {
      setState((s) => ({ ...s, status: "error" }));
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && state.status === "idle") void load();
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex min-h-[56px] w-full items-center justify-between px-4 text-left">
        <span className="text-sm font-bold text-slate-900">
          <span aria-hidden>{KID_EMOJI[learner.slug] ?? "⭐"}</span> {learner.name}
        </span>
        <span className="text-xs font-semibold text-slate-400">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4">
          {state.status === "loading" && <p className="py-3 text-xs text-slate-400">Loading…</p>}
          {state.status === "error" && (
            <div className="flex items-center justify-between py-3">
              <p className="text-xs font-semibold text-rose-600">Couldn&apos;t load the coach log.</p>
              <button type="button" onClick={() => void load()} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                Retry
              </button>
            </div>
          )}
          {state.status === "ready" && state.messages.length === 0 && <p className="py-3 text-xs text-slate-400">No coach messages yet.</p>}
          {state.status === "ready" && state.messages.length > 0 && (
            <ul className="mt-3 space-y-2">
              {state.messages.map((m) => {
                const prompt = m.role === "child" ? questionPromptOf(m.context) : null;
                const action = typeof m.context?.action === "string" ? m.context.action : null;
                return (
                  <li key={m.id} className={`rounded-xl p-3 ${m.role === "coach" ? "bg-indigo-50" : "bg-slate-50"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${m.role === "coach" ? "text-indigo-600" : "text-slate-500"}`}>
                        {m.role === "coach" ? "🤖 Coach" : m.role === "child" ? learner.name : "System"}
                        {action ? ` · ${action}` : ""}
                      </span>
                      <span className="text-[10px] font-medium text-slate-400">{formatWhen(m.createdAt)}</span>
                    </div>
                    {prompt && <p className="mt-1 text-xs text-slate-500">Q: {prompt}</p>}
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{m.text}</p>
                  </li>
                );
              })}
            </ul>
          )}
          {state.status === "ready" && (
            <button type="button" onClick={() => void load()} className="mt-3 flex min-h-[40px] w-full items-center justify-center rounded-xl bg-slate-50 text-xs font-bold text-slate-600">
              Refresh
            </button>
          )}
        </div>
      )}
    </div>
  );
}
