/**
 * Learn module — AI Coach request/response contract.
 *
 * Pure types shared by the server (coach.ts, the API route) and the browser
 * (coach-client.ts, the coach sheet). No imports so it is safe everywhere.
 */

export type CoachAction = "hint" | "explain" | "cheer" | "passage" | "feedback";

export const COACH_ACTIONS: readonly CoachAction[] = ["hint", "explain", "cheer", "passage", "feedback"];

/** The question the child is looking at, flattened to text for the model. */
export interface CoachQuestion {
  prompt: string;
  /** choice questions: option labels in order */
  options?: string[];
  correctAnswer: string;
  /** what the child answered (explain) */
  childAnswer?: string;
  /** reading questions: the passage text the question is about */
  passage?: string;
  /** the app's own hint / explanation / checklist lines for this item */
  guidance?: string[];
}

export interface CoachLearner {
  slug: string;
  name: string;
  grade: number;
}

/** Input to askCoach() on the server. */
export interface CoachInput {
  learner: CoachLearner;
  action: CoachAction;
  /** untrusted label; askCoach strips control characters, caps it at 120 chars and delimits it */
  skillTitle?: string;
  question?: CoachQuestion;
  /** the child's writing (feedback) or the app's progress note (cheer) */
  childText?: string;
  /** reading level for passages (1–1.5 Lily, 3.5–4 Cole) */
  level?: number;
}

export interface CoachPassageQuestion {
  prompt: string;
  options: string[];
  answerIndex: number;
  explain: string;
  hint: string;
  kind: string;
}

export interface CoachPassage {
  title: string;
  text: string;
  level: number;
  vocab: { word: string; meaning: string }[];
  questions: CoachPassageQuestion[];
}

export type CoachErrorCode = "coach_unavailable" | "busy" | "error" | "bad_passage";

export type CoachResult =
  | { kind: "text"; text: string; refused?: boolean }
  | { kind: "passage"; passage: CoachPassage }
  | { kind: "error"; error: CoachErrorCode };

/** POST /api/learn/coach body. */
export interface CoachRequestBody {
  slug: string;
  action: CoachAction;
  skillTitle?: string;
  question?: CoachQuestion;
  childText?: string;
  level?: number;
}

/** Error codes the route can answer with (superset of CoachErrorCode). */
export type CoachRouteError = CoachErrorCode | "unauthorized" | "bad_request" | "unknown_learner" | "slow_down" | "offline";

/** One row of the parent-visible coach log (GET /api/learn/coach). */
export interface CoachLogMessage {
  id: string;
  role: "child" | "coach" | "system";
  text: string;
  context: Record<string, unknown> | null;
  createdAt: string;
}
