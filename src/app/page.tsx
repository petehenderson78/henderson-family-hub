import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardView, { type LearningSummary } from "./dashboard-view";
import { kidSlugForLoginServer, LearnLoadError, loadLearnersServer, loadRecentSessionsServer, loadStreakSessionsServer } from "@/lib/learn/server";
import type { Learner } from "@/lib/learn/types";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { computeStreakInfo, sessionForDate, todayStatus } from "@/lib/learn/stats";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Extract first name from email
  const rawName = user.email?.split("@")[0] ?? "there";
  const firstName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  // Learn rows first: they also tell a child's login apart (cole@/lily@ or a learner's email).
  // Home never fails on the Learn tables (not set up yet, or unreachable): the card says so instead.
  let allLearners: Learner[] = [];
  let learnError: LearnLoadError | null = null;
  try {
    allLearners = await loadLearnersServer();
  } catch (e) {
    if (!(e instanceof LearnLoadError)) throw e;
    learnError = e;
  }
  const kidSlug = await kidSlugForLoginServer(user.email, allLearners);
  // Family finances are for parents: a child's login gets no spending total and no Add Expense link.
  const showFinances = kidSlug === null;

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

  // Fetch this month's spending total (parents only)
  let monthTotal = 0;
  if (showFinances) {
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

    monthTotal = (monthExpenses ?? []).reduce(
      (sum, e) => sum + Number(e.amount),
      0
    );
  }

  // Learning: each child's today status + streak.
  // Kid logins see only their own row and land on their Mission Control; parents go to the Tonight runner.
  const learnToday = todayInFamilyTz();
  const learners = allLearners.filter((l) => !kidSlug || l.slug === kidSlug);
  let learning: LearningSummary[] = [];
  try {
    learning = await Promise.all(
      learners.map(async (learner) => {
        // Today's row from a short window; the streak from the whole program history (FR-15).
        const [sessions, streak] = await Promise.all([
          loadRecentSessionsServer(learner.id, 7, learnToday),
          loadStreakSessionsServer(learner.id, learnToday),
        ]);
        const t = todayStatus(sessionForDate(sessions, learnToday));
        return {
          slug: learner.slug,
          name: learner.name,
          status: t.status,
          blocksDone: t.blocksDone,
          blocksTotal: t.blocksTotal,
          streak: computeStreakInfo(streak.sessions, learnToday, learner.settings, streak.loadedFrom).streak,
        };
      })
    );
  } catch (e) {
    if (!(e instanceof LearnLoadError)) throw e;
    learnError = e;
    learning = [];
  }
  const learningNote = learnError
    ? learnError.kind === "setup"
      ? "Run the Supabase setup scripts 007, 008 and 009 to see Cole and Lily here."
      : "Couldn't reach the family database. Check the connection and try again."
    : undefined;

  return (
    <DashboardView
      firstName={firstName}
      todayEvents={todayEvents ?? []}
      monthTotal={monthTotal}
      showFinances={showFinances}
      userId={user.id}
      learning={learning}
      learningNote={learningNote}
      learnHref={kidSlug ? `/learn/${kidSlug}` : "/learn/tonight"}
      learnTitle={kidSlug ? "Your mission" : "Tonight's run"}
    />
  );
}
