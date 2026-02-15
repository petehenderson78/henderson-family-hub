"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { Event } from "@/lib/types";

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
    const startOfMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01T00:00:00`;
    const endOfMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${getDaysInMonth(currentYear, currentMonth)}T23:59:59`;

    const { data } = await supabase
      .from("events")
      .select("*")
      .gte("start_date", startOfMonth)
      .lte("start_date", endOfMonth)
      .order("start_date", { ascending: true });

    setEvents(data ?? []);
    setLoading(false);
  }, [currentYear, currentMonth, supabase]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

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
    return events.filter((e) => e.start_date.startsWith(dateStr));
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    const startDate = `${selectedDate}T${startTime}:00`;
    const endDate = `${selectedDate}T${endTime}:00`;

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
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <Link
            href="/"
            className="text-blue-600 active:text-blue-800 text-base font-medium min-h-[44px] flex items-center"
          >
            Home
          </Link>
          <h1 className="text-lg font-bold text-gray-900">Calendar</h1>
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

        {/* Weekday headers */}
        <div className="mb-1 grid grid-cols-7 text-center text-xs font-semibold text-gray-500">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;

            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = mounted && dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const dayEvents = eventsForDate(dateStr);

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`relative flex min-h-[44px] flex-col items-center justify-center rounded-lg text-sm font-medium transition-colors active:scale-95 ${
                  isSelected
                    ? "bg-blue-600 text-white"
                    : isToday
                      ? "bg-blue-100 text-blue-700"
                      : "bg-white text-gray-800 active:bg-gray-100"
                }`}
              >
                {day}
                {dayEvents.length > 0 && (
                  <span
                    className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${
                      isSelected ? "bg-white" : "bg-blue-500"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected date events */}
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900" suppressHydrationWarning>
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
              className="min-h-[44px] rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm active:bg-blue-700"
            >
              + Add Event
            </button>
          </div>

          {loading ? (
            <p className="py-4 text-center text-sm text-gray-500">
              Loading...
            </p>
          ) : selectedEvents.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              No events this day
            </p>
          ) : (
            <ul className="space-y-2">
              {selectedEvents.map((evt) => (
                <li
                  key={evt.id}
                  className="flex items-start justify-between rounded-lg bg-white p-4 shadow-sm"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{evt.title}</p>
                    {evt.description && (
                      <p className="mt-0.5 text-sm text-gray-500">
                        {evt.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-400" suppressHydrationWarning>
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
                  <button
                    onClick={() => handleDelete(evt.id)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 active:bg-red-50 active:text-red-500"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick Add Modal */}
      {showQuickAdd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Quick Add</h3>
              <button
                onClick={() => setShowQuickAdd(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-2xl text-gray-400 active:bg-gray-100"
              >
                &times;
              </button>
            </div>

            {/* Preset buttons */}
            <div className="mb-4 flex flex-wrap gap-2">
              {QUICK_ADD_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setTitle(preset)}
                  className={`min-h-[44px] rounded-full px-4 text-sm font-medium shadow-sm active:scale-95 ${
                    title === preset
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 active:bg-gray-200"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <form onSubmit={handleQuickAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Event Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Cole's Baseball"
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Bring cleats"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Start
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    End
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="min-h-[52px] w-full rounded-lg bg-blue-600 text-base font-semibold text-white shadow-sm active:bg-blue-700 disabled:opacity-50"
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
