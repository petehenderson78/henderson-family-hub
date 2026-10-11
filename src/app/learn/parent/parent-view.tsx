"use client";

import { useState } from "react";
import Link from "next/link";
import type { Learner, LearnerSettings, SessionBlock, SessionRecord, Skill, SkillProgress } from "@/lib/learn/types";
import { catalogFor, SUBJECT_LABEL } from "@/lib/learn/catalog";
import { levelFor, mergeProgress, planMission } from "@/lib/learn/mastery";
import {
  computeStreak,
  daysPracticedThisWeek,
  formatClockLabel,
  isPaused,
  masteredCount,
  masteredThisWeek,
  masteryPercent,
  minutesThisWeek,
  reviewDueCount,
  sessionForDate,
  struggleFlags,
  todayStatus,
  vacationReturnLabel,
  weeklyRing,
  xpThisWeek,
} from "@/lib/learn/stats";
import { addDays, weekDates, weekdayShort } from "@/lib/learn/dates";
import { saveProgress, updateLearnerSettings } from "@/lib/learn/store";
import { addNote, upsertRewardItem, NOTE_KIND_LABEL, type LearnNote, type RewardItem } from "@/lib/learn/store-notes";
import { fetchCoachLog } from "@/lib/learn/coach-client";
import type { CoachLogMessage } from "@/lib/learn/coach-types";
import { KID_EMOJI } from "../learn-home";
import ProgressRing from "../components/progress-ring";
import StreakFlame from "../components/streak-flame";
import LogBookForm from "../components/log-book-form";

export interface ParentKid {
  learner: Learner;
  progressRows: SkillProgress[];
  sessions: SessionRecord[];
  /** XP earned (positive ledger entries) */
  xpTotal: number;
  /** spendable balance (whole ledger) */
  balance: number;
  rewardItems: RewardItem[];
  /** last 7 days of learn_notes */
  notes: LearnNote[];
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
    const paused = isPaused(k.learner.settings, today);
    const blocks: SessionBlock[] =
      session && session.blocks.length > 0
        ? session.blocks
        : paused
          ? []
          : planMission(catalog, progressMap, k.learner.settings, now, today).blocks.map((b) => ({ ...b, done: false }));
    return {
      ...k,
      catalog,
      progressMap,
      session,
      blocks,
      paused,
      status: todayStatus(session),
      masteryPct: masteryPercent(catalog, progressMap),
      mastered: masteredCount(catalog, progressMap),
      minutesWeek: minutesThisWeek(k.sessions, today),
      xpWeek: xpThisWeek(k.sessions, today),
      streak: computeStreak(k.sessions, today, k.learner.settings),
      ring: weeklyRing(k.sessions, today),
      due: reviewDueCount(catalog, progressMap, now),
      days: daysPracticedThisWeek(k.sessions, today),
      masteredWeek: masteredThisWeek(catalog, progressMap, today),
      flags: struggleFlags(catalog, progressMap),
    };
  });

  const [notesByKid, setNotesByKid] = useState<Record<string, LearnNote[]>>(() => Object.fromEntries(kids.map((k) => [k.learner.id, k.notes])));
  function pushNote(note: LearnNote) {
    setNotesByKid((m) => ({ ...m, [note.learnerId]: [note, ...(m[note.learnerId] ?? [])] }));
  }

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
      <div className="mx-auto max-w-lg px-4 pt-8">
        <Link href="/learn" className="text-xs font-semibold text-slate-400">
          ← Learn
        </Link>
        <h1 className="mt-3 text-[28px] font-bold tracking-tight text-slate-900">Parent view</h1>
        <p className="mt-1.5 text-sm font-medium text-slate-400">Both kids at a glance, flags, settings, rewards and the evidence report.</p>

        {derived.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white/50 p-6 text-center text-sm text-slate-400">
            No learners found. Run supabase/migrations/007_learn.sql and 008_learn_notes.sql.
          </div>
        )}

        {derived.length > 0 && (
          <Link
            href="/learn/tonight"
            className="tab-press mt-5 flex min-h-[60px] items-center justify-between rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-white shadow-lg shadow-blue-500/25"
          >
            <span className="text-base font-bold">🌙 Run tonight</span>
            <span className="text-xs font-semibold text-white/80">rotation · scripts · homework · log →</span>
          </Link>
        )}

        {/* Per-kid summary */}
        <div className="mt-5 space-y-3">
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
                    {d.mastered}/{d.catalog.length} skills mastered · {d.xpTotal} XP · {d.balance} {d.learner.settings.theme.currency}
                  </p>
                  <p className={`mt-1 text-xs font-semibold ${d.status.status === "done" ? "text-emerald-600" : "text-slate-500"}`}>
                    {d.paused
                      ? `🏖️ Vacation until ${vacationReturnLabel(d.learner.settings.pausedUntil ?? today)}`
                      : `Today: ${d.status.status === "done" ? "✓ done" : d.status.status === "in-progress" ? `${d.status.blocksDone}/${d.status.blocksTotal} blocks` : "not started"}`}
                    {" · "}
                    {d.ring.done}/{d.ring.target} school nights
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
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Flags</p>
                  <p className={`text-lg font-bold ${d.flags.length > 0 ? "text-rose-600" : "text-slate-900"}`}>{d.flags.length}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Link href={`/learn/${d.learner.slug}`} className="flex min-h-[44px] items-center justify-center rounded-xl bg-slate-50 text-xs font-bold text-slate-700">
                  Mission Control
                </Link>
                <Link href={`/learn/${d.learner.slug}/map`} className="flex min-h-[44px] items-center justify-center rounded-xl bg-slate-50 text-xs font-bold text-slate-700">
                  Skill Map
                </Link>
                <Link href={`/learn/parent/report/${d.learner.slug}`} className="flex min-h-[44px] items-center justify-center rounded-xl bg-indigo-50 text-xs font-bold text-indigo-700">
                  📄 Report
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Struggle flags */}
        {derived.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Needs a hand</h2>
            <p className="mt-1 text-xs text-slate-400">Skills that hit the stuck rule, failed two review sets, or sit under 60% over the last ten. What to say comes from the skill&apos;s coaching tip.</p>
            <div className="mt-3 space-y-3">
              {derived.map((d) =>
                d.flags.length === 0 ? (
                  <div key={d.learner.id} className="rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-500 shadow-sm">
                    <span aria-hidden>{KID_EMOJI[d.learner.slug] ?? "⭐"}</span> {d.learner.name}: no flags right now.
                  </div>
                ) : (
                  <div key={d.learner.id} className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
                    <p className="text-sm font-bold text-slate-900">
                      <span aria-hidden>{KID_EMOJI[d.learner.slug] ?? "⭐"}</span> {d.learner.name}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {d.flags.map((f) => (
                        <li key={f.skill.id} className="rounded-xl bg-rose-50/60 p-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {f.skill.title} <span className="text-[11px] font-medium text-slate-400">· {f.skill.standards.join(", ")}</span>
                          </p>
                          <p className="mt-0.5 text-[11px] font-semibold text-rose-700">{f.reasons.join(" · ")}</p>
                          <p className="mt-1.5 text-xs text-slate-700">
                            <span className="font-bold">What to say:</span> “{f.skill.parentTip}”
                          </p>
                          <Link href={`/learn/${d.learner.slug}/play?skill=${encodeURIComponent(f.skill.id)}&mode=learn`} className="mt-2 inline-flex min-h-[36px] items-center rounded-lg bg-white px-3 text-xs font-bold text-indigo-700 border border-indigo-100">
                            Practice it together →
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </div>
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

        {/* Parent log */}
        {derived.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Parent log</h2>
            <p className="mt-1 text-xs text-slate-400">Book work, school sheets and Together cards from the last 7 days. Everything here lands on the evidence report.</p>
            <div className="mt-3">
              <LogBookForm learners={derived.map((d) => ({ id: d.learner.id, name: d.learner.name, slug: d.learner.slug }))} today={today} onSaved={pushNote} />
            </div>
            <div className="mt-3 space-y-3">
              {derived.map((d) => {
                const notes = notesByKid[d.learner.id] ?? [];
                return (
                  <div key={d.learner.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <p className="text-sm font-bold text-slate-900">
                      <span aria-hidden>{KID_EMOJI[d.learner.slug] ?? "⭐"}</span> {d.learner.name}
                      <span className="ml-2 text-xs font-medium text-slate-400">
                        {notes.length} entr{notes.length === 1 ? "y" : "ies"} · {notes.reduce((s, n) => s + n.minutes, 0)} min
                      </span>
                    </p>
                    {notes.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {notes.slice(0, 8).map((n) => (
                          <li key={n.id ?? `${n.date}-${n.createdAt}`} className="flex items-center gap-2 text-xs text-slate-600">
                            <span className="w-12 flex-shrink-0 font-semibold tabular-nums text-slate-400">{n.date.slice(5)}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500">{NOTE_KIND_LABEL[n.kind]}</span>
                            <span className="min-w-0 flex-1 truncate">{n.text}</span>
                            <span className="flex-shrink-0 font-semibold tabular-nums text-slate-400">
                              {n.minutes} min{typeof n.score === "number" && typeof n.total === "number" ? ` · ${n.score}/${n.total}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Mark as mastered */}
        {derived.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Mark as mastered</h2>
            <p className="mt-1 text-xs text-slate-400">Seed what the books already proved (DONE stays DONE). Marked skills get a review in 7 days.</p>
            <div className="mt-3 space-y-3">
              {derived.map((d) => (
                <MarkMastered key={d.learner.id} learner={d.learner} catalog={d.catalog} progressMap={d.progressMap} today={today} onNote={pushNote} />
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
                <SettingsEditor key={d.learner.id} learner={d.learner} today={today} />
              ))}
            </div>
          </section>
        )}

        {/* Reward store */}
        {derived.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Reward store</h2>
            <p className="mt-1 text-xs text-slate-400">What the kids can spend their points on. Redeeming needs a parent&apos;s hold-to-confirm on their screen.</p>
            <div className="mt-3 space-y-3">
              {derived.map((d) => (
                <RewardItemsManager key={d.learner.id} learner={d.learner} items={d.rewardItems} balance={d.balance} />
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

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const FIELD = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-base font-bold text-slate-900 outline-none focus:border-indigo-400";
const LABEL = "mb-1 block text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400";

function SettingsEditor({ learner, today }: { learner: Learner; today: string }) {
  const [form, setForm] = useState<LearnerSettings>(learner.settings);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const patch = (fn: (f: LearnerSettings) => LearnerSettings) => {
    setState("idle");
    setForm(fn);
  };
  const int = (raw: string, min: number, max: number) => Math.max(min, Math.min(max, Number.parseInt(raw || "0", 10) || 0));

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
  const weekendTotal = form.weekend.math + form.weekend.reading + form.weekend.brain;
  const paused = isPaused(form, today);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">
        <span aria-hidden>{KID_EMOJI[learner.slug] ?? "⭐"}</span> {learner.name}
      </p>

      <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Weekday minutes</p>
      <div className="mt-1 grid grid-cols-4 gap-2">
        <label className="block">
          <span className={LABEL}>Daily</span>
          <input type="number" inputMode="numeric" min={0} max={120} value={form.dailyMinutes} onChange={(e) => patch((f) => ({ ...f, dailyMinutes: int(e.target.value, 0, 120) }))} className={FIELD} />
        </label>
        {(["math", "reading", "brain"] as const).map((k) => (
          <label key={k} className="block">
            <span className={LABEL}>{k}</span>
            <input type="number" inputMode="numeric" min={0} max={120} value={form.blocks[k]} onChange={(e) => patch((f) => ({ ...f, blocks: { ...f.blocks, [k]: int(e.target.value, 0, 120) } }))} className={FIELD} />
          </label>
        ))}
      </div>
      <p className={`mt-1 text-[11px] font-medium ${blockTotal !== form.dailyMinutes ? "text-amber-600" : "text-slate-400"}`}>
        Blocks add up to {blockTotal} min{blockTotal !== form.dailyMinutes ? ` (daily target ${form.dailyMinutes})` : ""}
      </p>

      <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Weekend minutes ({weekendTotal} total)</p>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {(["math", "reading", "brain"] as const).map((k) => (
          <label key={k} className="block">
            <span className={LABEL}>{k}</span>
            <input type="number" inputMode="numeric" min={0} max={120} value={form.weekend[k]} onChange={(e) => patch((f) => ({ ...f, weekend: { ...f.weekend, [k]: int(e.target.value, 0, 120) } }))} className={FIELD} />
          </label>
        ))}
      </div>

      <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Target grade</p>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {(["math", "reading", "reasoning"] as const).map((k) => (
          <label key={k} className="block">
            <span className={LABEL}>{k}</span>
            <input type="number" inputMode="numeric" min={1} max={8} value={form.targetGrade[k]} onChange={(e) => patch((f) => ({ ...f, targetGrade: { ...f.targetGrade, [k]: int(e.target.value, 1, 8) } }))} className={FIELD} />
          </label>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className={LABEL}>Blocks must start by</span>
          <input type="time" value={form.stopBy} onChange={(e) => patch((f) => ({ ...f, stopBy: /^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value) ? e.target.value : f.stopBy }))} className={FIELD} />
          <span className="mt-1 block text-center text-[10px] text-slate-400">{formatClockLabel(form.stopBy)} · bedtime wind-down after</span>
        </label>
        <label className="block">
          <span className={LABEL}>Pause until</span>
          <input type="date" value={form.pausedUntil ?? ""} min={today} onChange={(e) => patch((f) => ({ ...f, pausedUntil: /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : null }))} className={FIELD} />
          <span className="mt-1 block text-center text-[10px] text-slate-400">
            {paused ? (
              <>
                🏖️ vacation mode ·{" "}
                <button type="button" onClick={() => patch((f) => ({ ...f, pausedUntil: null }))} className="font-bold text-indigo-600">
                  clear
                </button>
              </>
            ) : (
              "streak freezes, no catch-up"
            )}
          </span>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className={LABEL}>Currency name</span>
          <input value={form.theme.currency} maxLength={40} onChange={(e) => patch((f) => ({ ...f, theme: { ...f.theme, currency: e.target.value } }))} className={`${FIELD} text-sm`} />
        </label>
        <label className="block">
          <span className={LABEL}>Level theme</span>
          <select value={form.theme.levels} onChange={(e) => patch((f) => ({ ...f, theme: { ...f.theme, levels: e.target.value as LearnerSettings["theme"]["levels"] } }))} className={`${FIELD} text-sm`}>
            <option value="baseball">Baseball</option>
            <option value="ballet">Ballet</option>
            <option value="generic">Generic</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <label className="flex min-h-[44px] flex-1 items-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={form.autoSpeak} onChange={(e) => patch((f) => ({ ...f, autoSpeak: e.target.checked }))} className="h-5 w-5 accent-indigo-600" />
          Read prompts aloud automatically
        </label>
        <label className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
          XP per buck
          <input type="number" inputMode="numeric" min={1} value={form.rewardRate} onChange={(e) => patch((f) => ({ ...f, rewardRate: int(e.target.value, 1, 100000) }))} className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-center text-xs font-bold text-slate-900" />
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

// ---------------------------------------------------------------------------
// Mark as mastered
// ---------------------------------------------------------------------------

const MARK_INTERVAL_DAYS = 7;

function MarkMastered({
  learner,
  catalog,
  progressMap,
  today,
  onNote,
}: {
  learner: Learner;
  catalog: Skill[];
  progressMap: Record<string, SkillProgress>;
  today: string;
  onNote: (n: LearnNote) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [marked, setMarked] = useState<Set<string>>(() => new Set());
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  const candidates = catalog.filter((s) => progressMap[s.id]?.status !== "mastered" && !marked.has(s.id));

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    const skills = candidates.filter((s) => selected.has(s.id));
    if (skills.length === 0) return;
    setState("saving");
    const now = new Date();
    const nowIso = now.toISOString();
    try {
      await saveProgress(
        learner.id,
        skills.map((s) => ({
          ...progressMap[s.id],
          skillId: s.id,
          status: "mastered" as const,
          masteredAt: nowIso,
          lastPracticedAt: progressMap[s.id]?.lastPracticedAt ?? nowIso,
          intervalDays: MARK_INTERVAL_DAYS,
          nextReviewAt: addDays(now, MARK_INTERVAL_DAYS).toISOString(),
        }))
      );
      const saved = await addNote({
        learnerId: learner.id,
        date: today,
        kind: "other",
        subject: skills[0].subject,
        text: `Marked mastered by parent: ${skills.map((s) => s.title).join("; ")}${note.trim() ? ` — ${note.trim()}` : ""}`,
        minutes: 0,
        score: null,
        total: null,
        standards: Array.from(new Set(skills.flatMap((s) => s.standards))),
      });
      onNote(saved);
      setMarked((m) => new Set([...m, ...skills.map((s) => s.id)]));
      setSelected(new Set());
      setNote("");
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-[56px] w-full items-center justify-between px-4 text-left">
        <span className="text-sm font-bold text-slate-900">
          <span aria-hidden>{KID_EMOJI[learner.slug] ?? "⭐"}</span> {learner.name}
          <span className="ml-2 text-xs font-medium text-slate-400">{candidates.length} not yet mastered</span>
        </span>
        <span className="text-xs font-semibold text-slate-400">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4">
          {candidates.length === 0 ? (
            <p className="py-3 text-xs text-slate-400">Everything on the map is mastered.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {candidates.map((s) => (
                <li key={s.id}>
                  <label className="flex min-h-[48px] items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="h-5 w-5 flex-shrink-0 accent-indigo-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{s.title}</span>
                      <span className="block text-[11px] text-slate-400">
                        {SUBJECT_LABEL[s.subject]} · G{s.grade} · {s.standards.join(", ")} · {progressMap[s.id]?.status ?? "locked"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {candidates.length > 0 && (
            <>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Note (e.g. Grade 4 Math pp.32–35 done, confirmed Sep 17)" className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none focus:border-indigo-400" />
              <button
                type="button"
                onClick={() => void save()}
                disabled={selected.size === 0 || state === "saving"}
                className={`mt-2 flex min-h-[48px] w-full items-center justify-center rounded-xl text-sm font-bold text-white ${state === "error" ? "bg-rose-500" : "bg-emerald-600"} disabled:opacity-40`}
              >
                {state === "saving" ? "Saving…" : state === "error" ? "Couldn't save — tap to retry" : `Mark ${selected.size || ""} as mastered ⭐`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reward items
// ---------------------------------------------------------------------------

function RewardItemsManager({ learner, items: initial, balance }: { learner: Learner; items: RewardItem[]; balance: number }) {
  const [items, setItems] = useState<RewardItem[]>(initial);
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState(200);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!title.trim()) return;
    setBusy("new");
    setError(null);
    try {
      const saved = await upsertRewardItem({ learnerId: learner.id, title: title.trim(), cost, active: true });
      setItems((list) => [...list, saved].sort((a, b) => a.cost - b.cost));
      setTitle("");
    } catch {
      setError("Couldn't add — parents only (check you're signed in as a parent).");
    } finally {
      setBusy(null);
    }
  }

  async function toggle(item: RewardItem) {
    if (!item.id) return;
    setBusy(item.id);
    setError(null);
    try {
      const saved = await upsertRewardItem({ ...item, active: !item.active });
      setItems((list) => list.map((i) => (i.id === saved.id ? saved : i)));
    } catch {
      setError("Couldn't update — parents only.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">
        <span aria-hidden>{KID_EMOJI[learner.slug] ?? "⭐"}</span> {learner.name}
        <span className="ml-2 text-xs font-medium text-slate-400">
          {balance} {learner.settings.theme.currency} to spend
        </span>
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">No rewards yet — run 008_learn_notes.sql for the starter set, or add one below.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li key={item.id ?? item.title} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${item.active ? "bg-slate-50" : "bg-slate-50/50 opacity-60"}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">{item.title}</span>
                <span className="block text-[11px] text-slate-400">
                  {item.cost} {learner.settings.theme.currency}
                  {!item.active ? " · hidden" : ""}
                </span>
              </span>
              <button type="button" onClick={() => void toggle(item)} disabled={busy === item.id} className={`min-h-[40px] rounded-lg px-3 text-xs font-bold ${item.active ? "bg-white text-slate-600 border border-slate-200" : "bg-indigo-600 text-white"} disabled:opacity-50`}>
                {item.active ? "Hide" : "Show"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="New reward" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400" />
        <input type="number" inputMode="numeric" min={1} value={cost} onChange={(e) => setCost(Math.max(1, Number.parseInt(e.target.value || "1", 10) || 1))} className="w-20 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-sm font-bold text-slate-900 outline-none focus:border-indigo-400" aria-label="cost" />
        <button type="button" onClick={() => void add()} disabled={!title.trim() || busy === "new"} className="min-h-[44px] rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-40">
          Add
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coach log
// ---------------------------------------------------------------------------

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
