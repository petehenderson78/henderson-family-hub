import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  kidSlugForLoginServer,
  learnLoadErrorPage,
  loadLearnersServer,
  loadNotesServer,
  loadProgressServer,
  loadRecentSessionsServer,
  loadRedemptionsServer,
  loadRewardItemsServer,
  loadWalletServer,
} from "@/lib/learn/server";
import { loadSundayReviewAttemptsServer } from "@/lib/learn/server-parent";
import type { Learner } from "@/lib/learn/types";
import { addDaysToDateStr, todayInFamilyTz } from "@/lib/learn/dates";
import { catalogFor } from "@/lib/learn/catalog";
import { sundayReview } from "@/lib/learn/stats";
import { coachEnabled } from "@/lib/learn/coach";
import ParentView, { type ParentKid } from "./parent-view";

export const dynamic = "force-dynamic";

/** Days of sessions loaded: the streak walk, this week, and the Sunday review's last two weeks. */
const SESSION_DAYS = 60;
/** Recent redemptions listed per child (the Friday Close log). */
const REDEMPTION_LOG_SIZE = 10;

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

  // Mark mastered and the review panel read from these rows: a failed read shows the retry card, never empty data.
  const today = todayInFamilyTz();
  const sessionsFrom = addDaysToDateStr(today, -(SESSION_DAYS - 1));
  let kids: ParentKid[];
  try {
    kids = await Promise.all(
      learners.map(async (learner) => {
        const [progressRows, sessions, wallet, rewardItems, notes, redemptions, attempts] = await Promise.all([
          loadProgressServer(learner.id),
          loadRecentSessionsServer(learner.id, SESSION_DAYS, today),
          loadWalletServer(learner.id, today),
          loadRewardItemsServer(learner.id),
          loadNotesServer(learner.id, addDaysToDateStr(today, -7), today),
          loadRedemptionsServer(learner.id, REDEMPTION_LOG_SIZE),
          loadSundayReviewAttemptsServer(learner.id, today),
        ]);
        // Computed here so the browser gets the panel, not a month of attempt rows.
        const sunday = sundayReview({ attempts, progress: progressRows, sessions, catalog: catalogFor(learner.slug), today, settings: learner.settings, slug: learner.slug });
        return {
          learner,
          progressRows,
          sessions,
          xpTotal: wallet.xp,
          balance: wallet.balance,
          weekPoints: wallet.weekPoints,
          rewardItems,
          notes,
          redemptions,
          sunday,
        };
      })
    );
  } catch (e) {
    return learnLoadErrorPage(e, "/learn/parent");
  }

  return <ParentView kids={kids} today={today} sessionsFrom={sessionsFrom} nowIso={new Date().toISOString()} coachEnabled={coachEnabled()} />;
}
