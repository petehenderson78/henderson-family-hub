"use client";

import { useEffect, useRef, useState } from "react";

interface HoldToConfirmProps {
  label: string;
  /** label while holding */
  holdingLabel?: string;
  holdMs?: number;
  disabled?: boolean;
  onConfirm: () => void;
  className?: string;
}

/**
 * A big button that only fires after being held for `holdMs` (default 1.5 s).
 * Used for the "Parent: hold to confirm" step so a kid cannot redeem by tapping.
 */
export default function HoldToConfirm({ label, holdingLabel = "Keep holding…", holdMs = 1500, disabled = false, onConfirm, className = "" }: HoldToConfirmProps) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);
  const start = useRef(0);
  const fired = useRef(false);

  function stop() {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    setProgress(0);
  }

  function begin() {
    if (disabled || timer.current !== null) return;
    fired.current = false;
    start.current = performance.now();
    timer.current = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - start.current) / holdMs);
      setProgress(p);
      if (p >= 1 && !fired.current) {
        fired.current = true;
        stop();
        onConfirm();
      }
    }, 40);
  }

  useEffect(() => stop, []);

  const holding = progress > 0;
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}
      className={`relative flex min-h-[56px] w-full select-none items-center justify-center overflow-hidden rounded-2xl bg-slate-900 text-base font-bold text-white disabled:opacity-40 ${className}`}
    >
      <span className="absolute inset-y-0 left-0 bg-emerald-500/80" style={{ width: `${progress * 100}%`, transition: holding ? "none" : "width 200ms" }} aria-hidden />
      <span className="relative">{holding ? holdingLabel : label}</span>
    </button>
  );
}
