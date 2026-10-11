import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { loadLearnerBySlugServer, loadWeekRewardsServer } from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { kidSlugForEmail, weekPoints } from "@/lib/learn/stats";
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
  const kidSlug = kidSlugForEmail(user.email);
  if (kidSlug && kidSlug !== slug) redirect(`/learn/${kidSlug}/workshops`);
  const learner = await loadLearnerBySlugServer(slug);
  if (!learner) notFound();

  // Workshops marked done this family week (Mon-Sun): "pt:workshop:<id>" (and legacy "workshop:<id>" XP rows).
  const today = todayInFamilyTz();
  const rewards = await loadWeekRewardsServer(learner.id, today);
  const doneIds = rewards
    .map((r) => /^(?:pt:)?workshop:(.+)$/.exec(r.reason)?.[1])
    .filter((id): id is string => !!id);

  return <WorkshopsView learner={learner} doneThisWeek={doneIds} weekPoints={weekPoints(rewards, today)} today={today} isKid={kidSlug !== null} />;
}
