"use client";

import { useState } from "react";
import SpeakButton, { speakNow } from "./speak-button";

interface IntroCardProps {
  kidTitle: string;
  /** 2-3 short teaching lines; the LAST line is the worked example */
  lines: string[];
  /** "Let's go" */
  onDone: () => void;
  /** speak each line as it appears (early readers) */
  autoSpeak?: boolean;
  /** say "Back to the question" instead of "Let's go" (re-opened via "Show me") */
  reopened?: boolean;
}

/**
 * "Learn it" card: the skill's intro lines appear one per tap (each with its
 * own speaker button); the last line is styled as the worked example.
 */
export default function IntroCard({ kidTitle, lines, onDone, autoSpeak = false, reopened = false }: IntroCardProps) {
  const [shown, setShown] = useState(1);
  const all = lines.length;
  const complete = shown >= all;

  return (
    <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">Learn it</p>
        <span className="text-2xl" aria-hidden>
          📚
        </span>
      </div>
      <h2 className="mt-1 text-xl font-bold text-slate-900">{kidTitle}</h2>

      <ol className="mt-4 space-y-3" aria-live="polite">
        {lines.slice(0, shown).map((line, i) => {
          const example = i === all - 1 && all > 1;
          return (
            <li
              key={i}
              className={`animate-fade-slide-in flex items-start gap-3 rounded-2xl p-4 ${example ? "border border-amber-200 bg-amber-50" : "bg-indigo-50"}`}
            >
              <div className="min-w-0 flex-1">
                {example && <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Example</p>}
                <p className={`text-[17px] leading-relaxed ${example ? "font-semibold text-amber-900" : "font-medium text-slate-800"}`}>{line}</p>
              </div>
              <SpeakButton text={line} />
            </li>
          );
        })}
      </ol>

      {!complete ? (
        <button
          type="button"
          onClick={() => {
            const next = lines[shown];
            // Speak inside the tap so iOS allows it; the speak module keeps the utterance alive.
            if (autoSpeak && next) speakNow(next);
            setShown((n) => Math.min(all, n + 1));
          }}
          className="mt-5 flex min-h-[60px] w-full items-center justify-center rounded-2xl border-2 border-indigo-200 bg-white text-lg font-bold text-indigo-700 active:bg-indigo-50"
        >
          Next →
        </button>
      ) : (
        <button
          type="button"
          onClick={onDone}
          className="mt-5 flex min-h-[60px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]"
        >
          {reopened ? "Back to the question →" : "Let's go 🚀"}
        </button>
      )}
    </div>
  );
}
