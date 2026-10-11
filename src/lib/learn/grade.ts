/**
 * Answer grading — pure, shared by the player and the self-check.
 */

import type { Question } from "./types";

export function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,!?;:]+$/g, "");
}

/**
 * `raw` is what the UI captured: the typed number/text, or the option index as
 * a string for choice questions. Returns whether it is correct.
 */
export function gradeAnswer(question: Question, raw: string): boolean {
  switch (question.type) {
    case "numeric": {
      const n = Number(raw.replace(/,/g, "").trim());
      if (!Number.isFinite(n)) return false;
      if (Math.abs(n - question.answer) < 1e-9) return true;
      return (question.accept ?? []).some((a) => Math.abs(n - a) < 1e-9);
    }
    case "text": {
      const got = normalizeText(raw);
      if (!got) return false;
      if (got === normalizeText(question.answer)) return true;
      return (question.accept ?? []).some((a) => normalizeText(a) === got);
    }
    case "choice": {
      const idx = Number(raw);
      return Number.isInteger(idx) && idx === question.answerIndex;
    }
    case "tiles": {
      // raw = the tiles placed in the slots, joined without separators
      const got = raw.replace(/\s+/g, "").toLowerCase();
      if (!got) return false;
      if (got === question.answer.replace(/\s+/g, "").toLowerCase()) return true;
      return (question.accept ?? []).some((a) => a.replace(/\s+/g, "").toLowerCase() === got);
    }
    case "tap": {
      // raw = number of cells the child selected (excluding fixed cells)
      const n = Number(raw);
      return Number.isInteger(n) && n === question.answer;
    }
    default:
      return false;
  }
}

/** The correct answer as display text (for feedback). */
export function answerText(question: Question): string {
  switch (question.type) {
    case "numeric":
      return String(question.answer);
    case "text":
      return question.modelAnswer ?? question.answer;
    case "choice": {
      const opt = question.options[question.answerIndex];
      return opt?.label ?? opt?.emoji ?? "the highlighted one";
    }
    case "tiles":
      return question.answer;
    case "tap":
      return String(question.answer);
    default:
      return "";
  }
}
