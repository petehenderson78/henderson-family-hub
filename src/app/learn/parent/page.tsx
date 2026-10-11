import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  kidSlugForLoginServer,
  learnLoadErrorPage,
  loadLearnersServer,
  loadNotesServer,
  loadProgressServer,
  loadRecentSessionsServer,
  loadRewardItemsServer,
  loadWalletServer,
} from "@/lib/learn/server";
import type { Learner } from "@/lib/learn/types";
import { addDaysToDateStr, todayInFamilyTz } from "@/lib/learn/dates";
import { coachEnabled } from "@/lib/learn/coach";
import ParentView, { type ParentKid } from "./parent-view";

export const dynamic = "force-dynamic";

export default async function ParentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let learners: Learner[];
  let kidSlug: string | null;
  try {
    learners = await loadLearnersServer();
    kidSlug = await kidSlugForLoginServer(user.email, learners);
  } catch (e) {
    return learnLoadErrorPage(e, "/learn/parent");
  }
  // Parent screens are hidden from kid logins.
  if (kidSlug) redirect(`/learn/${kidSlug}`);

  // Mark mastered and settings write from these rows: a failed read shows the retry card, never empty data.
  const today = todayInFamilyTz();
  let kids: ParentKid[];
  try {
    kids = await Promise.all(
      learners.map(async (learner) => {
        const [progressRows, sessions, wallet, rewardItems, notes] = await Promise.all([
          loadProgressServer(learner.id),
          loadRecentSessionsServer(learner.id, 60, today),
          loadWalletServer(learner.id, today),
          loadRewardItemsServer(learner.id),
          loadNotesServer(learner.id, addDaysToDateStr(today, -7), today),
        ]);
        return { learner, progressRows, sessions, xpTotal: wallet.xp, balance: wallet.balance, weekPoints: wallet.weekPoints, rewardItems, notes };
      })
    );
  } catch (e) {
    return learnLoadErrorPage(e, "/learn/parent");
  }

  return <ParentView kids={kids} today={today} nowIso={new Date().toISOString()} coachEnabled={coachEnabled()} />;
}
