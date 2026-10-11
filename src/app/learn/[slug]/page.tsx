import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { loadLearnerBundleServer } from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import MissionView from "./mission-view";

export const dynamic = "force-dynamic";

export default async function KidPage({ params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { slug } = await params;
  const today = todayInFamilyTz();
  const bundle = await loadLearnerBundleServer(slug, today);
  if (!bundle) notFound();

  return (
    <MissionView
      learner={bundle.learner}
      progressRows={bundle.progress}
      sessions={bundle.sessions}
      xpTotal={bundle.xpTotal}
      today={today}
      nowIso={new Date().toISOString()}
    />
  );
}
