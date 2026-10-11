"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Learner, Skill, SkillProgress } from "@/lib/learn/types";
import { SUBJECT_EMOJI, SUBJECT_LABEL, catalogFor, groupBySubject } from "@/lib/learn/catalog";
import { isReviewDue, mergeProgress, windowAccuracy } from "@/lib/learn/mastery";
import SkillChip, { CHIP_LABEL, type ChipStatus } from "../../components/skill-chip";

interface MapViewProps {
  learner: Learner;
  progressRows: SkillProgress[];
  nowIso: string;
}

export default function MapView({ learner, progressRows, nowIso }: MapViewProps) {
  const router = useRouter();
  const catalog = catalogFor(learner.slug);
  const progressMap = mergeProgress(catalog, progressRows);
  const now = new Date(nowIso);
  const groups = groupBySubject(catalog);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const base = `/learn/${learner.slug}`;

  const chipStatus = (skill: Skill): ChipStatus => {
    const p = progressMap[skill.id];
    return isReviewDue(p, now) ? "due" : p.status;
  };

  const mastered = catalog.filter((s) => progressMap[s.id]?.status === "mastered").length;
  const selected = selectedId ? catalog.find((s) => s.id === selectedId) ?? null : null;
  const selectedProgress = selected ? progressMap[selected.id] : null;
  const selectedStatus = selected ? chipStatus(selected) : null;

  const go = (skill: Skill, mode: "learn" | "review" | "test") => {
    router.push(`${base}/play?skill=${encodeURIComponent(skill.id)}&mode=${mode}`);
  };

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
      <div className="mx-auto max-w-lg px-4 pt-8">
        <Link href={base} className="text-xs font-semibold text-slate-400">
          ← Mission Control
        </Link>
        <div className="mt-3 flex items-end justify-between">
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900">Skill Map 🗺️</h1>
          <p className="text-sm font-semibold text-slate-400">
            ⭐ {mastered}/{catalog.length}
          </p>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["ready", "learning", "mastered", "due", "locked"] as ChipStatus[]).map((s) => (
            <span key={s} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 border border-slate-100">
              {CHIP_LABEL[s]}
            </span>
          ))}
        </div>

        {groups.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white/50 p-6 text-center text-sm text-slate-400">No skills in this track yet.</div>
        )}

        {groups.map((g) => (
          <section key={g.subject} className="mt-6">
            <h2 className="mb-2.5 flex items-center gap-2 text-base font-bold text-slate-900">
              <span aria-hidden>{SUBJECT_EMOJI[g.subject]}</span>
              {SUBJECT_LABEL[g.subject]}
              <span className="text-xs font-semibold text-slate-400">
                {g.skills.filter((s) => progressMap[s.id]?.status === "mastered").length}/{g.skills.length}
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {g.skills.map((skill) => (
                <SkillChip
                  key={skill.id}
                  skill={skill}
                  status={chipStatus(skill)}
                  selected={selectedId === skill.id}
                  onClick={() => setSelectedId(selectedId === skill.id ? null : skill.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Detail sheet */}
      {selected && selectedProgress && selectedStatus && (
        <div className="fixed inset-x-0 z-40 animate-slide-up" style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}>
          <div className="mx-auto max-w-lg px-4 pb-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-bold text-slate-900">{selected.kidTitle}</p>
                  <p className="text-xs font-medium text-slate-400">
                    {selected.title} · Grade {selected.grade} · {selected.standards.join(", ")}
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedId(null)} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-label="Close">
                  ✕
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Status</p>
                  <p className="text-sm font-bold text-slate-800">{CHIP_LABEL[selectedStatus]}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tries</p>
                  <p className="text-sm font-bold text-slate-800">{selectedProgress.attempts}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Last 10</p>
                  <p className="text-sm font-bold text-slate-800">{selectedProgress.window.length ? `${Math.round(windowAccuracy(selectedProgress.window) * 100)}%` : "—"}</p>
                </div>
              </div>

              {selectedStatus === "locked" ? (
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                  🔒 Unlock by mastering:{" "}
                  {selected.prereqs
                    .map((id) => catalog.find((s) => s.id === id)?.kidTitle ?? id)
                    .join(", ")}
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => go(selected, selectedStatus === "mastered" || selectedStatus === "due" ? "review" : "learn")}
                    className="flex min-h-[56px] items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-bold text-white shadow-lg shadow-blue-500/20"
                  >
                    {selectedStatus === "due" ? "Review now 🔁" : selectedStatus === "mastered" ? "Practice ⭐" : "Practice 📚"}
                  </button>
                  {selectedStatus === "ready" && selected.testOut ? (
                    <button
                      type="button"
                      onClick={() => go(selected, "test")}
                      className="flex min-h-[56px] items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-base font-bold text-white shadow-lg shadow-indigo-500/20"
                    >
                      Test out ⚡
                    </button>
                  ) : (
                    <div className="flex items-center justify-center rounded-2xl bg-slate-50 px-3 text-center text-xs font-medium text-slate-500">
                      {selected.parentTip}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
