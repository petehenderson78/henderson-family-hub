"use client";

import Link from "next/link";
import type { Learner } from "@/lib/learn/types";
import { formatDateStr } from "@/lib/learn/stats";
import { NOTE_KIND_LABEL, type LearnNote } from "@/lib/learn/store-notes";
import { evidenceNotes, familyDay, groupRowsBySubject, MASTERY_MODE_LABEL, notesToCsv, pct, skillRowsToCsv, type SessionsSummary, type SkillReportRow } from "@/lib/learn/report";

interface ReportViewProps {
  learner: Learner;
  rows: SkillReportRow[];
  summary: SessionsSummary;
  paragraph: string;
  notes: LearnNote[];
  today: string;
}

const STATUS_WORD: Record<SkillReportRow["status"], string> = {
  locked: "Not started",
  ready: "Ready",
  learning: "In progress",
  mastered: "Mastered",
};

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // iPad / iPhone Safari reads the blob only after the download prompt is answered: keep the URL alive for a minute.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A timestamp as a family-timezone date (an evening session is not dated the next UTC day). */
function day(iso: string | null): string {
  const d = familyDay(iso);
  return d ? formatDateStr(d, true) : "—";
}

export default function ReportView({ learner, rows, summary, paragraph, notes: allNotes, today }: ReportViewProps) {
  const notes = evidenceNotes(allNotes);
  const groups = groupRowsBySubject(rows);
  const mastered = rows.filter((r) => r.status === "mastered").length;
  const stamp = today.replace(/-/g, "");

  return (
    <div className="print-root min-h-[100dvh] bg-[#F8FAFC] pb-28 print:bg-white print:pb-0">
      <div className="mx-auto max-w-3xl px-4 pt-8 print:max-w-none print:px-0 print:pt-0">
        <div className="no-print flex items-center justify-between">
          <Link href="/learn/parent" className="-ml-2 inline-flex min-h-[44px] items-center px-2 text-xs font-semibold text-slate-400">
            ← Parent view
          </Link>
          <div className="flex gap-2">
            <button type="button" onClick={() => downloadCsv(`${learner.slug}-skills-${stamp}.csv`, skillRowsToCsv(rows))} className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700">
              ⬇ Skills CSV
            </button>
            <button type="button" onClick={() => downloadCsv(`${learner.slug}-log-${stamp}.csv`, notesToCsv(notes))} className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700">
              ⬇ Log CSV
            </button>
            <button type="button" onClick={() => window.print()} className="min-h-[44px] rounded-xl bg-slate-900 px-4 text-xs font-bold text-white">
              🖨 Print
            </button>
          </div>
        </div>

        {/* Title block */}
        <header className="mt-4 print:mt-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Learning evidence record</p>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900">
            {learner.name} · grade {learner.grade}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Generated {formatDateStr(today, true)} · Henderson Family Hub · Learn module. Standards are NJSLS / CCSS codes. &ldquo;Independent&rdquo; is first-try correct
            answers without a hint or teaching, out of every scored item (a hinted or taught answer counts as a miss).
          </p>
        </header>

        {/* Placement summary */}
        <section className="print-avoid-break mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Placement summary</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-800">{paragraph}</p>
          <p className="mt-2 text-[11px] text-slate-400">Written from the numbers below; no AI involved.</p>
        </section>

        {/* Sessions summary */}
        <section className="print-avoid-break mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Sessions", String(summary.sessions)],
            ["Days active", String(summary.daysActive)],
            ["Minutes", String(summary.minutes)],
            ["Avg accuracy", summary.avgAccuracy === null ? "—" : `${summary.avgAccuracy}%`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm print:rounded-none print:shadow-none">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
            </div>
          ))}
          <p className="col-span-2 text-xs text-slate-400 sm:col-span-4">
            {summary.firstDate ? `First session ${formatDateStr(summary.firstDate, true)} · latest ${formatDateStr(summary.lastDate ?? summary.firstDate, true)}` : "No app sessions yet."} ·{" "}
            {mastered} of {rows.length} skills mastered.
          </p>
        </section>

        {/* Skill table by subject */}
        {groups.map((g, gi) => (
          <section key={g.subject} className={`mt-6 ${gi > 0 ? "print-break" : ""}`}>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              {g.label}
              <span className="ml-2 text-xs font-semibold text-slate-400">
                {g.rows.filter((r) => r.status === "mastered").length}/{g.rows.length} mastered
              </span>
            </h2>
            <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm print:overflow-visible print:rounded-none print:shadow-none">
              <table className="w-full min-w-[640px] text-left text-xs print:min-w-0">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-400 print:bg-white">
                  <tr>
                    <th className="px-3 py-2">Skill</th>
                    <th className="px-3 py-2">Standards</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Mastered</th>
                    <th className="px-3 py-2">How</th>
                    <th className="px-3 py-2 text-right">Independent</th>
                    <th className="px-3 py-2 text-right">Reviews</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {g.rows.map((r) => {
                    const ind = pct(r.independentCorrect, r.independentTotal);
                    const rev = pct(r.reviewCorrect, r.reviewTotal);
                    return (
                      <tr key={r.skill.id} className="print-avoid-break align-top">
                        <td className="px-3 py-2">
                          <p className="font-semibold text-slate-900">{r.skill.title}</p>
                          <p className="text-[10px] text-slate-400">
                            G{r.skill.grade} · {r.skill.id}
                          </p>
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-700">{r.skill.standards.join(", ")}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              r.status === "mastered" ? "bg-emerald-100 text-emerald-700" : r.status === "learning" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                            } print:bg-transparent print:px-0`}
                          >
                            {STATUS_WORD[r.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-slate-700">{day(r.masteredAt)}</td>
                        <td className="px-3 py-2 text-slate-700">{MASTERY_MODE_LABEL[r.mode]}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {r.independentTotal > 0 ? (
                            <>
                              {ind}% <span className="text-slate-400">({r.independentCorrect}/{r.independentTotal})</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {r.reviewTotal > 0 ? (
                            <>
                              {rev}% <span className="text-slate-400">({r.reviewCorrect}/{r.reviewTotal})</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {g.rows.some((r) => !r.fromAttempts && r.attempts > 0) && <p className="mt-1 text-[10px] text-slate-400">Rows without attempt history use the skill&apos;s running counters.</p>}
          </section>
        ))}

        {/* Parent log */}
        <section className="print-break mt-6">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            Parent log
            <span className="ml-2 text-xs font-semibold text-slate-400">
              {notes.length} entr{notes.length === 1 ? "y" : "ies"} · {notes.reduce((s, n) => s + n.minutes, 0)} min
            </span>
          </h2>
          <p className="mt-1 text-xs text-slate-400">Book pages, school homework, read-alouds and Together cards logged by a parent (outside the app&apos;s timed blocks).</p>
          {notes.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">Nothing logged yet.</p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm print:overflow-visible print:rounded-none print:shadow-none">
              <table className="w-full min-w-[560px] text-left text-xs print:min-w-0">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-400 print:bg-white">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">What</th>
                    <th className="px-3 py-2 text-right">Min</th>
                    <th className="px-3 py-2 text-right">Score</th>
                    <th className="px-3 py-2">Standards</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {notes.map((n) => (
                    <tr key={n.id ?? `${n.date}-${n.createdAt}`} className="print-avoid-break align-top">
                      <td className="px-3 py-2 tabular-nums text-slate-700">{formatDateStr(n.date)}</td>
                      <td className="px-3 py-2 text-slate-700">{NOTE_KIND_LABEL[n.kind]}</td>
                      <td className="px-3 py-2 text-slate-700">{n.subject ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-900">{n.text ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{n.minutes}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{typeof n.score === "number" && typeof n.total === "number" ? `${n.score}/${n.total}` : "—"}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-700">{n.standards.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-8 text-center text-[11px] text-slate-400 print:mt-4">
          Mastery rule: ≥ 10 attempts, ≥ 90% over the last 10, streak ≥ 3 — independent answers only. Test-out: a 10-item skip check at ≥ 9/10, or a placement
          probe (5/5, or 9/10 over two). Parent-verified: marked mastered by a parent from book work, without an app test-out or enough app practice. Reviews
          spaced at 1 / 3 / 7 / 14 / 30 / 60 days.
        </p>
      </div>
    </div>
  );
}
