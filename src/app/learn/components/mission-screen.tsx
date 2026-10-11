"use client";

import type { BlockKind, ThemeScreen } from "@/lib/learn/types";
import { BLOCK_EMOJI, BLOCK_LABEL } from "@/lib/learn/mastery";

export interface KindState {
  kind: BlockKind;
  done: boolean;
}

interface MissionScreenProps {
  screen: ThemeScreen;
  kinds: KindState[];
}

const STAR_LINE: Record<ThemeScreen, string> = {
  diamond: "Run scored — tonight's star! ⭐",
  tutu: "Your pony cleared the jump — tonight's star! ⭐",
  generic: "All three done — tonight's star! ⭐",
};

function state(kinds: KindState[], kind: BlockKind): "done" | "open" | "none" {
  const k = kinds.find((x) => x.kind === kind);
  return !k ? "none" : k.done ? "done" : "open";
}

/** Cole: math is first base, reading second, brain third; all three score a run. */
function Diamond({ kinds }: { kinds: KindState[] }) {
  const all = kinds.length > 0 && kinds.every((k) => k.done);
  // base centers on a 200×200 diamond: home (100,180), 1st (180,100), 2nd (100,20), 3rd (20,100)
  const bases: { kind: BlockKind; x: number; y: number }[] = [
    { kind: "math", x: 172, y: 100 },
    { kind: "reading", x: 100, y: 28 },
    { kind: "brain", x: 28, y: 100 },
  ];
  return (
    <svg viewBox="0 0 200 200" className="h-40 w-40" role="img" aria-label={`Diamond: ${kinds.filter((k) => k.done).length} of ${kinds.length} bases`}>
      <rect x="0" y="0" width="200" height="200" rx="24" fill="#ecfdf5" />
      <polygon points="100,28 172,100 100,172 28,100" fill="#bbf7d0" stroke="#16a34a" strokeWidth="3" />
      <polygon points="100,62 138,100 100,138 62,100" fill="#fde68a" opacity="0.6" />
      {all && <polyline points="100,172 172,100 100,28 28,100 100,172" fill="none" stroke="#f59e0b" strokeWidth="5" strokeLinejoin="round" strokeDasharray="8 6" />}
      <polygon points="92,164 108,164 108,174 100,182 92,174" fill="#ffffff" stroke="#64748b" strokeWidth="2" />
      {bases.map((b) => {
        const st = state(kinds, b.kind);
        return (
          <g key={b.kind}>
            <rect
              x={b.x - 13}
              y={b.y - 13}
              width="26"
              height="26"
              transform={`rotate(45 ${b.x} ${b.y})`}
              fill={st === "done" ? "#16a34a" : st === "open" ? "#ffffff" : "#e2e8f0"}
              stroke={st === "done" ? "#15803d" : "#64748b"}
              strokeWidth="2"
            />
            <text x={b.x} y={b.y + 5} textAnchor="middle" fontSize="14">
              {st === "done" ? "✓" : BLOCK_EMOJI[b.kind]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Lily: three tutu petals (math, reading, brain); all three and her pony clears a jump. */
function Tutu({ kinds }: { kinds: KindState[] }) {
  const all = kinds.length > 0 && kinds.every((k) => k.done);
  const petals: { kind: BlockKind; angle: number }[] = [
    { kind: "math", angle: -90 },
    { kind: "reading", angle: 30 },
    { kind: "brain", angle: 150 },
  ];
  return (
    <svg viewBox="0 0 200 200" className="h-40 w-40" role="img" aria-label={`Tutu: ${kinds.filter((k) => k.done).length} of ${kinds.length} petals`}>
      <rect x="0" y="0" width="200" height="200" rx="24" fill="#fdf2f8" />
      {petals.map((p) => {
        const st = state(kinds, p.kind);
        const rad = (p.angle * Math.PI) / 180;
        const cx = 100 + Math.cos(rad) * 48;
        const cy = 100 + Math.sin(rad) * 48;
        return (
          <g key={p.kind}>
            <ellipse
              cx={cx}
              cy={cy}
              rx="44"
              ry="26"
              transform={`rotate(${p.angle} ${cx} ${cy})`}
              fill={st === "done" ? "#f472b6" : st === "open" ? "#ffffff" : "#f1f5f9"}
              stroke="#db2777"
              strokeWidth="2.5"
            />
            <text x={cx} y={cy + 6} textAnchor="middle" fontSize="16">
              {st === "done" ? "✓" : BLOCK_EMOJI[p.kind]}
            </text>
          </g>
        );
      })}
      <circle cx="100" cy="100" r="22" fill={all ? "#fbbf24" : "#ffffff"} stroke="#db2777" strokeWidth="2.5" />
      <text x="100" y="108" textAnchor="middle" fontSize="22">
        🐴
      </text>
    </svg>
  );
}

/** The night at a glance: three bases / petals / dots and the star when all three are done. */
export default function MissionScreen({ screen, kinds }: MissionScreenProps) {
  const all = kinds.length > 0 && kinds.every((k) => k.done);
  return (
    <div className="flex flex-col items-center">
      {screen === "diamond" ? (
        <Diamond kinds={kinds} />
      ) : screen === "tutu" ? (
        <Tutu kinds={kinds} />
      ) : (
        <div className="flex gap-3" role="img" aria-label={`${kinds.filter((k) => k.done).length} of ${kinds.length} blocks`}>
          {kinds.map((k) => (
            <span key={k.kind} className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl ${k.done ? "bg-emerald-500 text-white" : "bg-slate-100"}`}>
              {k.done ? "✓" : BLOCK_EMOJI[k.kind]}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        {kinds.map((k) => (
          <span key={k.kind} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${k.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {BLOCK_LABEL[k.kind]} {k.done ? "✓" : ""}
          </span>
        ))}
      </div>
      {all && <p className="mt-2 text-center text-sm font-bold text-amber-600">{STAR_LINE[screen]}</p>}
    </div>
  );
}
