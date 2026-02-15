import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BudgetView from "./budget-view";

export default async function BudgetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <BudgetView userId={user.id} />;
}
