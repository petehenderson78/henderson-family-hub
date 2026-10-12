import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import {
  kidSlugForLoginServer,
  learnLoadErrorPage,
  loadAttemptsServer,
  loadLearnerServer,
  loadNotesServer,
  loadProgressServer,
  loadRecentSessionsServer,
} from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { catalogFor } from "@/lib/learn/catalog";
import { mergeProgress } from "@/lib/learn/mastery";
import { buildSkillRows, placementSummary, sessionsSummary } from "@/lib/learn/report";
import ReportView from "./report-view";

export const dynamic = "force-dynamic";

/**
 * Attempt rows read for the pack. The "How" column replays the rows that led to
 * each mastery, so they must all be here: a year of evenings is about 24,000
 * rows, past loadAttemptsServer's default cap of 20,000 (a capped read would
 * drop the oldest learn rows and label a practiced skill "Parent-verified").
 */
const REPORT_ATTEMPT_CAP = 100_000;

/** The evidence pack: printable mastery record by standard, parent log, sessions, placement summary, CSV. Parents only. */
export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { slug } = await params;
  const here = `/learn/parent/report/${encodeURIComponent(slug)}`;
  let kidSlug: string | null;
  try {
    kidSlug = await kidSlugForLoginServer(user.email);
  } catch (e) {
    return learnLoadErrorPage(e, here);
  }
  if (kidSlug) redirect(`/learn/${kidSlug}`);

  // A pack printed for the school must not silently miss rows: any failed read → retry card.
  const today = todayInFamilyTz();
  const load = async () => {
    const learner = await loadLearnerServer(slug);
    if (!learner) return null;
    const [progressRows, sessions, notes, attempts] = await Promise.all([
      loadProgressServer(learner.id),
      loadRecentSessionsServer(learner.id, 365, today),
      loadNotesServer(learner.id, "2020-01-01", today),
      loadAttemptsServer(learner.id, REPORT_ATTEMPT_CAP),
    ]);
    return { learner, progressRows, sessions, notes, attempts };
  };
  let loaded: Awaited<ReturnType<typeof load>>;
  try {
    loaded = await load();
  } catch (e) {
    return learnLoadErrorPage(e, here);
  }
  if (!loaded) notFound();
  const { learner, progressRows, sessions, notes, attempts } = loaded;

  const catalog = catalogFor(slug);
  const progressMap = mergeProgress(catalog, progressRows);
  const rows = buildSkillRows(catalog, progressMap, attempts);
  const summary = sessionsSummary(sessions);
  const paragraph = placementSummary(learner, rows, summary, notes);

  return <ReportView learner={learner} rows={rows} summary={summary} paragraph={paragraph} notes={notes} today={today} />;
}
