"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Event } from "@/lib/types";

interface DashboardViewProps {
  firstName: string;
  todayEvents: Event[];
  monthTotal: number;
  userId: string;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardView({
  firstName,
  todayEvents,
  monthTotal,
}: DashboardViewProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter to only events that are actually today in the user's local timezone
  const localToday = new Date();
  const todayStr = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, "0")}-${String(localToday.getDate()).padStart(2, "0")}`;
  const filteredEvents = todayEvents.filter((evt) => {
    const d = new Date(evt.start_date);
    const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return localDate === todayStr;
  });

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
      <div className="mx-auto max-w-lg px-4 pt-10">
        {/* Greeting */}
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900" suppressHydrationWarning>
          {mounted ? `${getGreeting()}, ${firstName}` : `Hello, ${firstName}`}
        </h1>
        <p className="mt-1.5 text-sm font-medium text-slate-400" suppressHydrationWarning>
          {mounted
            ? new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
            : "\u00A0"}
        </p>

        {/* Summary Cards */}
        <div className="mt-7 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Today</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {filteredEvents.length}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">events</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Spent</p>
            <p className="mt-1 text-3xl font-bold text-slate-900" suppressHydrationWarning>
              {mounted ? formatCurrency(monthTotal) : "\u00A0"}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">this month</p>
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="mt-9">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
            Today&apos;s Schedule
          </h2>
          {filteredEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 py-10 text-center">
              <p className="text-sm text-slate-400">No events today</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {filteredEvents.map((evt) => (
                <li
                  key={evt.id}
                  className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm border-l-4 border-l-emerald-500"
                >
                  <p className="font-semibold text-slate-900">{evt.title}</p>
                  <p className="mt-1 text-xs font-medium text-slate-400" suppressHydrationWarning>
                    {mounted
                      ? `${new Date(evt.start_date).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })} – ${new Date(evt.end_date).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}`
                      : "\u00A0"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-9 grid grid-cols-2 gap-3">
          <Link
            href="/calendar"
            className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 active:scale-[0.98] active:shadow-md"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Event
          </Link>
          <Link
            href="/budget"
            className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm active:scale-[0.98] active:bg-slate-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Expense
          </Link>
        </div>
      </div>
    </div>
  );
}
