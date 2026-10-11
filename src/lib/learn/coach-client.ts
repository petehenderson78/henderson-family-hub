/**
 * Browser-side helpers for the AI coach: call /api/learn/coach and map error
 * codes to kid-friendly copy. Safe to import from client components (no env
 * vars, no SDK).
 */

import type { CoachLogMessage, CoachPassage, CoachRequestBody, CoachRouteError } from "./coach-types";

export type CoachResponse = { ok: true; text: string } | { ok: true; passage: CoachPassage } | { ok: false; error: CoachRouteError };

const KNOWN_ERRORS: readonly CoachRouteError[] = [
  "coach_unavailable",
  "busy",
  "error",
  "bad_passage",
  "unauthorized",
  "bad_request",
  "unknown_learner",
  "slow_down",
  "offline",
];

function toRouteError(code: unknown, status: number): CoachRouteError {
  if (status === 401) return "unauthorized";
  if (typeof code === "string" && (KNOWN_ERRORS as readonly string[]).includes(code)) return code as CoachRouteError;
  return "error";
}

/** Kid-facing copy per error code. */
export function coachErrorCopy(code: CoachRouteError): string {
  switch (code) {
    case "coach_unavailable":
      return "Coach is resting. Ask Mom or Dad!";
    case "busy":
      return "Coach is helping someone else. Try again in a minute!";
    case "slow_down":
      return "Whoa, lots of questions! Coach needs a little break.";
    case "offline":
      return "Coach can't connect right now. Check the Wi-Fi!";
    case "unauthorized":
      return "You need to be signed in to talk to Coach.";
    case "bad_passage":
      return "Coach's story got jumbled. Try again!";
    case "bad_request":
    case "unknown_learner":
    case "error":
    default:
      return "Coach got tangled up. Try again!";
  }
}

export async function requestCoach(body: CoachRequestBody): Promise<CoachResponse> {
  let res: Response;
  try {
    res = await fetch("/api/learn/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "offline" };
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  const obj = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};

  if (!res.ok) return { ok: false, error: toRouteError(obj.error, res.status) };
  if (typeof obj.text === "string") return { ok: true, text: obj.text };
  if (typeof obj.passage === "object" && obj.passage !== null) return { ok: true, passage: obj.passage as CoachPassage };
  return { ok: false, error: "error" };
}

/** Parent view: newest-first coach log for one learner. Throws on failure. */
export async function fetchCoachLog(slug: string, limit = 20): Promise<CoachLogMessage[]> {
  const res = await fetch(`/api/learn/coach?slug=${encodeURIComponent(slug)}&limit=${limit}`);
  if (!res.ok) throw new Error(`coach log: ${res.status}`);
  const data = (await res.json()) as { messages?: CoachLogMessage[] };
  return Array.isArray(data.messages) ? data.messages : [];
}
