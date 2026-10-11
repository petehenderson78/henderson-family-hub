"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  BlockKind,
  HelpLevel,
  Learner,
  PracticeMode,
  ProgressMap,
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
import { hashString, questionCounterKey, questionSeed } from "@/lib/learn/rng";
import {
  BLOCK_EMOJI,
  MIN_BLOCK_ITEMS,
  PLACEMENT_MAX_FAILS,
  TEST_OUT_ITEMS,
  XP,
  applyResult,
  applyReviewSet,
  applyTestOut,
  canStartBlock,
  countsAsIndependent,
  currencyFor,
  deriveStatuses,
  isGuess,
  isPaused,
  isReviewDue,
  isStuck,
  markNeedsHelp,
  mergeProgress,
  placementPlan,
  planMission,
  questionTargetFor,
  reviewSetPassed,
  sessionStatusFor,
  streakFromSessions,
  xpFor,
} from "@/lib/learn/mastery";
import { answerText, gradeAnswer } from "@/lib/learn/grade";
import { sessionForDate } from "@/lib/learn/stats";
import { addReward, logAttempt, newClientId, saveProgress, upsertSession } from "@/lib/learn/store";
import type { CoachQuestion } from "@/lib/learn/coach-types";
import QuestionCard from "../../components/question-card";
import FeedbackBanner from "../../components/feedback-banner";
import SummaryCard, { type MasteryChange } from "../../components/summary-card";
import IntroCard from "../../components/intro-card";
import CoachSheet from "../../components/coach-sheet";
import { useCoach } from "../../components/use-coach";
import { useMounted } from "../../components/use-mounted";
import { speakNow } from "../../components/speak-button";

interface PlayViewProps {
  learner: Learner;
  progressRows: SkillProgress[];
  sessions: SessionRecord[];
  today: string;
  nowIso: string;
  blockParam?: string;
  skillParam?: string;
  modeParam?: string;
  subjectParam?: string;
  returnParam?: string;
  introParam?: string;
  /** from the server page: Boolean(ANTHROPIC_API_KEY) */
  coachEnabled: boolean;
}

type RunKind = "block" | "skill" | "placement";

interface Run {
  kind: RunKind;
  /** one skill, or several for the Friday mix-up (items rotate through them) */
  skills: Skill[];
  mode: PracticeMode;
  minutes: number;
  /** fixed item count (review set 4, mix-up 6) */
  items?: number;
  /** index into `blocks` when running the mission, null for a free skill run / placement */
  blockIndex: number | null;
  offerTestOut: boolean;
  /** today's planned mission (stored or freshly planned) */
  blocks: SessionBlock[];
  session: SessionRecord | null;
  progressMap: ProgressMap;
  catalog: Skill[];
  /** placement sprint queue (catalog order) */
  placement: Skill[];
  subject?: Subject;
}

type Phase = "paused" | "blocked" | "offer" | "intro" | "question" | "feedback" | "stuck" | "summary";

interface Item {
  skill: Skill;
  question: Question;
  seed: number;
  n: number;
}

interface Answered {
  raw: string;
  correct: boolean;
  helpLevel: HelpLevel;
  hintUsed: boolean;
  ms: number;
  xp: number;
  /** the independent (first) answer on this item was wrong */
  firstTryWrong: boolean;
  /** streak after this answer (for the XP preview) */
  streakPreview: number;
}

interface ItemResult {
  skillId: string;
  correct: boolean;
  /** entered the mastery window as true */
  independent: boolean;
  helpLevel: HelpLevel;
  firstMiss: boolean;
  guess: boolean;
  xp: number;
  prompt: string;
}

interface Finished {
  xp: number;
  correct: number;
  total: number;
  changes: MasteryChange[];
  missionComplete: boolean;
  nextBlockIndex: number;
  streak: number;
  note?: string;
  testedOut?: boolean;
  reviewPassed?: boolean;
}

/** Session records written this page-load, so the next block never starts from stale server props. */
const sessionCache = new Map<string, SessionRecord>();

const SUBJECTS: Subject[] = ["math", "reading", "phonics", "reasoning", "writing"];

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
  if (q.type === "tiles") prompt += `\nTiles: ${q.tiles.join(" ")}`;
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

/** Text spoken for a prompt: never the answer (generators keep display.speak answer-free; the selfcheck asserts it). */
function promptSpeech(q: Question): string {
  return q.display?.speak ?? q.prompt;
}

function buildRun(props: PlayViewProps): Run | string {
  const { learner, progressRows, sessions, today, nowIso, blockParam, skillParam, modeParam, subjectParam } = props;
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
      : planMission(catalog, progressMap, learner.settings, now, today).blocks.map((b) => ({ ...b, done: false }));

  if (modeParam === "placement") {
    const subject = SUBJECTS.includes(subjectParam as Subject) ? (subjectParam as Subject) : "math";
    const placement = placementPlan(catalog, subject, progressMap);
    if (placement.length === 0) return `Nothing to place in ${subject} right now — every skill is mastered or has no test-out.`;
    return {
      kind: "placement",
      skills: [placement[0]],
      mode: "test",
      minutes: 15,
      blockIndex: null,
      offerTestOut: false,
      blocks,
      session,
      progressMap,
      catalog,
      placement,
      subject,
    };
  }

  if (skillParam) {
    const skill = catalog.find((s) => s.id === skillParam);
    if (!skill) return `"${skillParam}" is not on ${learner.name}'s skill map.`;
    const progress = progressMap[skill.id];
    const mode = parseMode(modeParam) ?? (progress.status === "mastered" ? "review" : "learn");
    const minutes = learner.settings.blocks[kindForSubject(skill.subject)] || skill.estMinutes;
    return { kind: "skill", skills: [skill], mode, minutes, blockIndex: null, offerTestOut: false, blocks, session, progressMap, catalog, placement: [] };
  }

  if (blocks.length === 0) return "No mission blocks yet — the skill catalog is still being loaded.";
  const parsed = Number.parseInt(blockParam ?? "0", 10);
  const idx = Math.min(blocks.length - 1, Math.max(0, Number.isFinite(parsed) ? parsed : 0));
  const block = blocks[idx];
  const ids = block.skillIds && block.skillIds.length > 0 ? block.skillIds : [block.skillId];
  const skills = ids.map((id) => catalog.find((s) => s.id === id)).filter((s): s is Skill => !!s);
  if (skills.length === 0) return `Skill "${block.skillId}" is no longer in the catalog. Head back to Mission Control.`;
  const progress = progressMap[skills[0].id];
  return {
    kind: "block",
    skills,
    mode: block.mode,
    minutes: block.minutes,
    items: block.items,
    blockIndex: idx,
    offerTestOut: !!block.offerTestOut && block.mode === "learn" && progress.status === "ready" && skills.length === 1,
    blocks,
    session,
    progressMap,
    catalog,
    placement: [],
  };
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// --- per-play seed counter: sessionStorage (survives a reload mid-block) with an
// in-memory cache for private mode. Never derived from DB row counts.
const memoryCounters = new Map<string, number>();

function readCounter(key: string): number {
  try {
    const v = window.sessionStorage.getItem(key);
    const n = v ? Number(v) : 0;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function writeCounter(key: string, n: number): void {
  try {
    window.sessionStorage.setItem(key, String(n));
  } catch {
    // private mode / quota — the in-memory counter still advances
  }
}

/** Current counter value for (slug, skill, date), then advance it. */
function takeCounter(slug: string, skillId: string, today: string): number {
  const key = questionCounterKey(slug, skillId, today);
  const n = memoryCounters.get(key) ?? readCounter(key);
  memoryCounters.set(key, n + 1);
  writeCounter(key, n + 1);
  return n;
}

/** Build the next item: seed = hash(slug | skill | mode | date | n); the stored seed is the one actually used. */
function makeItemFor(slug: string, today: string, skill: Skill, m: PracticeMode, previous: Question | null): Item {
  const n = takeCounter(slug, skill.id, today);
  let seed = questionSeed(slug, skill.id, m, today, n);
  let q = makeQuestion(skill, seed);
  // Avoid showing the exact same item twice in a row.
  for (let salt = 1; salt <= 3 && previous && q.prompt === previous.prompt && q.display?.svg === previous.display?.svg; salt++) {
    seed = hashString(`${seed}:retry${salt}`);
    q = makeQuestion(skill, seed);
  }
  return { skill, question: q, seed, n };
}

function MessageCard({ emoji, title, body, href, label }: { emoji: string; title: string; body?: string; href: string; label: string }) {
  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
      <div className="mx-auto max-w-lg px-4 pt-10">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
          <p className="text-4xl" aria-hidden>
            {emoji}
          </p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">{title}</h2>
          {body && <p className="mt-2 text-sm font-medium text-slate-500">{body}</p>}
          <Link
            href={href}
            className="mt-5 flex min-h-[56px] items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-bold text-white shadow-lg shadow-blue-500/20"
          >
            {label}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PlayView(props: PlayViewProps) {
  const { learner, today, coachEnabled, returnParam, introParam } = props;
  const mounted = useMounted();
  const [run] = useState(() => buildRun(props));
  const backHref = returnParam === "tonight" ? "/learn/tonight" : `/learn/${learner.slug}`;
  const backLabel = returnParam === "tonight" ? "Back to Tonight" : "Back to Mission Control";

  if (typeof run === "string") {
    return <MessageCard emoji="🧭" title={run} href={backHref} label={backLabel} />;
  }

  // The player reads sessionStorage (per-play seed counter) and the clock, so it mounts client-side only.
  if (!mounted) {
    return (
      <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
        <div className="mx-auto max-w-lg px-4 pt-10">
          <div className="animate-pulse rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
            <p className="text-3xl" aria-hidden>
              {BLOCK_EMOJI[kindForSubject(run.skills[0].subject)]}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-400">Getting ready…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Player
      run={run}
      learner={learner}
      sessions={props.sessions}
      today={today}
      coachEnabled={coachEnabled}
      backHref={backHref}
      backLabel={backLabel}
      returnParam={returnParam}
      forceIntro={introParam === "1"}
    />
  );
}

interface PlayerProps {
  run: Run;
  learner: Learner;
  sessions: SessionRecord[];
  today: string;
  coachEnabled: boolean;
  backHref: string;
  backLabel: string;
  returnParam?: string;
  forceIntro: boolean;
}

function Player({ run, learner, sessions, today, coachEnabled, backHref, backLabel, returnParam, forceIntro }: PlayerProps) {
  const settings = learner.settings;
  const autoSpeak = settings.autoSpeak;
  const early = learner.grade <= 2;
  const isPlacement = run.kind === "placement";
  const isMixup = run.skills.length > 1;
  const primarySkill = run.skills[0];
  const [initialStatuses] = useState<Record<string, SkillStatus>>(() =>
    Object.fromEntries([...run.skills, ...run.placement].map((s) => [s.id, run.progressMap[s.id]?.status ?? "ready"]))
  );
  const [startedAt] = useState(() => new Date());

  const makeItem = useCallback(
    (skill: Skill, m: PracticeMode, previous: Question | null): Item => makeItemFor(learner.slug, today, skill, m, previous),
    [learner.slug, today]
  );

  // --- initial phase ---------------------------------------------------------
  const introLines = primarySkill.intro ?? [];
  const introApplies =
    !isPlacement && !isMixup && run.mode === "learn" && introLines.length > 0 && (forceIntro || (run.progressMap[primarySkill.id]?.attempts ?? 0) === 0);
  const initialPhase: Phase = isPaused(settings, today)
    ? "paused"
    : !canStartBlock(startedAt, settings.stopBy, run.minutes)
      ? "blocked"
      : run.offerTestOut
        ? "offer"
        : introApplies
          ? "intro"
          : "question";

  const [mode, setMode] = useState<PracticeMode>(run.mode);
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [progressMap, setProgressMap] = useState<ProgressMap>(run.progressMap);
  const [results, setResults] = useState<ItemResult[]>([]);
  const [item, setItem] = useState<Item | null>(() => (initialPhase === "question" ? makeItemFor(learner.slug, today, primarySkill, run.mode, null) : null));
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [xpRun, setXpRun] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [saveError, setSaveError] = useState(false);
  // placement sprint
  const [sprintIndex, setSprintIndex] = useState(0);
  const [sprintFails, setSprintFails] = useState(0);
  const [sprintLog, setSprintLog] = useState<{ skill: Skill; passed: boolean; correct: number }[]>([]);

  const startRef = useRef(0);
  const questionStartRef = useRef(0);
  const failedRef = useRef<Array<() => Promise<unknown>>>([]);

  const currentSkill = item?.skill ?? (isPlacement ? run.placement[sprintIndex] : primarySkill);

  // AI coach (optional; buttons only render when coachEnabled).
  const coach = useCoach(learner.slug);
  const coachAsk = coach.ask;
  const askHint = useCallback(() => {
    if (!item) return;
    void coachAsk("Coach hint", { action: "hint", skillTitle: item.skill.kidTitle, question: coachQuestion(item.question) });
  }, [coachAsk, item]);
  const askExplain = useCallback(() => {
    if (!answered || !item) return;
    void coachAsk("Coach explains", { action: "explain", skillTitle: item.skill.kidTitle, question: coachQuestion(item.question, answered.raw) });
  }, [coachAsk, item, answered]);
  const askFeedback = useCallback(
    (text: string) => {
      if (!item) return;
      void coachAsk("Coach feedback", {
        action: "feedback",
        skillTitle: item.skill.kidTitle,
        childText: text.slice(0, 1500),
        question: coachQuestion(item.question),
      });
    },
    [coachAsk, item]
  );

  const target = isPlacement ? TEST_OUT_ITEMS : questionTargetFor(mode, run.minutes, run.items);
  const limitSeconds = run.minutes * 60;
  const timeUp = !isPlacement && elapsed >= limitSeconds;

  // Block timer (soft): ticks once a second while practicing.
  useEffect(() => {
    if (phase !== "question" && phase !== "feedback") return;
    if (!startRef.current) startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Per-question stopwatch (for learn_attempts.ms); the retry keeps the original start.
  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [item]);

  // The first prompt of a block arrives by navigation (no tap on this page): try to speak it once.
  // Later prompts are spoken inside the advancing tap (iOS needs the gesture).
  const spokenFirstRef = useRef(false);
  useEffect(() => {
    if (spokenFirstRef.current || !autoSpeak || !item || phase !== "question") return;
    spokenFirstRef.current = true;
    speakNow(promptSpeech(item.question));
  }, [autoSpeak, item, phase]);

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

  /** Start (or restart) the item stream in mode `m`, speaking the first prompt inside the caller's tap. */
  const beginItems = useCallback(
    (m: PracticeMode, skill: Skill) => {
      const first = makeItem(skill, m, null);
      if (autoSpeak) speakNow(promptSpeech(first.question));
      setMode(m);
      setItem(first);
      setAnswered(null);
      setRetrying(false);
      setHintUsed(false);
      setPhase("question");
    },
    [makeItem, autoSpeak]
  );

  const submit = useCallback(
    (raw: string, correctOverride?: boolean) => {
      if (phase !== "question" || !item) return;
      const q = item.question;
      const correct = correctOverride ?? gradeAnswer(q, raw);
      const ms = Date.now() - (questionStartRef.current || Date.now());
      const selfChecked = q.type === "text" && !!q.selfCheck;

      // Learn mode: a miss earns a hint and ONE retry (help_level "hint" if it then lands).
      if (!correct && mode === "learn" && !retrying && !selfChecked && !isMixup) {
        if (autoSpeak) speakNow(`Not yet. Here's a hint. ${q.hint}`);
        setRetrying(true);
        setHintUsed(true);
        return;
      }

      const helpLevel: HelpLevel = correct && hintUsed ? "hint" : "independent";
      const progress = progressMap[item.skill.id];
      const preview = mode === "test" ? progress : applyResult(progress, { correct, helpLevel, ms, questionType: q.type }, new Date(), mode);
      const xp = xpFor(correct, preview.streak, mode, helpLevel);
      if (autoSpeak) speakNow(correct ? (helpLevel === "independent" ? "Yes! " : "You got it, with a hint. ") + q.explain : `Not yet. Here's the idea. ${q.explain}`);
      setAnswered({ raw, correct, helpLevel, hintUsed, ms, xp, firstTryWrong: retrying, streakPreview: preview.streak });
      setPhase("feedback");
    },
    [phase, item, mode, retrying, hintUsed, progressMap, autoSpeak, isMixup]
  );

  const markTaught = useCallback(() => {
    setAnswered((a) => (a ? { ...a, helpLevel: "taught", xp: xpFor(a.correct, a.streakPreview, mode, "taught") } : a));
  }, [mode]);

  /** Write the day's session row (mission runs only) and return it. */
  const writeSession = useCallback(
    (blockPatch: Partial<SessionBlock>, minutesSpent: number, xp: number): SessionRecord | null => {
      if (run.blockIndex === null) return null;
      const blocks = run.blocks.map((b, i) => (i === run.blockIndex ? { ...b, ...blockPatch } : b));
      const status = sessionStatusFor(blocks);
      const session: SessionRecord = {
        learnerId: learner.id,
        date: today,
        minutes: (run.session?.minutes ?? 0) + minutesSpent,
        xp: (run.session?.xp ?? 0) + xp,
        blocks,
        completed: status === "done",
        status,
        skipReason: null,
      };
      sessionCache.set(`${learner.id}:${today}`, session);
      persist(() => upsertSession(session));
      return session;
    },
    [run, learner.id, today, persist]
  );

  const streakAfter = useCallback(
    (session: SessionRecord | null) => {
      const others = sessions.filter((s) => s.date !== today);
      return streakFromSessions(session ? [...others, session] : sessions, today, settings);
    },
    [sessions, today, settings]
  );

  const changesFor = useCallback(
    (map: ProgressMap, skills: Skill[]): MasteryChange[] =>
      skills
        .filter((s) => initialStatuses[s.id] !== map[s.id]?.status)
        .map((s) => ({ kidTitle: s.kidTitle, from: initialStatuses[s.id] ?? "ready", to: map[s.id].status })),
    [initialStatuses]
  );

  /** End a block or free run (not placement). */
  const finish = useCallback(
    (allResults: ItemResult[], map: ProgressMap, xpSoFar: number, stuck: boolean) => {
      const now = new Date();
      let bonus = 0;
      let nextMap = map;
      let testedOut = false;
      let reviewPassed: boolean | undefined;

      if (!isMixup) {
        const skill = primarySkill;
        const prev = map[skill.id];
        if (mode === "test") {
          const final = applyTestOut(prev, allResults.map((r) => r.correct), now);
          testedOut = final.status === "mastered";
          if (testedOut) bonus += XP.mastery;
          nextMap = { ...map, [skill.id]: final };
          persist(() => saveProgress(learner.id, final));
        } else if (mode === "review" && prev.status === "mastered") {
          const wasDue = isReviewDue(run.progressMap[skill.id], startedAt);
          const final = applyReviewSet(prev, allResults.map((r) => r.independent), now, wasDue);
          reviewPassed = reviewSetPassed(allResults.map((r) => r.independent));
          if (reviewPassed) bonus += XP.reviewComplete;
          nextMap = { ...map, [skill.id]: final };
          persist(() => saveProgress(learner.id, final));
        }
        if (stuck) {
          bonus += XP.effort;
          const last = allResults[allResults.length - 1];
          const flagged = markNeedsHelp(nextMap[skill.id], last?.prompt ?? skill.title);
          nextMap = { ...nextMap, [skill.id]: flagged };
          persist(() => saveProgress(learner.id, flagged));
        }
      } else {
        const independent = allResults.filter((r) => r.independent).length;
        if (allResults.length > 0 && independent >= Math.ceil(allResults.length / 2)) bonus += XP.reviewComplete;
      }

      const totalXp = xpSoFar + bonus;
      const correctCount = allResults.filter((r) => r.correct).length;
      const minutesSpent = Math.max(1, Math.round(elapsed / 60));
      const session = writeSession(
        { mode, done: true, correct: correctCount, total: allResults.length, xp: totalXp, minutes_spent: minutesSpent, stuck: stuck || undefined },
        minutesSpent,
        totalXp
      );
      if (totalXp > 0) {
        const clientId = newClientId();
        persist(() => addReward(learner.id, totalXp, `${mode}:${primarySkill.id}`, clientId));
      }

      const blocks = session?.blocks ?? run.blocks;
      setProgressMap(nextMap);
      setXpRun(totalXp);
      setFinished({
        xp: totalXp,
        correct: correctCount,
        total: allResults.length,
        changes: changesFor(nextMap, run.skills),
        missionComplete: !!session?.completed,
        nextBlockIndex: run.blockIndex === null ? -1 : blocks.findIndex((b) => !b.done),
        streak: streakAfter(session),
        testedOut,
        reviewPassed,
      });
      setPhase(stuck ? "stuck" : "summary");
    },
    [isMixup, primarySkill, mode, persist, learner.id, run, elapsed, writeSession, changesFor, streakAfter, startedAt]
  );

  /** Placement sprint: fold one finished test-out, then continue or stop. */
  const finishSprintSkill = useCallback(
    (skillResults: ItemResult[], map: ProgressMap, xpSoFar: number) => {
      const now = new Date();
      const skill = run.placement[sprintIndex];
      const wasLocked = map[skill.id]?.status === "locked";
      const folded = applyTestOut(map[skill.id], skillResults.map((r) => r.correct), now);
      const passed = folded.status === "mastered";
      // A still-locked skill that fails keeps its window but stays locked (its prereq is not mastered).
      const final: SkillProgress = !passed && wasLocked ? { ...folded, status: "locked" } : folded;
      const correct = skillResults.filter((r) => r.correct).length;
      // Re-derive ready/locked so a pass unlocks the next skill in the queue.
      const nextMap = deriveStatuses(run.catalog, { ...map, [skill.id]: final });
      const gained = skillResults.reduce((s, r) => s + r.xp, 0) + (passed ? XP.mastery : 0);
      persist(() => saveProgress(learner.id, final));
      if (gained > 0) {
        const clientId = newClientId();
        persist(() => addReward(learner.id, gained, `placement:${skill.id}`, clientId));
      }
      const fails = passed ? 0 : sprintFails + 1;
      const log = [...sprintLog, { skill, passed, correct }];
      const nextIndex = sprintIndex + 1;
      const totalXp = xpSoFar + (passed ? XP.mastery : 0);
      setProgressMap(nextMap);
      setSprintLog(log);
      setSprintFails(fails);
      setXpRun(totalXp);

      if (fails >= PLACEMENT_MAX_FAILS || nextIndex >= run.placement.length) {
        const mastered = log.filter((l) => l.passed).map((l) => l.skill.kidTitle);
        setFinished({
          xp: totalXp,
          correct: log.reduce((s, l) => s + l.correct, 0),
          total: log.length * TEST_OUT_ITEMS,
          changes: changesFor(nextMap, log.map((l) => l.skill)),
          missionComplete: false,
          nextBlockIndex: -1,
          streak: streakAfter(null),
          note:
            mastered.length > 0
              ? `Placed past ${mastered.length} skill${mastered.length === 1 ? "" : "s"}: ${mastered.join(", ")}.`
              : "Nothing tested out this time — the next skills will be learned step by step.",
        });
        setResults([]);
        setPhase("summary");
        return;
      }
      setSprintIndex(nextIndex);
      setResults([]);
      const first = makeItem(run.placement[nextIndex], "test", null);
      if (autoSpeak) speakNow(promptSpeech(first.question));
      setItem(first);
      setAnswered(null);
      setRetrying(false);
      setHintUsed(false);
      setPhase("question");
    },
    [run.placement, run.catalog, sprintIndex, sprintFails, sprintLog, persist, learner.id, changesFor, streakAfter, makeItem, autoSpeak]
  );

  /** The tap that advances: commits the item, logs it, and speaks the next prompt inside the same gesture. */
  const handleNext = useCallback(() => {
    if (phase !== "feedback" || !answered || !item) return;
    const now = new Date();
    const q = item.question;
    const skill = item.skill;
    const input = { correct: answered.correct, helpLevel: answered.helpLevel, ms: answered.ms, questionType: q.type };
    const prev = progressMap[skill.id];
    const next = mode === "test" ? prev : applyResult(prev, input, now, mode);
    let gained = answered.xp;
    if (mode !== "test" && prev.status !== "mastered" && next.status === "mastered") gained += XP.mastery;
    const nextMap = mode === "test" ? progressMap : { ...progressMap, [skill.id]: next };

    const clientId = newClientId();
    const attempt = {
      learnerId: learner.id,
      skillId: skill.id,
      mode,
      question: q,
      answer: answered.raw,
      correct: answered.correct,
      ms: answered.ms,
      seed: item.seed,
      hintUsed: answered.hintUsed,
      helpLevel: answered.helpLevel,
      clientId,
    };
    persist(() => logAttempt(attempt));
    if (mode !== "test") persist(() => saveProgress(learner.id, next));

    const result: ItemResult = {
      skillId: skill.id,
      correct: answered.correct,
      independent: countsAsIndependent(input),
      helpLevel: answered.helpLevel,
      firstMiss: answered.firstTryWrong || !answered.correct,
      guess: isGuess(input),
      xp: gained,
      prompt: q.prompt,
    };
    const allResults = [...results, result];
    const xpSoFar = xpRun + gained;
    setProgressMap(nextMap);
    setResults(allResults);
    setXpRun(xpSoFar);

    if (isPlacement) {
      if (allResults.length >= TEST_OUT_ITEMS) {
        finishSprintSkill(allResults, nextMap, xpSoFar);
        return;
      }
    } else {
      const stuck = mode === "learn" && !isMixup && isStuck(allResults.map((r) => r.firstMiss));
      if (stuck) {
        finish(allResults, nextMap, xpSoFar, true);
        return;
      }
      const n = allResults.length;
      if (n >= target || (timeUp && n >= MIN_BLOCK_ITEMS)) {
        finish(allResults, nextMap, xpSoFar, false);
        return;
      }
    }

    const nextSkill = isPlacement ? skill : run.skills[allResults.length % run.skills.length];
    const nextItem = makeItem(nextSkill, mode, q);
    if (autoSpeak) speakNow(promptSpeech(nextItem.question));
    setItem(nextItem);
    setAnswered(null);
    setRetrying(false);
    setHintUsed(false);
    setPhase("question");
  }, [
    phase,
    answered,
    item,
    progressMap,
    mode,
    learner.id,
    persist,
    results,
    xpRun,
    isPlacement,
    isMixup,
    target,
    timeUp,
    finish,
    finishSprintSkill,
    run.skills,
    makeItem,
    autoSpeak,
  ]);

  // --- render ----------------------------------------------------------------
  const base = `/learn/${learner.slug}`;
  const returnQ = returnParam ? `&return=${encodeURIComponent(returnParam)}` : "";

  if (phase === "paused") {
    return (
      <MessageCard
        emoji="🏖️"
        title="Vacation mode"
        body={`Missions are paused${settings.pausedUntil ? ` until ${settings.pausedUntil}` : ""}. Your streak is safe — see you when you're back!`}
        href={backHref}
        label={backLabel}
      />
    );
  }
  if (phase === "blocked") {
    return (
      <MessageCard
        emoji="🌙"
        title="Lights out soon — tomorrow is a fresh start"
        body={`This ${run.minutes}-minute block can't finish before ${settings.stopBy}. Nothing carries over.`}
        href={backHref}
        label={backLabel}
      />
    );
  }

  const blockLabel = isPlacement
    ? `Placement · ${currentSkill.kidTitle}`
    : run.blockIndex !== null
      ? run.blocks[run.blockIndex].label
      : `${mode === "review" ? "Review" : mode === "test" ? "Test out" : "Practice"} · ${currentSkill.kidTitle}`;
  const emoji = run.blockIndex !== null ? BLOCK_EMOJI[run.blocks[run.blockIndex].kind] : BLOCK_EMOJI[kindForSubject(currentSkill.subject)];
  const remaining = limitSeconds - elapsed;
  const isLast = !isPlacement && (results.length + 1 >= target || (timeUp && results.length + 1 >= MIN_BLOCK_ITEMS));
  const sprintLast = isPlacement && results.length + 1 >= TEST_OUT_ITEMS;
  const sprintEnds = sprintLast && (sprintIndex + 1 >= run.placement.length || (answered && !answered.correct && sprintFails + 1 >= PLACEMENT_MAX_FAILS));
  /** 0-based number of the question on screen (results only grow on Next, so this is stable across question → feedback). */
  const qIndex = results.length;
  const inPlay = phase === "question" || phase === "feedback";
  const showIntroCard = (phase === "intro" || (showIntro && phase === "question")) && introLines.length > 0;
  const currency = { amount: currencyFor(finished?.xp ?? 0, settings.rewardRate), name: settings.theme.currency };

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-44">
      <div className="mx-auto max-w-lg px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <Link href={backHref} className="tab-press flex min-h-[44px] items-center gap-1 text-sm font-semibold text-slate-400">
            ← {returnParam === "tonight" ? "Tonight" : "Mission Control"}
          </Link>
          {inPlay && !early && !isPlacement && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold tabular-nums ${
                timeUp ? "bg-rose-100 text-rose-700" : remaining <= 60 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {timeUp ? "⏰ Time's up" : `⏱ ${formatClock(remaining)}`}
            </span>
          )}
          {inPlay && isPlacement && (
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
              Skill {sprintIndex + 1} of up to {run.placement.length}
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
            {isPlacement ? "placement" : mode}
          </span>
        </div>

        {/* Item dots (Lily's only progress signal; Cole also sees the countdown) */}
        {inPlay && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${results.length} of ${target} done`}>
            {Array.from({ length: target }, (_, i) => {
              const r = results[i];
              const current = i === qIndex;
              const cls =
                r !== undefined
                  ? r.correct
                    ? "bg-emerald-500"
                    : "bg-amber-400"
                  : current
                    ? "bg-indigo-600 ring-2 ring-indigo-200 animate-dot-pulse"
                    : "bg-slate-200";
              return <span key={i} className={`h-3 w-3 rounded-full ${cls}`} />;
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
                onClick={() => beginItems("test", primarySkill)}
                className="mt-5 flex min-h-[60px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-indigo-500/25 active:scale-[0.98]"
              >
                Test out ⚡
              </button>
              <button
                type="button"
                onClick={() => {
                  if (introApplies) {
                    if (autoSpeak && introLines[0]) speakNow(introLines[0]);
                    setPhase("intro");
                  } else beginItems("learn", primarySkill);
                }}
                className="mt-3 flex min-h-[56px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-base font-bold text-slate-700 active:bg-slate-50"
              >
                Learn it first 📚
              </button>
            </div>
          )}

          {showIntroCard && (
            <IntroCard
              kidTitle={primarySkill.kidTitle}
              lines={introLines}
              autoSpeak={autoSpeak}
              reopened={phase !== "intro"}
              onDone={() => {
                if (phase === "intro") beginItems("learn", primarySkill);
                else {
                  if (autoSpeak && item) speakNow(promptSpeech(item.question));
                  setShowIntro(false);
                }
              }}
            />
          )}

          {inPlay && item && !showIntroCard && (
            <QuestionCard
              key={`${isPlacement ? sprintIndex : 0}-${qIndex}-${retrying ? "retry" : "first"}`}
              question={item.question}
              answered={answered}
              onSubmit={(raw) => submit(raw)}
              onSelfCheck={(ok) => submit(ok ? "self-check: yes" : "self-check: not yet", ok)}
              index={Math.min(qIndex + 1, target)}
              total={target}
              hideCounter={early}
              bigText={early}
              allowHint={mode === "learn" && !isMixup}
              hintVisible={retrying}
              retrying={retrying}
              onHint={() => setHintUsed(true)}
              onShowIntro={introLines.length > 0 && mode === "learn" && !isMixup ? () => setShowIntro(true) : undefined}
              onCoachHint={coachEnabled && mode === "learn" && phase === "question" ? askHint : undefined}
              onCoachFeedback={coachEnabled && item.question.type === "text" && item.question.selfCheck ? askFeedback : undefined}
            />
          )}

          {phase === "stuck" && finished && (
            <div className="rounded-2xl border border-amber-100 bg-white p-6 text-center shadow-sm">
              <p className="text-4xl" aria-hidden>
                🫶
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">Let&apos;s take a break from this one</h2>
              <p className="mt-2 text-[15px] font-medium text-slate-600">
                You still earned XP for trying. {learner.name === "Lily" ? "A grown-up" : "Mom or Dad"} will do this one with you next time — that&apos;s how
                brains grow.
              </p>
              <button
                type="button"
                onClick={() => setPhase("summary")}
                className="mt-5 flex min-h-[60px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-blue-500/25"
              >
                OK →
              </button>
            </div>
          )}

          {phase === "summary" && finished && (
            <SummaryCard
              title={
                isPlacement
                  ? "Placement done!"
                  : finished.missionComplete
                    ? "Mission complete!"
                    : mode === "test"
                      ? finished.testedOut
                        ? "Tested out!"
                        : "Good try!"
                      : finished.correct === finished.total && finished.total > 0
                        ? "Perfect block!"
                        : "Block done!"
              }
              subtitle={isPlacement ? `${run.subject ?? "math"} · ${sprintLog.length} test-out${sprintLog.length === 1 ? "" : "s"}` : `${primarySkill.kidTitle} · ${formatClock(elapsed)}`}
              note={finished.note}
              correct={finished.correct}
              total={finished.total}
              xp={finished.xp}
              currency={currency}
              streak={
                run.blockIndex !== null
                  ? { days: finished.streak, label: finished.missionComplete ? "streak safe for today" : "finish the mission to keep it going" }
                  : undefined
              }
              masteryChanges={finished.changes}
              confetti={finished.missionComplete || finished.changes.some((c) => c.to === "mastered")}
              primary={
                pendingWrites > 0
                  ? { label: "Saving…", href: "#" }
                  : finished.nextBlockIndex >= 0
                    ? { label: "Next block →", href: `${base}/play?block=${finished.nextBlockIndex}${returnQ}` }
                    : { label: backLabel, href: backHref }
              }
              secondary={finished.nextBlockIndex >= 0 ? { label: backLabel, href: backHref } : { label: "Skill Map", href: `${base}/map` }}
            />
          )}
        </div>
      </div>

      {phase === "feedback" && answered && item && (
        <FeedbackBanner
          correct={answered.correct}
          helpLevel={answered.helpLevel}
          explain={item.question.explain}
          correctAnswer={item.question.type === "text" && item.question.selfCheck ? undefined : answerText(item.question)}
          xp={answered.xp}
          nextLabel={isPlacement ? (sprintEnds ? "Finish" : sprintLast ? "Next skill" : "Next") : isLast ? "Finish" : "Next"}
          onNext={handleNext}
          onTaught={markTaught}
          onAskCoach={coachEnabled && !answered.correct && !(item.question.type === "text" && item.question.selfCheck) ? askExplain : undefined}
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
