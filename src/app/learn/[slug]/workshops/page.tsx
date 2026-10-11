import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { kidSlugForLoginServer, learnLoadErrorPage, loadLearnerServer, loadWeekRewardsServer } from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { weekPoints } from "@/lib/learn/stats";
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
  const here = `/learn/${encodeURIComponent(slug)}/workshops`;
  let kidSlug: string | null;
  try {
    kidSlug = await kidSlugForLoginServer(user.email);
  } catch (e) {
    return learnLoadErrorPage(e, here);
  }
  if (kidSlug && kidSlug !== slug) redirect(`/learn/${kidSlug}/workshops`);

  // Workshops marked done this family week (Mon-Sun): "pt:workshop:<id>" (and legacy "workshop:<id>" XP rows).
  // A failed read would show done workshops as open and invite a second award: retry card instead.
  const today = todayInFamilyTz();
  const load = async () => {
    const learner = await loadLearnerServer(slug);
    if (!learner) return null;
    return { learner, rewards: await loadWeekRewardsServer(learner.id, today) };
  };
  let loaded: Awaited<ReturnType<typeof load>>;
  try {
    loaded = await load();
  } catch (e) {
    return learnLoadErrorPage(e, here);
  }
  if (!loaded) notFound();
  const { learner, rewards } = loaded;
  const doneIds = rewards
    .map((r) => /^(?:pt:)?workshop:(.+)$/.exec(r.reason)?.[1])
    .filter((id): id is string => !!id);

  return <WorkshopsView learner={learner} doneThisWeek={doneIds} weekPoints={weekPoints(rewards, today)} today={today} isKid={kidSlug !== null} />;
}
