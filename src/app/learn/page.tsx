import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  kidSlugForLoginServer,
  learnLoadErrorPage,
  loadLearnersServer,
  loadRecentSessionsServer,
  loadStreakSessionsServer,
  loadWalletServer,
} from "@/lib/learn/server";
import type { Learner } from "@/lib/learn/types";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { computeStreakInfo, isPaused, sessionForDate, todayStatus } from "@/lib/learn/stats";
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
        const [sessions, streakRows, wallet] = await Promise.all([
          loadRecentSessionsServer(learner.id, 60, today),
          loadStreakSessionsServer(learner.id, today),
          loadWalletServer(learner.id, today),
        ]);
        const todayRow = sessionForDate(sessions, today);
        const t = todayStatus(todayRow);
        // The streak walks the whole history since the program start (FR-15), not the 60-day window.
        const streak = computeStreakInfo(
          todayRow ? [...streakRows.sessions.filter((s) => s.date !== today), todayRow] : streakRows.sessions,
          today,
          learner.settings,
          streakRows.loadedFrom
        );
        return {
          learner,
          status: t.status,
          blocksDone: t.blocksDone,
          blocksTotal: t.blocksTotal,
          streak: streak.streak,
          streakAtLeast: !streak.complete,
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
