import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { kidSlugForLoginServer, LearnLoadError } from "@/lib/learn/server";
import { kidSlugForEmail } from "@/lib/learn/stats";
import BudgetView from "./budget-view";

export default async function BudgetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Family finances are parents only: a child's login (cole@/lily@ or a learner's email) goes to Learn.
  let kidSlug: string | null = kidSlugForEmail(user.email);
  if (!kidSlug) {
    try {
      kidSlug = await kidSlugForLoginServer(user.email);
    } catch (e) {
      // Learn tables not set up / unreachable: the cole@/lily@ rule above still applies.
      if (!(e instanceof LearnLoadError)) throw e;
    }
  }
  if (kidSlug) redirect("/learn");

  return <BudgetView userId={user.id} />;
}
