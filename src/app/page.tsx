import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-50 px-4 py-12">
      <main className="w-full max-w-2xl">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Henderson Family Hub
        </h1>
        <p className="mb-8 text-gray-600">
          Welcome, {user.email}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/budget"
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <h2 className="mb-2 text-xl font-semibold text-gray-900">
              Budget
            </h2>
            <p className="text-sm text-gray-600">
              Track family expenses and manage your budget.
            </p>
          </Link>

          <Link
            href="/calendar"
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <h2 className="mb-2 text-xl font-semibold text-gray-900">
              Calendar
            </h2>
            <p className="text-sm text-gray-600">
              View and manage family events and schedules.
            </p>
          </Link>
        </div>

        <form action="/auth/signout" method="post" className="mt-8">
          <button
            type="submit"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign Out
          </button>
        </form>
      </main>
    </div>
  );
}
