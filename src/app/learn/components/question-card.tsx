"use client";

import { useEffect, useState } from "react";
import type { Question } from "@/lib/learn/types";
import Keypad from "./keypad";
import SpeakButton from "./speak-button";

interface QuestionCardProps {
  question: Question;
  /** set once the child has answered — locks inputs and highlights the result */
  answered?: { raw: string; correct: boolean } | null;
  onSubmit: (raw: string) => void;
  /** writing prompts (`selfCheck`): the child grades themselves against the model answer */
  onSelfCheck?: (correct: boolean) => void;
  /** 1-based question number and total, for the header */
  index: number;
  total: number;
  /** AI coach: Socratic hint before answering (learn mode only) */
  onCoachHint?: () => void;
  /** AI coach: feedback on the child's writing (selfCheck prompts) */
  onCoachFeedback?: (text: string) => void;
}

/**
 * Renders one question. Mount with `key={questionNumber}` so its input state
 * resets for each new question.
 */
export default function QuestionCard({ question, answered = null, onSubmit, onSelfCheck, index, total, onCoachHint, onCoachFeedback }: QuestionCardProps) {
  const [value, setValue] = useState("");
  const [hintShown, setHintShown] = useState(false);
  const [modelShown, setModelShown] = useState(false);
  const locked = !!answered;
  const speakText = question.display?.speak ?? question.prompt;

  // Hardware keyboard support for numeric questions (phones use the keypad).
  useEffect(() => {
    if (question.type !== "numeric" || locked) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) setValue((v) => (v.length < 7 ? v + e.key : v));
      else if (e.key === "Backspace") setValue((v) => v.slice(0, -1));
      else if (e.key === "-") setValue((v) => (v === "" ? "-" : v));
      else if (e.key === "Enter") {
        setValue((v) => {
          if (v !== "" && v !== "-") onSubmit(v);
          return v;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [question.type, locked, onSubmit]);

  const allowNegative = question.type === "numeric" && (question.answer < 0 || (question.accept ?? []).some((a) => a < 0));

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Question {index} of {total}
        </p>
        <SpeakButton text={speakText} />
      </div>

      {/* Display block */}
      {question.display?.passage && (
        <div className="mt-3 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-slate-900">{question.display.passage.title}</p>
            <SpeakButton text={question.display.passage.text} label="Read" />
          </div>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{question.display.passage.text}</p>
        </div>
      )}
      {question.display?.svg && (
        <div
          className="mx-auto mt-3 w-full max-w-[260px] [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: question.display.svg }}
        />
      )}
      {question.display?.emoji && (
        <p className="mt-3 text-center text-4xl leading-relaxed tracking-wide break-words">{question.display.emoji}</p>
      )}
      {question.display?.grid && (
        <table className="mx-auto mt-3 border-collapse">
          <tbody>
            {question.display.grid.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className="border border-slate-200 px-3 py-2 text-center text-lg font-semibold text-slate-800">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Prompt */}
      <p className="mt-4 text-center text-2xl font-bold leading-snug text-slate-900 break-words">{question.prompt}</p>

      {/* Answer area */}
      <div className="mt-5">
        {question.type === "numeric" && (
          <>
            <div
              className={`mb-3 flex min-h-[64px] items-center justify-center rounded-2xl border-2 text-3xl font-bold tabular-nums ${
                answered
                  ? answered.correct
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-rose-300 bg-rose-50 text-rose-700 animate-shake"
                  : "border-slate-200 bg-slate-50 text-slate-900"
              }`}
            >
              {answered ? answered.raw || "—" : value === "" ? <span className="text-slate-300">?</span> : value}
            </div>
            <Keypad
              disabled={locked}
              canSubmit={value !== "" && value !== "-"}
              allowNegative={allowNegative}
              onDigit={(d) => setValue((v) => (d === "-" ? (v === "" ? "-" : v) : v.length < 7 ? v + d : v))}
              onBackspace={() => setValue((v) => v.slice(0, -1))}
              onSubmit={() => {
                if (value !== "" && value !== "-") onSubmit(value);
              }}
            />
          </>
        )}

        {question.type === "text" && (
          <div>
            {question.selfCheck ? (
              <>
                <textarea
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  disabled={locked}
                  rows={3}
                  placeholder="Write your answer here…"
                  className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 text-lg text-slate-900 outline-none focus:border-indigo-400"
                />
                {!modelShown ? (
                  <button
                    type="button"
                    disabled={locked || value.trim().length === 0}
                    onClick={() => setModelShown(true)}
                    className="mt-3 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-bold text-white shadow-lg shadow-blue-500/20 disabled:opacity-40"
                  >
                    Done — show an example answer
                  </button>
                ) : (
                  <div className="mt-3 rounded-2xl bg-indigo-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">Example answer</p>
                    <p className="mt-1 text-[15px] leading-relaxed text-slate-800">{question.modelAnswer ?? question.answer}</p>
                    {!locked && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onSelfCheck?.(true)}
                          className="min-h-[56px] rounded-2xl bg-emerald-500 text-base font-bold text-white shadow-sm"
                        >
                          Mine is close ✅
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelfCheck?.(false)}
                          className="min-h-[56px] rounded-2xl border border-slate-200 bg-white text-base font-bold text-slate-700"
                        >
                          Not yet 🤔
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {onCoachFeedback && value.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => onCoachFeedback(value)}
                    className="tab-press mt-2 flex min-h-[48px] w-full items-center justify-center gap-1 rounded-2xl border border-indigo-200 bg-white text-sm font-bold text-indigo-700"
                  >
                    🤖 Coach feedback
                  </button>
                )}
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (value.trim()) onSubmit(value);
                }}
              >
                <input
                  value={answered ? answered.raw : value}
                  onChange={(e) => setValue(e.target.value)}
                  disabled={locked}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Type your answer"
                  className={`w-full rounded-2xl border-2 px-4 py-4 text-center text-2xl font-bold outline-none ${
                    answered
                      ? answered.correct
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-rose-300 bg-rose-50 text-rose-700 animate-shake"
                      : "border-slate-200 bg-slate-50 text-slate-900 focus:border-indigo-400"
                  }`}
                />
                <button
                  type="submit"
                  disabled={locked || value.trim().length === 0}
                  className="mt-3 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-lg shadow-blue-500/20 disabled:opacity-40"
                >
                  Check ✓
                </button>
              </form>
            )}
          </div>
        )}

        {question.type === "choice" && (
          <div className="grid grid-cols-2 gap-3">
            {question.options.map((opt, i) => {
              const picked = answered && Number(answered.raw) === i;
              const isAnswer = i === question.answerIndex;
              const tone = !answered
                ? "border-slate-200 bg-white active:bg-slate-50"
                : isAnswer
                  ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300"
                  : picked
                    ? "border-rose-300 bg-rose-50 animate-shake"
                    : "border-slate-100 bg-white opacity-60";
              return (
                <button
                  key={i}
                  type="button"
                  disabled={locked}
                  onClick={() => onSubmit(String(i))}
                  className={`tab-press flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 shadow-sm ${tone}`}
                >
                  {opt.svg && <div className="h-20 w-20 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: opt.svg }} />}
                  {opt.emoji && <span className="text-4xl leading-none">{opt.emoji}</span>}
                  {opt.label && <span className="text-xl font-bold text-slate-900 break-words">{opt.label}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hint */}
      {!locked && (
        <div className="mt-4">
          {hintShown ? (
            <div className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800">💡 {question.hint}</div>
          ) : (
            <button
              type="button"
              onClick={() => setHintShown(true)}
              className="tab-press flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl text-sm font-semibold text-slate-400"
            >
              💡 Need a hint?
            </button>
          )}
          {onCoachHint && (
            <button
              type="button"
              onClick={onCoachHint}
              className="tab-press mt-1 flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl text-sm font-semibold text-indigo-500"
            >
              🤖 Ask Coach for a hint
            </button>
          )}
        </div>
      )}
    </div>
  );
}
