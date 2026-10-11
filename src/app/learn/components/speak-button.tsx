"use client";

import { useState } from "react";
import { useMounted } from "./use-mounted";

interface SpeakButtonProps {
  text: string;
  className?: string;
  label?: string;
}

/** Reads `text` aloud with the Web Speech API (en-US, rate 0.9). Renders nothing when unsupported. */
export default function SpeakButton({ text, className = "", label }: SpeakButtonProps) {
  const mounted = useMounted();
  const [speaking, setSpeaking] = useState(false);
  const supported = mounted && typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  if (!supported) return null;

  function speak() {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 0.9;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      synth.speak(u);
    } catch {
      setSpeaking(false);
    }
  }

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={label ?? "Read aloud"}
      className={`tab-press inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 text-base ${
        speaking ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
      } ${className}`}
    >
      🔊{label ? <span className="text-xs font-semibold">{label}</span> : null}
    </button>
  );
}
