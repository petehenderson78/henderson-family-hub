import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loadLearnersServer, loadLedgerTotalsServer, loadRecentSessionsServer } from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { computeStreak, isPaused, kidSlugForEmail, sessionForDate, todayStatus } from "@/lib/learn/stats";
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

  // Kids' accounts go straight to their own Mission Control.
  const kidSlug = kidSlugForEmail(user.email);
  if (kidSlug) redirect(`/learn/${kidSlug}`);

  const today = todayInFamilyTz();
  const learners = await loadLearnersServer();
  const kids: KidSummary[] = await Promise.all(
    learners.map(async (learner) => {
      const [sessions, ledger] = await Promise.all([loadRecentSessionsServer(learner.id, 60, today), loadLedgerTotalsServer(learner.id)]);
      const t = todayStatus(sessionForDate(sessions, today));
      return {
        learner,
        status: t.status,
        blocksDone: t.blocksDone,
        blocksTotal: t.blocksTotal,
        streak: computeStreak(sessions, today, learner.settings),
        xp: ledger.earned,
        paused: isPaused(learner.settings, today),
      };
    })
  );

  return <LearnHome kids={kids} today={today} nowIso={new Date().toISOString()} />;
}
