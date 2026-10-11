/**
 * Learn module — shared types.
 *
 * Everything in src/lib/learn/* must stay importable from plain Node (the
 * self-check script runs the engine + generators with Node's type stripping):
 * relative imports only, `import type` for types, no enums, no path aliases.
 */

export type Subject = "math" | "reading" | "phonics" | "reasoning" | "writing";

export type SkillStatus = "locked" | "ready" | "learning" | "mastered";

export type Track = "cole" | "lily" | "both";

export type PracticeMode = "learn" | "review" | "test";

/**
 * How much help the child had on an answer.
 *   independent — answered alone (the only kind that counts as correct in the mastery window)
 *   hint        — answered correctly after seeing the hint (incl. the learn-mode retry)
 *   taught      — a parent tapped "I helped" on the feedback banner
 */
export type HelpLevel = "independent" | "hint" | "taught";

export interface Skill {
  /** e.g. "m1.count120", "m4.frac.equiv", "r3.fig.matrix", "p1.cvc" */
  id: string;
  subject: Subject;
  /** 1..5 */
  grade: number;
  /** parent-facing */
  title: string;
  /** child-facing, playful */
  kidTitle: string;
  /** NJSLS/CCSS codes e.g. ["1.NBT.A.1"] */
  standards: string[];
  /** skill ids that must be mastered first */
  prereqs: string[];
  /** generator id (see src/lib/learn/generators/index.ts) */
  generator: string;
  params?: Record<string, unknown>;
  /** typical minutes to a mastery session */
  estMinutes: number;
  /** can be compacted with a 5-item pretest */
  testOut: boolean;
  /** one-line "how to coach it" */
  parentTip: string;
  /** which learner's tree includes it */
  track: Track;
  /** 2-3 short teaching lines a parent can read aloud, ending with a worked example */
  intro?: string[];
}

export interface Option {
  label?: string;
  svg?: string;
  emoji?: string;
}

export interface Passage {
  title: string;
  text: string;
  level: number;
}

export interface QuestionDisplay {
  svg?: string;
  emoji?: string;
  passage?: Passage;
  /** text for TTS (defaults to the prompt) */
  speak?: string;
  grid?: string[][];
}

export interface NumericQuestion {
  type: "numeric";
  prompt: string;
  answer: number;
  display?: QuestionDisplay;
  explain: string;
  hint: string;
  accept?: number[];
}

export interface TextQuestion {
  type: "text";
  prompt: string;
  answer: string;
  display?: QuestionDisplay;
  explain: string;
  hint: string;
  accept?: string[];
  /** writing prompts: no auto-grading, show modelAnswer and let the child self-check */
  selfCheck?: boolean;
  modelAnswer?: string;
}

export interface ChoiceQuestion {
  type: "choice";
  prompt: string;
  options: Option[];
  answerIndex: number;
  display?: QuestionDisplay;
  explain: string;
  hint: string;
}

/** Arrange letter/number tiles into slots (word building, number building). Never a free-text keyboard. */
export interface TilesQuestion {
  type: "tiles";
  prompt: string;
  /** Tiles offered to the child, already shuffled by the generator; may include 1-2 distractors. */
  tiles: string[];
  /** Number of answer slots. */
  slots: number;
  /** Correct sequence joined without separators, e.g. "ship" or "34". */
  answer: string;
  accept?: string[];
  display?: QuestionDisplay;
  explain: string;
  hint: string;
}

/** Tap cells in a grid to show a quantity (ten frame, array, fraction bar, hundred grid). */
export interface TapQuestion {
  type: "tap";
  prompt: string;
  rows: number;
  cols: number;
  /** Cell indexes (row-major) pre-filled and not toggleable, e.g. counters already placed. */
  fixed?: number[];
  /** Correct number of selected cells (position-independent). */
  answer: number;
  variant?: "ten-frame" | "array" | "fraction-bar" | "hundred-grid" | "plain";
  display?: QuestionDisplay;
  explain: string;
  hint: string;
}

export type Question = NumericQuestion | TextQuestion | ChoiceQuestion | TilesQuestion | TapQuestion;

export interface GeneratorContext {
  /** seeded, returns [0, 1) */
  rng: () => number;
  /** reasoning generators use 1 (Lily) or 3 (Cole) */
  level?: number;
  params?: Record<string, unknown>;
}

export type Generator = (ctx: GeneratorContext) => Question;

export interface SkillProgress {
  skillId: string;
  status: SkillStatus;
  attempts: number;
  correct: number;
  /** consecutive correct answers (reset to 0 on a miss) */
  streak: number;
  /** last 10 window-eligible results, oldest first (only independent corrects are `true`) */
  window: boolean[];
  intervalDays: number;
  nextReviewAt: string | null;
  lastPracticedAt: string | null;
  masteredAt: string | null;
  /** consecutive failed 4-item review sets (2 → demoted to learning). Default 0. */
  reviewMisses?: number;
  /** set by the stuck rule; the parent dashboard shows a struggle flag. Default false. */
  needsHelp?: boolean;
  /** the prompt the child was stuck on (for the parent, next to parentTip) */
  helpNote?: string | null;
  /** mastered via a test-out (skip check >= 9/10 or a placement probe) rather than practice. Default false. */
  testOut?: boolean;
}

export type ProgressMap = Record<string, SkillProgress>;

/** Planned light weeks (design §14.8): review-only missions, or "off" (= vacation: no mission, streak frozen). */
export interface LightWeek {
  from: string;
  to: string;
  mode: "review-only" | "off";
}

/** Mission Control screen: Cole's diamond (bases), Lily's tutu (petals), or a plain row. */
export type ThemeScreen = "diamond" | "tutu" | "generic";

export interface LearnerTheme {
  /** currency name, e.g. "Lightning Bucks" */
  currency: string;
  levels: "baseball" | "ballet" | "generic";
  /** level ladder, one name per 500 XP (Appendix A) */
  ladder?: string[];
  /** the nightly zero-cost time-back line, e.g. "Done by 7:45 = catch in the yard" */
  timeBack?: string;
  screen?: ThemeScreen;
}

export interface LearnerSettings {
  dailyMinutes: number;
  /** Weekday block minutes (family norm 12 / 12 / 6). */
  blocks: { math: number; reading: number; brain: number };
  /** Weekend block minutes (family norm 30 / 30 / 45). */
  weekend: { math: number; reading: number; brain: number };
  targetGrade: { math: number; reading: number; reasoning: number };
  /** Legacy (XP per currency unit). The currency is now input points (learn_rewards "pt:" rows); unused. */
  rewardRate: number;
  /** Every block must FINISH by this time, "HH:MM" 24h in the family timezone (family rule: 20:30); a block that cannot is skipped, no debt. */
  stopBy: string;
  /** YYYY-MM-DD; while pausedFrom <= day <= pausedUntil, missions are paused and the streak is frozen. */
  pausedUntil: string | null;
  /** YYYY-MM-DD the current "Pause until" started (set by the settings editor). Missing on legacy rows. */
  pausedFrom?: string | null;
  /** Planned vacations (inclusive YYYY-MM-DD ranges); same effect as pausedUntil. */
  vacations?: { from: string; to: string }[];
  /** Planned light weeks (review-only or off). */
  lightWeeks?: LightWeek[];
  /** What the child sees: currency name, level ladder, time-back line, Mission Control screen. */
  theme: LearnerTheme;
  /** Speak prompts automatically (early readers). */
  autoSpeak: boolean;
}

export interface Learner {
  id: string;
  slug: string;
  name: string;
  grade: number;
  settings: LearnerSettings;
  /** Login email for routing (kids land on their own dashboard). */
  email?: string | null;
  createdAt: string;
}

export type BlockKind = "math" | "reading" | "brain";

export interface MissionBlock {
  /** which slot of the mission this is */
  kind: BlockKind;
  subject: Subject;
  skillId: string;
  mode: PracticeMode;
  minutes: number;
  /** kid-facing label, e.g. "Math · Times Tables" */
  label: string;
  /** true when the skill is "ready" and can be compacted with a 10-item skip check (weekends) */
  offerTestOut?: boolean;
  /** Interleaved review (Friday "mix-up"): the block rotates through these skills; skillId is the first. */
  skillIds?: string[];
  /** Fixed item count for set-based blocks (review set = 4, mix-up = 8 / 12, skip check = 10). */
  items?: number;
}

export interface Mission {
  blocks: MissionBlock[];
}

/** Per-block completion stats stored in learn_sessions.blocks */
export interface SessionBlock extends MissionBlock {
  done: boolean;
  correct?: number;
  total?: number;
  xp?: number;
  minutes_spent?: number;
  /** the stuck rule ended this block early (still counts as done — no backlog) */
  stuck?: boolean;
  /** input points earned when this block finished (pt: rows) */
  points?: number;
}

export interface SessionRecord {
  id?: string;
  learnerId: string;
  /** YYYY-MM-DD in the family timezone */
  date: string;
  minutes: number;
  xp: number;
  blocks: SessionBlock[];
  completed: boolean;
  /** planned → partial → done; skipped/vacation days carry no debt. */
  status?: SessionStatus;
  skipReason?: string | null;
  createdAt?: string;
}

export type SessionStatus = "planned" | "partial" | "done" | "skipped" | "vacation";

export interface AttemptRecord {
  id?: string;
  learnerId: string;
  skillId: string;
  mode: PracticeMode;
  /** stored WITHOUT display.svg (rows.ts strips it) */
  question: Question;
  answer: string;
  correct: boolean;
  ms: number;
  /** generator seed (rng.questionSeed) so the item can be rebuilt for the report */
  seed?: number;
  /** the child saw the hint before this answer */
  hintUsed?: boolean;
  /** default "independent" */
  helpLevel?: HelpLevel;
  /** client-generated uuid; a retried write with the same id is ignored by the DB */
  clientId?: string;
  createdAt?: string;
}

export interface RewardRecord {
  id?: string;
  learnerId: string;
  delta: number;
  reason: string;
  /** client-generated uuid; duplicate writes are ignored */
  clientId?: string;
  createdAt?: string;
}

export interface Workshop {
  id: string;
  title: string;
  emoji: string;
  minutes: number;
  blurb: string;
  steps: string[];
  /** input points paid when marked done with a logged Show (design §4: 3) */
  points: number;
}
