"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import type { Expense } from "@/lib/types";

const CATEGORIES = [
  "Groceries",
  "Dining Out",
  "Gas",
  "Kids Activities",
  "Shopping",
  "Bills",
  "Entertainment",
  "Other",
];

const CATEGORY_COLORS: Record<string, string> = {
  Groceries: "bg-emerald-50 text-emerald-700",
  "Dining Out": "bg-orange-50 text-orange-700",
  Gas: "bg-amber-50 text-amber-700",
  "Kids Activities": "bg-violet-50 text-violet-700",
  Shopping: "bg-pink-50 text-pink-700",
  Bills: "bg-red-50 text-red-700",
  Entertainment: "bg-blue-50 text-blue-700",
  Other: "bg-slate-100 text-slate-600",
};

const CATEGORY_CHART_COLORS: Record<string, string> = {
  Groceries: "#10B981",
  "Dining Out": "#F97316",
  Gas: "#F59E0B",
  "Kids Activities": "#8B5CF6",
  Shopping: "#EC4899",
  Bills: "#EF4444",
  Entertainment: "#3B82F6",
  Other: "#94A3B8",
};

const CATEGORY_BORDER_COLORS: Record<string, string> = {
  Groceries: "border-l-emerald-500",
  "Dining Out": "border-l-orange-500",
  Gas: "border-l-amber-500",
  "Kids Activities": "border-l-violet-500",
  Shopping: "border-l-pink-500",
  Bills: "border-l-red-500",
  Entertainment: "border-l-blue-500",
  Other: "border-l-slate-400",
};

function formatMonthYear(year: number, month: number) {
  return new Date(year, month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function getTodayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildConicGradient(categories: [string, number][], total: number) {
  if (total === 0) return "conic-gradient(#e2e8f0 0deg 360deg)";
  const segments: string[] = [];
  let currentDeg = 0;
  for (const [cat, amount] of categories) {
    const deg = (amount / total) * 360;
    const color = CATEGORY_CHART_COLORS[cat] ?? "#94A3B8";
    segments.push(`${color} ${currentDeg}deg ${currentDeg + deg}deg`);
    currentDeg += deg;
  }
  return `conic-gradient(${segments.join(", ")})`;
}

export default function BudgetView({ userId }: { userId: string }) {
  const supabase = createClient();
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Quick-add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => getTodayString());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const startOfMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
    const endOfMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const { data } = await supabase
      .from("expenses")
      .select("*")
      .gte("date", startOfMonth)
      .lte("date", endOfMonth)
      .order("date", { ascending: false });

    setExpenses(data ?? []);
    setLoading(false);
  }, [currentYear, currentMonth, supabase]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }

  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  // Group by category for summary
  const byCategory: Record<string, number> = {};
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount);
  }
  const sortedCategories = Object.entries(byCategory).sort(
    (a, b) => b[1] - a[1]
  );

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !category) return;

    setSaving(true);
    const { error } = await supabase.from("expenses").insert({
      user_id: userId,
      amount: parseFloat(amount),
      category,
      description: description.trim() || null,
      date,
    });

    if (!error) {
      setAmount("");
      setCategory("");
      setDescription("");
      setDate(getTodayString());
      setShowQuickAdd(false);
      fetchExpenses();
    }
    setSaving(false);
  }

  async function handleDelete(expenseId: string) {
    await supabase.from("expenses").delete().eq("id", expenseId);
    fetchExpenses();
  }

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
      <div className="mx-auto max-w-lg px-4 pt-6">
        {/* Month navigation */}
        <div className="mb-5 flex items-center justify-between">
          <button
            onClick={prevMonth}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm active:scale-95 active:bg-slate-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h2 className="text-lg font-bold tracking-tight text-slate-900" suppressHydrationWarning>
            {formatMonthYear(currentYear, currentMonth)}
          </h2>
          <button
            onClick={nextMonth}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm active:scale-95 active:bg-slate-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </button>
        </div>

        {/* Donut Chart */}
        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-center">
            <div
              className="relative flex h-44 w-44 items-center justify-center rounded-full"
              style={{
                background: buildConicGradient(sortedCategories, totalSpent),
              }}
            >
              <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white shadow-inner">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total</p>
                <p className="text-xl font-bold text-slate-900" suppressHydrationWarning>
                  {mounted ? formatCurrency(totalSpent) : "\u00A0"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Category breakdown with color dots */}
        {sortedCategories.length > 0 && (
          <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
              By Category
            </h3>
            <ul className="space-y-3">
              {sortedCategories.map(([cat, total]) => {
                const pct = totalSpent > 0 ? Math.round((total / totalSpent) * 100) : 0;
                return (
                  <li key={cat}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: CATEGORY_CHART_COLORS[cat] ?? "#94A3B8" }}
                        />
                        <span className="text-sm font-medium text-slate-700">
                          {cat}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-slate-900" suppressHydrationWarning>
                        {formatCurrency(total)}
                      </span>
                    </div>
                    <div className="ml-[22px] h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: CATEGORY_CHART_COLORS[cat] ?? "#94A3B8",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Add Expense button + expense list */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Expenses</h3>
          <button
            onClick={() => setShowQuickAdd(true)}
            className="min-h-[44px] rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 active:scale-[0.97]"
          >
            + Add Expense
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading...</p>
        ) : expenses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 py-10 text-center">
            <p className="text-sm text-slate-400">No expenses this month</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {expenses.map((exp) => (
              <li
                key={exp.id}
                className={`flex items-start justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm border-l-4 ${CATEGORY_BORDER_COLORS[exp.category] ?? "border-l-slate-400"}`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-slate-900" suppressHydrationWarning>
                      {formatCurrency(Number(exp.amount))}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[exp.category] ?? CATEGORY_COLORS["Other"]}`}
                    >
                      {exp.category}
                    </span>
                  </div>
                  {exp.description && (
                    <p className="mt-1 text-sm text-slate-500">
                      {exp.description}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs font-medium text-slate-400" suppressHydrationWarning>
                    {new Date(exp.date + "T12:00:00").toLocaleDateString(
                      "en-US",
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      }
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(exp.id)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-300 active:bg-red-50 active:text-red-500"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick Add Modal */}
      {showQuickAdd && (
        <div className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center">
          <div className="animate-slide-up w-full max-w-lg rounded-t-3xl bg-white p-6 pb-10 shadow-2xl sm:rounded-3xl sm:pb-6 max-h-[90dvh] overflow-y-auto">
            {/* Drag handle */}
            <div className="mb-4 flex justify-center sm:hidden">
              <div className="h-1 w-10 rounded-full bg-slate-200" />
            </div>

            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Add Expense</h3>
              <button
                onClick={() => setShowQuickAdd(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 active:bg-slate-100"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Category presets */}
            <div className="mb-5 flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`min-h-[44px] rounded-2xl px-4 text-sm font-medium active:scale-95 ${
                    category === cat
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                      : "border border-slate-200 bg-slate-50 text-slate-600 active:bg-slate-100"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <form onSubmit={handleQuickAdd} className="space-y-4">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium text-slate-400">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-3.5 pl-9 pr-4 text-lg text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-base text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-base focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <button
                type="submit"
                disabled={saving || !category}
                className="min-h-[52px] w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-semibold text-white shadow-lg shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add Expense"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
