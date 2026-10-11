import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { loadLearnerBundleServer, loadPonyNotesServer } from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { kidSlugForEmail } from "@/lib/learn/stats";
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
  // A kid login only ever plays their own mission.
  const kidSlug = kidSlugForEmail(user.email);
  if (kidSlug && kidSlug !== slug) redirect(`/learn/${kidSlug}`);
  const today = todayInFamilyTz();
  const bundle = await loadLearnerBundleServer(slug, today);
  if (!bundle) notFound();
  // Lily's stable: names already taken are not offered again when a new pony arrives.
  const ponyNotes = bundle.learner.settings.theme.screen === "tutu" ? await loadPonyNotesServer(bundle.learner.id) : [];

  // Key forces a fresh run when the block/skill/mode changes (same component position).
  const key = `${query.block ?? ""}|${query.skill ?? ""}|${query.mode ?? ""}|${query.subject ?? ""}`;

  return (
    <PlayView
      key={key}
      learner={bundle.learner}
      progressRows={bundle.progress}
      sessions={bundle.sessions}
      notes={[...bundle.notes, ...ponyNotes]}
      weekRewards={bundle.weekRewards}
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
