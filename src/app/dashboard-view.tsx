"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Event, ExternalEvent } from "@/lib/types";

export interface LearningSummary {
  slug: string;
  name: string;
  status: "done" | "in-progress" | "not-started";
  blocksDone: number;
  blocksTotal: number;
  streak: number;
}

interface DashboardViewProps {
  firstName: string;
  todayEvents: Event[];
  monthTotal: number;
  /** false for a child's login: no spending card, no Add Expense link (the server sends monthTotal 0) */
  showFinances?: boolean;
  userId: string;
  learning?: LearningSummary[];
  /** replaces the empty-state line of the Learning card (Learn not set up / unreachable) */
  learningNote?: string;
  /** parents → /learn/tonight, kids → their own Mission Control */
  learnHref?: string;
  learnTitle?: string;
}

const KID_EMOJI: Record<string, string> = { cole: "🚀", lily: "🌈" };

// false while rendering on the server and hydrating, true on the client afterwards
// (time-of-day text must not differ between the two).
const noSubscription = () => () => {};
const onClient = () => true;
const onServer = () => false;

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

function toLocalDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Events from the subscribed ICS feeds; null when there are no feeds or the read failed (best-effort). */
async function fetchFeedEvents(supabase: ReturnType<typeof createClient>): Promise<ExternalEvent[] | null> {
  const { data: feeds } = await supabase
    .from("calendar_feeds")
    .select("*")
    .order("created_at", { ascending: true });

  if (!feeds || feeds.length === 0) return null;

  try {
    const results = await Promise.all(
      feeds.map(async (feed) => {
        try {
          const res = await fetch(
            `/api/calendar/feeds/sync?url=${encodeURIComponent(feed.url)}`
          );
          if (!res.ok) return [];
          const data = await res.json();
          return (data.events ?? []).map(
            (evt: { id: string; title: string; description: string | null; location: string | null; start_date: string; end_date: string }) => ({
              ...evt,
              source: feed.name,
              sourceColor: feed.color,
              is_external: true as const,
            })
          );
        } catch {
          return [];
        }
      })
    );
    return results.flat();
  } catch {
    return null; // best-effort
  }
}

export default function DashboardView({
  firstName,
  todayEvents,
  monthTotal,
  showFinances = true,
  learning = [],
  learningNote,
  learnHref = "/learn",
  learnTitle = "Today's missions",
}: DashboardViewProps) {
  const supabase = createClient();
  const mounted = useSyncExternalStore(noSubscription, onClient, onServer);
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([]);

  useEffect(() => {
    let alive = true;
    fetchFeedEvents(supabase).then((events) => {
      if (alive && events) setExternalEvents(events);
    });
    return () => {
      alive = false;
    };
  }, [supabase]);

  // Filter to only events that are actually today in the user's local timezone
  const todayStr = toLocalDateStr(new Date());

  const filteredDbEvents = todayEvents.filter((evt) => {
    return toLocalDateStr(new Date(evt.start_date)) === todayStr;
  });

  const filteredExtEvents = externalEvents.filter((evt) => {
    return toLocalDateStr(new Date(evt.start_date)) === todayStr;
  });

  const allTodayEvents = [
    ...filteredDbEvents.map((e) => ({ ...e, is_external: false as const })),
    ...filteredExtEvents,
  ].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

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
          <div className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-sm ${showFinances ? "" : "col-span-2"}`}>
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
              {allTodayEvents.length}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">events</p>
          </div>
          {showFinances && (
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
          )}
        </div>

        {/* Learning */}
        <Link
          href={learnHref}
          className="mt-3 block rounded-2xl border border-slate-100 bg-white p-5 shadow-sm active:bg-slate-50"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10L12 5 2 10l10 5 10-5z" />
                  <path d="M6 12.5V17c0 1.1 2.7 3 6 3s6-1.9 6-3v-4.5" />
                  <line x1="22" y1="10" x2="22" y2="16" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Learning</p>
                <p className="text-sm font-semibold text-slate-900">{learnTitle}</p>
              </div>
            </div>
            <span className="text-slate-300">→</span>
          </div>
          {learning.length === 0 ? (
            <p className="mt-3 text-xs text-slate-400">{learningNote ?? "Set up the Learn module to see Cole and Lily here."}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {learning.map((kid) => (
                <li key={kid.slug} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                  <span className="text-xl" aria-hidden>{KID_EMOJI[kid.slug] ?? "⭐"}</span>
                  <span className="flex-1 text-sm font-semibold text-slate-900">{kid.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      kid.status === "done"
                        ? "bg-emerald-100 text-emerald-700"
                        : kid.status === "in-progress"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-white text-slate-400 border border-slate-200"
                    }`}
                  >
                    {kid.status === "done" ? "Done ✓" : kid.status === "in-progress" ? `${kid.blocksDone}/${kid.blocksTotal} blocks` : "Not yet"}
                  </span>
                  <span className={`text-xs font-bold tabular-nums ${kid.streak > 0 ? "text-orange-600" : "text-slate-300"}`}>🔥 {kid.streak}</span>
                </li>
              ))}
            </ul>
          )}
        </Link>

        {/* Today's Schedule */}
        <div className="mt-9">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
            Today&apos;s Schedule
          </h2>
          {allTodayEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 py-10 text-center">
              <p className="text-sm text-slate-400">No events today</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {allTodayEvents.map((evt) => {
                const isExt = "is_external" in evt && evt.is_external;
                return (
                  <li
                    key={`${isExt ? "ext" : "loc"}-${evt.id}`}
                    className={`rounded-2xl border border-slate-100 bg-white p-4 shadow-sm border-l-4 ${isExt ? "" : "border-l-emerald-500"}`}
                    style={isExt ? { borderLeftColor: (evt as ExternalEvent).sourceColor } : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 truncate">{evt.title}</p>
                      {isExt && (
                        <span
                          className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: (evt as ExternalEvent).sourceColor }}
                        >
                          {(evt as ExternalEvent).source}
                        </span>
                      )}
                    </div>
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
                );
              })}
            </ul>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-9 grid grid-cols-2 gap-3">
          <Link
            href="/calendar"
            className={`${showFinances ? "" : "col-span-2 "}flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 active:scale-[0.98] active:shadow-md`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Event
          </Link>
          {showFinances && (
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
          )}
        </div>
      </div>
    </div>
  );
}
