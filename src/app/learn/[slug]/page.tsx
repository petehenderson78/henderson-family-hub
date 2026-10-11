import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { loadLearnerBundleServer, loadLedgerTotalsServer, loadRewardItemsServer } from "@/lib/learn/server";
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
  const today = todayInFamilyTz();
  const bundle = await loadLearnerBundleServer(slug, today);
  if (!bundle) notFound();
  const [ledger, rewardItems] = await Promise.all([loadLedgerTotalsServer(bundle.learner.id), loadRewardItemsServer(bundle.learner.id)]);

  return (
    <MissionView
      learner={bundle.learner}
      progressRows={bundle.progress}
      sessions={bundle.sessions}
      xpTotal={ledger.earned}
      balance={ledger.balance}
      rewardItems={rewardItems}
      today={today}
      nowIso={new Date().toISOString()}
      coachEnabled={coachEnabled()}
      isKid={kidSlugForEmail(user.email) !== null}
    />
  );
}
