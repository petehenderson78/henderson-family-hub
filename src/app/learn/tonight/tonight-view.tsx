"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BlockKind, Learner, SessionBlock, SessionRecord, Skill, SkillProgress } from "@/lib/learn/types";
import { catalogFor } from "@/lib/learn/catalog";
import { BLOCK_EMOJI, mergeProgress, planMission } from "@/lib/learn/mastery";
import {
  formatClockLabel,
  formatDateStr,
  isPaused,
  isWeekend,
  minutesUntil,
  quickReply,
  rotationPlan,
  sessionForDate,
  vacationReturnLabel,
  type RotationTurn,
} from "@/lib/learn/stats";
import { addNote, type LearnNote } from "@/lib/learn/store-notes";
import { blockScript, meanwhileText, togetherCardOfDay } from "@/lib/learn/together";
import { KID_EMOJI } from "../learn-home";
import LogBookForm from "../components/log-book-form";
import TogetherCard from "../components/together-card";

export interface TonightKid {
  learner: Learner;
  progressRows: SkillProgress[];
  sessions: SessionRecord[];
  /** today's notes (homework ticks, Together cards, book work) */
  notes: LearnNote[];
}

interface TonightViewProps {
  kids: TonightKid[];
  /** YYYY-MM-DD in the family timezone */
  today: string;
  nowIso: string;
  coachEnabled: boolean;
}

/** Lily's "School homework first" items. Minutes come off the matching block (display only). */
const HOMEWORK_ITEMS: { key: string; label: string; noteText: string; hint: string; subject: string; block: BlockKind }[] = [
  { key: "math-sheet", label: "Math sheet", noteText: "School math sheet", hint: "Take Home Folder, right side · due tomorrow", subject: "math", block: "math" },
  { key: "og-packet", label: "OG packet", noteText: "School OG packet", hint: "today's directions on the front · due Friday", subject: "reading", block: "reading" },
];

const TURN_MINUTES = 6;

interface DerivedKid extends TonightKid {
  catalog: Skill[];
  blocks: SessionBlock[];
  paused: boolean;
  hasHomework: boolean;
}

export default function TonightView({ kids, today, nowIso, coachEnabled }: TonightViewProps) {
  const now = new Date(nowIso);
  const weekend = isWeekend(today);

  // One planMission call site: today's stored mission when it exists, else a fresh plan.
  const derived: DerivedKid[] = kids.map((k) => {
    const catalog = catalogFor(k.learner.slug);
    const progressMap = mergeProgress(catalog, k.progressRows);
    const session = sessionForDate(k.sessions, today);
    const blocks: SessionBlock[] =
      session && session.blocks.length > 0 ? session.blocks : planMission(catalog, progressMap, k.learner.settings, now, today).blocks.map((b) => ({ ...b, done: false }));
    return {
      ...k,
      catalog,
      blocks,
      paused: isPaused(k.learner.settings, today),
      hasHomework: k.learner.slug === "lily" || k.learner.grade <= 2,
    };
  });

  // Notes logged tonight (seeded from the server, appended as the parent taps).
  const [notesByKid, setNotesByKid] = useState<Record<string, LearnNote[]>>(() => Object.fromEntries(kids.map((k) => [k.learner.id, k.notes])));
  function pushNote(note: LearnNote) {
    setNotesByKid((m) => ({ ...m, [note.learnerId]: [note, ...(m[note.learnerId] ?? [])] }));
  }

  // Clock for the stop-by countdown (server time first, then the phone's, every 30 s).
  const [nowMs, setNowMs] = useState(() => now.getTime());
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const t = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, []);
  const stopBy = derived.reduce<string | null>((earliest, d) => (earliest === null || d.learner.settings.stopBy < earliest ? d.learner.settings.stopBy : earliest), null) ?? "20:30";
  const minutesLeft = minutesUntil(stopBy, new Date(nowMs));

  // Rotation: 6-minute alternating turns through the (unpaused) missions.
  const active = derived.filter((d) => !d.paused && d.blocks.length > 0);
  const turns = rotationPlan(
    active.map((d) => ({ slug: d.learner.slug, name: d.learner.name, mission: { blocks: d.blocks } })),
    TURN_MINUTES
  );
  const skillOf = (slug: string, skillId: string) => derived.find((d) => d.learner.slug === slug)?.catalog.find((s) => s.id === skillId);
  function meanwhileFor(i: number): string {
    const t = turns[i];
    const others = derived.filter((d) => d.learner.slug !== t.learnerSlug);
    if (others.length === 0) return "";
    const other = others[0];
    if (other.paused) return `${other.learner.name}: vacation mode — off duty.`;
    const near = [turns[i + 1], turns[i - 1]].find((x): x is RotationTurn => !!x && x.learnerSlug === other.learner.slug);
    if (!near) return `${other.learner.name}: reads a familiar book quietly.`;
    return meanwhileText(other.learner.name, skillOf(near.learnerSlug, near.block.skillId), near.block.label.split(" · ")[1]);
  }

  // Quick reply mirrors the family's email convention.
  const reply = quickReply(
    derived.map((d) => {
      const notes = notesByKid[d.learner.id] ?? [];
      const extras = [
        ...HOMEWORK_ITEMS.filter((h) => notes.some((n) => n.kind === "homework" && n.subject === h.subject)).map((h) => h.label.toLowerCase()),
        ...(notes.some((n) => n.kind === "together") ? ["together card"] : []),
      ];
      return { name: d.learner.name, blocks: d.blocks, paused: d.paused, extras };
    })
  );
  const [copied, setCopied] = useState(false);
  async function copyReply() {
    try {
      await navigator.clipboard.writeText(reply);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy tonight's summary:", reply);
    }
  }

  const [cardOffset, setCardOffset] = useState<Record<string, number>>({});

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
      <div className="mx-auto max-w-3xl px-4 pt-8">
        <Link href="/learn" className="text-xs font-semibold text-slate-400">
          ← Learn
        </Link>

        {/* Header: title, countdown, vacation badges */}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-slate-900">Tonight</h1>
            <p className="mt-0.5 text-sm font-medium text-slate-400">
              {formatDateStr(today)} · one adult, {TURN_MINUTES}-minute turns{weekend ? " · weekend" : ""}
            </p>
          </div>
          <div
            className={`rounded-2xl px-3 py-2 text-sm font-bold ${
              minutesLeft <= 0 ? "bg-slate-800 text-white" : minutesLeft <= 15 ? "bg-rose-50 text-rose-700" : "bg-indigo-50 text-indigo-700"
            }`}
            suppressHydrationWarning
          >
            {minutesLeft <= 0 ? (
              <>Lights out soon — tomorrow is a fresh start</>
            ) : (
              <>
                Blocks must start by {formatClockLabel(stopBy)} · {minutesLeft} min left
              </>
            )}
          </div>
        </div>
        {derived.some((d) => d.paused) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {derived
              .filter((d) => d.paused)
              .map((d) => (
                <span key={d.learner.id} className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">
                  🏖️ Vacation mode · {d.learner.name} is back {vacationReturnLabel(d.learner.settings.pausedUntil ?? today)}
                </span>
              ))}
          </div>
        )}

        {derived.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white/50 p-6 text-center text-sm text-slate-400">
            No learners found. Run supabase/migrations/007_learn.sql and 008_learn_notes.sql.
          </div>
        )}

        {/* Two kid columns (stack on phone) */}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {derived.map((d) => (
            <KidColumn
              key={d.learner.id}
              kid={d}
              today={today}
              notes={notesByKid[d.learner.id] ?? []}
              onNote={pushNote}
              minutesLeft={minutesLeft}
              stopBy={stopBy}
              cardOffset={cardOffset[d.learner.id] ?? 0}
              onNextCard={() => setCardOffset((m) => ({ ...m, [d.learner.id]: (m[d.learner.id] ?? 0) + 1 }))}
            />
          ))}
        </div>

        {/* Rotation timeline */}
        {turns.length > 0 && (
          <section className="mt-8">
            <div className="flex items-end justify-between">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Rotation</h2>
              <span className="text-xs font-semibold text-slate-400">{turns.reduce((s, t) => s + t.minutes, 0)} min · swap at each row</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Adult coaches one kid; the other works independently. Checks happen inside these times. Stop at the timer, not the end of a section.</p>
            <ol className="mt-3 space-y-2">
              {turns.map((t, i) => {
                const kid = derived.find((d) => d.learner.slug === t.learnerSlug);
                const done = kid?.blocks.find((b) => b.skillId === t.block.skillId && b.kind === t.block.kind)?.done;
                const skill = skillOf(t.learnerSlug, t.block.skillId);
                const startAt = turns.slice(0, i).reduce((s, x) => s + x.minutes, 0);
                return (
                  <li key={t.index} className={`rounded-2xl border border-slate-100 bg-white p-3 shadow-sm ${done ? "opacity-50" : ""}`}>
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-slate-100 text-[10px] font-bold leading-tight text-slate-500">
                        <span className="text-sm">{t.index}</span>+{startAt}′
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          Adult with <span aria-hidden>{KID_EMOJI[t.learnerSlug] ?? "⭐"}</span> {t.learnerName} · {BLOCK_EMOJI[t.block.kind]} {t.block.label}
                          {t.parts > 1 ? ` (${t.part}/${t.parts})` : ""}
                          {done ? " ✓" : ""}
                        </p>
                        {skill && t.part === 1 && <p className="mt-0.5 text-xs text-slate-500">Say this: “{skill.parentTip}”</p>}
                        <p className="mt-1 text-xs font-medium text-amber-700">Meanwhile — {meanwhileFor(i)}</p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold text-slate-400">{t.minutes} min</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* Log book work */}
        {derived.length > 0 && (
          <section className="mt-8">
            <LogBookForm learners={derived.map((d) => ({ id: d.learner.id, name: d.learner.name, slug: d.learner.slug }))} today={today} onSaved={pushNote} />
            <TonightLog kids={derived} notesByKid={notesByKid} />
          </section>
        )}

        {/* All done summary */}
        {derived.length > 0 && (
          <section className="mt-8 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">All done?</h2>
              <button type="button" onClick={() => void copyReply()} className={`min-h-[44px] rounded-xl px-4 text-sm font-bold text-white ${copied ? "bg-emerald-500" : "bg-slate-900"}`}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">The one-line reply the plan asks for. Unfinished work is not tomorrow&apos;s debt.</p>
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-800">{reply}</p>
            {coachEnabled && <p className="mt-2 text-[11px] text-slate-400">The AI coach is on inside each kid&apos;s player.</p>}
          </section>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface KidColumnProps {
  kid: DerivedKid;
  today: string;
  notes: LearnNote[];
  onNote: (n: LearnNote) => void;
  minutesLeft: number;
  stopBy: string;
  cardOffset: number;
  onNextCard: () => void;
}

function KidColumn({ kid, today, notes, onNote, minutesLeft, stopBy, cardOffset, onNextCard }: KidColumnProps) {
  const { learner, blocks, catalog, paused } = kid;
  const doneCount = blocks.filter((b) => b.done).length;
  const nextIndex = blocks.findIndex((b) => !b.done);
  const homeworkMinutes = (block: BlockKind) =>
    notes.filter((n) => n.kind === "homework" && HOMEWORK_ITEMS.some((h) => h.subject === n.subject && h.block === block)).reduce((s, n) => s + n.minutes, 0);
  const card = togetherCardOfDay(learner.slug, today, cardOffset);
  const cardDone = !!card && notes.some((n) => n.kind === "together" && n.text === card.title);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-bold text-slate-900">
          <span aria-hidden>{KID_EMOJI[learner.slug] ?? "⭐"}</span> {learner.name}
          <span className="ml-2 text-xs font-semibold text-slate-400">grade {learner.grade}</span>
        </p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${doneCount === blocks.length && blocks.length > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {blocks.length === 0 ? "no blocks" : `${doneCount}/${blocks.length} done`}
        </span>
      </div>

      {paused ? (
        <div className="mt-3 rounded-xl bg-sky-50 p-4 text-sm font-semibold text-sky-800">
          🏖️ Vacation mode — missions paused, streak frozen. Back {vacationReturnLabel(learner.settings.pausedUntil ?? today)}.
        </div>
      ) : (
        <>
          {kid.hasHomework && <HomeworkChecklist learner={learner} today={today} notes={notes} onNote={onNote} />}

          <ul className="mt-3 space-y-2">
            {blocks.map((b, i) => {
              const skill = catalog.find((s) => s.id === b.skillId);
              const hw = homeworkMinutes(b.kind);
              const shortened = hw > 0 ? Math.max(0, b.minutes - hw) : null;
              const isNext = i === nextIndex;
              const tooLate = minutesLeft <= 0;
              const endsLate = !tooLate && minutesLeft < (shortened ?? b.minutes);
              return (
                <li key={`${b.kind}-${i}`} className={`rounded-xl border p-3 ${b.done ? "border-emerald-100 bg-emerald-50/60" : isNext ? "border-indigo-200 bg-indigo-50/40" : "border-slate-100 bg-slate-50/60"}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl" aria-hidden>
                      {BLOCK_EMOJI[b.kind]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{b.label}</p>
                      <p className="text-xs font-medium text-slate-400">
                        {shortened !== null ? (
                          <>
                            <span className="line-through">{b.minutes} min</span> → {shortened} min (homework counted)
                          </>
                        ) : (
                          `${b.minutes} min`
                        )}
                        {" · "}
                        {b.mode === "review" ? "Review" : b.mode === "test" ? "Test out" : "Learn"}
                        {b.done && typeof b.correct === "number" && typeof b.total === "number" ? ` · ${b.correct}/${b.total}` : ""}
                      </p>
                    </div>
                    {b.done ? (
                      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-lg font-bold text-white">✓</span>
                    ) : tooLate ? (
                      <span className="text-[11px] font-bold text-slate-400">lights out</span>
                    ) : (
                      <Link
                        href={`/learn/${learner.slug}/play?block=${i}&return=tonight`}
                        className={`flex min-h-[48px] flex-shrink-0 items-center justify-center rounded-xl px-5 text-sm font-bold text-white ${isNext ? "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md shadow-blue-500/20" : "bg-slate-700"}`}
                      >
                        Start
                      </Link>
                    )}
                  </div>
                  {endsLate && !b.done && <p className="mt-1.5 text-[11px] font-semibold text-amber-700">Would end after {formatClockLabel(stopBy)} — shorten it or skip; no catch-up tomorrow.</p>}
                  {skill && !b.done && <ScriptLines skill={skill} open={isNext} />}
                </li>
              );
            })}
          </ul>

          {card && (
            <div className="mt-3">
              <TogetherCard card={card} learnerId={learner.id} learnerName={learner.name} today={today} done={cardDone} onDone={onNote} onNext={onNextCard} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ScriptLines({ skill, open }: { skill: Skill; open: boolean }) {
  const [show, setShow] = useState(open);
  const script = blockScript(skill);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setShow((s) => !s)} aria-expanded={show} className="min-h-[32px] text-[11px] font-bold uppercase tracking-wider text-indigo-600">
        {show ? "Hide script ▲" : "Say this / if stuck / if flying ▼"}
      </button>
      {show && (
        <dl className="mt-1 space-y-1.5 text-xs">
          <div>
            <dt className="font-bold text-slate-500">Say this</dt>
            <dd className="text-slate-800">“{script.sayThis}”</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-500">If stuck</dt>
            <dd className="text-slate-700">{script.ifStuck}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-500">If flying</dt>
            <dd className="text-slate-700">{script.ifFlying}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function HomeworkChecklist({ learner, today, notes, onNote }: { learner: Learner; today: string; notes: LearnNote[]; onNote: (n: LearnNote) => void }) {
  const [minutes, setMinutes] = useState<Record<string, number>>({});
  const [state, setState] = useState<Record<string, "saving" | "error">>({});

  async function tick(item: (typeof HOMEWORK_ITEMS)[number]) {
    const m = minutes[item.key] ?? 10;
    setState((s) => ({ ...s, [item.key]: "saving" }));
    try {
      const note = await addNote({
        learnerId: learner.id,
        date: today,
        kind: "homework",
        subject: item.subject,
        text: item.noteText,
        minutes: m,
        score: null,
        total: null,
        standards: [],
      });
      setState((s) => {
        const next = { ...s };
        delete next[item.key];
        return next;
      });
      onNote(note);
    } catch {
      setState((s) => ({ ...s, [item.key]: "error" }));
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50/50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">School homework first</p>
      <p className="mt-0.5 text-[11px] text-slate-500">STOP RULE: if school work needs more time, use her thinking block before going past 30 min. Never add old assignments.</p>
      <ul className="mt-2 space-y-2">
        {HOMEWORK_ITEMS.map((item) => {
          const logged = notes.find((n) => n.kind === "homework" && n.subject === item.subject);
          const m = minutes[item.key] ?? 10;
          const s = state[item.key];
          return (
            <li key={item.key} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!!logged || s === "saving"}
                onClick={() => void tick(item)}
                aria-pressed={!!logged}
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border-2 text-lg font-bold ${
                  logged ? "border-emerald-500 bg-emerald-500 text-white" : s === "error" ? "border-rose-400 bg-white text-rose-500" : "border-slate-300 bg-white text-transparent"
                }`}
              >
                ✓
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                <p className="truncate text-[11px] text-slate-400">{logged ? `logged · ${logged.minutes} min off her ${item.block} block` : item.hint}</p>
              </div>
              {!logged && (
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setMinutes((x) => ({ ...x, [item.key]: Math.max(1, m - 5) }))} className="h-10 w-10 rounded-lg bg-white text-lg font-bold text-slate-600 border border-slate-200" aria-label="less minutes">
                    −
                  </button>
                  <span className="w-12 text-center text-xs font-bold tabular-nums text-slate-700">{m} min</span>
                  <button type="button" onClick={() => setMinutes((x) => ({ ...x, [item.key]: Math.min(30, m + 5) }))} className="h-10 w-10 rounded-lg bg-white text-lg font-bold text-slate-600 border border-slate-200" aria-label="more minutes">
                    +
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TonightLog({ kids, notesByKid }: { kids: DerivedKid[]; notesByKid: Record<string, LearnNote[]> }) {
  const rows = kids.flatMap((k) => (notesByKid[k.learner.id] ?? []).map((n) => ({ n, name: k.learner.name })));
  if (rows.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5">
      {rows.map(({ n, name }) => (
        <li key={n.id ?? `${n.learnerId}-${n.createdAt}`} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-600 border border-slate-100">
          <span className="font-bold text-slate-800">{name}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500">{n.kind}</span>
          <span className="min-w-0 flex-1 truncate">{n.text}</span>
          <span className="font-semibold tabular-nums text-slate-400">{n.minutes} min{typeof n.score === "number" && typeof n.total === "number" ? ` · ${n.score}/${n.total}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}
