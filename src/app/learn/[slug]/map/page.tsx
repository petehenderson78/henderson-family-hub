import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { loadLearnerBySlugServer, loadPonyNotesServer, loadProgressServer } from "@/lib/learn/server";
import { kidSlugForEmail, ponyNames } from "@/lib/learn/stats";
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
  const kidSlug = kidSlugForEmail(user.email);
  if (kidSlug && kidSlug !== slug) redirect(`/learn/${kidSlug}/map`);
  const learner = await loadLearnerBySlugServer(slug);
  if (!learner) notFound();
  const [progress, ponyNotes] = await Promise.all([loadProgressServer(learner.id), loadPonyNotesServer(learner.id)]);

  return <MapView learner={learner} progressRows={progress} ponies={ponyNames(ponyNotes)} nowIso={new Date().toISOString()} />;
}
