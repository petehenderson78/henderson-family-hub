"use client";

import { useState } from "react";
import { addNote, LOGGABLE_NOTE_KINDS, NOTE_KIND_LABEL, parseStandards, type LearnNote, type NoteKind } from "@/lib/learn/store-notes";

export interface LogBookLearner {
  id: string;
  name: string;
  slug: string;
}

interface LogBookFormProps {
  learners: LogBookLearner[];
  /** YYYY-MM-DD in the family timezone */
  today: string;
  defaultLearnerId?: string;
  defaultKind?: NoteKind;
  onSaved?: (note: LearnNote) => void;
  title?: string;
}

const SUBJECTS = ["math", "reading", "phonics", "writing", "reasoning", "other"] as const;

/**
 * "Log book work": the family's physical books, school sheets and read-alouds
 * become learn_notes rows (the evidence pack reads them). INSERT-only.
 */
export default function LogBookForm({ learners, today, defaultLearnerId, defaultKind = "book", onSaved, title = "Log book work" }: LogBookFormProps) {
  const [learnerId, setLearnerId] = useState(defaultLearnerId ?? learners[0]?.id ?? "");
  const [kind, setKind] = useState<NoteKind>(defaultKind);
  const [subject, setSubject] = useState<string>("math");
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState(10);
  const [score, setScore] = useState("");
  const [total, setTotal] = useState("");
  const [standards, setStandards] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const field = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none focus:border-indigo-400";
  const canSave = learnerId && (text.trim().length > 0 || kind !== "other") && state !== "saving";

  async function save() {
    if (!canSave) return;
    setState("saving");
    const scoreNum = score.trim() === "" ? null : Number.parseInt(score, 10);
    const totalNum = total.trim() === "" ? null : Number.parseInt(total, 10);
    try {
      const saved = await addNote({
        learnerId,
        date: today,
        kind,
        subject,
        text: text.trim() || NOTE_KIND_LABEL[kind],
        minutes,
        score: scoreNum !== null && Number.isFinite(scoreNum) ? scoreNum : null,
        total: totalNum !== null && Number.isFinite(totalNum) ? totalNum : null,
        standards: parseStandards(standards),
      });
      setState("saved");
      setText("");
      setScore("");
      setTotal("");
      setStandards("");
      onSaved?.(saved);
    } catch {
      setState("error");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">📓 {title}</p>
      <p className="mt-0.5 text-xs text-slate-400">Book pages, school sheets, read-alouds — anything done off the iPad. Goes on the evidence report.</p>

      {learners.length > 1 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {learners.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setLearnerId(l.id);
                setState("idle");
              }}
              className={`min-h-[44px] rounded-xl text-sm font-bold ${learnerId === l.id ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-600"}`}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as NoteKind)} className={field}>
            {LOGGABLE_NOTE_KINDS.map((k) => (
              <option key={k} value={k}>
                {NOTE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Subject</span>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className={field}>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-2 block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Book / page / what you did</span>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setState("idle");
          }}
          placeholder="Grade 4 Math pp.36–37, 4 problems"
          maxLength={500}
          className={field}
        />
      </label>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Minutes</span>
          <input type="number" inputMode="numeric" min={0} max={600} value={minutes} onChange={(e) => setMinutes(Math.max(0, Number.parseInt(e.target.value || "0", 10) || 0))} className={`${field} text-center`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Score</span>
          <input type="number" inputMode="numeric" min={0} value={score} onChange={(e) => setScore(e.target.value)} placeholder="—" className={`${field} text-center`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Out of</span>
          <input type="number" inputMode="numeric" min={0} value={total} onChange={(e) => setTotal(e.target.value)} placeholder="—" className={`${field} text-center`} />
        </label>
      </div>

      <label className="mt-2 block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Standards (optional)</span>
        <input value={standards} onChange={(e) => setStandards(e.target.value)} placeholder="4.NBT.B.5, 4.NBT.B.6" className={field} />
      </label>

      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        className={`mt-3 flex min-h-[52px] w-full items-center justify-center rounded-xl text-sm font-bold ${
          state === "saved" ? "bg-emerald-500 text-white" : state === "error" ? "bg-rose-500 text-white" : "bg-slate-900 text-white"
        } disabled:opacity-40`}
      >
        {state === "saving" ? "Saving…" : state === "saved" ? "Logged ✓ — log another" : state === "error" ? "Couldn't save — tap to retry" : "Log it"}
      </button>
    </div>
  );
}
