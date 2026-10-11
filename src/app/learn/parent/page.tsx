import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  loadLearnersServer,
  loadLedgerTotalsServer,
  loadNotesServer,
  loadProgressServer,
  loadRecentSessionsServer,
  loadRewardItemsServer,
} from "@/lib/learn/server";
import { addDaysToDateStr, todayInFamilyTz } from "@/lib/learn/dates";
import { kidSlugForEmail } from "@/lib/learn/stats";
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

  // Parent screens are hidden from kid logins.
  const kidSlug = kidSlugForEmail(user.email);
  if (kidSlug) redirect(`/learn/${kidSlug}`);

  const today = todayInFamilyTz();
  const learners = await loadLearnersServer();
  const kids: ParentKid[] = await Promise.all(
    learners.map(async (learner) => {
      const [progressRows, sessions, ledger, rewardItems, notes] = await Promise.all([
        loadProgressServer(learner.id),
        loadRecentSessionsServer(learner.id, 60, today),
        loadLedgerTotalsServer(learner.id),
        loadRewardItemsServer(learner.id),
        loadNotesServer(learner.id, addDaysToDateStr(today, -6), today),
      ]);
      return { learner, progressRows, sessions, xpTotal: ledger.earned, balance: ledger.balance, rewardItems, notes };
    })
  );

  return <ParentView kids={kids} today={today} nowIso={new Date().toISOString()} coachEnabled={coachEnabled()} />;
}
