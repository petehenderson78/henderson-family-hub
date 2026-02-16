"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { CalendarFeed } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

const COLOR_PRESETS = [
  { name: "Violet", value: "#8B5CF6" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Emerald", value: "#10B981" },
  { name: "Amber", value: "#F59E0B" },
  { name: "Rose", value: "#F43F5E" },
  { name: "Slate", value: "#64748B" },
];

export default function FeedsView({ userId }: { userId: string }) {
  void userId;
  const supabase = createClient();
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0].value);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchFeeds = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("calendar_feeds")
      .select("*")
      .order("created_at", { ascending: true });
    setFeeds(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchFeeds();
  }, [fetchFeeds]);

  async function handleTest() {
    if (!url.trim()) return;
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch(
        `/api/calendar/feeds/sync?url=${encodeURIComponent(url.trim())}`
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to fetch feed");
      } else {
        setTestResult(`Found ${data.events.length} event(s)`);
      }
    } catch {
      setError("Failed to test feed URL");
    }
    setTesting(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/calendar/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), color }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save feed");
      } else {
        setName("");
        setUrl("");
        setColor(COLOR_PRESETS[0].value);
        setTestResult(null);
        setShowAdd(false);
        fetchFeeds();
      }
    } catch {
      setError("Failed to save feed");
    }
    setSaving(false);
  }

  async function handleDelete(feedId: string) {
    await fetch(`/api/calendar/feeds/${feedId}`, { method: "DELETE" });
    fetchFeeds();
  }

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] pb-28">
      <div className="mx-auto max-w-lg px-4 pt-6">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <Link
            href="/calendar"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm active:scale-95 active:bg-slate-50"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            Calendar Feeds
          </h2>
          <button
            onClick={() => {
              setShowAdd(true);
              setError(null);
              setTestResult(null);
            }}
            className="min-h-[44px] rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 active:scale-[0.97]"
          >
            + Add
          </button>
        </div>

        {/* Feed list */}
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading...</p>
        ) : feeds.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 py-10 text-center">
            <p className="text-sm text-slate-400">No calendar feeds yet</p>
            <p className="mt-1 text-xs text-slate-300">
              Add external calendars like TeamSnap or Google Calendar
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {feeds.map((feed) => (
              <li
                key={feed.id}
                className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="h-3 w-3 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: feed.color }}
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{feed.name}</p>
                    <p className="truncate text-xs text-slate-400">
                      {feed.url}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(feed.id)}
                  className="min-h-[44px] min-w-[44px] flex-shrink-0 flex items-center justify-center rounded-xl text-slate-300 active:bg-red-50 active:text-red-500"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add Feed Modal */}
      {showAdd && (
        <div className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center">
          <div className="animate-slide-up w-full max-w-lg rounded-t-3xl bg-white p-6 pb-10 shadow-2xl sm:rounded-3xl sm:pb-6 max-h-[90dvh] overflow-y-auto">
            {/* Drag handle */}
            <div className="mb-4 flex justify-center sm:hidden">
              <div className="h-1 w-10 rounded-full bg-slate-200" />
            </div>

            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                Add Calendar Feed
              </h3>
              <button
                onClick={() => setShowAdd(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 active:bg-slate-100"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <input
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setTestResult(null);
                  setError(null);
                }}
                placeholder="Feed URL (https://...)"
                required
                className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-base text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Feed name (e.g. TeamSnap)"
                required
                className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-base text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />

              {/* Color picker */}
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Color
                </label>
                <div className="flex gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setColor(preset.value)}
                      className={`h-9 w-9 rounded-full active:scale-90 ${
                        color === preset.value
                          ? "ring-2 ring-offset-2 ring-slate-400"
                          : ""
                      }`}
                      style={{ backgroundColor: preset.value }}
                      title={preset.name}
                    />
                  ))}
                </div>
              </div>

              {/* Test / error / success */}
              {error && (
                <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
                  {error}
                </p>
              )}
              {testResult && (
                <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-600">
                  {testResult}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || !url.trim()}
                  className="min-h-[52px] flex-1 rounded-2xl border border-slate-200 bg-white text-base font-semibold text-slate-700 active:scale-[0.98] disabled:opacity-50"
                >
                  {testing ? "Testing..." : "Test"}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[52px] flex-1 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-base font-semibold text-white shadow-lg shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Add Feed"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
