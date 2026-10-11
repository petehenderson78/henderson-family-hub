"use client";

import { useState } from "react";
import type { TogetherCard as TogetherCardData } from "@/lib/learn/together";
import { addNote, type LearnNote } from "@/lib/learn/store-notes";

interface TogetherCardProps {
  card: TogetherCardData;
  learnerId: string;
  learnerName: string;
  today: string;
  /** already logged tonight */
  done: boolean;
  onDone: (note: LearnNote) => void;
  onNext?: () => void;
}

/** Optional parent-led 5-minute card. No timer; "Did it" logs a learn_notes row (kind 'together'). */
export default function TogetherCard({ card, learnerId, learnerName, today, done, onDone, onNext }: TogetherCardProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function didIt() {
    setState("saving");
    try {
      const note = await addNote({
        learnerId,
        date: today,
        kind: "together",
        subject: card.subject,
        text: card.title,
        minutes: card.minutes,
        score: null,
        total: null,
        standards: card.standards,
      });
      setState("idle");
      onDone(note);
    } catch {
      setState("error");
    }
  }

  return (
    <div className={`rounded-2xl border p-4 ${done ? "border-emerald-100 bg-emerald-50/60" : "border-amber-100 bg-amber-50/50"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <span className="text-2xl" aria-hidden>
          {card.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-700">Together · {card.minutes} min · optional</span>
          <span className="block text-sm font-bold text-slate-900">{card.title}</span>
          <span className="block text-[11px] font-medium text-slate-400">{card.standards.join(" · ")}</span>
        </span>
        <span className="text-xs font-semibold text-slate-400">{done ? "✓ done" : open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Say this</p>
            <ol className="mt-1 space-y-1.5">
              {card.script.map((line, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-800">
                  <span className="font-bold text-amber-600">{i + 1}.</span>
                  <span>“{line}”</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Listen for</p>
            <p className="mt-1 text-sm text-slate-700">{card.listenFor}</p>
          </div>
          <div className="flex gap-2">
            {!done && (
              <button
                type="button"
                onClick={() => void didIt()}
                disabled={state === "saving"}
                className={`flex min-h-[48px] flex-1 items-center justify-center rounded-xl text-sm font-bold text-white ${state === "error" ? "bg-rose-500" : "bg-emerald-600"} disabled:opacity-60`}
              >
                {state === "saving" ? "Saving…" : state === "error" ? "Couldn't save — retry" : `Did it with ${learnerName} ✓`}
              </button>
            )}
            {onNext && (
              <button type="button" onClick={onNext} className="min-h-[48px] rounded-xl bg-white px-4 text-sm font-bold text-slate-600 border border-slate-200">
                Another card
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
