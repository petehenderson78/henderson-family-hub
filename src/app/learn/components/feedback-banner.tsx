"use client";

interface FeedbackBannerProps {
  correct: boolean;
  explain: string;
  /** shown on a miss so the child sees what it was */
  correctAnswer?: string;
  xp: number;
  nextLabel?: string;
  onNext: () => void;
  /** provided by the coach integration; renders an "Ask Coach" button when set */
  onAskCoach?: () => void;
}

const CHEERS = ["Nice!", "You got it!", "Boom!", "Yes!", "Super!"];
const NUDGES = ["Not quite.", "Almost!", "Good try.", "Let's look at it."];

export default function FeedbackBanner({ correct, explain, correctAnswer, xp, nextLabel = "Next", onNext, onAskCoach }: FeedbackBannerProps) {
  const word = correct ? CHEERS[explain.length % CHEERS.length] : NUDGES[explain.length % NUDGES.length];
  return (
    <div className="fixed inset-x-0 z-40 animate-slide-up" style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}>
      <div className="mx-auto max-w-lg px-4 pb-3">
        <div
          className={`rounded-2xl border p-4 shadow-xl ${
            correct ? "border-emerald-200 bg-emerald-50 shadow-emerald-500/10" : "border-rose-200 bg-rose-50 shadow-rose-500/10"
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="animate-pop text-3xl leading-none" aria-hidden>
              {correct ? "🎉" : "🤔"}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-lg font-bold ${correct ? "text-emerald-800" : "text-rose-800"}`}>
                {word}
                {correct && xp > 0 && <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">+{xp} XP</span>}
              </p>
              {!correct && correctAnswer && (
                <p className="mt-0.5 text-sm font-semibold text-rose-700">
                  The answer is <span className="rounded bg-white px-1.5 py-0.5">{correctAnswer}</span>
                </p>
              )}
              <p className="mt-1 text-[15px] leading-relaxed text-slate-700">{explain}</p>
            </div>
          </div>
          <div className={`mt-3 grid gap-2 ${onAskCoach ? "grid-cols-[1fr_auto]" : "grid-cols-1"}`}>
            <button
              type="button"
              onClick={onNext}
              className={`flex min-h-[56px] items-center justify-center rounded-2xl text-lg font-bold text-white shadow-lg ${
                correct ? "bg-emerald-600 shadow-emerald-500/20" : "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-500/20"
              }`}
            >
              {nextLabel} →
            </button>
            {onAskCoach && (
              <button
                type="button"
                onClick={onAskCoach}
                className="flex min-h-[56px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700"
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
