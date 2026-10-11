import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loadLearnersServer, loadProgressServer, loadRecentSessionsServer, loadXpTotalServer } from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
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

  const today = todayInFamilyTz();
  const learners = await loadLearnersServer();
  const kids: ParentKid[] = await Promise.all(
    learners.map(async (learner) => {
      const [progressRows, sessions, xpTotal] = await Promise.all([
        loadProgressServer(learner.id),
        loadRecentSessionsServer(learner.id, 60, today),
        loadXpTotalServer(learner.id),
      ]);
      return { learner, progressRows, sessions, xpTotal };
    })
  );

  return <ParentView kids={kids} today={today} nowIso={new Date().toISOString()} coachEnabled={coachEnabled()} />;
}
