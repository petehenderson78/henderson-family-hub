/**
 * Server-side loaders for the Parent view (server components only — uses
 * next/headers cookies through the Supabase server client).
 *
 * Same error contract as ./server: a database error or an unreachable
 * database THROWS LearnLoadError, and the page answers with
 * learnLoadErrorPage(). An empty result with no error is empty data. Reads
 * that can pass PostgREST's 1000-row cap are paged (selectAllPages).
 */

import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { selectAllPages } from "./rows";
import { addDaysToDateStr, familyMidnightIso } from "./dates";
import { LearnLoadError } from "./server";
import type { AttemptSummary } from "./report";

/**
 * Family days of attempts the Sunday review reads: its 7-day window, the 7
 * days before it (the "over 95% two weeks running" test) and the 30-day count
 * of blocks that ended after the stop time (stats.ts sundayReview).
 */
export const SUNDAY_REVIEW_ATTEMPT_DAYS = 30;

async function guarded<T>(what: string, body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } catch (e) {
    if (e instanceof LearnLoadError) throw e;
    unstable_rethrow(e);
    throw new LearnLoadError(what, { message: e instanceof Error ? e.message : String(e) });
  }
}

function attemptFromRowServer(row: Record<string, unknown>): AttemptSummary {
  return {
    skillId: String(row.skill_id ?? ""),
    mode: typeof row.mode === "string" ? row.mode : "learn",
    correct: row.correct === true,
    helpLevel: typeof row.help_level === "string" ? row.help_level : null,
    hintUsed: typeof row.hint_used === "boolean" ? row.hint_used : null,
    ms: typeof row.ms === "number" ? row.ms : null,
    questionType: typeof row.qtype === "string" ? row.qtype : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
  };
}

/**
 * Every attempt logged from local midnight (family timezone) of `fromDate`
 * onward, newest first, paged past 1000 rows. The optional columns
 * (help_level, hint_used, ms, question type) are read when they exist; a
 * database without them is read with the base columns. Throws LearnLoadError.
 */
export async function loadAttemptsSinceServer(learnerId: string, fromDate: string): Promise<AttemptSummary[]> {
  return guarded("loadAttemptsSince", async () => {
    const supabase = await createClient();
    const since = familyMidnightIso(fromDate);
    let result = await selectAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from("learn_attempts")
        .select("skill_id, mode, correct, created_at, help_level, hint_used, ms, qtype:question->>type")
        .eq("learner_id", learnerId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    );
    if (result.error && new LearnLoadError("loadAttemptsSince", result.error).kind === "setup") {
      result = await selectAllPages<Record<string, unknown>>((from, to) =>
        supabase
          .from("learn_attempts")
          .select("skill_id, mode, correct, created_at")
          .eq("learner_id", learnerId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to)
      );
    }
    if (result.error) throw new LearnLoadError("loadAttemptsSince", result.error);
    return result.data.map(attemptFromRowServer);
  });
}

/**
 * The attempts sundayReview() needs for `today`: the last
 * SUNDAY_REVIEW_ATTEMPT_DAYS family days, today included. Throws LearnLoadError.
 */
export async function loadSundayReviewAttemptsServer(learnerId: string, today: string): Promise<AttemptSummary[]> {
  return loadAttemptsSinceServer(learnerId, addDaysToDateStr(today, -(SUNDAY_REVIEW_ATTEMPT_DAYS - 1)));
}
