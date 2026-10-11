import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loadTonightBundleServer } from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
import { kidSlugForEmail } from "@/lib/learn/stats";
import { coachEnabled } from "@/lib/learn/coach";
import TonightView, { type TonightKid } from "./tonight-view";

export const dynamic = "force-dynamic";

/** The one-adult evening runner: both missions, the 6-minute rotation, scripts, homework, notes. Parents only. */
export default async function TonightPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const kidSlug = kidSlugForEmail(user.email);
  if (kidSlug) redirect(`/learn/${kidSlug}`);

  const today = todayInFamilyTz();
  const bundles = await loadTonightBundleServer(today);
  const kids: TonightKid[] = bundles.map((b) => ({ learner: b.learner, progressRows: b.progress, sessions: b.sessions, notes: b.notes }));

  return <TonightView kids={kids} today={today} nowIso={new Date().toISOString()} coachEnabled={coachEnabled()} />;
}
