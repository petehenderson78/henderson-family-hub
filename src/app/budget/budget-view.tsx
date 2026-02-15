"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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
  Groceries: "bg-green-100 text-green-800",
  "Dining Out": "bg-orange-100 text-orange-800",
  Gas: "bg-yellow-100 text-yellow-800",
  "Kids Activities": "bg-purple-100 text-purple-800",
  Shopping: "bg-pink-100 text-pink-800",
  Bills: "bg-red-100 text-red-800",
  Entertainment: "bg-blue-100 text-blue-800",
  Other: "bg-gray-100 text-gray-800",
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
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <Link
            href="/"
            className="min-h-[44px] flex items-center text-base font-medium text-blue-600 active:text-blue-800"
          >
            Home
          </Link>
          <h1 className="text-lg font-bold text-gray-900">Budget</h1>
          <div className="w-14" />
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 pt-4">
        {/* Month navigation */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={prevMonth}
            className="min-h-[44px] min-w-[44px] rounded-lg bg-white text-xl font-bold text-gray-700 shadow-sm active:bg-gray-100"
          >
            &lsaquo;
          </button>
          <h2 className="text-xl font-semibold text-gray-900" suppressHydrationWarning>
            {formatMonthYear(currentYear, currentMonth)}
          </h2>
          <button
            onClick={nextMonth}
            className="min-h-[44px] min-w-[44px] rounded-lg bg-white text-xl font-bold text-gray-700 shadow-sm active:bg-gray-100"
          >
            &rsaquo;
          </button>
        </div>

        {/* Total card */}
        <div className="mb-4 rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Spent</p>
          <p className="text-3xl font-bold text-gray-900" suppressHydrationWarning>
            {mounted ? formatCurrency(totalSpent) : "\u00A0"}
          </p>
        </div>

        {/* Category breakdown */}
        {sortedCategories.length > 0 && (
          <div className="mb-6 rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-500">
              By Category
            </h3>
            <ul className="space-y-2">
              {sortedCategories.map(([cat, total]) => (
                <li key={cat} className="flex items-center justify-between">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${CATEGORY_COLORS[cat] ?? CATEGORY_COLORS["Other"]}`}
                  >
                    {cat}
                  </span>
                  <span className="text-sm font-semibold text-gray-700" suppressHydrationWarning>
                    {formatCurrency(total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Add Expense button + expense list */}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Expenses</h3>
          <button
            onClick={() => setShowQuickAdd(true)}
            className="min-h-[44px] rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm active:bg-blue-700"
          >
            + Add Expense
          </button>
        </div>

        {loading ? (
          <p className="py-4 text-center text-sm text-gray-500">Loading...</p>
        ) : expenses.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">
            No expenses this month
          </p>
        ) : (
          <ul className="space-y-2">
            {expenses.map((exp) => (
              <li
                key={exp.id}
                className="flex items-start justify-between rounded-lg bg-white p-4 shadow-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-gray-900" suppressHydrationWarning>
                      {formatCurrency(Number(exp.amount))}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[exp.category] ?? CATEGORY_COLORS["Other"]}`}
                    >
                      {exp.category}
                    </span>
                  </div>
                  {exp.description && (
                    <p className="mt-0.5 text-sm text-gray-500">
                      {exp.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400" suppressHydrationWarning>
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
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 active:bg-red-50 active:text-red-500"
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick Add Modal */}
      {showQuickAdd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Add Expense</h3>
              <button
                onClick={() => setShowQuickAdd(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-2xl text-gray-400 active:bg-gray-100"
              >
                &times;
              </button>
            </div>

            {/* Category presets */}
            <div className="mb-4 flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`min-h-[44px] rounded-full px-4 text-sm font-medium shadow-sm active:scale-95 ${
                    category === cat
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 active:bg-gray-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <form onSubmit={handleQuickAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Amount
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
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
                    className="block w-full rounded-lg border border-gray-300 py-3 pl-8 pr-4 text-lg shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Costco run"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={saving || !category}
                className="min-h-[52px] w-full rounded-lg bg-blue-600 text-base font-semibold text-white shadow-sm active:bg-blue-700 disabled:opacity-50"
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
