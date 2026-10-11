"use client";

interface KeypadProps {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  canSubmit?: boolean;
  allowNegative?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Large digits, a backspace, and an explicit Go button (no auto-submit). */
export default function Keypad({ onDigit, onBackspace, onSubmit, disabled = false, canSubmit = true, allowNegative = false }: KeypadProps) {
  const base = "tab-press flex min-h-[64px] items-center justify-center rounded-2xl text-3xl font-bold select-none disabled:opacity-40";
  const digit = `${base} border border-slate-200 bg-white text-slate-900 shadow-sm active:bg-slate-50`;
  const tool = `${base} border border-slate-200 bg-slate-50 text-slate-500 active:bg-slate-100`;
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Number keypad">
      {KEYS.map((k) => (
        <button key={k} type="button" disabled={disabled} onClick={() => onDigit(k)} className={digit}>
          {k}
        </button>
      ))}
      {allowNegative ? (
        <button type="button" disabled={disabled} onClick={() => onDigit("-")} className={tool} aria-label="Minus">
          −
        </button>
      ) : (
        <span aria-hidden />
      )}
      <button type="button" disabled={disabled} onClick={() => onDigit("0")} className={digit}>
        0
      </button>
      <button type="button" disabled={disabled} onClick={onBackspace} className={tool} aria-label="Backspace">
        ⌫
      </button>
      <button
        type="button"
        disabled={disabled || !canSubmit}
        onClick={onSubmit}
        className={`${base} col-span-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-2xl text-white shadow-lg shadow-blue-500/20`}
        aria-label="Go — check my answer"
      >
        Go ✓
      </button>
    </div>
  );
}
