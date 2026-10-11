import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { loadLearnerBundleServer, loadRewardItemsServer, loadWalletServer } from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { kidSlugForEmail } from "@/lib/learn/stats";
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
  // A kid login only sees their own Mission Control.
  const kidSlug = kidSlugForEmail(user.email);
  if (kidSlug && kidSlug !== slug) redirect(`/learn/${kidSlug}`);
  const today = todayInFamilyTz();
  const bundle = await loadLearnerBundleServer(slug, today);
  if (!bundle) notFound();
  const [wallet, rewardItems] = await Promise.all([loadWalletServer(bundle.learner.id, today), loadRewardItemsServer(bundle.learner.id)]);

  return (
    <MissionView
      learner={bundle.learner}
      progressRows={bundle.progress}
      sessions={bundle.sessions}
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
