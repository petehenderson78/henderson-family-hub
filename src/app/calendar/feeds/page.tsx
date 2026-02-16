import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FeedsView from "./feeds-view";

export default async function FeedsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <FeedsView userId={user.id} />;
}
