import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import {
  kidSlugForLoginServer,
  learnLoadErrorPage,
  loadLearnerBundleServer,
  loadRewardItemsServer,
  loadWalletServer,
} from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { coachEnabled } from "@/lib/learn/coach";
import MissionView from "./mission-view";

export const dynamic = "force-dynamic";

export default async function KidPage({ params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { slug } = await params;
  const here = `/learn/${encodeURIComponent(slug)}`;
  // A kid login only sees their own Mission Control.
  let kidSlug: string | null;
  try {
    kidSlug = await kidSlugForLoginServer(user.email);
  } catch (e) {
    return learnLoadErrorPage(e, here);
  }
  if (kidSlug && kidSlug !== slug) redirect(`/learn/${kidSlug}`);

  const today = todayInFamilyTz();
  const load = async () => {
    const bundle = await loadLearnerBundleServer(slug, today);
    if (!bundle) return null;
    const [wallet, rewardItems] = await Promise.all([loadWalletServer(bundle.learner.id, today), loadRewardItemsServer(bundle.learner.id)]);
    return { bundle, wallet, rewardItems };
  };
  let loaded: Awaited<ReturnType<typeof load>>;
  try {
    loaded = await load();
  } catch (e) {
    return learnLoadErrorPage(e, here);
  }
  if (!loaded) notFound();
  const { bundle, wallet, rewardItems } = loaded;

  return (
    <MissionView
      learner={bundle.learner}
      progressRows={bundle.progress}
      sessions={bundle.sessions}
      streakSessions={bundle.streak.sessions}
      streakFrom={bundle.streak.loadedFrom}
      notes={bundle.notes}
      xpTotal={wallet.xp}
      balance={wallet.balance}
      weekPoints={wallet.weekPoints}
      rewardItems={rewardItems}
      today={today}
      nowIso={new Date().toISOString()}
      coachEnabled={coachEnabled()}
      isKid={kidSlug !== null}
    />
  );
}
