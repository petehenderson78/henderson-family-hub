import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { kidSlugForLoginServer, learnLoadErrorPage, loadLearnerServer, loadPonyNotesServer, loadProgressServer } from "@/lib/learn/server";
import { ponyNames } from "@/lib/learn/stats";
import MapView from "./map-view";

export const dynamic = "force-dynamic";

export default async function MapPage({ params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { slug } = await params;
  const here = `/learn/${encodeURIComponent(slug)}/map`;
  let kidSlug: string | null;
  try {
    kidSlug = await kidSlugForLoginServer(user.email);
  } catch (e) {
    return learnLoadErrorPage(e, here);
  }
  if (kidSlug && kidSlug !== slug) redirect(`/learn/${kidSlug}/map`);

  const load = async () => {
    const learner = await loadLearnerServer(slug);
    if (!learner) return null;
    const [progress, ponyNotes] = await Promise.all([loadProgressServer(learner.id), loadPonyNotesServer(learner.id)]);
    return { learner, progress, ponyNotes };
  };
  let loaded: Awaited<ReturnType<typeof load>>;
  try {
    loaded = await load();
  } catch (e) {
    return learnLoadErrorPage(e, here);
  }
  if (!loaded) notFound();
  const { learner, progress, ponyNotes } = loaded;

  return <MapView learner={learner} progressRows={progress} ponies={ponyNames(ponyNotes)} nowIso={new Date().toISOString()} />;
}
