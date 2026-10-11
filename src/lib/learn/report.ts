/**
 * Evidence pack — pure computations for /learn/parent/report/[slug].
 * Mastery record by standard code, session summary, the auto-written
 * placement paragraph (template text from the numbers, no AI) and CSV.
 *
 * Relative imports only, `import type` for types (Node-importable).
 */

import type { Learner, ProgressMap, SessionRecord, Skill, SkillStatus, Subject } from "./types";
import type { LearnNote } from "./store-notes";
import { MASTERY_MIN_ATTEMPTS, TEST_OUT_ITEMS } from "./mastery";
import { SUBJECT_LABEL, SUBJECT_ORDER } from "./catalog";
import { formatDateStr } from "./stats";

/** One learn_attempts row, reduced to what the report needs (optional columns read defensively). */
export interface AttemptSummary {
  skillId: string;
  mode: string;
  correct: boolean;
  /** 'independent' | 'hint' | 'taught' when the column exists */
  helpLevel?: string | null;
  hintUsed?: boolean | null;
  createdAt: string;
}

export type MasteryMode = "test-out" | "practiced" | "parent-verified" | "—";

export const MASTERY_MODE_LABEL: Record<MasteryMode, string> = {
  "test-out": "Test-out (5/5 pretest)",
  practiced: "Practiced to mastery",
  "parent-verified": "Parent-verified",
  "—": "—",
};

export interface SkillReportRow {
  skill: Skill;
  status: SkillStatus;
  masteredAt: string | null;
  mode: MasteryMode;
  /** independent answers only (no hint / not taught) */
  independentCorrect: number;
  independentTotal: number;
  reviewCorrect: number;
  reviewTotal: number;
  attempts: number;
  lastPracticedAt: string | null;
  /** true when attempt rows were available (else the progress counters were used) */
  fromAttempts: boolean;
}

function isIndependent(a: AttemptSummary): boolean {
  if (a.hintUsed === true) return false;
  return !a.helpLevel || a.helpLevel === "independent";
}

export function buildSkillRows(catalog: Skill[], progressMap: ProgressMap, attempts: AttemptSummary[]): SkillReportRow[] {
  const bySkill = new Map<string, AttemptSummary[]>();
  for (const a of attempts) {
    const list = bySkill.get(a.skillId);
    if (list) list.push(a);
    else bySkill.set(a.skillId, [a]);
  }
  return catalog.map((skill) => {
    const p = progressMap[skill.id];
    const rows = bySkill.get(skill.id) ?? [];
    const status: SkillStatus = p?.status ?? "locked";
    const masteredAt = p?.masteredAt ?? null;
    const fromAttempts = rows.length > 0;

    const learnRows = rows.filter((a) => a.mode !== "review");
    const independent = learnRows.filter(isIndependent);
    const reviewRows = rows.filter((a) => a.mode === "review");
    const testRows = rows.filter((a) => a.mode === "test");

    let mode: MasteryMode = "—";
    if (status === "mastered") {
      if (fromAttempts) {
        const practice = learnRows.length - testRows.length;
        mode = testRows.length >= TEST_OUT_ITEMS && practice < MASTERY_MIN_ATTEMPTS ? "test-out" : "practiced";
      } else if (!p || p.attempts === 0) {
        mode = "parent-verified";
      } else {
        mode = p.attempts <= TEST_OUT_ITEMS ? "test-out" : "practiced";
      }
    }

    return {
      skill,
      status,
      masteredAt,
      mode,
      independentCorrect: fromAttempts ? independent.filter((a) => a.correct).length : (p?.correct ?? 0),
      independentTotal: fromAttempts ? independent.length : (p?.attempts ?? 0),
      reviewCorrect: reviewRows.filter((a) => a.correct).length,
      reviewTotal: reviewRows.length,
      attempts: fromAttempts ? rows.length : (p?.attempts ?? 0),
      lastPracticedAt: p?.lastPracticedAt ?? null,
      fromAttempts,
    };
  });
}

export function groupRowsBySubject(rows: SkillReportRow[]): { subject: Subject; label: string; rows: SkillReportRow[] }[] {
  return SUBJECT_ORDER.map((subject) => ({ subject, label: SUBJECT_LABEL[subject], rows: rows.filter((r) => r.skill.subject === subject) })).filter(
    (g) => g.rows.length > 0
  );
}

export function pct(correct: number, total: number): number | null {
  return total > 0 ? Math.round((100 * correct) / total) : null;
}

export interface SessionsSummary {
  sessions: number;
  daysActive: number;
  minutes: number;
  /** across all block scores, null when nothing was answered */
  avgAccuracy: number | null;
  firstDate: string | null;
  lastDate: string | null;
}

export function sessionsSummary(sessions: SessionRecord[]): SessionsSummary {
  const active = sessions.filter((s) => s.completed || s.minutes > 0 || s.blocks.some((b) => b.done));
  let correct = 0;
  let total = 0;
  for (const s of active) {
    for (const b of s.blocks) {
      if (typeof b.correct === "number" && typeof b.total === "number") {
        correct += b.correct;
        total += b.total;
      }
    }
  }
  const dates = active.map((s) => s.date).sort();
  return {
    sessions: active.length,
    daysActive: new Set(dates).size,
    minutes: active.reduce((sum, s) => sum + (s.minutes || 0), 0),
    avgAccuracy: pct(correct, total),
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
  };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function gradeSpan(skills: Skill[]): string {
  const grades = skills.map((s) => s.grade);
  const lo = Math.min(...grades);
  const hi = Math.max(...grades);
  return lo === hi ? `grade-${lo}` : `grade ${lo}–${hi}`;
}

/**
 * The placement paragraph, written from the numbers:
 * "Since Sep 14, 2026, Cole has completed 12 sessions (310 minutes) and mastered
 *  3 of 4 grade 3–4 math skills, including …"
 */
export function placementSummary(learner: Learner, rows: SkillReportRow[], summary: SessionsSummary, notes: LearnNote[]): string {
  const name = learner.name;
  const sentences: string[] = [];

  const since = summary.firstDate ? `Since ${formatDateStr(summary.firstDate, true)}, ` : "";
  const sessionsText =
    summary.sessions > 0
      ? `${since}${name} has completed ${summary.sessions} session${summary.sessions === 1 ? "" : "s"} (${summary.minutes} minutes${
          summary.avgAccuracy !== null ? `, ${summary.avgAccuracy}% average accuracy` : ""
        })`
      : `${name} has not completed a session in the app yet`;

  const bySubject = groupRowsBySubject(rows).map((g) => {
    const mastered = g.rows.filter((r) => r.status === "mastered");
    const top = mastered
      .slice()
      .sort((a, b) => b.skill.grade - a.skill.grade)
      .slice(0, 3)
      .map((r) => r.skill.title);
    const label = g.label.toLowerCase();
    const span = gradeSpan(g.rows.map((r) => r.skill));
    return mastered.length > 0
      ? `${mastered.length} of ${g.rows.length} ${span} ${label} skills${top.length ? ` (including ${joinNames(top)})` : ""}`
      : `0 of ${g.rows.length} ${span} ${label} skills`;
  });

  sentences.push(`${sessionsText}${bySubject.length ? ` and mastered ${joinNames(bySubject)}` : ""}.`);

  const mastered = rows.filter((r) => r.status === "mastered");
  const testOut = mastered.filter((r) => r.mode === "test-out").length;
  const practiced = mastered.filter((r) => r.mode === "practiced");
  const verified = mastered.filter((r) => r.mode === "parent-verified").length;
  const practicedCorrect = practiced.reduce((s, r) => s + r.independentCorrect, 0);
  const practicedTotal = practiced.reduce((s, r) => s + r.independentTotal, 0);
  const modeParts: string[] = [];
  if (testOut) modeParts.push(`${testOut} compacted with a 5-item test-out`);
  if (practiced.length) {
    const acc = pct(practicedCorrect, practicedTotal);
    modeParts.push(`${practiced.length} practiced to mastery${acc !== null ? ` at ${acc}% independent accuracy` : ""}`);
  }
  if (verified) modeParts.push(`${verified} verified by a parent from book work`);
  if (modeParts.length) sentences.push(`Of the mastered skills, ${joinNames(modeParts)}.`);

  const reviewCorrect = rows.reduce((s, r) => s + r.reviewCorrect, 0);
  const reviewTotal = rows.reduce((s, r) => s + r.reviewTotal, 0);
  if (reviewTotal > 0) sentences.push(`Spaced reviews: ${reviewCorrect} of ${reviewTotal} answered correctly (${pct(reviewCorrect, reviewTotal)}% retention).`);

  const learning = rows.filter((r) => r.status === "learning").map((r) => r.skill.title);
  if (learning.length) sentences.push(`Currently working on ${joinNames(learning.slice(0, 4))}${learning.length > 4 ? ` and ${learning.length - 4} more` : ""}.`);

  if (notes.length) {
    const minutes = notes.reduce((s, n) => s + (n.minutes || 0), 0);
    const books = notes.filter((n) => n.kind === "book").length;
    const homework = notes.filter((n) => n.kind === "homework").length;
    const extra: string[] = [];
    if (books) extra.push(`${books} book-work session${books === 1 ? "" : "s"}`);
    if (homework) extra.push(`${homework} school homework check-in${homework === 1 ? "" : "s"}`);
    sentences.push(`The parent log holds ${notes.length} entr${notes.length === 1 ? "y" : "ies"} (${minutes} minutes)${extra.length ? ` including ${joinNames(extra)}` : ""}.`);
  }

  return sentences.join(" ");
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function skillRowsToCsv(rows: SkillReportRow[]): string {
  const header = [
    "subject",
    "skill_id",
    "skill",
    "grade",
    "standards",
    "status",
    "mastered_on",
    "mode",
    "independent_correct",
    "independent_total",
    "independent_pct",
    "review_correct",
    "review_total",
    "attempts",
    "last_practiced",
  ];
  const lines = rows.map((r) =>
    [
      SUBJECT_LABEL[r.skill.subject],
      r.skill.id,
      r.skill.title,
      r.skill.grade,
      r.skill.standards.join(" "),
      r.status,
      r.masteredAt ? r.masteredAt.slice(0, 10) : "",
      r.mode === "—" ? "" : r.mode,
      r.independentCorrect,
      r.independentTotal,
      pct(r.independentCorrect, r.independentTotal) ?? "",
      r.reviewCorrect,
      r.reviewTotal,
      r.attempts,
      r.lastPracticedAt ? r.lastPracticedAt.slice(0, 10) : "",
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...lines].join("\r\n");
}

export function notesToCsv(notes: LearnNote[]): string {
  const header = ["date", "kind", "subject", "text", "minutes", "score", "total", "standards"];
  const lines = notes.map((n) =>
    [n.date, n.kind, n.subject ?? "", n.text ?? "", n.minutes, n.score ?? "", n.total ?? "", n.standards.join(" ")].map(csvCell).join(",")
  );
  return [header.join(","), ...lines].join("\r\n");
}
