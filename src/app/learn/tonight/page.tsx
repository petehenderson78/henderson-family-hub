import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { kidSlugForLoginServer, learnLoadErrorPage, loadTonightBundleServer, type TonightKidBundle } from "@/lib/learn/server";
import { todayInFamilyTz } from "@/lib/learn/dates";
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

  let kidSlug: string | null;
  try {
    kidSlug = await kidSlugForLoginServer(user.email);
  } catch (e) {
    return learnLoadErrorPage(e, "/learn/tonight");
  }
  if (kidSlug) redirect(`/learn/${kidSlug}`);

  const today = todayInFamilyTz();
  let bundles: TonightKidBundle[];
  try {
    bundles = await loadTonightBundleServer(today);
  } catch (e) {
    return learnLoadErrorPage(e, "/learn/tonight");
  }
  // Youngest first: the rotation opens each block with Lily (design §2.1).
  const kids: TonightKid[] = bundles
    .map((b) => ({ learner: b.learner, progressRows: b.progress, sessions: b.sessions, notes: b.notes, weekRewards: b.weekRewards }))
    .sort((a, b) => a.learner.grade - b.learner.grade);

  return <TonightView kids={kids} today={today} nowIso={new Date().toISOString()} coachEnabled={coachEnabled()} />;
}
