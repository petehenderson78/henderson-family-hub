"use client";

import type { HelpLevel } from "@/lib/learn/types";
import SpeakButton from "./speak-button";

interface FeedbackBannerProps {
  correct: boolean;
  explain: string;
  /** shown on a miss so the child sees what it was (omit for self-checked writing) */
  correctAnswer?: string;
  xp: number;
  nextLabel?: string;
  onNext: () => void;
  /** provided by the coach integration; renders an "Ask Coach" button when set */
  onAskCoach?: () => void;
  /** how the child got there; "hint" / "taught" change the wording and halve XP */
  helpLevel?: HelpLevel;
  /** parent chip "I helped" → marks the item taught (half XP, not in the mastery window) */
  onTaught?: () => void;
  /** read the feedback aloud (never used for the question's answer before answering) */
  speak?: boolean;
}

const CHEERS = ["Nice!", "You got it!", "Boom!", "Yes!", "Super!"];

/** Feedback wording — never "Wrong": a miss is "Not yet". */
export function feedbackHeadline(correct: boolean, helpLevel: HelpLevel, seed: number): string {
  if (!correct) return "Not yet.";
  if (helpLevel === "taught") return "You got there — with some help!";
  if (helpLevel === "hint") return "You got it — with a hint!";
  return CHEERS[seed % CHEERS.length];
}

export default function FeedbackBanner({
  correct,
  explain,
  correctAnswer,
  xp,
  nextLabel = "Next",
  onNext,
  onAskCoach,
  helpLevel = "independent",
  onTaught,
  speak = true,
}: FeedbackBannerProps) {
  const word = feedbackHeadline(correct, helpLevel, explain.length);
  const speech = correct ? `${word} ${explain}` : `Not yet. Here's the idea. ${explain}`;
  return (
    <div className="fixed inset-x-0 z-40 animate-slide-up" style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}>
      <div className="mx-auto max-w-lg px-4 pb-3">
        <div
          className={`rounded-2xl border p-4 shadow-xl ${
            correct ? "border-emerald-200 bg-emerald-50 shadow-emerald-500/10" : "border-amber-200 bg-amber-50 shadow-amber-500/10"
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <span className="animate-pop text-3xl leading-none" aria-hidden>
              {correct ? (helpLevel === "independent" ? "🎉" : "👍") : "💡"}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-lg font-bold ${correct ? "text-emerald-800" : "text-amber-900"}`}>
                {word}
                {correct && xp > 0 && <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">+{xp} XP</span>}
              </p>
              {!correct && (
                <p className="mt-0.5 text-sm font-semibold text-amber-800">
                  Here&apos;s the idea
                  {correctAnswer ? (
                    <>
                      {" "}
                      — it was <span className="rounded bg-white px-1.5 py-0.5 text-slate-900">{correctAnswer}</span>
                    </>
                  ) : null}
                  :
                </p>
              )}
              <p className="mt-1 text-[15px] leading-relaxed text-slate-700">{explain}</p>
            </div>
            {speak && <SpeakButton text={speech} />}
          </div>

          {onTaught && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={onTaught}
                disabled={helpLevel === "taught"}
                aria-pressed={helpLevel === "taught"}
                className={`tab-press inline-flex min-h-[36px] items-center gap-1 rounded-full border px-3 text-xs font-bold ${
                  helpLevel === "taught" ? "border-violet-300 bg-violet-100 text-violet-800" : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                {helpLevel === "taught" ? "✓ Parent helped" : "👋 I helped (parent)"}
              </button>
            </div>
          )}

          <div className={`mt-3 grid gap-2 ${onAskCoach ? "grid-cols-[1fr_auto]" : "grid-cols-1"}`}>
            <button
              type="button"
              onClick={onNext}
              className={`flex min-h-[60px] items-center justify-center rounded-2xl text-lg font-bold text-white shadow-lg ${
                correct ? "bg-emerald-600 shadow-emerald-500/20" : "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-500/20"
              }`}
            >
              {nextLabel} →
            </button>
            {onAskCoach && (
              <button
                type="button"
                onClick={onAskCoach}
                className="flex min-h-[60px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700"
              >
                🤖 Ask Coach
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
