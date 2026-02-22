"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RecurringExpense } from "@/lib/types";
import { CATEGORIES, CATEGORY_COLORS } from "./constants";

interface RecurringExpensesProps {
  userId: string;
  expenses: RecurringExpense[];
  onChanged: () => void;
}

export default function RecurringExpenses({
  userId,
  expenses,
  onChanged,
}: RecurringExpensesProps) {
  const supabase = createClient();
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !amount || !category) return;

    setSaving(true);
    const { error } = await supabase.from("recurring_expenses").insert({
      user_id: userId,
      title: title.trim(),
      amount: parseFloat(amount),
      category,
      day_of_month: parseInt(dayOfMonth),
      description: description.trim() || null,
    });

    if (!error) {
      setTitle("");
      setAmount("");
      setCategory("");
      setDayOfMonth("1");
      setDescription("");
      setShowAdd(false);
      onChanged();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await supabase.from("recurring_expenses").delete().eq("id", id);
    onChanged();
  }

  const activeExpenses = expenses.filter((e) => e.is_active);

  function ordinalSuffix(n: number) {
    if (n >= 11 && n <= 13) return "th";
    switch (n % 10) {
      case 1: return "st";
      case 2: return "nd";
      case 3: return "rd";
      default: return "th";
    }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Recurring Bills
        </h3>
        <button
          onClick={() => setShowAdd(true)}
          className="min-h-[44px] rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-sm font-semibold text-white shadow-md shadow-blue-500/20 active:scale-[0.97]"
        >
          + Add
        </button>
      </div>

      {activeExpenses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white/50 py-6 text-center">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto mb-2 text-slate-300"
          >
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <p className="text-sm text-slate-400">No recurring bills</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {activeExpenses.map((exp) => (
            <li
              key={exp.id}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {exp.title}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[exp.category] ?? CATEGORY_COLORS["Other"]}`}
                  >
                    {exp.category}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    ${Number(exp.amount).toFixed(2)}
                  </span>
                  <span>
                    Due on the {exp.day_of_month}{ordinalSuffix(exp.day_of_month)}
                  </span>
                </div>
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

      {/* Add Recurring Expense Modal */}
      {showAdd && (
        <div className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center">
          <div className="animate-slide-up w-full max-w-lg rounded-t-3xl bg-white p-6 pb-10 shadow-2xl sm:rounded-3xl sm:pb-6 max-h-[90dvh] overflow-y-auto">
            {/* Drag handle */}
            <div className="mb-4 flex justify-center sm:hidden">
              <div className="h-1 w-10 rounded-full bg-slate-200" />
            </div>

            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Add Recurring Bill</h3>
              <button
                onClick={() => setShowAdd(false)}
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

            <form onSubmit={handleAdd} className="space-y-4">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Bill name (e.g. Netflix, Rent)"
                required
                className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-base text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />

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

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Day of Month
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  required
                  className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-base text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-base text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />

              <button
                type="submit"
                disabled={saving || !category || !title.trim()}
                className="min-h-[52px] w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-semibold text-white shadow-lg shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add Recurring Bill"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
