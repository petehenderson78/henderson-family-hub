"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import type { BlockKind, Learner, RewardRecord, SessionBlock, SessionRecord, Skill, SkillProgress } from "@/lib/learn/types";
import { catalogFor } from "@/lib/learn/catalog";
import { BLOCK_EMOJI, BLOCK_LABEL, mergeProgress } from "@/lib/learn/mastery";
import {
  HOMEWORK_MATH_LIMIT,
  POINTS,
  breakAfter,
  eveningStartMinutes,
  formatClockLabel,
  formatDateStr,
  homeworkFirst,
  homeworkReviewOnly,
  isPaused,
  isWeekend,
  minutesUntil,
  missionLaunchLine,
  missionRole,
  pointKindOf,
  quickReply,
  rotationPlan,
  todaysBlocks,
  vacationReturnLabel,
  weekPoints,
  weeklyRing,
  type MissionRole,
} from "@/lib/learn/stats";
import { familyDateOfIso } from "@/lib/learn/dates";
import { awardPoints, newClientId } from "@/lib/learn/store";
import { addNote, logFinishedBook, type LearnNote } from "@/lib/learn/store-notes";
import { blockScript, meanwhileText, togetherCardOfDay } from "@/lib/learn/together";
import { KID_EMOJI } from "../learn-home";
import LogBookForm from "../components/log-book-form";
import TogetherCard from "../components/together-card";

export interface TonightKid {
  learner: Learner;
  progressRows: SkillProgress[];
  sessions: SessionRecord[];
  /** learn_notes of the last 8 days (today's ticks, books, Together cards; the homework rule) */
  notes: LearnNote[];
  /** this week's ledger rows (points, surprise bonus given today) */
  weekRewards: RewardRecord[];
}

interface TonightViewProps {
  /** youngest first (the rotation opens each block with the younger child) */
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

/** Adult turns: 6 minutes on school nights, 7-8 on the weekend set (design §2.2). */
const TURN_MINUTES = { weekday: 6, weekend: 8 } as const;

interface DerivedKid extends TonightKid {
  catalog: Skill[];
  blocks: SessionBlock[];
  paused: boolean;
  hasHomework: boolean;
  role: MissionRole;
  /** design §14.7: tonight's app math is review-only */
  mathReviewOnly: boolean;
  todayNotes: LearnNote[];
}

export default function TonightView({ kids, today, nowIso, coachEnabled }: TonightViewProps) {
  const now = new Date(nowIso);
  const weekend = isWeekend(today);

  // Notes (seeded from the server, appended as the parent taps) and points written tonight.
  const [notesByKid, setNotesByKid] = useState<Record<string, LearnNote[]>>(() => Object.fromEntries(kids.map((k) => [k.learner.id, k.notes])));
  function pushNote(note: LearnNote) {
    setNotesByKid((m) => ({ ...m, [note.learnerId]: [note, ...(m[note.learnerId] ?? [])] }));
  }
  const [extraPoints, setExtraPoints] = useState<Record<string, RewardRecord[]>>({});
  function pushPoints(learnerId: string, row: RewardRecord) {
    setExtraPoints((m) => ({ ...m, [learnerId]: [...(m[learnerId] ?? []), row] }));
  }

  // One planning rule for every screen: stored mission, else a fresh plan (light weeks, homework rule).
  const derived: DerivedKid[] = kids.map((k) => {
    const catalog = catalogFor(k.learner.slug);
    const progressMap = mergeProgress(catalog, k.progressRows);
    const notes = notesByKid[k.learner.id] ?? [];
    const hasHomework = homeworkFirst(k.learner);
    return {
      ...k,
      notes,
      catalog,
      blocks: todaysBlocks({ learner: k.learner, catalog, progressMap, sessions: k.sessions, now, today, notes }),
      paused: isPaused(k.learner.settings, today),
      hasHomework,
      role: missionRole(k.sessions, today),
      mathReviewOnly: hasHomework && homeworkReviewOnly(notes, today),
      todayNotes: notes.filter((n) => n.date === today),
    };
  });

  // Clock for the stop-by countdown (server time first, then the phone's). Kept at minute
  // resolution so the page re-renders at most once a minute, never under a parent's tap.
  const [nowMs, setNowMs] = useState(() => Math.floor(now.getTime() / 60_000) * 60_000);
  useEffect(() => {
    const tick = () => setNowMs(Math.floor(Date.now() / 60_000) * 60_000);
    const t = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, []);
  const stopBy = derived.reduce<string | null>((earliest, d) => (earliest === null || d.learner.settings.stopBy < earliest ? d.learner.settings.stopBy : earliest), null) ?? "20:30";
  const minutesLeft = minutesUntil(stopBy, new Date(nowMs));

  // Rotation: per block kind, the adult splits the kids' parallel minutes (younger child first).
  const active = derived.filter((d) => !d.paused && d.blocks.length > 0);
  const turns = rotationPlan(
    active.map((d) => ({ slug: d.learner.slug, name: d.learner.name, mission: { blocks: d.blocks.filter((b) => !b.done) } })),
    weekend ? TURN_MINUTES.weekend : TURN_MINUTES.weekday
  );
  // Breaks sit outside the 30: 2 minutes after math on a school night (none on a fallback night
  // starting at or after 19:55), 10 minutes between weekend blocks.
  const eveningStart = eveningStartMinutes(
    derived.map((d) => d.sessions.find((x) => x.date === today)),
    new Date(nowMs)
  );
  const skillOf = (slug: string, skillId: string) => derived.find((d) => d.learner.slug === slug)?.catalog.find((s) => s.id === skillId);
  function meanwhileFor(i: number): string {
    const t = turns[i];
    const other = derived.find((d) => d.learner.slug !== t.learnerSlug);
    if (!other) return "";
    if (other.paused) return `${other.learner.name}: vacation mode — off duty.`;
    const near = turns.find((x) => x.kind === t.kind && x.learnerSlug === other.learner.slug);
    if (!near) return `${other.learner.name}: reads a familiar book quietly.`;
    return meanwhileText(other.learner.name, skillOf(near.learnerSlug, near.block.skillId), near.block.label.split(" · ").pop());
  }

  // Quick reply mirrors the family's email convention.
  const reply = quickReply(
    derived.map((d) => {
      const extras = [
        ...HOMEWORK_ITEMS.filter((h) => d.todayNotes.some((n) => n.kind === "homework" && n.subject === h.subject)).map((h) => h.label.toLowerCase()),
        ...(d.todayNotes.some((n) => n.kind === "together") ? ["together card"] : []),
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
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-[calc(8rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-3xl px-4 pt-8">
        <Link href="/learn" className="text-xs font-semibold text-slate-400">
          ← Learn
        </Link>

        {/* Header: title, countdown, vacation badges */}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-slate-900">Tonight</h1>
            <p className="mt-0.5 text-sm font-medium text-slate-400">
              {formatDateStr(today)} · one adult, {weekend ? TURN_MINUTES.weekend : TURN_MINUTES.weekday}-minute turns{weekend ? " · weekend set" : ""}
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
                Blocks must finish by {formatClockLabel(stopBy)} · {minutesLeft} min left
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
                  🏖️ Vacation mode · {d.learner.name} is back {vacationReturnLabel(d.learner.settings, today)}
                </span>
              ))}
          </div>
        )}

        {derived.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white/50 p-6 text-center text-sm text-slate-400">
            No learners found. Run the supabase/migrations 007, 008 and 009.
          </div>
        )}

        {/* Two kid columns (stack on phone) */}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {derived.map((d) => (
            <KidColumn
              key={d.learner.id}
              kid={d}
              today={today}
              weekend={weekend}
              pointRows={[...d.weekRewards, ...(extraPoints[d.learner.id] ?? [])]}
              onNote={pushNote}
              onPoints={(row) => pushPoints(d.learner.id, row)}
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
            <p className="mt-1 text-xs text-slate-400">
              Both kids work the same block at once; the adult coaches one while the other works alone. Model the first item, hand over the completion problem,
              check after the attempt. Stop at the timer, not the end of a section. A block that cannot finish by {formatClockLabel(stopBy)} is skipped — no debt.
            </p>
            <ol className="mt-3 space-y-2">
              {turns.map((t, i) => {
                const kid = derived.find((d) => d.learner.slug === t.learnerSlug);
                const kindBlocks = kid?.blocks.filter((b) => b.kind === t.kind) ?? [];
                const done = kindBlocks.length > 0 && kindBlocks.every((b) => b.done);
                const skill = skillOf(t.learnerSlug, t.block.skillId);
                const reviews = t.blocks.filter((b) => b.mode === "review" && !b.skillIds).length;
                const lastOfKind = !turns.slice(i + 1).some((x) => x.kind === t.kind);
                const breakMinutes = lastOfKind && turns.slice(i + 1).length > 0 ? breakAfter(t.kind, weekend, eveningStart) : 0;
                return (
                  <Fragment key={t.index}>
                    <li className={`rounded-2xl border border-slate-100 bg-white p-3 shadow-sm ${done ? "opacity-50" : ""}`}>
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-slate-100 text-[10px] font-bold leading-tight text-slate-500">
                          <span className="text-sm">{t.index}</span>+{t.startMinute}′
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">
                            Adult with <span aria-hidden>{KID_EMOJI[t.learnerSlug] ?? "⭐"}</span> {t.learnerName} · {BLOCK_EMOJI[t.kind]} {BLOCK_LABEL[t.kind]}
                            {t.parts > 1 ? ` (${t.part}/${t.parts})` : ""}
                            {done ? " ✓" : ""}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {t.block.label.split(" · ").slice(1).join(" · ")}
                            {reviews > 0 && t.block.mode !== "review" ? ` · after ${reviews} review set${reviews === 1 ? "" : "s"}` : ""}
                          </p>
                          {skill && t.part === 1 && <p className="mt-0.5 text-xs text-slate-500">Say this: “{skill.parentTip}”</p>}
                          <p className="mt-1 text-xs font-medium text-amber-700">Meanwhile — {meanwhileFor(i)}</p>
                        </div>
                        <span className="flex-shrink-0 text-xs font-bold text-slate-400">{t.minutes} min</span>
                      </div>
                    </li>
                    {breakMinutes > 0 && (
                      <li className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs font-semibold text-emerald-800">
                        🤸 {breakMinutes}-minute {weekend ? "break outside" : "movement break"} — both kids, outside the {weekend ? "105" : "30"}
                      </li>
                    )}
                  </Fragment>
                );
              })}
            </ol>
          </section>
        )}

        {/* Log book work */}
        {derived.length > 0 && (
          <section className="mt-8">
            <LogBookForm learners={derived.map((d) => ({ id: d.learner.id, name: d.learner.name, slug: d.learner.slug }))} today={today} onSaved={pushNote} />
            <TonightLog kids={derived} />
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
            <p className="mt-1 text-xs text-slate-400">&ldquo;Done. Same plan tomorrow, nothing carried.&rdquo; Unfinished work is not tomorrow&apos;s debt.</p>
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
  weekend: boolean;
  /** this week's ledger rows plus the points written tonight */
  pointRows: RewardRecord[];
  onNote: (n: LearnNote) => void;
  onPoints: (row: RewardRecord) => void;
  minutesLeft: number;
  stopBy: string;
  cardOffset: number;
  onNextCard: () => void;
}

function KidColumn({ kid, today, weekend, pointRows, onNote, onPoints, minutesLeft, stopBy, cardOffset, onNextCard }: KidColumnProps) {
  const { learner, blocks, catalog, paused, todayNotes } = kid;
  const theme = learner.settings.theme;
  const kindsTotal = new Set(blocks.map((b) => b.kind)).size;
  const kindsDone = new Set(blocks.map((b) => b.kind)).size - new Set(blocks.filter((b) => !b.done).map((b) => b.kind)).size;
  const nextIndex = blocks.findIndex((b) => !b.done);
  const homeworkMinutes = (block: BlockKind) =>
    todayNotes.filter((n) => n.kind === "homework" && HOMEWORK_ITEMS.some((h) => h.subject === n.subject && h.block === block)).reduce((s, n) => s + n.minutes, 0);
  const card = togetherCardOfDay(learner.slug, today, cardOffset);
  const cardDone = !!card && todayNotes.some((n) => n.kind === "together" && n.text === card.title);
  const ring = weeklyRing(kid.sessions, today);
  const week = weekPoints(pointRows, today);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-bold text-slate-900">
          <span aria-hidden>{KID_EMOJI[learner.slug] ?? "⭐"}</span> {learner.name}
          <span className="ml-2 text-xs font-semibold text-slate-400">grade {learner.grade}</span>
        </p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${kindsDone === kindsTotal && kindsTotal > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {kindsTotal === 0 ? "no blocks" : `${kindsDone}/${kindsTotal} done`} · ★ {ring.stars}/{ring.target}
        </span>
      </div>

      {paused ? (
        <div className="mt-3 rounded-xl bg-sky-50 p-4 text-sm font-semibold text-sky-800">
          🏖️ Vacation mode — missions paused, streak frozen. Back {vacationReturnLabel(learner.settings, today)}.
        </div>
      ) : (
        <>
          {/* The two-line launch (the child reads it; Lily repeats it). */}
          <div className="mt-3 rounded-xl bg-indigo-50/70 p-3">
            {kid.role !== "required" && (
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                {kid.role === "optional" ? "Friday Free — optional tonight" : "Bonus set — the ring is closed"}
              </p>
            )}
            <p className="text-sm font-bold text-slate-900">{missionLaunchLine(blocks, weekend)}</p>
            {theme.timeBack && <p className="mt-0.5 text-sm font-semibold text-indigo-700">{theme.timeBack}</p>}
          </div>

          {kid.hasHomework && <HomeworkChecklist learner={learner} today={today} notes={todayNotes} onNote={onNote} />}
          {kid.mathReviewOnly && (
            <p className="mt-2 rounded-xl bg-amber-50 p-2.5 text-[11px] font-semibold text-amber-800">
              Homework took more than {HOMEWORK_MATH_LIMIT} of her 12 math minutes two nights running: tonight&apos;s app math is review-only; new learning moves
              to the weekend set.
            </p>
          )}

          <ul className="mt-3 space-y-2">
            {blocks.map((b, i) => {
              const skill = catalog.find((s) => s.id === b.skillId);
              const hw = b.mode === "review" ? 0 : homeworkMinutes(b.kind);
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
                        {b.skillIds ? "Mix-up" : b.mode === "review" ? "Review set" : b.mode === "test" ? "Skip check" : b.offerTestOut ? "Learn (skip check offered)" : "Learn"}
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

      {!paused && <PlacementLauncher slug={learner.slug} catalog={catalog} />}
      <PointsActions learner={learner} today={today} pointRows={pointRows} weekPoints={week} onNote={onNote} onPoints={onPoints} />
    </div>
  );
}

const SUBJECT_WORD: Record<string, string> = { math: "Math", reading: "Reading", phonics: "Phonics", writing: "Writing", reasoning: "Brain" };

/**
 * Placement sprint (design §3.1): 5-item probes climb a subject's skill order until two
 * skills in a row are not passed; 4/5 earns a second probe and the pair must reach 9/10.
 */
function PlacementLauncher({ slug, catalog }: { slug: string; catalog: Skill[] }) {
  const [open, setOpen] = useState(false);
  const subjects = Array.from(new Set(catalog.filter((s) => s.testOut).map((s) => s.subject)));
  if (subjects.length === 0) return null;
  return (
    <div className="mt-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-h-[32px] text-[11px] font-bold uppercase tracking-wider text-violet-700">
        {open ? "Placement sprint ▲" : "Placement sprint (~10 min a subject) ▼"}
      </button>
      {open && (
        <div className="mt-1 flex flex-wrap gap-2">
          {subjects.map((subject) => (
            <Link
              key={subject}
              href={`/learn/${slug}/play?mode=placement&subject=${subject}&return=tonight`}
              className="flex min-h-[44px] items-center rounded-xl bg-violet-50 px-3 text-xs font-bold text-violet-800 border border-violet-200"
            >
              {SUBJECT_WORD[subject] ?? subject}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Surprise bonus" (1 point, at most once a day) and "Finished a book" (2 points), inside the weekly cap of 25. */
function PointsActions({
  learner,
  today,
  pointRows,
  weekPoints: week,
  onNote,
  onPoints,
}: {
  learner: Learner;
  today: string;
  pointRows: RewardRecord[];
  weekPoints: number;
  onNote: (n: LearnNote) => void;
  onPoints: (row: RewardRecord) => void;
}) {
  const currency = learner.settings.theme.currency;
  const bonusToday = pointRows.some((r) => pointKindOf(r) === "bonus" && (r.createdAt ? familyDateOfIso(r.createdAt) === today : true));
  const capped = week >= POINTS.weeklyCap;
  const [state, setState] = useState<Record<string, "saving" | "error" | string>>({});
  const [bookOpen, setBookOpen] = useState(false);
  const [title, setTitle] = useState("");

  function record(kind: "bonus" | "book", points: number) {
    if (points > 0) onPoints({ learnerId: learner.id, delta: points, reason: `pt:${kind}`, createdAt: new Date().toISOString() });
  }

  async function bonus() {
    setState((s) => ({ ...s, bonus: "saving" }));
    try {
      const points = await awardPoints(learner.id, "bonus", { today, clientId: newClientId() });
      record("bonus", points);
      setState((s) => ({ ...s, bonus: points > 0 ? `+${points} ${currency} — say what it was for` : "Not added (daily or weekly cap)" }));
    } catch {
      setState((s) => ({ ...s, bonus: "error" }));
    }
  }

  async function book() {
    setState((s) => ({ ...s, book: "saving" }));
    try {
      const { note, points } = await logFinishedBook(learner.id, today, title);
      onNote(note);
      record("book", points);
      setTitle("");
      setBookOpen(false);
      setState((s) => ({ ...s, book: points > 0 ? `Logged · +${points} ${currency}` : "Logged (weekly cap reached — no points)" }));
    } catch {
      setState((s) => ({ ...s, book: "error" }));
    }
  }

  const msg = (k: string) => (state[k] && state[k] !== "saving" ? (state[k] === "error" ? "Couldn't save — try again" : state[k]) : null);

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {currency}: {Math.min(week, POINTS.weeklyCap)} of {POINTS.weeklyCap} this week
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void bonus()}
          disabled={bonusToday || capped || state.bonus === "saving"}
          className="min-h-[44px] rounded-xl bg-amber-50 px-3 text-xs font-bold text-amber-800 border border-amber-200 disabled:opacity-50"
        >
          {bonusToday ? "Surprise bonus given ✓" : state.bonus === "saving" ? "Saving…" : "🎁 Surprise bonus +1"}
        </button>
        <button
          type="button"
          onClick={() => setBookOpen((o) => !o)}
          disabled={state.book === "saving"}
          className="min-h-[44px] rounded-xl bg-emerald-50 px-3 text-xs font-bold text-emerald-800 border border-emerald-200 disabled:opacity-50"
        >
          📚 Finished a book +2
        </button>
      </div>
      {bookOpen && (
        <div className="mt-2 flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Title (retold at dinner)"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400"
          />
          <button type="button" onClick={() => void book()} disabled={state.book === "saving"} className="min-h-[44px] rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-40">
            {state.book === "saving" ? "…" : "Log"}
          </button>
        </div>
      )}
      {(msg("bonus") || msg("book")) && <p className="mt-1.5 text-[11px] font-semibold text-slate-500">{[msg("bonus"), msg("book")].filter(Boolean).join(" · ")}</p>}
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
    const m = minutes[item.key] ?? 6;
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
      <p className="mt-0.5 text-[11px] text-slate-500">
        Model item 1, she does the rest. Log the real minutes: more than {HOMEWORK_MATH_LIMIT} math minutes two nights running makes that night&apos;s app math
        review-only. Never add old assignments.
      </p>
      <ul className="mt-2 space-y-2">
        {HOMEWORK_ITEMS.map((item) => {
          const logged = notes.find((n) => n.kind === "homework" && n.subject === item.subject);
          const m = minutes[item.key] ?? 6;
          const s = state[item.key];
          return (
            <li key={item.key} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!!logged || s === "saving"}
                onClick={() => void tick(item)}
                aria-pressed={!!logged}
                aria-label={`${item.label} done`}
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
                  <button type="button" onClick={() => setMinutes((x) => ({ ...x, [item.key]: Math.max(1, m - 1) }))} className="h-10 w-10 rounded-lg bg-white text-lg font-bold text-slate-600 border border-slate-200" aria-label="less minutes">
                    −
                  </button>
                  <span className="w-12 text-center text-xs font-bold tabular-nums text-slate-700">{m} min</span>
                  <button type="button" onClick={() => setMinutes((x) => ({ ...x, [item.key]: Math.min(30, m + 1) }))} className="h-10 w-10 rounded-lg bg-white text-lg font-bold text-slate-600 border border-slate-200" aria-label="more minutes">
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

function TonightLog({ kids }: { kids: DerivedKid[] }) {
  const rows = kids.flatMap((k) => k.todayNotes.filter((n) => n.kind !== "pony").map((n) => ({ n, name: k.learner.name })));
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
