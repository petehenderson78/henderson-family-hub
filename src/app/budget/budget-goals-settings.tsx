"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BudgetGoal } from "@/lib/types";
import { CATEGORIES, CATEGORY_CHART_COLORS } from "./constants";

interface BudgetGoalsSettingsProps {
  userId: string;
  goals: BudgetGoal[];
  onClose: () => void;
  onSaved: () => void;
}

export default function BudgetGoalsSettings({
  userId,
  goals,
  onClose,
  onSaved,
}: BudgetGoalsSettingsProps) {
  const supabase = createClient();
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const g of goals) {
      initial[g.category] = String(g.monthly_limit);
    }
    setLimits(initial);
  }, [goals]);

  async function handleSave() {
    setSaving(true);

    const toUpsert: { user_id: string; category: string; monthly_limit: number }[] = [];
    const toDelete: string[] = [];

    for (const cat of CATEGORIES) {
      const val = limits[cat]?.trim();
      const existing = goals.find((g) => g.category === cat);

      if (val && parseFloat(val) > 0) {
        toUpsert.push({
          user_id: userId,
          category: cat,
          monthly_limit: parseFloat(val),
        });
      } else if (existing) {
        toDelete.push(existing.id);
      }
    }

    if (toUpsert.length > 0) {
      await supabase
        .from("budget_goals")
        .upsert(toUpsert, { onConflict: "user_id,category" });
    }

    if (toDelete.length > 0) {
      await supabase
        .from("budget_goals")
        .delete()
        .in("id", toDelete);
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center">
      <div className="animate-slide-up w-full max-w-lg rounded-t-3xl bg-white p-6 pb-10 shadow-2xl sm:rounded-3xl sm:pb-6 max-h-[90dvh] overflow-y-auto">
        {/* Drag handle */}
        <div className="mb-4 flex justify-center sm:hidden">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Budget Goals</h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 active:bg-slate-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="mb-5 text-sm text-slate-500">
          Set monthly spending limits per category. Leave blank for no limit.
        </p>

        <div className="space-y-3">
          {CATEGORIES.map((cat) => (
            <div key={cat} className="flex items-center gap-3">
              <span
                className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_CHART_COLORS[cat] ?? "#94A3B8" }}
              />
              <span className="w-28 flex-shrink-0 text-sm font-medium text-slate-700">
                {cat}
              </span>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={limits[cat] ?? ""}
                  onChange={(e) =>
                    setLimits((prev) => ({ ...prev, [cat]: e.target.value }))
                  }
                  placeholder="0.00"
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-7 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-6 min-h-[52px] w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-semibold text-white shadow-lg shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Goals"}
        </button>
      </div>
    </div>
  );
}
