import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { loadLearnerBySlugServer, loadProgressServer } from "@/lib/learn/server";
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
  const learner = await loadLearnerBySlugServer(slug);
  if (!learner) notFound();
  const progress = await loadProgressServer(learner.id);

  return <MapView learner={learner} progressRows={progress} nowIso={new Date().toISOString()} />;
}
