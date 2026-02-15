import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardView from "./dashboard-view";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Extract first name from email
  const rawName = user.email?.split("@")[0] ?? "there";
  const firstName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  // Fetch upcoming events (48h window to cover timezone differences on server)
  const now = new Date();
  const startWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const endWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data: todayEvents } = await supabase
    .from("events")
    .select("*")
    .gte("start_date", startWindow)
    .lte("start_date", endWindow)
    .order("start_date", { ascending: true });

  // Fetch this month's spending total
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const startOfMonth = `${y}-${m}-01`;
  const daysInMonth = new Date(y, now.getMonth() + 1, 0).getDate();
  const endOfMonth = `${y}-${m}-${String(daysInMonth).padStart(2, "0")}`;

  const { data: monthExpenses } = await supabase
    .from("expenses")
    .select("amount")
    .gte("date", startOfMonth)
    .lte("date", endOfMonth);

  const monthTotal = (monthExpenses ?? []).reduce(
    (sum, e) => sum + Number(e.amount),
    0
  );

  return (
    <DashboardView
      firstName={firstName}
      todayEvents={todayEvents ?? []}
      monthTotal={monthTotal}
      userId={user.id}
    />
  );
}
