"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Learner, LearnerSettings, LightWeek, SessionBlock, SessionRecord, Skill, SkillProgress } from "@/lib/learn/types";
import { catalogFor, SUBJECT_LABEL } from "@/lib/learn/catalog";
import { LADDERS, applyPauseEdit, ladderFor, levelFor, markMasteredByParent, mergeProgress, needsSkipCheckFollowUp, shiftReviewDates } from "@/lib/learn/mastery";
import {
  POINTS,
  computeStreak,
  daysPracticedThisWeek,
  formatClockLabel,
  formatDateStr,
  isPaused,
  masteredCount,
  masteredThisWeek,
  masteryPercent,
  minutesThisWeek,
  reviewDueCount,
  sessionForDate,
  struggleFlags,
  todayStatus,
  todaysBlocks,
  vacationReturnLabel,
  weeklyRing,
  xpThisWeek,
} from "@/lib/learn/stats";
import { addDaysToDateStr, weekDates, weekdayShort } from "@/lib/learn/dates";
import { saveProgress, updateLearnerSettings } from "@/lib/learn/store";
import { addNote, logFinishedBook, upsertRewardItem, NOTE_KIND_LABEL, type LearnNote, type RewardItem } from "@/lib/learn/store-notes";
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
  /** XP (level ladder only) */
  xpTotal: number;
  /** spendable input points (points earned − redemptions) */
  balance: number;
  /** points earned this week (cap 25) */
  weekPoints: number;
  rewardItems: RewardItem[];
  /** last 8 days of learn_notes */
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
  const router = useRouter();
  const now = new Date(nowIso);
  const week = weekDates(today);

  const derived = kids.map((k) => {
    const catalog = catalogFor(k.learner.slug);
    const progressMap = mergeProgress(catalog, k.progressRows);
    const session = sessionForDate(k.sessions, today);
    const paused = isPaused(k.learner.settings, today);
    const blocks: SessionBlock[] = todaysBlocks({ learner: k.learner, catalog, progressMap, sessions: k.sessions, now, today, notes: k.notes });
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
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-[calc(8rem+env(safe-area-inset-bottom))]">
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
                    <span className="ml-2 text-xs font-semibold text-indigo-600">{levelFor(d.xpTotal, ladderFor(d.learner.settings.theme)).name}</span>
                  </p>
                  <p className="text-xs font-medium text-slate-400">
                    {d.mastered}/{d.catalog.length} skills mastered · {d.xpTotal} XP · {d.balance} {d.learner.settings.theme.currency} (
                    {Math.min(d.weekPoints, POINTS.weeklyCap)}/{POINTS.weeklyCap} this week)
                  </p>
                  <p className={`mt-1 text-xs font-semibold ${d.status.status === "done" ? "text-emerald-600" : "text-slate-500"}`}>
                    {d.paused
                      ? `🏖️ Vacation · back ${vacationReturnLabel(d.learner.settings, today)}`
                      : `Today: ${d.status.status === "done" ? "✓ done" : d.status.status === "in-progress" ? `${d.status.blocksDone}/${d.status.blocksTotal} blocks` : "not started"}`}
                    {" · "}★ {d.ring.stars}/{d.ring.target} stars{d.ring.fridayFree && !d.ring.closed ? " · Friday Free" : ""}
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
            <p className="mt-1 text-xs text-slate-400">
              Skills that hit the stuck rule, dropped back to learning after two failed review sets, or sit under 60% over the last ten. Next session opens with a
              different worked example; what to say comes from the skill&apos;s coaching tip.
            </p>
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
                          {d.progressMap[f.skill.id]?.needsHelp && d.progressMap[f.skill.id]?.helpNote && (
                            <p className="mt-0.5 text-[11px] text-slate-500">Stuck on: “{d.progressMap[f.skill.id]?.helpNote}”</p>
                          )}
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

        {/* Skip-check follow-ups */}
        {derived.some((d) => d.catalog.some((s) => needsSkipCheckFollowUp(d.progressMap[s.id]))) && (
          <section className="mt-8">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">After a skip check</h2>
            <p className="mt-1 text-xs text-slate-400">
              Math 7-8/10 → quick fill (Learn-it card + a few items, skip check again next weekend). Reading 6-8/10 → fill the missed sub-skill, then re-check.
            </p>
            <ul className="mt-3 space-y-2">
              {derived.flatMap((d) =>
                d.catalog
                  .filter((s) => needsSkipCheckFollowUp(d.progressMap[s.id]))
                  .map((s) => (
                    <li key={`${d.learner.id}-${s.id}`} className="rounded-xl border border-slate-100 bg-white p-3 text-sm shadow-sm">
                      <span className="font-semibold text-slate-900">
                        {d.learner.name} · {s.title}
                      </span>{" "}
                      <span className="text-[11px] font-semibold text-indigo-600">{d.progressMap[s.id]?.helpNote}</span>
                    </li>
                  ))
              )}
            </ul>
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
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {derived.map((d) => (
                <FinishedBook key={d.learner.id} learner={d.learner} today={today} onNote={pushNote} />
              ))}
            </div>
            <div className="mt-3">
              <LogBookForm learners={derived.map((d) => ({ id: d.learner.id, name: d.learner.name, slug: d.learner.slug }))} today={today} onSaved={pushNote} />
            </div>
            <div className="mt-3 space-y-3">
              {derived.map((d) => {
                const notes = (notesByKid[d.learner.id] ?? []).filter((n) => n.kind !== "pony");
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
                <MarkMastered key={d.learner.id} learner={d.learner} catalog={d.catalog} progressMap={d.progressMap} today={today} onNote={pushNote} onMarked={() => router.refresh()} />
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
                <SettingsEditor key={d.learner.id} learner={d.learner} progressRows={d.progressRows} today={today} />
              ))}
            </div>
          </section>
        )}

        {/* Reward store */}
        {derived.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Reward store</h2>
            <p className="mt-1 text-xs text-slate-400">
              Points come from inputs only (blocks, starting on time, review sets, finished books, workshops, a surprise bonus) — at most {POINTS.weeklyCap} a week.
              Redeeming needs a parent&apos;s hold-to-confirm on the kid&apos;s screen. Prices reset quarterly; retire anything that has become the point.
            </p>
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

const PAUSE_HORIZON_DAYS = 400;

/**
 * Days from today that `next` pauses and `prev` did not: a new or extended
 * "Pause until", or a new vacation range. Pending reviews are moved by this
 * many days when the settings are saved, so they do not pile up on the return day.
 */
function newlyPausedDays(prev: LearnerSettings, next: LearnerSettings, today: string): number {
  let days = 0;
  for (let i = 0, d = today; i < PAUSE_HORIZON_DAYS; i++, d = addDaysToDateStr(d, 1)) {
    if (isPaused(next, d) && !isPaused(prev, d)) days += 1;
  }
  return days;
}

function SettingsEditor({ learner, progressRows, today }: { learner: Learner; progressRows: SkillProgress[]; today: string }) {
  const [form, setForm] = useState<LearnerSettings>(learner.settings);
  /** last persisted settings — the pause comparison baseline, so a re-save never shifts reviews twice */
  const [saved, setSaved] = useState<LearnerSettings>(learner.settings);
  const [rows, setRows] = useState<SkillProgress[]>(progressRows);
  const [shiftNote, setShiftNote] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const patch = (fn: (f: LearnerSettings) => LearnerSettings) => {
    setState("idle");
    setShiftNote(null);
    setForm(fn);
  };
  const int = (raw: string, min: number, max: number) => Math.max(min, Math.min(max, Number.parseInt(raw || "0", 10) || 0));

  async function save() {
    setState("saving");
    try {
      // A new / changed "Pause until" starts today; the elapsed part of the old pause is kept as a vacation
      // range, so clearing a pause never unfreezes the streak for days that were paused.
      const lightWeeks = (form.lightWeeks ?? []).filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.from) && /^\d{4}-\d{2}-\d{2}$/.test(w.to) && w.from <= w.to);
      const toSave = applyPauseEdit(saved, { ...form, lightWeeks }, today);
      await updateLearnerSettings(learner.id, toSave);
      setForm(toSave);
      // Vacation: move every pending review past the newly paused days (once per pause change).
      const days = newlyPausedDays(saved, toSave, today);
      const shifted = days > 0 ? shiftReviewDates(rows, days) : rows;
      const changed = shifted.filter((p, i) => p !== rows[i]);
      if (changed.length > 0) await saveProgress(learner.id, changed);
      setRows(shifted);
      setShiftNote(changed.length > 0 ? `Review dates moved ${days} day${days === 1 ? "" : "s"}` : null);
      setSaved(toSave);
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
          <span className={LABEL}>Blocks must finish by</span>
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

      <LightWeeksEditor weeks={form.lightWeeks ?? []} today={today} onChange={(lightWeeks) => patch((f) => ({ ...f, lightWeeks }))} />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className={LABEL}>Currency name</span>
          <input value={form.theme.currency} maxLength={40} onChange={(e) => patch((f) => ({ ...f, theme: { ...f.theme, currency: e.target.value } }))} className={`${FIELD} text-sm`} />
        </label>
        <label className="block">
          <span className={LABEL}>Level ladder</span>
          <select
            value={form.theme.levels}
            onChange={(e) => {
              const levels = e.target.value as LearnerSettings["theme"]["levels"];
              patch((f) => ({ ...f, theme: { ...f.theme, levels, ladder: [...LADDERS[levels]] } }));
            }}
            className={`${FIELD} text-sm`}
          >
            <option value="baseball">Baseball</option>
            <option value="ballet">Ballet</option>
            <option value="generic">Generic</option>
          </select>
        </label>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Ladder (a level every 500 XP): {ladderFor(form.theme).join(" → ")}</p>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <label className="block">
          <span className={LABEL}>Time-back line</span>
          <input
            value={form.theme.timeBack ?? ""}
            maxLength={120}
            placeholder="Done by 7:45 = catch in the yard"
            onChange={(e) => patch((f) => ({ ...f, theme: { ...f.theme, timeBack: e.target.value } }))}
            className={`${FIELD} text-sm`}
          />
        </label>
        <label className="block">
          <span className={LABEL}>Screen</span>
          <select
            value={form.theme.screen ?? "generic"}
            onChange={(e) => patch((f) => ({ ...f, theme: { ...f.theme, screen: e.target.value as NonNullable<LearnerSettings["theme"]["screen"]> } }))}
            className={`${FIELD} text-sm`}
          >
            <option value="diamond">Diamond</option>
            <option value="tutu">Tutu</option>
            <option value="generic">Plain</option>
          </select>
        </label>
      </div>

      <div className="mt-3">
        <label className="flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={form.autoSpeak} onChange={(e) => patch((f) => ({ ...f, autoSpeak: e.target.checked }))} className="h-5 w-5 accent-indigo-600" />
          Read prompts aloud automatically
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
      {shiftNote && (
        <p className="mt-2 text-center text-[11px] font-semibold text-emerald-600" role="status">
          📅 {shiftNote} — reviews pick up after the break.
        </p>
      )}
    </div>
  );
}

/** Planned light weeks: "review-only" plans review sets only; "off" behaves like vacation (no mission, streak frozen). */
function LightWeeksEditor({ weeks, today, onChange }: { weeks: LightWeek[]; today: string; onChange: (weeks: LightWeek[]) => void }) {
  const set = (i: number, patch: Partial<LightWeek>) => onChange(weeks.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  return (
    <div className="mt-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Light weeks</p>
      <p className="mt-0.5 text-[11px] text-slate-400">Review-only = review sets only. Off = like vacation: no mission, streak frozen, no catch-up.</p>
      <ul className="mt-2 space-y-2">
        {weeks.map((w, i) => (
          <li key={i} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-1.5">
            <input type="date" value={w.from} onChange={(e) => set(i, { from: e.target.value })} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-900" aria-label="from" />
            <input type="date" value={w.to} min={w.from} onChange={(e) => set(i, { to: e.target.value })} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-900" aria-label="to" />
            <select value={w.mode} onChange={(e) => set(i, { mode: e.target.value === "off" ? "off" : "review-only" })} className="rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-2 text-xs font-semibold text-slate-900" aria-label="mode">
              <option value="review-only">Review-only</option>
              <option value="off">Off</option>
            </select>
            <button type="button" onClick={() => onChange(weeks.filter((_, j) => j !== i))} className="h-9 w-9 rounded-lg bg-slate-100 text-sm font-bold text-slate-500" aria-label="remove light week">
              ✕
            </button>
            <span className="col-span-4 -mt-1 text-[10px] text-slate-400">
              {w.from && w.to && w.from <= w.to ? `${formatDateStr(w.from)} – ${formatDateStr(w.to)}${w.to < today ? " · past" : w.from <= today ? " · now" : ""}` : "pick a start and an end"}
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...weeks, { from: today, to: addDaysToDateStr(today, 6), mode: "review-only" }])}
        className="mt-2 min-h-[40px] rounded-lg bg-slate-50 px-3 text-xs font-bold text-indigo-700"
      >
        + Add a light week
      </button>
    </div>
  );
}

/** "Finished a book" quick action (2 points, design §4) for one kid. */
function FinishedBook({ learner, today, onNote }: { learner: Learner; today: string; onNote: (n: LearnNote) => void }) {
  const [title, setTitle] = useState("");
  const [state, setState] = useState<string | null>(null);
  async function save() {
    setState("saving");
    try {
      const { note, points } = await logFinishedBook(learner.id, today, title);
      onNote(note);
      setTitle("");
      setState(points > 0 ? `Logged · +${points} ${learner.settings.theme.currency}` : "Logged (weekly cap reached — no points)");
    } catch {
      setState("error");
    }
  }
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm">
      <p className="text-xs font-bold text-slate-900">
        📚 {learner.name} finished a book <span className="font-medium text-slate-400">· +{POINTS.book}</span>
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setState(null);
          }}
          maxLength={200}
          placeholder="Title (retold at dinner)"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400"
        />
        <button type="button" onClick={() => void save()} disabled={state === "saving"} className="min-h-[44px] rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-40">
          {state === "saving" ? "…" : "Log"}
        </button>
      </div>
      {state && state !== "saving" && <p className="mt-1 text-[11px] font-semibold text-slate-500">{state === "error" ? "Couldn't save — try again" : state}</p>}
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
  onMarked,
}: {
  learner: Learner;
  catalog: Skill[];
  progressMap: Record<string, SkillProgress>;
  today: string;
  onNote: (n: LearnNote) => void;
  /** reload the server data so counts, flags and plans see the new mastery */
  onMarked: () => void;
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
    try {
      // Mastered with a review in 7 days; stuck / review-miss flags and any old test-out mark are cleared.
      await saveProgress(
        learner.id,
        skills.map((s) => markMasteredByParent({ ...progressMap[s.id], skillId: s.id }, now, MARK_INTERVAL_DAYS))
      );
      // The skills are mastered now: drop them from the list even if the log note below fails.
      setMarked((m) => new Set([...m, ...skills.map((s) => s.id)]));
      setSelected(new Set());
      onMarked();
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
  const [cost, setCost] = useState(10);
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
        <p className="mt-2 text-xs text-slate-400">No rewards yet — run 009_learn_design.sql for the starter store, or add one below.</p>
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
