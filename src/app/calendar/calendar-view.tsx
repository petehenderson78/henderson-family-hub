"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { Event, CalendarFeed, ExternalEvent } from "@/lib/types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const QUICK_ADD_PRESETS = [
  "Cole's Baseball",
  "Lily's Soccer",
  "Family Dinner",
  "Date Night",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatMonthYear(year: number, month: number) {
  return new Date(year, month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function toLocalDateString(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function CalendarView({ userId }: { userId: string }) {
  const supabase = createClient();
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(() =>
    toLocalDateString(new Date())
  );
  const [todayStr, setTodayStr] = useState("");
  const [mounted, setMounted] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  // External feed state
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(false);

  useEffect(() => {
    setTodayStr(toLocalDateString(new Date()));
    setMounted(true);
  }, []);

  // Quick-add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [saving, setSaving] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString();
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59).toISOString();

    const { data } = await supabase
      .from("events")
      .select("*")
      .gte("start_date", startOfMonth)
      .lte("start_date", endOfMonth)
      .order("start_date", { ascending: true });

    setEvents(data ?? []);
    setLoading(false);
  }, [currentYear, currentMonth, supabase]);

  const fetchFeeds = useCallback(async () => {
    const { data } = await supabase
      .from("calendar_feeds")
      .select("*")
      .order("created_at", { ascending: true });
    setFeeds(data ?? []);
    return data ?? [];
  }, [supabase]);

  const syncFeeds = useCallback(
    async (feedList: CalendarFeed[]) => {
      if (feedList.length === 0) {
        setExternalEvents([]);
        return;
      }
      setFeedsLoading(true);

      try {
        const results = await Promise.all(
          feedList.map(async (feed) => {
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

        setExternalEvents(results.flat());
      } catch {
        setExternalEvents([]);
      }
      setFeedsLoading(false);
    },
    []
  );

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    fetchFeeds().then((feedList) => syncFeeds(feedList));
  }, [fetchFeeds, syncFeeds, currentYear, currentMonth]);

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

  function eventsForDate(dateStr: string) {
    const localEvents = events.filter((e) => {
      const local = new Date(e.start_date);
      return toLocalDateString(local) === dateStr;
    });

    const extEvents = externalEvents.filter((e) => {
      const local = new Date(e.start_date);
      return toLocalDateString(local) === dateStr;
    });

    // Combine and sort by start_date
    const all = [
      ...localEvents.map((e) => ({ ...e, is_external: false as const })),
      ...extEvents,
    ].sort(
      (a, b) =>
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );

    return all;
  }

  function dateHasLocalEvents(dateStr: string) {
    return events.some((e) => toLocalDateString(new Date(e.start_date)) === dateStr);
  }

  function dateHasExternalEvents(dateStr: string) {
    return externalEvents.some(
      (e) => toLocalDateString(new Date(e.start_date)) === dateStr
    );
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    const startDate = new Date(`${selectedDate}T${startTime}`).toISOString();
    const endDate = new Date(`${selectedDate}T${endTime}`).toISOString();

    const { error } = await supabase.from("events").insert({
      user_id: userId,
      title: title.trim(),
      description: description.trim() || null,
      start_date: startDate,
      end_date: endDate,
    });

    if (!error) {
      setTitle("");
      setDescription("");
      setStartTime("09:00");
      setEndTime("10:00");
      setShowQuickAdd(false);
      fetchEvents();
    }
    setSaving(false);
  }

  async function handleDelete(eventId: string) {
    await supabase.from("events").delete().eq("id", eventId);
    fetchEvents();
  }

  // Build calendar grid
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  const selectedEvents = eventsForDate(selectedDate);

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
          <div className="flex items-center gap-2">
            <Link
              href="/calendar/feeds"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm active:scale-95 active:bg-slate-50"
              title="Manage calendar feeds"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
            <button
              onClick={nextMonth}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm active:scale-95 active:bg-slate-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Calendar card */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          {/* Weekday headers */}
          <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {calendarCells.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} />;

              const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = mounted && dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const hasLocal = dateHasLocalEvents(dateStr);
              const hasExternal = dateHasExternalEvents(dateStr);

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`relative flex min-h-[44px] flex-col items-center justify-center rounded-full text-sm font-medium active:scale-90 ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/30"
                      : isToday
                        ? "ring-2 ring-blue-500 ring-offset-1 text-blue-700 font-bold"
                        : "text-slate-700 hover:bg-slate-50 active:bg-slate-100"
                  }`}
                >
                  {day}
                  {(hasLocal || hasExternal) && (
                    <span className="absolute bottom-1.5 flex gap-0.5">
                      {hasLocal && (
                        <span
                          className={`h-1 w-1 rounded-full ${
                            isSelected ? "bg-white" : "bg-emerald-500"
                          }`}
                        />
                      )}
                      {hasExternal && (
                        <span
                          className={`h-1 w-1 rounded-full ${
                            isSelected ? "bg-white/70" : "bg-violet-500"
                          }`}
                        />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected date events */}
        <div className="mt-7">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900" suppressHydrationWarning>
              {mounted
                ? new Date(selectedDate + "T12:00:00").toLocaleDateString(
                    "en-US",
                    {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    }
                  )
                : "\u00A0"}
            </h3>
            <button
              onClick={() => setShowQuickAdd(true)}
              className="min-h-[44px] rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 active:scale-[0.97]"
            >
              + Add Event
            </button>
          </div>

          {loading || feedsLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Loading...
            </p>
          ) : selectedEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 py-10 text-center">
              <p className="text-sm text-slate-400">No events this day</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {selectedEvents.map((evt) => {
                const isExternal = "is_external" in evt && evt.is_external;
                const borderColor = isExternal
                  ? (evt as ExternalEvent).sourceColor
                  : undefined;

                return (
                  <li
                    key={`${isExternal ? "ext" : "loc"}-${evt.id}`}
                    className={`flex items-start justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm border-l-4 ${
                      isExternal ? "" : "border-l-emerald-500"
                    }`}
                    style={isExternal ? { borderLeftColor: borderColor } : undefined}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 truncate">
                          {evt.title}
                        </p>
                        {isExternal && (
                          <span
                            className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                            style={{
                              backgroundColor: (evt as ExternalEvent).sourceColor,
                            }}
                          >
                            {(evt as ExternalEvent).source}
                          </span>
                        )}
                      </div>
                      {evt.description &&
                        !(isExternal && (evt as ExternalEvent).location && evt.description === (evt as ExternalEvent).location) && (
                        <p className="mt-0.5 text-sm text-slate-500 line-clamp-2">
                          {evt.description}
                        </p>
                      )}
                      {isExternal && (evt as ExternalEvent).location && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((evt as ExternalEvent).location!)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 flex items-center gap-1 text-xs text-blue-600"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span className="truncate">{(evt as ExternalEvent).location}</span>
                        </a>
                      )}
                      <p className="mt-1.5 text-xs font-medium text-slate-400" suppressHydrationWarning>
                        {new Date(evt.start_date).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}{" "}
                        &ndash;{" "}
                        {new Date(evt.end_date).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    {!isExternal && (
                      <button
                        onClick={() => handleDelete(evt.id)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-300 active:bg-red-50 active:text-red-500"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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
              <h3 className="text-lg font-bold text-slate-900">Quick Add</h3>
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

            {/* Preset buttons */}
            <div className="mb-5 flex flex-wrap gap-2">
              {QUICK_ADD_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setTitle(preset)}
                  className={`min-h-[44px] rounded-2xl px-4 text-sm font-medium active:scale-95 ${
                    title === preset
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                      : "border border-slate-200 bg-slate-50 text-slate-600 active:bg-slate-100"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <form onSubmit={handleQuickAdd} className="space-y-4">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                required
                className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-base text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />

              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notes (optional)"
                className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-base text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Start
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-base focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    End
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-base focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="min-h-[52px] w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-semibold text-white shadow-lg shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add Event"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
