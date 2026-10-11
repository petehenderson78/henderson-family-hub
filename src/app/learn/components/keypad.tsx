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

export default function Keypad({ onDigit, onBackspace, onSubmit, disabled = false, canSubmit = true, allowNegative = false }: KeypadProps) {
  const base =
    "tab-press flex min-h-[56px] items-center justify-center rounded-2xl text-2xl font-bold select-none disabled:opacity-40";
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <button key={k} type="button" disabled={disabled} onClick={() => onDigit(k)} className={`${base} border border-slate-200 bg-white text-slate-900 shadow-sm active:bg-slate-50`}>
          {k}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={() => (allowNegative ? onDigit("-") : onBackspace())}
        className={`${base} border border-slate-200 bg-slate-50 text-slate-500 active:bg-slate-100`}
        aria-label={allowNegative ? "Minus" : "Backspace"}
      >
        {allowNegative ? "−" : "⌫"}
      </button>
      <button type="button" disabled={disabled} onClick={() => onDigit("0")} className={`${base} border border-slate-200 bg-white text-slate-900 shadow-sm active:bg-slate-50`}>
        0
      </button>
      {allowNegative ? (
        <button type="button" disabled={disabled} onClick={onBackspace} className={`${base} border border-slate-200 bg-slate-50 text-slate-500 active:bg-slate-100`} aria-label="Backspace">
          ⌫
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled || !canSubmit}
          onClick={onSubmit}
          className={`${base} bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20`}
          aria-label="Check answer"
        >
          ✓
        </button>
      )}
      {allowNegative && (
        <button
          type="button"
          disabled={disabled || !canSubmit}
          onClick={onSubmit}
          className={`${base} col-span-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20`}
        >
          Check ✓
        </button>
      )}
    </div>
  );
}
