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

export type Question = NumericQuestion | TextQuestion | ChoiceQuestion;

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
  /** last 10 results, oldest first */
  window: boolean[];
  intervalDays: number;
  nextReviewAt: string | null;
  lastPracticedAt: string | null;
  masteredAt: string | null;
}

export type ProgressMap = Record<string, SkillProgress>;

export interface LearnerSettings {
  dailyMinutes: number;
  blocks: { math: number; reading: number; brain: number };
  targetGrade: { math: number; reading: number; reasoning: number };
  /** XP per family-currency unit */
  rewardRate: number;
}

export interface Learner {
  id: string;
  slug: string;
  name: string;
  grade: number;
  settings: LearnerSettings;
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
  /** true when the skill is "ready" and can be compacted with a 5-item pretest */
  offerTestOut?: boolean;
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
  createdAt?: string;
}

export interface AttemptRecord {
  learnerId: string;
  skillId: string;
  mode: PracticeMode;
  question: Question;
  answer: string;
  correct: boolean;
  ms: number;
}

export interface RewardRecord {
  id?: string;
  learnerId: string;
  delta: number;
  reason: string;
  createdAt?: string;
}

export interface Workshop {
  id: string;
  title: string;
  emoji: string;
  minutes: number;
  blurb: string;
  steps: string[];
  xp: number;
}
