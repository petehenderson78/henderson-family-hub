"use client";

import { useState } from "react";
import SpeakButton from "./speak-button";

interface TilesInputProps {
  /** tiles offered (already shuffled by the generator; may include distractors) */
  tiles: string[];
  /** number of answer slots */
  slots: number;
  disabled?: boolean;
  /** once answered: lock and tint */
  answered?: { raw: string; correct: boolean } | null;
  /** called with the slots joined without separators */
  onSubmit: (answer: string) => void;
  /** read the tile aloud when tapped (letters / sounds) */
  speakTiles?: boolean;
}

/**
 * Tap a tile to drop it into the next empty slot; tap a filled slot to send
 * the tile back. Big targets (64px). An explicit Go button submits.
 */
export default function TilesInput({ tiles, slots, disabled = false, answered = null, onSubmit, speakTiles = false }: TilesInputProps) {
  // placed[i] = index into `tiles` sitting in slot i (null = empty)
  const [placed, setPlaced] = useState<(number | null)[]>(() => Array.from({ length: slots }, () => null));
  const locked = disabled || !!answered;
  const used = new Set(placed.filter((v): v is number => v !== null));
  const full = placed.every((v) => v !== null);
  const value = placed.map((v) => (v === null ? "" : tiles[v])).join("");

  function placeTile(i: number) {
    if (locked || used.has(i)) return;
    setPlaced((p) => {
      const slot = p.indexOf(null);
      if (slot < 0) return p;
      const next = p.slice();
      next[slot] = i;
      return next;
    });
  }

  function clearSlot(slot: number) {
    if (locked) return;
    setPlaced((p) => {
      if (p[slot] === null) return p;
      const next = p.slice();
      next[slot] = null;
      return next;
    });
  }

  const slotTone = answered
    ? answered.correct
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : "border-rose-300 bg-rose-50 text-rose-700 animate-shake"
    : "border-slate-300 bg-slate-50 text-slate-900";

  return (
    <div>
      {/* Slots */}
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Answer boxes">
        {placed.map((v, slot) => (
          <button
            key={slot}
            type="button"
            disabled={locked || v === null}
            onClick={() => clearSlot(slot)}
            aria-label={v === null ? `Box ${slot + 1}, empty` : `Box ${slot + 1}: ${tiles[v]} — tap to remove`}
            className={`flex h-16 min-w-16 items-center justify-center rounded-2xl border-2 border-dashed px-3 text-3xl font-bold ${slotTone} ${
              v === null ? "" : "border-solid shadow-sm"
            }`}
          >
            {v === null ? <span className="text-slate-300">·</span> : tiles[v]}
          </button>
        ))}
      </div>

      {/* Tiles */}
      <div className={`mt-4 flex flex-wrap justify-center ${speakTiles ? "gap-x-4 gap-y-3" : "gap-2"}`} role="group" aria-label="Tiles">
        {tiles.map((t, i) => {
          const isUsed = used.has(i);
          return (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                disabled={locked || isUsed}
                onClick={() => placeTile(i)}
                aria-label={isUsed ? `${t} (placed)` : `Tile ${t}`}
                className={`tab-press flex h-16 min-w-16 items-center justify-center rounded-2xl border-2 px-3 text-3xl font-bold shadow-sm ${
                  isUsed ? "border-slate-100 bg-slate-100 text-slate-300" : "border-indigo-200 bg-white text-indigo-900 active:bg-indigo-50"
                }`}
              >
                {t}
              </button>
              {/* 44px speaker, 8px from the tile, so aiming for it never drops the tile */}
              {speakTiles && !isUsed && !locked && <SpeakButton text={t} className="flex-shrink-0" />}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={locked || !full}
        onClick={() => onSubmit(value)}
        className="mt-4 flex min-h-[64px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-2xl font-bold text-white shadow-lg shadow-blue-500/20 disabled:opacity-40"
      >
        Go ✓
      </button>
    </div>
  );
}
