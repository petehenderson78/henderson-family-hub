import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { loadLearnerBySlugServer, loadRewardsSinceServer } from "@/lib/learn/server";
import { addDaysToDateStr, todayInFamilyTz } from "@/lib/learn/dates";
import WorkshopsView from "./workshops-view";

export const dynamic = "force-dynamic";

export default async function WorkshopsPage({ params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { slug } = await params;
  const learner = await loadLearnerBySlugServer(slug);
  if (!learner) notFound();

  // Workshops marked done in the last 7 days (reason "workshop:<id>").
  const today = todayInFamilyTz();
  const since = `${addDaysToDateStr(today, -6)}T00:00:00Z`;
  const rewards = await loadRewardsSinceServer(learner.id, since);
  const doneIds = rewards.filter((r) => r.reason.startsWith("workshop:")).map((r) => r.reason.slice("workshop:".length));

  return <WorkshopsView learner={learner} doneThisWeek={doneIds} today={today} />;
}
