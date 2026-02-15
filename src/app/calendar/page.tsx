import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CalendarView from "./calendar-view";

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <CalendarView userId={user.id} />;
}
