"use client";

import { useEffect, useState } from "react";
import { useMounted } from "./use-mounted";

/**
 * Web Speech helpers shared by the player. The utterance is kept in a module
 * ref (Chrome garbage-collects un-referenced utterances mid-sentence), every
 * speak() cancels what is playing first, and nothing here ever receives the
 * answer: callers pass prompts, options, hints and feedback only.
 */

let current: SpeechSynthesisUtterance | null = null;

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

/**
 * Speak `text` now. Must be called synchronously inside a user gesture on iOS
 * (the player calls it from the tap that advances to the next item, before any
 * state update). Returns false when unsupported.
 */
export function speakNow(text: string, onDone?: () => void): boolean {
  if (!speechSupported()) return false;
  const clean = text.trim();
  if (!clean) return false;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "en-US";
    u.rate = 0.9;
    u.onend = () => {
      if (current === u) current = null;
      onDone?.();
    };
    u.onerror = () => {
      if (current === u) current = null;
      onDone?.();
    };
    current = u;
    synth.speak(u);
    return true;
  } catch {
    current = null;
    onDone?.();
    return false;
  }
}

export function stopSpeaking(): void {
  if (!speechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
  current = null;
}

interface SpeakButtonProps {
  text: string;
  className?: string;
  label?: string;
  /** compact 36px circle for inline use next to options */
  small?: boolean;
}

/** Reads `text` aloud (en-US, rate 0.9). Renders nothing until mounted and only when supported. */
export default function SpeakButton({ text, className = "", label, small = false }: SpeakButtonProps) {
  const mounted = useMounted();
  const [speaking, setSpeaking] = useState(false);
  const supported = mounted && speechSupported();

  // Stop the highlight if the page is left mid-sentence.
  useEffect(() => () => setSpeaking(false), []);

  if (!supported) return null;

  function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    setSpeaking(true);
    if (!speakNow(text, () => setSpeaking(false))) setSpeaking(false);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? "Read aloud"}
      aria-pressed={speaking}
      className={`tab-press inline-flex items-center justify-center gap-1 rounded-full ${
        small ? "h-9 min-w-9 px-2 text-sm" : "h-11 min-w-11 px-3 text-base"
      } ${speaking ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"} ${className}`}
    >
      🔊{label ? <span className="text-xs font-semibold">{label}</span> : null}
    </button>
  );
}
