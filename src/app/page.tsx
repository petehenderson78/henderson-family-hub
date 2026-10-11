import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardView, { type LearningSummary } from "./dashboard-view";
import { loadLearnersServer, loadRecentSessionsServer } from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { computeStreak, kidSlugForEmail, sessionForDate, todayStatus } from "@/lib/learn/stats";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Extract first name from email
  const rawName = user.email?.split("@")[0] ?? "there";
  const firstName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  // Fetch upcoming events (48h window to cover timezone differences on server)
  const now = new Date();
  const startWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const endWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data: todayEvents } = await supabase
    .from("events")
    .select("*")
    .gte("start_date", startWindow)
    .lte("start_date", endWindow)
    .order("start_date", { ascending: true });

  // Fetch this month's spending total
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const startOfMonth = `${y}-${m}-01`;
  const daysInMonth = new Date(y, now.getMonth() + 1, 0).getDate();
  const endOfMonth = `${y}-${m}-${String(daysInMonth).padStart(2, "0")}`;

  const { data: monthExpenses } = await supabase
    .from("expenses")
    .select("amount")
    .gte("date", startOfMonth)
    .lte("date", endOfMonth);

  const monthTotal = (monthExpenses ?? []).reduce(
    (sum, e) => sum + Number(e.amount),
    0
  );

  // Learning: each child's today status + streak (empty if the learn tables don't exist yet).
  // Kid logins see only their own row and land on their Mission Control; parents go to the Tonight runner.
  const learnToday = todayInFamilyTz();
  const kidSlug = kidSlugForEmail(user.email);
  const learners = (await loadLearnersServer()).filter((l) => !kidSlug || l.slug === kidSlug);
  const learning: LearningSummary[] = await Promise.all(
    learners.map(async (learner) => {
      const sessions = await loadRecentSessionsServer(learner.id, 60, learnToday);
      const t = todayStatus(sessionForDate(sessions, learnToday));
      return {
        slug: learner.slug,
        name: learner.name,
        status: t.status,
        blocksDone: t.blocksDone,
        blocksTotal: t.blocksTotal,
        streak: computeStreak(sessions, learnToday, learner.settings),
      };
    })
  );

  return (
    <DashboardView
      firstName={firstName}
      todayEvents={todayEvents ?? []}
      monthTotal={monthTotal}
      userId={user.id}
      learning={learning}
      learnHref={kidSlug ? `/learn/${kidSlug}` : "/learn/tonight"}
      learnTitle={kidSlug ? "Your mission" : "Tonight's run"}
    />
  );
}
