"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import type { DiscoveredEvent } from "@/lib/types";

export default function GmailScan({
  userId,
  onEventsAdded,
}: {
  userId: string;
  onEventsAdded: () => void;
}) {
  const supabase = createClient();
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [discoveredEvents, setDiscoveredEvents] = useState<DiscoveredEvent[]>(
    []
  );
  const [showModal, setShowModal] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Check connection status
      try {
        const res = await fetch("/api/gmail/connect");
        if (!cancelled && res.ok) {
          const data = await res.json();
          setConnected(data.connected);
        }
      } catch {
        // ignore
      }

      // Check if we just came back from OAuth with a refresh token
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled && session?.provider_refresh_token) {
          await fetch("/api/gmail/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              refresh_token: session.provider_refresh_token,
              email: session.user?.email,
            }),
          });
          if (!cancelled) setConnected(true);
        }
      } catch {
        // ignore
      }

      if (!cancelled) setChecking(false);
    }

    init();
    return () => { cancelled = true; };
  }, [supabase]);

  async function handleConnect() {
    setShowPrompt(false);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/gmail.readonly",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
        redirectTo: `${window.location.origin}/auth/callback?next=/calendar`,
      },
    });
  }

  async function handleScan() {
    setScanning(true);
    setScanError(null);

    try {
      const res = await fetch("/api/gmail/scan", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "reconnect") {
          setConnected(false);
          setScanError("Gmail connection expired. Please reconnect.");
          return;
        }
        setScanError("Failed to scan emails. Please try again.");
        return;
      }

      if (data.events.length === 0) {
        setScanError("No school events found in recent emails.");
        return;
      }

      setDiscoveredEvents(data.events);
      setShowModal(true);
    } catch {
      setScanError("Failed to scan emails. Please try again.");
    } finally {
      setScanning(false);
    }
  }

  async function handleAccept(event: DiscoveredEvent) {
    await supabase.from("events").insert({
      user_id: userId,
      title: event.title,
      description: event.description,
      start_date: event.start_date,
      end_date: event.end_date,
    });

    setDiscoveredEvents((prev) => prev.filter((e) => e.id !== event.id));
    onEventsAdded();
  }

  async function handleAcceptAll() {
    const inserts = discoveredEvents.map((event) => ({
      user_id: userId,
      title: event.title,
      description: event.description,
      start_date: event.start_date,
      end_date: event.end_date,
    }));

    await supabase.from("events").insert(inserts);
    setDiscoveredEvents([]);
    onEventsAdded();
  }

  function handleDismiss(id: string) {
    setDiscoveredEvents((prev) => prev.filter((e) => e.id !== id));
  }

  // Auto-close modal when all events handled
  useEffect(() => {
    if (showModal && discoveredEvents.length === 0) {
      const timer = setTimeout(() => setShowModal(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [showModal, discoveredEvents.length]);

  if (checking) return null;

  return (
    <>
      {/* Scan button */}
      <div className="relative">
        <button
          onClick={() => {
            if (connected) {
              handleScan();
            } else {
              setShowPrompt(!showPrompt);
            }
          }}
          disabled={scanning}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm active:scale-95 active:bg-slate-50 disabled:opacity-50"
          title={connected ? "Scan Gmail for events" : "Connect Gmail"}
        >
          {scanning ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              className="animate-spin"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" strokeDasharray="50" strokeDashoffset="20" />
            </svg>
          ) : (
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
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          )}
          {connected && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
          )}
        </button>

        {/* Connect prompt popover */}
        {showPrompt && !connected && (
          <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
            <p className="mb-3 text-sm text-slate-600">
              Connect Gmail to find events from teachers and schools
            </p>
            <button
              onClick={handleConnect}
              className="min-h-[44px] w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-sm font-semibold text-white shadow-md active:scale-[0.97]"
            >
              Connect Gmail
            </button>
          </div>
        )}
      </div>

      {/* Error toast */}
      {scanError && (
        <div className="animate-fade-in fixed left-4 right-4 top-4 z-[70] mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-amber-800">{scanError}</p>
            <button
              onClick={() => setScanError(null)}
              className="flex-shrink-0 text-amber-400 active:text-amber-600"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Review modal */}
      {showModal && (
        <div className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center">
          <div className="animate-slide-up w-full max-w-lg rounded-t-3xl bg-white p-6 pb-10 shadow-2xl sm:rounded-3xl sm:pb-6 max-h-[90dvh] overflow-y-auto">
            {/* Drag handle */}
            <div className="mb-4 flex justify-center sm:hidden">
              <div className="h-1 w-10 rounded-full bg-slate-200" />
            </div>

            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                Discovered Events
              </h3>
              <button
                onClick={() => setShowModal(false)}
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

            {discoveredEvents.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mb-2 text-3xl">&#10003;</div>
                <p className="text-sm text-slate-500">
                  All events handled!
                </p>
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {discoveredEvents.map((evt) => (
                    <li
                      key={evt.id}
                      className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm border-l-4 border-l-blue-500"
                    >
                      <div className="mb-2">
                        <p className="font-semibold text-slate-900">
                          {evt.title}
                        </p>
                        {evt.description && (
                          <p className="mt-0.5 text-sm text-slate-500 line-clamp-2">
                            {evt.description}
                          </p>
                        )}
                      </div>

                      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>
                          {new Date(evt.start_date).toLocaleDateString(
                            "en-US",
                            {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            }
                          )}
                          {" "}
                          {new Date(evt.start_date).toLocaleTimeString(
                            "en-US",
                            { hour: "numeric", minute: "2-digit" }
                          )}
                          {" \u2013 "}
                          {new Date(evt.end_date).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        {evt.location && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(evt.location)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="flex-shrink-0"
                            >
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            <span className="truncate">{evt.location}</span>
                          </a>
                        )}
                      </div>

                      <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                        From: {evt.source_email}
                      </p>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAccept(evt)}
                          className="min-h-[44px] flex-1 rounded-xl bg-emerald-500 text-sm font-semibold text-white shadow-sm active:scale-[0.97]"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleDismiss(evt.id)}
                          className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 active:scale-[0.97] active:bg-slate-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                {discoveredEvents.length > 1 && (
                  <button
                    onClick={handleAcceptAll}
                    className="mt-4 min-h-[52px] w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-base font-semibold text-white shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                  >
                    Accept All ({discoveredEvents.length})
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
