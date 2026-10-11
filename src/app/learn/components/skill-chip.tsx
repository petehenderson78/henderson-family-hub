"use client";

import type { Skill, SkillStatus } from "@/lib/learn/types";

export type ChipStatus = SkillStatus | "due";

const STYLES: Record<ChipStatus, string> = {
  locked: "border-slate-200 bg-slate-50 text-slate-400",
  ready: "border-blue-200 bg-blue-50 text-blue-700",
  learning: "border-amber-200 bg-amber-50 text-amber-700",
  mastered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  due: "border-violet-200 bg-violet-50 text-violet-700",
};

const ICON: Record<ChipStatus, string> = {
  locked: "🔒",
  ready: "✨",
  learning: "📝",
  mastered: "⭐",
  due: "🔁",
};

export const CHIP_LABEL: Record<ChipStatus, string> = {
  locked: "Locked",
  ready: "Ready",
  learning: "Learning",
  mastered: "Mastered",
  due: "Review due",
};

interface SkillChipProps {
  skill: Skill;
  status: ChipStatus;
  selected?: boolean;
  onClick?: () => void;
}

export default function SkillChip({ skill, status, selected = false, onClick }: SkillChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tab-press flex min-h-[56px] w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left ${STYLES[status]} ${
        selected ? "ring-2 ring-indigo-400 ring-offset-1" : ""
      }`}
    >
      <span className="text-lg" aria-hidden>
        {ICON[status]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{skill.kidTitle}</span>
        <span className="block truncate text-[11px] font-medium opacity-70">
          {CHIP_LABEL[status]} · G{skill.grade}
        </span>
      </span>
    </button>
  );
}
