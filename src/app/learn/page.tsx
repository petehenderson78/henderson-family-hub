import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { kidSlugForLoginServer, learnLoadErrorPage, loadLearnersServer, loadRecentSessionsServer, loadWalletServer } from "@/lib/learn/server";
import type { Learner } from "@/lib/learn/types";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { computeStreak, isPaused, sessionForDate, todayStatus } from "@/lib/learn/stats";
import LearnHome, { type KidSummary } from "./learn-home";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
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
    return learnLoadErrorPage(e, "/learn");
  }
  // Kids' accounts go straight to their own Mission Control.
  if (kidSlug) redirect(`/learn/${kidSlug}`);

  const today = todayInFamilyTz();
  let kids: KidSummary[];
  try {
    kids = await Promise.all(
      learners.map(async (learner) => {
        const [sessions, wallet] = await Promise.all([loadRecentSessionsServer(learner.id, 60, today), loadWalletServer(learner.id, today)]);
        const t = todayStatus(sessionForDate(sessions, today));
        return {
          learner,
          status: t.status,
          blocksDone: t.blocksDone,
          blocksTotal: t.blocksTotal,
          streak: computeStreak(sessions, today, learner.settings),
          xp: wallet.xp,
          paused: isPaused(learner.settings, today),
        };
      })
    );
  } catch (e) {
    return learnLoadErrorPage(e, "/learn");
  }

  return <LearnHome kids={kids} today={today} nowIso={new Date().toISOString()} />;
}
