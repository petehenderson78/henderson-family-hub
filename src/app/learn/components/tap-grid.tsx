"use client";

import { useState } from "react";
import type { TapQuestion } from "@/lib/learn/types";

interface TapGridProps {
  rows: number;
  cols: number;
  /** cell indexes (row-major) that are pre-filled and locked */
  fixed?: number[];
  variant?: TapQuestion["variant"];
  disabled?: boolean;
  answered?: { raw: string; correct: boolean } | null;
  /** called with the number of cells the child selected (fixed cells excluded) */
  onSubmit: (count: number) => void;
}

/**
 * Tap cells in a CSS grid (no SVG) to show a quantity. Fixed cells are shown
 * filled and cannot be toggled; the answer is the count of selected cells.
 */
export default function TapGrid({ rows, cols, fixed = [], variant = "plain", disabled = false, answered = null, onSubmit }: TapGridProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const locked = disabled || !!answered;
  const fixedSet = new Set(fixed);
  const total = Math.max(0, rows) * Math.max(0, cols);
  const count = selected.size;

  function toggle(i: number) {
    if (locked || fixedSet.has(i)) return;
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const small = variant === "hundred-grid" || total > 40;
  const bar = variant === "fraction-bar";
  const cellSize = small ? "h-7 w-7" : bar ? "h-16 min-w-10 flex-1" : "h-14 w-14";
  const shape = variant === "ten-frame" || variant === "array" ? "rounded-full" : "rounded-md";
  const gap = small ? "gap-0.5" : bar ? "gap-1" : "gap-2";
  const frame = variant === "ten-frame" ? "rounded-2xl border-2 border-slate-400 p-2" : variant === "hundred-grid" ? "rounded-lg border border-slate-300 p-1" : "";
  const tone = answered ? (answered.correct ? "ring-2 ring-emerald-300" : "ring-2 ring-rose-300 animate-shake") : "";

  return (
    <div>
      <div
        className={`mx-auto grid w-fit max-w-full ${gap} ${frame} ${tone}`}
        style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, auto))` }}
        role="group"
        aria-label={`${rows} by ${cols} grid, ${count} selected`}
      >
        {Array.from({ length: total }, (_, i) => {
          const isFixed = fixedSet.has(i);
          const on = isFixed || selected.has(i);
          const r = Math.floor(i / cols) + 1;
          const c = (i % cols) + 1;
          return (
            <button
              key={i}
              type="button"
              disabled={locked || isFixed}
              onClick={() => toggle(i)}
              aria-pressed={on}
              aria-label={isFixed ? `Row ${r} column ${c}, already filled` : `Row ${r} column ${c}${on ? ", selected" : ""}`}
              className={`tab-press flex items-center justify-center border-2 ${cellSize} ${shape} ${
                isFixed
                  ? "border-slate-500 bg-slate-500"
                  : on
                    ? "border-indigo-600 bg-indigo-500"
                    : "border-slate-300 bg-white active:bg-indigo-50"
              } ${bar ? "" : ""}`}
            />
          );
        })}
      </div>

      <p className="mt-3 text-center text-sm font-semibold text-slate-500">
        {count === 0 ? "Tap the squares to fill them in" : `${count} filled in`}
      </p>

      <button
        type="button"
        disabled={locked}
        onClick={() => onSubmit(count)}
        className="mt-3 flex min-h-[64px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-2xl font-bold text-white shadow-lg shadow-blue-500/20 disabled:opacity-40"
      >
        Go ✓
      </button>
    </div>
  );
}
