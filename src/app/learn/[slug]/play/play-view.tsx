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
  RewardRecord,
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
  applyResult,
  applyReviewSet,
  applySkipCheck,
  applyTestOut,
  blockXp,
  canStartBlock,
  countsAsIndependent,
  deriveStatuses,
  isGuess,
  isMixupBlock,
  isPaused,
  isReviewDueOn,
  isStuck,
  markNeedsHelp,
  mergeProgress,
  needsSkipCheckFollowUp,
  placementPlan,
  placementProbeResult,
  questionTargetFor,
  replayFactor,
  sessionStatusFor,
  shouldFilterGuess,
  skipCheckBand,
  xpFor,
  type SkipCheckBand,
} from "@/lib/learn/mastery";
import { answerText, gradeAnswer } from "@/lib/learn/grade";
import {
  POINTS,
  computeStreakInfo,
  formatClockLabel,
  isWeekend,
  pointReason,
  pointsAllowed,
  ponyNameChoices,
  ponyNames,
  resolveBlockIndex,
  sessionForDate,
  setsDoneToday,
  startedOnTime,
  todaysBlocks,
  vacationReturnLabel,
  xpReason,
  type PointKind,
} from "@/lib/learn/stats";
import { newClientId } from "@/lib/learn/store";
import type { LearnNote } from "@/lib/learn/store-notes";
import { pendingOverlay } from "@/lib/learn/write-queue";
import type { CoachQuestion } from "@/lib/learn/coach-types";
import QuestionCard from "../../components/question-card";
import FeedbackBanner from "../../components/feedback-banner";
import SummaryCard, { type MasteryChange } from "../../components/summary-card";
import IntroCard from "../../components/intro-card";
import CoachSheet from "../../components/coach-sheet";
import { useCoach } from "../../components/use-coach";
import { useMounted } from "../../components/use-mounted";
import { DROPPED_MESSAGE, useWriteQueue } from "../../components/use-write-queue";
import { speakNow } from "../../components/speak-button";

interface PlayViewProps {
  learner: Learner;
  progressRows: SkillProgress[];
  sessions: SessionRecord[];
  /** the streak's history (server loadStreakSessionsServer: date / status / completed) */
  streakSessions: SessionRecord[];
  /** that read's lower date bound for computeStreakInfo (null = the whole history) */
  streakFrom: string | null;
  /** learn_notes of the last days (Lily's homework rule; pony names) */
  notes: LearnNote[];
  /** this week's ledger rows (points caps, replay decay) */
  weekRewards: RewardRecord[];
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
  /** fixed item count (review set 4, mix-up 8 / 12) */
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

interface RunMessage {
  message: string;
  emoji: string;
  body?: string;
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
  /** XP shown on the banner (after replay decay) */
  xp: number;
  /** the independent (first) answer on this item was wrong */
  firstTryWrong: boolean;
  /** set while "A grown-up helped" is on: the help level and XP to restore when it is tapped off */
  beforeTaught?: { helpLevel: HelpLevel; xp: number };
}

interface ItemResult {
  skillId: string;
  correct: boolean;
  /** entered the mastery window as true */
  independent: boolean;
  helpLevel: HelpLevel;
  /**
   * TRUE = the first (independent) answer on this item was right. This is the
   * polarity isStuck() expects: it fires after three FALSE in a row.
   */
  firstTryCorrect: boolean;
  /** item XP before replay decay (1 / 0.5 / 0) */
  xp: number;
  prompt: string;
}

interface Finished {
  xp: number;
  points: number;
  correct: number;
  total: number;
  changes: MasteryChange[];
  /** skills that became mastered in this run (Lily names a pony for each) */
  newlyMastered: Skill[];
  missionComplete: boolean;
  nextBlockIndex: number;
  streak: number;
  note?: string;
  testedOut?: boolean;
  band?: SkipCheckBand;
}

/** Session records written this page-load, so the next block never starts from stale server props. */
const sessionCache = new Map<string, SessionRecord>();
/** Sets finished this page-load per learner:date:skill (replay decay before the ledger catches up). */
const localSets = new Map<string, number>();
/** Point rows written this page-load (so the caps hold before the server props refresh). */
const localPointRows: RewardRecord[] = [];

const SUBJECTS: Subject[] = ["math", "reading", "phonics", "reasoning", "writing"];

/** A frozen / throttled tab never adds more than this per timer tick. */
const MAX_TICK_MS = 5000;

/** Self-checked writing: the child's own text is stored as the answer (capped). */
const SELF_CHECK_TEXT_MAX = 2000;

function selfCheckAnswer(text: string, ok: boolean): string {
  return text.trim().slice(0, SELF_CHECK_TEXT_MAX) || (ok ? "self-check: yes" : "self-check: not yet");
}

function kindForSubject(subject: Subject): BlockKind {
  if (subject === "math") return "math";
  if (subject === "reasoning") return "brain";
  return "reading";
}

function parseMode(m: string | undefined): PracticeMode | null {
  return m === "learn" || m === "review" || m === "test" ? m : null;
}

/** Kid-facing mode words (never "test" / "pretest" on a kid screen). */
const MODE_WORD: Record<PracticeMode, string> = { learn: "learn", review: "review", test: "skip check" };

const BAND_NOTE: Record<SkipCheckBand, string> = {
  "test-out": "You skipped ahead — this one is mastered!",
  "quick-fill": "So close! A quick fill next time, then another skip check.",
  "hole-fill": "So close! We'll fill the gaps, then another skip check.",
  learn: "Now we learn this one step by step.",
};

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

/**
 * Text AUTO-spoken for a prompt: display.speak exactly as the generator wrote it
 * (else the prompt). Generators decide what is safe to hear: decoding items never
 * speak their answer (scripts/phonics-check.mts asserts it), while sight words,
 * rhymes and sound sorts speak the target on purpose, and reasoning / math items
 * speak their premises. A passage is never auto-read whole (it has its own
 * "Read it to me" button): only the question prompt is spoken.
 */
function promptSpeech(q: Question): string {
  if (q.display?.passage) return q.prompt;
  return q.display?.speak ?? q.prompt;
}

/** Writes still waiting in the local queue (write-queue.ts) that the server props do not have yet. */
interface PendingState {
  progress: SkillProgress[];
  session: SessionRecord | null;
}

function buildRun(props: PlayViewProps, pending?: PendingState): Run | RunMessage {
  const { learner, sessions, notes, today, nowIso, blockParam, skillParam, modeParam, subjectParam } = props;
  const catalog = catalogFor(learner.slug);
  // A queued progress row is newer than the server's copy of that skill (mergeProgress: later rows win).
  const progressRows = pending && pending.progress.length > 0 ? [...props.progressRows, ...pending.progress] : props.progressRows;
  const progressMap = mergeProgress(catalog, progressRows);
  const now = new Date(nowIso);

  const fromServer = sessionForDate(sessions, today);
  const doneCount = (s: SessionRecord | null | undefined) => s?.blocks.filter((b) => b.done).length ?? -1;
  // The freshest of the server row, a session row still in the write queue and this page-load's cache.
  const session = [pending?.session, sessionCache.get(`${learner.id}:${today}`)].reduce<SessionRecord | null>(
    (best, s) => (s && doneCount(s) >= doneCount(best) ? s : best),
    fromServer
  );
  const sessionsNow = session ? [...sessions.filter((s) => s.date !== today), session] : sessions;
  const blocks: SessionBlock[] = todaysBlocks({ learner, catalog, progressMap, sessions: sessionsNow, now, today, notes });

  if (modeParam === "placement") {
    const subject = SUBJECTS.includes(subjectParam as Subject) ? (subjectParam as Subject) : "math";
    const placement = placementPlan(catalog, subject, progressMap);
    if (placement.length === 0) return { emoji: "🧭", message: `Nothing to place in ${subject} right now — every skill is mastered or can't be skipped.` };
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
    if (!skill) return { emoji: "🧭", message: `"${skillParam}" is not on ${learner.name}'s skill map.` };
    const progress = progressMap[skill.id];
    const mode = parseMode(modeParam) ?? (progress.status === "mastered" ? "review" : "learn");
    // Skip checks are a weekend activity (design §3.11, the planner's weekend rule); the Skill Map only offers them on Sat/Sun.
    if (mode === "test" && !isWeekend(today)) {
      return { emoji: "📅", message: "Skip checks open on the weekend", body: `Practice ${skill.kidTitle} now, or try its skip check on Saturday or Sunday.` };
    }
    const minutes = learner.settings.blocks[kindForSubject(skill.subject)] || skill.estMinutes;
    return { kind: "skill", skills: [skill], mode, minutes, blockIndex: null, offerTestOut: false, blocks, session, progressMap, catalog, placement: [] };
  }

  if (blocks.length === 0) {
    if (isPaused(learner.settings, today)) {
      return { emoji: "🏖️", message: "Vacation mode", body: `Missions are paused — see you on ${vacationReturnLabel(learner.settings, today)}. Your streak is safe.` };
    }
    return { emoji: "🧭", message: "No mission blocks yet — the skill catalog is still being loaded." };
  }
  // A finished block is never replayed from history / a reload (it would pay XP, points and minutes twice).
  const { index: idx, state } = resolveBlockIndex(blocks, blockParam);
  if (state === "done") return { emoji: "✅", message: "This block is already done today.", body: "Head back for the next one." };
  if (state === "complete") return { emoji: "🌟", message: "Today's mission is complete!", body: "Nothing carries over — see you next time." };
  const block = blocks[idx];
  const ids = block.skillIds && block.skillIds.length > 0 ? block.skillIds : [block.skillId];
  const skills = ids.map((id) => catalog.find((s) => s.id === id)).filter((s): s is Skill => !!s);
  if (skills.length === 0) return { emoji: "🧭", message: `Skill "${block.skillId}" is no longer in the catalog. Head back to Mission Control.` };
  const progress = progressMap[skills[0].id];
  return {
    kind: "block",
    skills,
    mode: block.mode,
    minutes: block.minutes,
    items: block.items,
    blockIndex: idx,
    offerTestOut: !!block.offerTestOut && block.mode === "learn" && (progress.status === "ready" || needsSkipCheckFollowUp(progress)) && skills.length === 1,
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
// in-memory cache for private mode. A new tab or device has no stored counter, so
// the counter never starts below the skill's attempts at the start of the block:
// the items seen on another device today were counted there, and are not replayed.
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

/** Current counter value for (slug, skill, date) — at least `floor` (the skill's attempts) — then advance it. */
function takeCounter(slug: string, skillId: string, today: string, floor: number): number {
  const key = questionCounterKey(slug, skillId, today);
  const stored = memoryCounters.get(key) ?? readCounter(key);
  const n = Math.max(stored, Number.isFinite(floor) ? Math.max(0, Math.floor(floor)) : 0);
  memoryCounters.set(key, n + 1);
  writeCounter(key, n + 1);
  return n;
}

/**
 * Build the next item: seed = hash(slug | skill | mode | date | n) with n = max(this tab's counter, the
 * skill's attempts when the block started); the stored seed is the one actually used. The generator also
 * gets params.attempt = n (never below the attempts), so content-backed generators (reading passages,
 * verbal banks) walk their pool continuously across blocks, days and devices instead of repeating.
 */
function makeItemFor(slug: string, today: string, skill: Skill, m: PracticeMode, previous: Question | null, attempts = 0): Item {
  const n = takeCounter(slug, skill.id, today, attempts);
  const withAttempt: Skill = { ...skill, params: { ...skill.params, attempt: n } };
  let seed = questionSeed(slug, skill.id, m, today, n);
  let q = makeQuestion(withAttempt, seed);
  // Avoid showing the exact same item twice in a row.
  for (let salt = 1; salt <= 3 && previous && q.prompt === previous.prompt && q.display?.svg === previous.display?.svg; salt++) {
    seed = hashString(`${seed}:retry${salt}`);
    q = makeQuestion(withAttempt, seed);
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
  // The server render and hydration use the server props only (the same markup on both sides). Once
  // mounted, the player also folds in writes still waiting in the local queue (a reload before they
  // landed), so a finished block is not offered again and a skill's progress never steps back.
  const [serverRun] = useState(() => buildRun(props));
  const [clientRun] = useState(() =>
    typeof window === "undefined" ? null : buildRun(props, pendingOverlay(props.learner.slug, props.learner.id, props.today))
  );
  const run = mounted && clientRun ? clientRun : serverRun;
  const backHref = returnParam === "tonight" ? "/learn/tonight" : `/learn/${learner.slug}`;
  const backLabel = returnParam === "tonight" ? "Back to Tonight" : "Back to Mission Control";

  if ("message" in run) {
    return <MessageCard emoji={run.emoji} title={run.message} body={run.body} href={backHref} label={backLabel} />;
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
      streakSessions={props.streakSessions}
      streakFrom={props.streakFrom}
      notes={props.notes}
      weekRewards={props.weekRewards}
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
  /** the streak's history and its lower date bound (summary card streak) */
  streakSessions: SessionRecord[];
  streakFrom: string | null;
  notes: LearnNote[];
  weekRewards: RewardRecord[];
  today: string;
  coachEnabled: boolean;
  backHref: string;
  backLabel: string;
  returnParam?: string;
  forceIntro: boolean;
}

function Player({ run, learner, streakSessions, streakFrom, notes, weekRewards, today, coachEnabled, backHref, backLabel, returnParam, forceIntro }: PlayerProps) {
  const settings = learner.settings;
  const autoSpeak = settings.autoSpeak;
  const early = learner.grade <= 2;
  const isPlacement = run.kind === "placement";
  // Decided by the block, not the skill count: a Friday mix-up the planner filled with ONE mastered
  // skill still only updates windows and streaks — it never advances or halves the review interval.
  const isMixup = run.blockIndex !== null && isMixupBlock(run.blocks[run.blockIndex]);
  const primarySkill = run.skills[0];
  const [initialStatuses] = useState<Record<string, SkillStatus>>(() =>
    Object.fromEntries([...run.skills, ...run.placement].map((s) => [s.id, run.progressMap[s.id]?.status ?? "ready"]))
  );
  const [startedAt] = useState(() => new Date());
  // Replay decay: sets of this skill already finished today (ledger + this page-load).
  const setKey = `${learner.id}:${today}:${isMixup ? "mixup" : primarySkill.id}`;
  const [setsBefore] = useState(() =>
    isPlacement || isMixup ? 0 : Math.max(setsDoneToday(weekRewards, primarySkill.id, today), localSets.get(setKey) ?? 0)
  );
  const factor = replayFactor(setsBefore);

  // params.attempt counts from the attempts the skill had when the block started (stable for the whole block).
  const makeItem = useCallback(
    (skill: Skill, m: PracticeMode, previous: Question | null): Item =>
      makeItemFor(learner.slug, today, skill, m, previous, run.progressMap[skill.id]?.attempts ?? 0),
    [learner.slug, today, run.progressMap]
  );

  // --- initial phase ---------------------------------------------------------
  const introLines = primarySkill.intro ?? [];
  // The Learn-it card opens a skill's first session, a quick / hole fill after a skip check, or on request.
  const introApplies =
    !isPlacement &&
    !isMixup &&
    run.mode === "learn" &&
    introLines.length > 0 &&
    (forceIntro || (run.progressMap[primarySkill.id]?.attempts ?? 0) === 0 || needsSkipCheckFollowUp(run.progressMap[primarySkill.id]));
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
  const [item, setItem] = useState<Item | null>(() =>
    initialPhase === "question" ? makeItemFor(learner.slug, today, primarySkill, run.mode, null, run.progressMap[primarySkill.id]?.attempts ?? 0) : null
  );
  const [answered, setAnswered] = useState<(Answered & { forced?: boolean }) | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [slowDown, setSlowDown] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState<Finished | null>(null);
  // placement sprint
  const [sprintIndex, setSprintIndex] = useState(0);
  const [sprintFails, setSprintFails] = useState(0);
  const [sprintLog, setSprintLog] = useState<{ skill: Skill; passed: boolean; correct: number; total: number; xp: number }[]>([]);
  /** 5, or 10 once a probe came back 4/5 (the pair must reach 9/10) */
  const [probeTarget, setProbeTarget] = useState(TEST_OUT_ITEMS);

  /** active (visible) practice time banked so far, and when it was last banked */
  const activeMsRef = useRef(0);
  const lastTickRef = useRef(0);
  const questionStartRef = useRef(0);
  const guessStreakRef = useRef(0);
  /** set by every in-gesture speak, so the arrival effect never re-speaks over it */
  const spokenFirstRef = useRef(false);

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

  const target = isPlacement ? probeTarget : questionTargetFor(mode, run.minutes, run.items);
  const limitSeconds = run.minutes * 60;
  // Only a learn block ends by the clock; review sets, mix-ups and skip checks run their fixed count.
  const timeUp = !isPlacement && mode === "learn" && elapsed >= limitSeconds;

  // Block timer (soft): counts ACTIVE time only. It pauses while the page is hidden (phone locked, app in
  // the background) and resumes when it is visible again; one tick never adds more than MAX_TICK_MS, so a
  // frozen tab cannot either. Time's up and minutes_spent both use this clock.
  const playing = phase === "question" || phase === "feedback";
  useEffect(() => {
    if (!playing) return;
    const visible = () => document.visibilityState !== "hidden";
    const bank = (count: boolean) => {
      const now = Date.now();
      if (count) activeMsRef.current += Math.min(Math.max(0, now - lastTickRef.current), MAX_TICK_MS);
      lastTickRef.current = now;
    };
    lastTickRef.current = Date.now();
    const id = window.setInterval(() => {
      bank(visible());
      setElapsed(Math.floor(activeMsRef.current / 1000));
    }, 1000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") bank(true); // bank up to the moment it was hidden, then pause
      else lastTickRef.current = Date.now(); // resume: the hidden span never counts
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      bank(visible());
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing]);

  /** Active seconds right now (banked time plus the running tick). */
  const activeSeconds = useCallback(() => {
    const running = lastTickRef.current && document.visibilityState !== "hidden" ? Math.min(Math.max(0, Date.now() - lastTickRef.current), MAX_TICK_MS) : 0;
    return Math.floor((activeMsRef.current + running) / 1000);
  }, []);

  // Per-question stopwatch (for learn_attempts.ms); the retry keeps the original start.
  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [item]);

  /** Speak inside the current tap (iOS needs the gesture) and mark the first prompt as spoken. */
  const say = useCallback((text: string) => {
    spokenFirstRef.current = true;
    speakNow(text);
  }, []);

  // The first prompt of a block that arrives by navigation (no tap on this page yet): try to speak it once.
  useEffect(() => {
    if (spokenFirstRef.current || !autoSpeak || !item || phase !== "question") return;
    spokenFirstRef.current = true;
    speakNow(promptSpeech(item.question));
  }, [autoSpeak, item, phase]);

  // Every write goes through the learner's persistent queue (localStorage, write-queue.ts): it is sent
  // at once, kept until Supabase accepts it, and retried on load, on 'online', on return to the tab and
  // after each block. Writes are idempotent (client ids / upserts), so a replay never double-counts.
  // Progress for one skill keeps only its LATEST state in the queue and the queue runs in order, so the
  // last item's save and the block's final fold (review set, skip check, stuck flag) cannot race.
  const saves = useWriteQueue(learner.slug);
  const queueWrite = saves.enqueue;
  const flushSaves = saves.flush;
  const saveSkill = useCallback((p: SkillProgress) => void queueWrite({ op: "progress", learnerId: learner.id, progress: p }), [queueWrite, learner.id]);

  /** Start (or restart) the item stream in mode `m`, speaking the first prompt inside the caller's tap. */
  const beginItems = useCallback(
    (m: PracticeMode, skill: Skill) => {
      const first = makeItem(skill, m, null);
      if (autoSpeak) say(promptSpeech(first.question));
      setMode(m);
      setItem(first);
      setAnswered(null);
      setRetrying(false);
      setHintUsed(false);
      setPhase("question");
    },
    [makeItem, autoSpeak, say]
  );

  const submit = useCallback(
    (raw: string, correctOverride?: boolean) => {
      if (phase !== "question" || !item) return;
      const q = item.question;
      const correct = correctOverride ?? gradeAnswer(q, raw);
      const ms = Date.now() - (questionStartRef.current || Date.now());
      const selfChecked = q.type === "text" && !!q.selfCheck;
      const fastWrong = !retrying && isGuess({ correct, ms, questionType: q.type });

      // Guess filter: a sub-1.5 s wrong tap is logged, never scored, and a fresh item takes its slot,
      // so it cannot cost the retry, the window, a review set or a skip check. After a few in a row
      // the next fast answer counts (no endless re-serving).
      if (shouldFilterGuess({ correct, ms, questionType: q.type }, retrying, guessStreakRef.current)) {
        guessStreakRef.current += 1;
        const attempt = {
          learnerId: learner.id,
          skillId: item.skill.id,
          mode,
          question: q,
          answer: raw,
          correct: false,
          ms,
          seed: item.seed,
          hintUsed: false,
          helpLevel: "independent" as const,
          clientId: newClientId(),
        };
        queueWrite({ op: "attempt", attempt });
        const replacement = makeItem(item.skill, mode, q);
        if (autoSpeak) say(`Take your time. ${promptSpeech(replacement.question)}`);
        setItem(replacement);
        setHintUsed(false);
        setSlowDown(true);
        return;
      }
      guessStreakRef.current = 0;
      setSlowDown(false);

      // Learn mode: a miss earns a hint and ONE retry (help_level "hint" if it then lands).
      if (!correct && mode === "learn" && !retrying && !selfChecked && !isMixup) {
        if (autoSpeak) say(`Not yet. Here's a hint. ${q.hint}`);
        setRetrying(true);
        setHintUsed(true);
        return;
      }

      const helpLevel: HelpLevel = correct && hintUsed ? "hint" : "independent";
      const xp = xpFor(correct, helpLevel) * (isPlacement ? 1 : factor);
      if (autoSpeak) say(correct ? (helpLevel === "independent" ? "Yes! " : "You got it, with a hint. ") + q.explain : `Not yet. Here's the idea. ${q.explain}`);
      setAnswered({ raw, correct, helpLevel, hintUsed, ms, xp, firstTryWrong: retrying, forced: fastWrong });
      setPhase("feedback");
    },
    [phase, item, mode, retrying, hintUsed, autoSpeak, isMixup, isPlacement, factor, learner.id, queueWrite, makeItem, say]
  );

  /** "A grown-up helped": the item counts as taught (half XP, a miss in the window); a second tap undoes it until Next. */
  const toggleTaught = useCallback(() => {
    setAnswered((a) => {
      if (!a) return a;
      if (a.helpLevel === "taught" && a.beforeTaught) return { ...a, helpLevel: a.beforeTaught.helpLevel, xp: a.beforeTaught.xp, beforeTaught: undefined };
      return { ...a, beforeTaught: { helpLevel: a.helpLevel, xp: a.xp }, helpLevel: "taught", xp: xpFor(a.correct, "taught") * factor };
    });
  }, [factor]);

  /** Write the day's session row (mission runs only) and return it. A block that is already done is never written twice. */
  const writeSession = useCallback(
    (blockPatch: Partial<SessionBlock>, minutesSpent: number, xp: number): SessionRecord | null => {
      if (run.blockIndex === null || run.blocks[run.blockIndex]?.done) return null;
      const blocks = run.blocks.map((b, i) => (i === run.blockIndex ? { ...b, ...blockPatch } : b));
      // A night already closed (every block done, or a parent's "Weekend set done") stays done:
      // extra practice after it never takes the star away.
      const alreadyDone = run.session?.status === "done" || run.session?.completed === true;
      const status = alreadyDone ? "done" : sessionStatusFor(blocks);
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
      queueWrite({ op: "session", session });
      return session;
    },
    [run, learner.id, today, queueWrite]
  );

  const streakAfter = useCallback(
    (session: SessionRecord | null) => {
      const others = streakSessions.filter((s) => s.date !== today);
      return computeStreakInfo(session ? [...others, session] : streakSessions, today, settings, streakFrom).streak;
    },
    [streakSessions, streakFrom, today, settings]
  );

  const changesFor = useCallback(
    (map: ProgressMap, skills: Skill[]): MasteryChange[] =>
      skills
        .filter((s) => initialStatuses[s.id] !== map[s.id]?.status)
        .map((s) => ({ kidTitle: s.kidTitle, from: initialStatuses[s.id] ?? "ready", to: map[s.id].status })),
    [initialStatuses]
  );

  /** Award input points for a finished set; returns what the caps allow (the write re-checks them). */
  const award = useCallback(
    (kind: PointKind, detail?: string): number => {
      const local = localPointRows.filter((r) => r.learnerId === learner.id && !weekRewards.some((w) => w.clientId === r.clientId));
      const allowed = pointsAllowed([...weekRewards, ...local], kind, POINTS[kind], today);
      if (allowed <= 0) return 0;
      const clientId = newClientId();
      localPointRows.push({ learnerId: learner.id, delta: allowed, reason: pointReason(kind, detail), clientId, createdAt: new Date().toISOString() });
      queueWrite({ op: "points", learnerId: learner.id, kind, today, detail, clientId });
      return allowed;
    },
    [learner.id, weekRewards, today, queueWrite]
  );

  /** End a block or free run (not placement). */
  const finish = useCallback(
    (allResults: ItemResult[], map: ProgressMap, stuck: boolean) => {
      const now = new Date();
      let nextMap = map;
      let testedOut = false;
      let band: SkipCheckBand | undefined;
      let reviewWasDue = false;
      const flags = allResults.map((r) => r.independent);

      if (!isMixup) {
        const skill = primarySkill;
        const prev = map[skill.id];
        if (mode === "test") {
          // Skip check: 10 items, independent answers only (a parent-helped answer never passes it).
          band = skipCheckBand(flags, skill.subject);
          const final = applySkipCheck(prev, flags, now, skill.subject);
          testedOut = final.status === "mastered";
          nextMap = { ...map, [skill.id]: final };
          saveSkill(final);
        } else if (mode === "review" && prev.status === "mastered") {
          reviewWasDue = isReviewDueOn(run.progressMap[skill.id], today, settings);
          const final = applyReviewSet(prev, flags, now, reviewWasDue);
          nextMap = { ...map, [skill.id]: final };
          saveSkill(final);
        }
        if (stuck) {
          const last = allResults[allResults.length - 1];
          const flagged = markNeedsHelp(nextMap[skill.id], last?.prompt ?? skill.title);
          nextMap = { ...nextMap, [skill.id]: flagged };
          saveSkill(flagged);
        }
      }

      const totalXp = blockXp(
        allResults.reduce((s, r) => s + r.xp, 0),
        setsBefore,
        stuck
      );
      localSets.set(setKey, setsBefore + 1);
      const correctCount = allResults.filter((r) => r.correct).length;
      const minutesSpent = Math.max(1, Math.round(activeSeconds() / 60));

      // Input points (design §4): a closed kind ("base"), starting on time, a completed review set.
      let points = 0;
      const blockIdx = run.blockIndex;
      const missionBlock = blockIdx !== null && !run.blocks[blockIdx].done ? run.blocks[blockIdx] : null;
      if (missionBlock && blockIdx !== null) {
        const kindClosed = run.blocks.every((b, i) => i === blockIdx || b.kind !== missionBlock.kind || b.done);
        if (kindClosed) points += award("block", missionBlock.kind);
        if (!run.blocks.some((b) => b.done) && startedOnTime(startedAt)) points += award("ontime");
      }
      if (mode === "review" && (missionBlock || reviewWasDue)) points += award("review", isMixup ? "mixup" : primarySkill.id);

      const session = writeSession(
        {
          mode,
          done: true,
          correct: correctCount,
          total: allResults.length,
          xp: totalXp,
          minutes_spent: minutesSpent,
          stuck: stuck || undefined,
          points: points || undefined,
        },
        minutesSpent,
        totalXp
      );
      if (totalXp > 0) {
        const clientId = newClientId();
        queueWrite({ op: "reward", learnerId: learner.id, delta: totalXp, reason: xpReason(isMixup ? "mixup" : mode, primarySkill.id), clientId });
      }
      void flushSaves();

      const blocks = session?.blocks ?? run.blocks;
      setProgressMap(nextMap);
      setFinished({
        xp: totalXp,
        points,
        correct: correctCount,
        total: allResults.length,
        changes: changesFor(nextMap, run.skills),
        newlyMastered: run.skills.filter((s) => initialStatuses[s.id] !== "mastered" && nextMap[s.id]?.status === "mastered"),
        missionComplete: !!session?.completed,
        nextBlockIndex: run.blockIndex === null ? -1 : blocks.findIndex((b) => !b.done),
        streak: streakAfter(session),
        testedOut,
        band,
        note: band ? BAND_NOTE[band] : undefined,
      });
      setPhase(stuck ? "stuck" : "summary");
    },
    [isMixup, primarySkill, mode, queueWrite, flushSaves, saveSkill, learner.id, run, activeSeconds, writeSession, changesFor, streakAfter, startedAt, setsBefore, setKey, award, initialStatuses, today, settings]
  );

  /** Placement sprint: fold one finished probe (5 items, or the 10 of a pair), then continue or stop. */
  const finishSprintSkill = useCallback(
    (skillResults: ItemResult[], map: ProgressMap) => {
      const now = new Date();
      const skill = run.placement[sprintIndex];
      const wasLocked = map[skill.id]?.status === "locked";
      const folded = applyTestOut(
        map[skill.id],
        skillResults.map((r) => r.independent),
        now
      );
      const passed = folded.status === "mastered";
      // A still-locked skill that fails keeps its window but stays locked (its prereq is not mastered).
      const final: SkillProgress = !passed && wasLocked ? { ...folded, status: "locked" } : folded;
      const correct = skillResults.filter((r) => r.correct).length;
      // Re-derive ready/locked so a pass unlocks the next skill in the queue.
      const nextMap = deriveStatuses(run.catalog, { ...map, [skill.id]: final });
      const gained = Math.round(skillResults.reduce((s, r) => s + r.xp, 0));
      saveSkill(final);
      if (gained > 0) {
        const clientId = newClientId();
        queueWrite({ op: "reward", learnerId: learner.id, delta: gained, reason: xpReason("placement", skill.id), clientId });
      }
      const fails = passed ? 0 : sprintFails + 1;
      const log = [...sprintLog, { skill, passed, correct, total: skillResults.length, xp: gained }];
      const nextIndex = sprintIndex + 1;
      setProgressMap(nextMap);
      setSprintLog(log);
      setSprintFails(fails);
      setProbeTarget(TEST_OUT_ITEMS);

      if (fails >= PLACEMENT_MAX_FAILS || nextIndex >= run.placement.length) {
        const placed = log.filter((l) => l.passed);
        setFinished({
          xp: log.reduce((s, l) => s + l.xp, 0),
          points: 0,
          correct: log.reduce((s, l) => s + l.correct, 0),
          total: log.reduce((s, l) => s + l.total, 0),
          changes: changesFor(nextMap, log.map((l) => l.skill)),
          newlyMastered: placed.map((l) => l.skill),
          missionComplete: false,
          nextBlockIndex: -1,
          streak: streakAfter(null),
          note:
            placed.length > 0
              ? `Placed past ${placed.length} skill${placed.length === 1 ? "" : "s"}: ${placed.map((l) => l.skill.kidTitle).join(", ")}.`
              : "Nothing skipped this time — the next skills will be learned step by step.",
        });
        setResults([]);
        setPhase("summary");
        return;
      }
      setSprintIndex(nextIndex);
      setResults([]);
      const first = makeItem(run.placement[nextIndex], "test", null);
      if (autoSpeak) say(promptSpeech(first.question));
      setItem(first);
      setAnswered(null);
      setRetrying(false);
      setHintUsed(false);
      setPhase("question");
    },
    [run.placement, run.catalog, sprintIndex, sprintFails, sprintLog, queueWrite, saveSkill, learner.id, changesFor, streakAfter, makeItem, autoSpeak, say]
  );

  /** The tap that advances: commits the item, logs it, and speaks the next prompt inside the same gesture. */
  const handleNext = useCallback(() => {
    if (phase !== "feedback" || !answered || !item) return;
    const now = new Date();
    const q = item.question;
    const skill = item.skill;
    // A fast answer that got past the guess filter (after GUESS_STREAK_LIMIT taps) counts: no ms → no guess.
    const input = { correct: answered.correct, helpLevel: answered.helpLevel, ms: answered.forced ? undefined : answered.ms, questionType: q.type };
    const prev = progressMap[skill.id];
    const next = mode === "test" ? prev : applyResult(prev, input, now, mode);
    const nextMap = mode === "test" ? progressMap : { ...progressMap, [skill.id]: next };

    // Self-checked writing: the answer is the child's text; the verdict also goes into the stored question
    // JSON (`selfCheckVerdict`) next to the existing `selfCheck: true` item flag (rows.ts has no column for it).
    const selfChecked = q.type === "text" && !!q.selfCheck;
    const attempt = {
      learnerId: learner.id,
      skillId: skill.id,
      mode,
      question: selfChecked ? ({ ...q, selfCheckVerdict: answered.correct ? "close" : "not-yet" } as Question) : q,
      answer: answered.raw,
      correct: answered.correct,
      ms: answered.ms,
      seed: item.seed,
      hintUsed: answered.hintUsed,
      helpLevel: answered.helpLevel,
      clientId: newClientId(),
    };
    queueWrite({ op: "attempt", attempt });
    if (mode !== "test") saveSkill(next);

    const result: ItemResult = {
      skillId: skill.id,
      correct: answered.correct,
      independent: countsAsIndependent(input),
      helpLevel: answered.helpLevel,
      firstTryCorrect: answered.correct && !answered.firstTryWrong,
      xp: xpFor(answered.correct, answered.helpLevel),
      prompt: q.prompt,
    };
    const allResults = [...results, result];
    setProgressMap(nextMap);
    setResults(allResults);

    if (isPlacement) {
      if (allResults.length >= probeTarget) {
        const verdict = placementProbeResult(allResults.map((r) => r.independent));
        if (verdict === "second-set") {
          setProbeTarget(TEST_OUT_ITEMS * 2);
        } else {
          finishSprintSkill(allResults, nextMap);
          return;
        }
      }
    } else {
      // isStuck wants TRUE = first try right and fires after three FALSE (three first-try misses in a row).
      const stuck = mode === "learn" && !isMixup && isStuck(allResults.map((r) => r.firstTryCorrect));
      if (stuck) {
        finish(allResults, nextMap, true);
        return;
      }
      const n = allResults.length;
      if (n >= target || (timeUp && n >= MIN_BLOCK_ITEMS)) {
        finish(allResults, nextMap, false);
        return;
      }
    }

    const nextSkill = isPlacement ? skill : run.skills[allResults.length % run.skills.length];
    const nextItem = makeItem(nextSkill, mode, q);
    if (autoSpeak) say(promptSpeech(nextItem.question));
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
    queueWrite,
    saveSkill,
    results,
    isPlacement,
    isMixup,
    probeTarget,
    target,
    timeUp,
    finish,
    finishSprintSkill,
    run.skills,
    makeItem,
    autoSpeak,
    say,
  ]);

  // --- render ----------------------------------------------------------------
  const base = `/learn/${learner.slug}`;
  const returnQ = returnParam ? `&return=${encodeURIComponent(returnParam)}` : "";

  if (phase === "paused") {
    return (
      <MessageCard
        emoji="🏖️"
        title="Vacation mode"
        body={`Missions are paused — see you on ${vacationReturnLabel(settings, today)}. Your streak is safe!`}
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
        body={`This ${run.minutes}-minute block can't finish before ${formatClockLabel(settings.stopBy)}. Nothing carries over.`}
        href={backHref}
        label={backLabel}
      />
    );
  }

  const blockLabel = isPlacement
    ? `Placement · ${currentSkill.kidTitle}`
    : run.blockIndex !== null && mode === run.mode
      ? run.blocks[run.blockIndex].label
      : `${mode === "review" ? "Review" : mode === "test" ? "Skip check" : "Practice"} · ${currentSkill.kidTitle}`;
  const emoji = run.blockIndex !== null ? BLOCK_EMOJI[run.blocks[run.blockIndex].kind] : BLOCK_EMOJI[kindForSubject(currentSkill.subject)];
  const remaining = limitSeconds - elapsed;
  const isLast = !isPlacement && (results.length + 1 >= target || (timeUp && results.length + 1 >= MIN_BLOCK_ITEMS));
  const projected = answered ? [...results.map((r) => r.independent), answered.correct && answered.helpLevel === "independent"] : [];
  const probeDone = isPlacement && projected.length >= probeTarget && !(projected.length === TEST_OUT_ITEMS && placementProbeResult(projected) === "second-set");
  const sprintEnds = probeDone && (sprintIndex + 1 >= run.placement.length || (placementProbeResult(projected) !== "pass" && sprintFails + 1 >= PLACEMENT_MAX_FAILS));
  /** 0-based number of the question on screen (results only grow on Next, so this is stable across question → feedback). */
  const qIndex = results.length;
  const inPlay = phase === "question" || phase === "feedback";
  const showIntroCard = (phase === "intro" || (showIntro && phase === "question")) && introLines.length > 0;
  // Long learn blocks (weekend 30-45 min) would draw dozens of dots: show the answered ones plus the current.
  const dotCount = target <= 20 ? target : results.length + 1;
  const tutu = settings.theme.screen === "tutu";
  const ponies = ponyNames(notes);

  return (
    <div className={`min-h-[100dvh] bg-[#F8FAFC] ${phase === "feedback" ? "pb-[70dvh]" : "pb-44"}`}>
      <div className="mx-auto max-w-lg px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <Link href={backHref} className="tab-press flex min-h-[44px] items-center gap-1 text-sm font-semibold text-slate-400">
            ← {returnParam === "tonight" ? "Tonight" : "Mission Control"}
          </Link>
          {inPlay && !early && !isPlacement && mode === "learn" && (
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
            {isPlacement ? "placement" : MODE_WORD[mode]}
          </span>
        </div>

        {/* Item dots (Lily's only progress signal; Cole also sees the countdown) */}
        {inPlay && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${results.length} of ${target} done`}>
            {Array.from({ length: dotCount }, (_, i) => {
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

        {slowDown && phase === "question" && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800" role="status">
            Take your time — read it all before you tap 🙂
          </p>
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
                Get 9 of 10 right and you skip straight to <strong>Mastered</strong>. No hints this time — and anything less just tells us where to start.
              </p>
              <button
                type="button"
                onClick={() => beginItems("test", primarySkill)}
                className="mt-5 flex min-h-[60px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-indigo-500/25 active:scale-[0.98]"
              >
                Skip check ⚡
              </button>
              <button
                type="button"
                onClick={() => {
                  if (introApplies) {
                    if (autoSpeak && introLines[0]) say(introLines[0]);
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
                  if (autoSpeak && item) say(promptSpeech(item.question));
                  setShowIntro(false);
                }
              }}
            />
          )}

          {inPlay && item && !showIntroCard && (
            <QuestionCard
              key={`${item.skill.id}-${item.n}-${retrying ? "retry" : "first"}`}
              question={item.question}
              answered={answered}
              onSubmit={(raw) => submit(raw)}
              onSelfCheck={(ok, text) => submit(selfCheckAnswer(text, ok), ok)}
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
                That one&apos;s done for tonight, good try — you still earned XP for trying. {early ? "A grown-up" : "Mom or Dad"} will show you a different way
                next time. That&apos;s how brains grow.
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
                        ? "Skipped ahead!"
                        : "Good try!"
                      : finished.correct === finished.total && finished.total > 0
                        ? "Perfect set!"
                        : "Block done!"
              }
              subtitle={
                isPlacement
                  ? `${run.subject ?? "math"} · ${sprintLog.length} skill${sprintLog.length === 1 ? "" : "s"} checked`
                  : `${primarySkill.kidTitle} · ${formatClock(elapsed)}`
              }
              note={finished.note}
              correct={finished.correct}
              total={finished.total}
              xp={finished.xp}
              currency={{ amount: finished.points, name: settings.theme.currency }}
              streak={
                run.blockIndex !== null
                  ? { days: finished.streak, label: finished.missionComplete ? "streak safe for today" : "finish the mission to keep it going" }
                  : undefined
              }
              masteryChanges={finished.changes}
              confetti={finished.missionComplete || finished.changes.some((c) => c.to === "mastered")}
              primary={
                finished.nextBlockIndex >= 0
                  ? { label: "Next block →", href: `${base}/play?block=${finished.nextBlockIndex}${returnQ}` }
                  : { label: backLabel, href: backHref }
              }
              save={{ state: saves.state, onRetry: () => void flushSaves() }}
              secondary={finished.nextBlockIndex >= 0 ? { label: backLabel, href: backHref } : { label: "Skill Map", href: `${base}/map` }}
              extra={
                tutu && finished.newlyMastered.length > 0 ? (
                  <PonyPicker
                    skills={finished.newlyMastered}
                    taken={Object.values(ponies)}
                    autoSpeak={autoSpeak}
                    onName={(skill, name) =>
                      queueWrite({ op: "pony", learnerId: learner.id, today, skillId: skill.id, name, standards: skill.standards, clientId: newClientId() })
                    }
                  />
                ) : undefined
              }
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
          nextLabel={isPlacement ? (sprintEnds ? "Finish" : probeDone ? "Next skill" : "Next") : isLast ? "Finish" : "Next"}
          onNext={handleNext}
          onTaught={mode === "test" || isPlacement ? undefined : toggleTaught}
          onAskCoach={coachEnabled && !answered.correct && !(item.question.type === "text" && item.question.selfCheck) ? askExplain : undefined}
        />
      )}

      {saves.state === "failed" && phase !== "summary" && (
        <div className="fixed inset-x-0 top-3 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 py-1.5 pl-4 pr-1.5 text-sm font-semibold text-amber-800 shadow-lg" role="status">
            Not saved yet — will retry.
            <button type="button" onClick={() => void flushSaves()} className="min-h-[44px] rounded-xl bg-amber-600 px-4 text-sm font-bold text-white">
              Retry now
            </button>
          </div>
        </div>
      )}
      {saves.state === "dropped" && phase !== "summary" && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 shadow-lg" role="status">
            {DROPPED_MESSAGE}
          </p>
        </div>
      )}

      <CoachSheet state={coach.state} onClose={coach.close} bigText={learner.grade <= 1} />
    </div>
  );
}

/** Lily names a pony for each newly mastered skill — six names to tap, never a keyboard. */
function PonyPicker({
  skills,
  taken,
  autoSpeak,
  onName,
}: {
  skills: Skill[];
  taken: string[];
  autoSpeak: boolean;
  onName: (skill: Skill, name: string) => void;
}) {
  const [named, setNamed] = useState<Record<string, string>>({});
  return (
    <div className="mt-4 space-y-3 text-left">
      {skills.map((skill) => {
        const chosen = named[skill.id];
        const choices = ponyNameChoices(skill.id, [...taken, ...Object.values(named)]);
        return (
          <div key={skill.id} className="rounded-2xl border border-pink-100 bg-pink-50/70 p-4">
            {chosen ? (
              <p className="text-center text-base font-bold text-pink-800">🐴 Meet {chosen}! Your pony for {skill.kidTitle}.</p>
            ) : (
              <>
                <p className="text-center text-sm font-bold text-pink-800">🐴 A new pony for your stable! Pick a name:</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {choices.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        if (autoSpeak) speakNow(`Meet ${name}!`);
                        setNamed((m) => ({ ...m, [skill.id]: name }));
                        onName(skill, name);
                      }}
                      className="tab-press min-h-[48px] rounded-xl bg-white px-2 text-sm font-bold text-pink-700 shadow-sm"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
