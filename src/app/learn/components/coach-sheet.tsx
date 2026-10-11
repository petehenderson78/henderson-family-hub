"use client";

import { useEffect } from "react";
import { coachErrorCopy } from "@/lib/learn/coach-client";
import SpeakButton from "./speak-button";
import type { CoachSheetState } from "./use-coach";

interface CoachSheetProps {
  /** null = closed (see useCoach) */
  state: CoachSheetState | null;
  onClose: () => void;
  /** larger text and a prominent read-aloud button (early readers) */
  bigText?: boolean;
}

/** Bottom sheet showing one coach reply, with read-aloud and a "Got it" close. */
export default function CoachSheet({ state, onClose, bigText = false }: CoachSheetProps) {
  const open = state !== null;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!state) return null;

  const text = state.status === "ready" ? state.text : state.status === "error" ? coachErrorCopy(state.code) : "";

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-sheet-title"
      onClick={onClose}
    >
      <div
        className="animate-slide-up max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
        style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="mb-3 flex justify-center sm:hidden">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        <div className="flex items-center justify-between">
          <h3 id="coach-sheet-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="text-2xl" aria-hidden>
              🤖
            </span>
            {state.title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 active:bg-slate-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={`mt-3 min-h-[80px] rounded-2xl p-4 ${state.status === "error" ? "bg-amber-50" : "bg-indigo-50"}`} aria-live="polite">
          {state.status === "loading" ? (
            <div className="flex items-center gap-3 text-sm font-semibold text-indigo-600">
              <span className="flex gap-1" aria-hidden>
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-indigo-400" />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:120ms]" />
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:240ms]" />
              </span>
              Coach is thinking…
            </div>
          ) : state.status === "error" ? (
            <p className="text-[15px] font-semibold leading-relaxed text-amber-800">{text}</p>
          ) : (
            <p className={`whitespace-pre-line text-slate-800 ${bigText ? "text-xl font-semibold leading-relaxed" : "text-[17px] leading-relaxed"}`}>{text}</p>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          {state.status === "ready" && <SpeakButton text={text} label={bigText ? "Read to me" : "Read"} className="flex-none" />}
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[56px] flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-blue-500/20 active:scale-[0.98]"
          >
            Got it 👍
          </button>
        </div>
      </div>
    </div>
  );
}
