import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { loadLearnerBundleServer } from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { coachEnabled } from "@/lib/learn/coach";
import PlayView from "./play-view";

export const dynamic = "force-dynamic";

interface PlayPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    block?: string;
    skill?: string;
    /** learn | review | test | placement */
    mode?: string;
    /** placement sprint subject (math | reading | phonics | reasoning | writing) */
    subject?: string;
    /** "tonight" → back links go to /learn/tonight */
    return?: string;
    /** "1" → show the skill's intro card even after the first attempt */
    intro?: string;
  }>;
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
  if (!/^[a-z0-9-]{1,32}$/.test(slug)) notFound();
  const today = todayInFamilyTz();
  const bundle = await loadLearnerBundleServer(slug, today);
  if (!bundle) notFound();

  // Key forces a fresh run when the block/skill/mode changes (same component position).
  const key = `${query.block ?? ""}|${query.skill ?? ""}|${query.mode ?? ""}|${query.subject ?? ""}`;

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
      subjectParam={query.subject}
      returnParam={query.return}
      introParam={query.intro}
      coachEnabled={coachEnabled()}
    />
  );
}
