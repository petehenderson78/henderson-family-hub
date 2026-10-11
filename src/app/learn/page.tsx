import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loadLearnersServer, loadRecentSessionsServer, loadXpTotalServer } from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { computeStreak, sessionForDate, todayStatus } from "@/lib/learn/stats";
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
  const email = (user.email ?? "").toLowerCase();
  if (email.startsWith("cole")) redirect("/learn/cole");
  if (email.startsWith("lily")) redirect("/learn/lily");

  const today = todayInFamilyTz();
  const learners = await loadLearnersServer();
  const kids: KidSummary[] = await Promise.all(
    learners.map(async (learner) => {
      const [sessions, xp] = await Promise.all([loadRecentSessionsServer(learner.id, 60, today), loadXpTotalServer(learner.id)]);
      const t = todayStatus(sessionForDate(sessions, today));
      return { learner, status: t.status, blocksDone: t.blocksDone, blocksTotal: t.blocksTotal, streak: computeStreak(sessions, today), xp };
    })
  );

  return <LearnHome kids={kids} />;
}
