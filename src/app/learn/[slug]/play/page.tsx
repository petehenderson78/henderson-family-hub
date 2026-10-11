import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { loadLearnerBundleServer } from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { coachEnabled } from "@/lib/learn/coach";
import PlayView from "./play-view";

export const dynamic = "force-dynamic";

interface PlayPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ block?: string; skill?: string; mode?: string }>;
}

export default async function PlayPage({ params, searchParams }: PlayPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const today = todayInFamilyTz();
  const bundle = await loadLearnerBundleServer(slug, today);
  if (!bundle) notFound();

  // Key forces a fresh run when the block/skill changes (same component position).
  const key = `${query.block ?? ""}|${query.skill ?? ""}|${query.mode ?? ""}`;

  return (
    <PlayView
      key={key}
      learner={bundle.learner}
      progressRows={bundle.progress}
      sessions={bundle.sessions}
      today={today}
      nowIso={new Date().toISOString()}
      blockParam={query.block}
      skillParam={query.skill}
      modeParam={query.mode}
      coachEnabled={coachEnabled()}
    />
  );
}
