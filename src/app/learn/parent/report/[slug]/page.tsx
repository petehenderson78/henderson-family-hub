import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import {
  loadAttemptsServer,
  loadLearnerBySlugServer,
  loadNotesServer,
  loadProgressServer,
  loadRecentSessionsServer,
} from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { kidSlugForEmail } from "@/lib/learn/stats";
import { catalogFor } from "@/lib/learn/catalog";
import { mergeProgress } from "@/lib/learn/mastery";
import { buildSkillRows, placementSummary, sessionsSummary } from "@/lib/learn/report";
import ReportView from "./report-view";

export const dynamic = "force-dynamic";

/** The evidence pack: printable mastery record by standard, parent log, sessions, placement summary, CSV. Parents only. */
export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const kidSlug = kidSlugForEmail(user.email);
  if (kidSlug) redirect(`/learn/${kidSlug}`);

  const { slug } = await params;
  const learner = await loadLearnerBySlugServer(slug);
  if (!learner) notFound();

  const today = todayInFamilyTz();
  const [progressRows, sessions, notes, attempts] = await Promise.all([
    loadProgressServer(learner.id),
    loadRecentSessionsServer(learner.id, 365, today),
    loadNotesServer(learner.id, "2020-01-01", today),
    loadAttemptsServer(learner.id),
  ]);

  const catalog = catalogFor(slug);
  const progressMap = mergeProgress(catalog, progressRows);
  const rows = buildSkillRows(catalog, progressMap, attempts);
  const summary = sessionsSummary(sessions);
  const paragraph = placementSummary(learner, rows, summary, notes);

  return <ReportView learner={learner} rows={rows} summary={summary} paragraph={paragraph} notes={notes} today={today} />;
}
