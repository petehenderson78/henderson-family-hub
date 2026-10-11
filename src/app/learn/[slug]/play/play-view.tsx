"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  BlockKind,
  Learner,
  PracticeMode,
  Question,
  SessionBlock,
  SessionRecord,
  Skill,
  SkillProgress,
  SkillStatus,
  Subject,
} from "@/lib/learn/types";
import { catalogFor } from "@/lib/learn/catalog";
import { makeQuestion } from "@/lib/learn/generators";
import { questionSeed, hashString } from "@/lib/learn/rng";
import { BLOCK_EMOJI, XP, applyResult, applyTestOut, mergeProgress, planMission, questionTargetFor } from "@/lib/learn/mastery";
import { xpFor } from "@/lib/learn/mastery";
import { answerText, gradeAnswer } from "@/lib/learn/grade";
import { sessionForDate } from "@/lib/learn/stats";
import { addReward, logAttempt, saveProgress, upsertSession } from "@/lib/learn/store";
import type { CoachQuestion } from "@/lib/learn/coach-types";
import QuestionCard from "../../components/question-card";
import FeedbackBanner from "../../components/feedback-banner";
import SummaryCard, { type MasteryChange } from "../../components/summary-card";
import CoachSheet from "../../components/coach-sheet";
import { useCoach } from "../../components/use-coach";

interface PlayViewProps {
  learner: Learner;
  progressRows: SkillProgress[];
  sessions: SessionRecord[];
  today: string;
  nowIso: string;
  blockParam?: string;
  skillParam?: string;
  modeParam?: string;
  /** from the server page: Boolean(ANTHROPIC_API_KEY) */
  coachEnabled: boolean;
}

interface Run {
  skill: Skill;
  mode: PracticeMode;
  minutes: number;
  /** index into `blocks` when running the mission, null for a free skill run */
  blockIndex: number | null;
  offerTestOut: boolean;
  /** today's planned mission (stored or freshly planned) */
  blocks: SessionBlock[];
  session: SessionRecord | null;
  progress: SkillProgress;
}

type Phase = "offer" | "question" | "feedback" | "summary";

interface Finished {
  xp: number;
  correct: number;
  total: number;
  changes: MasteryChange[];
  missionComplete: boolean;
  nextBlockIndex: number;
}

/** Session records written this page-load, so the next block never starts from stale server props. */
const sessionCache = new Map<string, SessionRecord>();

function kindForSubject(subject: Subject): BlockKind {
  if (subject === "math") return "math";
  if (subject === "reasoning") return "brain";
  return "reading";
}

function parseMode(m: string | undefined): PracticeMode | null {
  return m === "learn" || m === "review" || m === "test" ? m : null;
}

const COACH_TEXT_MAX = 2000;

/** Flattens the on-screen question (prompt, picture, passage, options) for the coach route. */
function coachQuestion(q: Question, raw?: string): CoachQuestion {
  let prompt = q.prompt;
  if (q.display?.emoji) prompt += `\nPicture: ${q.display.emoji}`;
  if (q.display?.grid) prompt += `\nGrid:\n${q.display.grid.map((row) => row.join(" | ")).join("\n")}`;
  if (q.display?.svg) prompt += "\n(There is also a drawing the child can see but you cannot.)";
  const options = q.type === "choice" ? q.options.map((o) => o.label ?? o.emoji ?? "(picture)") : undefined;
  const childAnswer = raw === undefined ? undefined : q.type === "choice" ? (options?.[Number(raw)] ?? raw) : raw;
  const passage = q.display?.passage ? `${q.display.passage.title}\n${q.display.passage.text}` : undefined;
  return {
    prompt: prompt.slice(0, COACH_TEXT_MAX),
    options,
    correctAnswer: answerText(q).slice(0, COACH_TEXT_MAX),
    childAnswer: childAnswer?.slice(0, COACH_TEXT_MAX),
    passage: passage?.slice(0, COACH_TEXT_MAX),
    guidance: [q.hint, q.explain].filter((s) => s && s.trim()),
  };
}

function buildRun(props: PlayViewProps): Run | string {
  const { learner, progressRows, sessions, today, nowIso, blockParam, skillParam, modeParam } = props;
  const catalog = catalogFor(learner.slug);
  const progressMap = mergeProgress(catalog, progressRows);
  const now = new Date(nowIso);

  const cached = sessionCache.get(`${learner.id}:${today}`);
  const fromServer = sessionForDate(sessions, today);
  const doneCount = (s: SessionRecord | null | undefined) => s?.blocks.filter((b) => b.done).length ?? -1;
  const session = cached && doneCount(cached) >= doneCount(fromServer) ? cached : fromServer;

  const blocks: SessionBlock[] =
    session && session.blocks.length > 0
      ? session.blocks
      : planMission(catalog, progressMap, learner.settings, now).blocks.map((b) => ({ ...b, done: false }));

  if (skillParam) {
    const skill = catalog.find((s) => s.id === skillParam);
    if (!skill) return `"${skillParam}" is not on ${learner.name}'s skill map.`;
    const progress = progressMap[skill.id];
    const mode = parseMode(modeParam) ?? (progress.status === "mastered" ? "review" : "learn");
    const minutes = learner.settings.blocks[kindForSubject(skill.subject)] || skill.estMinutes;
    return { skill, mode, minutes, blockIndex: null, offerTestOut: false, blocks, session, progress };
  }

  if (blocks.length === 0) return "No mission blocks yet — the skill catalog is still being loaded.";
  const parsed = Number.parseInt(blockParam ?? "0", 10);
  const idx = Math.min(blocks.length - 1, Math.max(0, Number.isFinite(parsed) ? parsed : 0));
  const block = blocks[idx];
  const skill = catalog.find((s) => s.id === block.skillId);
  if (!skill) return `Skill "${block.skillId}" is no longer in the catalog. Head back to Mission Control.`;
  const progress = progressMap[skill.id];
  return {
    skill,
    mode: block.mode,
    minutes: block.minutes,
    blockIndex: idx,
    offerTestOut: !!block.offerTestOut && block.mode === "learn" && progress.status === "ready",
    blocks,
    session,
    progress,
  };
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function PlayView(props: PlayViewProps) {
  const { learner, today, coachEnabled } = props;
  const [run] = useState(() => buildRun(props));

  if (typeof run === "string") {
    return (
      <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
        <div className="mx-auto max-w-lg px-4 pt-10">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
            <p className="text-3xl" aria-hidden>
              🧭
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-700">{run}</p>
            <Link
              href={`/learn/${learner.slug}`}
              className="mt-5 flex min-h-[56px] items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-bold text-white shadow-lg shadow-blue-500/20"
            >
              Back to Mission Control
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <Player run={run} learner={learner} today={today} coachEnabled={coachEnabled} />;
}

function Player({ run, learner, today, coachEnabled }: { run: Run; learner: Learner; today: string; coachEnabled: boolean }) {
  const { skill } = run;
  const seedBase = run.progress.attempts;
  const initialStatus: SkillStatus = run.progress.status;

  const [mode, setMode] = useState<PracticeMode>(run.mode);
  const [phase, setPhase] = useState<Phase>(run.offerTestOut ? "offer" : "question");
  const [progress, setProgress] = useState<SkillProgress>(run.progress);
  const [results, setResults] = useState<boolean[]>([]);
  const [question, setQuestion] = useState<Question>(() => makeQuestion(skill, questionSeed(learner.slug, skill.id, seedBase)));
  const [answered, setAnswered] = useState<{ raw: string; correct: boolean; xp: number } | null>(null);
  const [xpRun, setXpRun] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [saveError, setSaveError] = useState(false);

  const startRef = useRef(0);
  const questionStartRef = useRef(0);
  const failedRef = useRef<Array<() => Promise<unknown>>>([]);

  // AI coach (optional; buttons only render when coachEnabled).
  const coach = useCoach(learner.slug);
  const coachAsk = coach.ask;
  const askHint = useCallback(() => {
    void coachAsk("Coach hint", { action: "hint", skillTitle: skill.kidTitle, question: coachQuestion(question) });
  }, [coachAsk, skill.kidTitle, question]);
  const askExplain = useCallback(() => {
    if (!answered) return;
    void coachAsk("Coach explains", { action: "explain", skillTitle: skill.kidTitle, question: coachQuestion(question, answered.raw) });
  }, [coachAsk, skill.kidTitle, question, answered]);
  const askFeedback = useCallback(
    (text: string) => {
      void coachAsk("Coach feedback", {
        action: "feedback",
        skillTitle: skill.kidTitle,
        childText: text.slice(0, 1500),
        question: coachQuestion(question),
      });
    },
    [coachAsk, skill.kidTitle, question]
  );

  const target = questionTargetFor(mode, run.minutes);
  const limitSeconds = run.minutes * 60;
  const timeUp = elapsed >= limitSeconds;

  // Block timer (soft): ticks once a second while practicing.
  useEffect(() => {
    if (phase === "offer" || phase === "summary") return;
    if (!startRef.current) startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Per-question stopwatch (for learn_attempts.ms).
  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [question]);

  // Optimistic persistence with a retry queue.
  const persist = useCallback((fn: () => Promise<unknown>) => {
    setPendingWrites((n) => n + 1);
    fn()
      .catch(() => {
        failedRef.current.push(fn);
        setSaveError(true);
      })
      .finally(() => setPendingWrites((n) => Math.max(0, n - 1)));
  }, []);

  const retryFailed = useCallback(() => {
    const queue = failedRef.current;
    failedRef.current = [];
    setSaveError(false);
    for (const fn of queue) persist(fn);
  }, [persist]);

  const nextQuestion = useCallback(
    (n: number, previous: Question) => {
      let q = makeQuestion(skill, questionSeed(learner.slug, skill.id, seedBase + n));
      // Avoid showing the exact same item twice in a row.
      for (let salt = 1; salt <= 3 && q.prompt === previous.prompt && q.display?.svg === previous.display?.svg; salt++) {
        q = makeQuestion(skill, hashString(`${learner.slug}:${skill.id}:${seedBase + n}:retry${salt}`));
      }
      return q;
    },
    [skill, learner.slug, seedBase]
  );

  const submit = useCallback(
    (raw: string, correctOverride?: boolean) => {
      if (phase !== "question") return;
      const correct = correctOverride ?? gradeAnswer(question, raw);
      const now = new Date();
      const ms = Date.now() - (questionStartRef.current || Date.now());

      let nextProgress = progress;
      let gained = 0;
      if (mode === "test") {
        gained = xpFor(correct, 0, "test");
      } else {
        nextProgress = applyResult(progress, correct, now, mode);
        gained = xpFor(correct, nextProgress.streak, mode);
        if (progress.status !== "mastered" && nextProgress.status === "mastered") gained += XP.mastery;
      }

      setProgress(nextProgress);
      setResults((r) => [...r, correct]);
      setXpRun((x) => x + gained);
      setAnswered({ raw, correct, xp: gained });
      setPhase("feedback");

      persist(() => logAttempt({ learnerId: learner.id, skillId: skill.id, mode, question, answer: raw, correct, ms }));
      if (mode !== "test") persist(() => saveProgress(learner.id, nextProgress));
    },
    [phase, question, progress, mode, persist, learner.id, skill.id]
  );

  const finish = useCallback(() => {
    const now = new Date();
    let final = progress;
    let bonus = 0;
    if (mode === "test") {
      final = applyTestOut(progress, results, now);
      if (final.status === "mastered") bonus += XP.mastery;
      persist(() => saveProgress(learner.id, final));
    } else if (mode === "review" && initialStatus === "mastered" && final.status === "mastered") {
      bonus += XP.reviewComplete;
    }
    const totalXp = xpRun + bonus;
    const correctCount = results.filter(Boolean).length;
    const minutesSpent = Math.max(1, Math.round(elapsed / 60));

    const blocks = run.blocks.map((b, i) =>
      i === run.blockIndex
        ? { ...b, mode, done: true, correct: correctCount, total: results.length, xp: totalXp, minutes_spent: minutesSpent }
        : b
    );
    const completed = blocks.length > 0 && blocks.every((b) => b.done);
    const session: SessionRecord = {
      learnerId: learner.id,
      date: today,
      minutes: (run.session?.minutes ?? 0) + minutesSpent,
      xp: (run.session?.xp ?? 0) + totalXp,
      blocks,
      completed,
    };
    sessionCache.set(`${learner.id}:${today}`, session);

    if (totalXp > 0) persist(() => addReward(learner.id, totalXp, `${mode}:${skill.id}`));
    persist(() => upsertSession(session));

    const changes: MasteryChange[] = initialStatus !== final.status ? [{ kidTitle: skill.kidTitle, from: initialStatus, to: final.status }] : [];
    setProgress(final);
    setXpRun(totalXp);
    setFinished({
      xp: totalXp,
      correct: correctCount,
      total: results.length,
      changes,
      missionComplete: completed,
      nextBlockIndex: run.blockIndex === null ? -1 : blocks.findIndex((b) => !b.done),
    });
    setPhase("summary");
  }, [progress, mode, results, persist, learner.id, initialStatus, xpRun, elapsed, run, today, skill.id, skill.kidTitle]);

  const handleNext = useCallback(() => {
    const n = results.length;
    if (n >= target || (timeUp && n >= 3)) {
      finish();
      return;
    }
    setAnswered(null);
    setQuestion((prev) => nextQuestion(n, prev));
    setPhase("question");
  }, [results.length, target, timeUp, finish, nextQuestion]);

  const base = `/learn/${learner.slug}`;
  const blockLabel =
    run.blockIndex !== null ? run.blocks[run.blockIndex].label : `${mode === "review" ? "Review" : mode === "test" ? "Test out" : "Practice"} · ${skill.kidTitle}`;
  const emoji = run.blockIndex !== null ? BLOCK_EMOJI[run.blocks[run.blockIndex].kind] : BLOCK_EMOJI[kindForSubject(skill.subject)];
  const remaining = limitSeconds - elapsed;
  const isLast = results.length >= target || (timeUp && results.length >= 3);
  /** 0-based number of the question on screen (stable across question → feedback). */
  const qIndex = phase === "feedback" ? results.length - 1 : results.length;

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-44">
      <div className="mx-auto max-w-lg px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <Link href={base} className="tab-press flex min-h-[44px] items-center gap-1 text-sm font-semibold text-slate-400">
            ← Mission Control
          </Link>
          {phase !== "summary" && phase !== "offer" && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold tabular-nums ${
                timeUp ? "bg-rose-100 text-rose-700" : remaining <= 60 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {timeUp ? "⏰ Time's up" : `⏱ ${formatClock(remaining)}`}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {emoji}
          </span>
          <h1 className="truncate text-lg font-bold tracking-tight text-slate-900">{blockLabel}</h1>
          <span
            className={`ml-auto flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              mode === "test" ? "bg-violet-100 text-violet-700" : mode === "review" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
            }`}
          >
            {mode}
          </span>
        </div>

        {/* Progress dots */}
        {phase !== "offer" && phase !== "summary" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Array.from({ length: target }, (_, i) => {
              const r = results[i];
              const current = i === qIndex;
              const cls =
                r === true
                  ? "bg-emerald-500"
                  : r === false
                    ? "bg-rose-400"
                    : current
                      ? "bg-indigo-600 ring-2 ring-indigo-200"
                      : "bg-slate-200";
              return <span key={i} className={`h-2.5 w-2.5 rounded-full ${cls}`} />;
            })}
          </div>
        )}

        {/* Body */}
        <div className="mt-4">
          {phase === "offer" && (
            <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
              <p className="text-4xl" aria-hidden>
                ⚡
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">Already know this one?</h2>
              <p className="mt-1 text-sm text-slate-500">
                Get 5 in a row right and you skip straight to <strong>Mastered</strong>. Miss one and it just counts as practice.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMode("test");
                  setPhase("question");
                }}
                className="mt-5 flex min-h-[60px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-indigo-500/25 active:scale-[0.98]"
              >
                Test out ⚡
              </button>
              <button
                type="button"
                onClick={() => setPhase("question")}
                className="mt-3 flex min-h-[56px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-base font-bold text-slate-700 active:bg-slate-50"
              >
                Learn it first 📚
              </button>
            </div>
          )}

          {(phase === "question" || phase === "feedback") && (
            <QuestionCard
              key={qIndex}
              question={question}
              answered={answered}
              onSubmit={(raw) => submit(raw)}
              onSelfCheck={(ok) => submit(ok ? "self-check: yes" : "self-check: not yet", ok)}
              index={Math.min(qIndex + 1, target)}
              total={target}
              onCoachHint={coachEnabled && mode === "learn" && phase === "question" ? askHint : undefined}
              onCoachFeedback={coachEnabled && question.type === "text" && question.selfCheck ? askFeedback : undefined}
            />
          )}

          {phase === "summary" && finished && (
            <SummaryCard
              title={
                finished.missionComplete
                  ? "Mission complete!"
                  : mode === "test"
                    ? progress.status === "mastered"
                      ? "Tested out!"
                      : "Good try!"
                    : finished.correct === finished.total
                      ? "Perfect block!"
                      : "Block done!"
              }
              subtitle={`${skill.kidTitle} · ${formatClock(elapsed)}`}
              correct={finished.correct}
              total={finished.total}
              xp={finished.xp}
              masteryChanges={finished.changes}
              confetti={finished.missionComplete || finished.changes.some((c) => c.to === "mastered")}
              primary={
                pendingWrites > 0
                  ? { label: "Saving…", href: "#" }
                  : finished.nextBlockIndex >= 0
                    ? { label: "Next block →", href: `${base}/play?block=${finished.nextBlockIndex}` }
                    : { label: "Back to Mission Control", href: base }
              }
              secondary={finished.nextBlockIndex >= 0 ? { label: "Back to Mission Control", href: base } : { label: "Skill Map", href: `${base}/map` }}
            />
          )}
        </div>
      </div>

      {phase === "feedback" && answered && (
        <FeedbackBanner
          correct={answered.correct}
          explain={question.explain}
          correctAnswer={answerText(question)}
          xp={answered.xp}
          nextLabel={isLast ? "Finish" : "Next"}
          onNext={handleNext}
          onAskCoach={coachEnabled && !answered.correct && !(question.type === "text" && question.selfCheck) ? askExplain : undefined}
        />
      )}

      {saveError && (
        <div className="fixed inset-x-0 top-3 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 shadow-lg">
            Couldn&apos;t save progress.
            <button type="button" onClick={retryFailed} className="rounded-full bg-amber-600 px-3 py-1 text-xs font-bold text-white">
              Retry
            </button>
          </div>
        </div>
      )}

      <CoachSheet state={coach.state} onClose={coach.close} bigText={learner.grade <= 1} />
    </div>
  );
}
