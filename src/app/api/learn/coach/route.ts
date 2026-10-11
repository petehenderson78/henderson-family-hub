/**
 * POST /api/learn/coach — ask the AI coach (authenticated family members only).
 * GET  /api/learn/coach?slug=cole&limit=50 — recent coach log for the parent view.
 *
 * Request (POST, JSON): CoachRequestBody from src/lib/learn/coach-types.ts
 *   { slug, action: "hint"|"explain"|"cheer"|"passage"|"feedback",
 *     skillTitle? (control chars stripped, capped at 120 chars),
 *     question?: { prompt, options?, correctAnswer, childAnswer?, passage?, guidance? },
 *     childText?, level? }
 * Responses:
 *   200 { text }            hint / explain / cheer / feedback
 *   200 { passage }         passage
 *   400 { error: "bad_request", detail }
 *   401 { error: "Unauthorized" }
 *   404 { error: "unknown_learner" }
 *   429 { error: "slow_down" }       per-learner in-memory limit
 *   502 { error: "error" | "bad_passage" }
 *   503 { error: "coach_unavailable" | "busy" }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadLearnerBySlugServer } from "@/lib/learn/server";
import { askCoach, cleanSkillTitle, coachEnabled } from "@/lib/learn/coach";
import { COACH_ACTIONS, type CoachAction, type CoachLogMessage, type CoachQuestion, type CoachRequestBody } from "@/lib/learn/coach-types";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

const MAX_TEXT = 2000;
const MAX_CHILD_TEXT = 1500;
const MAX_OPTIONS = 8;
const MAX_GUIDANCE = 6;
const RATE_LIMIT_CALLS = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const LOG_DEFAULT = 50;
const LOG_MAX = 100;

/**
 * Per-process call timestamps per learner slug (resets on redeploy; that's fine).
 * Bounded: keys are only added after the slug resolved to a real learner, each
 * list holds at most RATE_LIMIT_CALLS in-window timestamps, and learners with
 * no call inside the window are pruned on every check.
 */
const recentCalls = new Map<string, number[]>();

function allowCall(slug: string, now = Date.now()): boolean {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  for (const [key, times] of recentCalls) {
    if (times.length === 0 || times[times.length - 1] <= cutoff) recentCalls.delete(key);
  }
  const calls = (recentCalls.get(slug) ?? []).filter((t) => t > cutoff);
  if (calls.length >= RATE_LIMIT_CALLS) {
    recentCalls.set(slug, calls);
    return false;
  }
  calls.push(now);
  recentCalls.set(slug, calls);
  return true;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type Validated = { ok: true; value: CoachRequestBody } | { ok: false; detail: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Returns a trimmed string, undefined when absent, or null when invalid. */
function optText(v: unknown, max: number): string | undefined | null {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > max ? null : s;
}

function validateQuestion(v: unknown): CoachQuestion | null {
  if (!isRecord(v)) return null;
  const prompt = optText(v.prompt, MAX_TEXT);
  const correctAnswer = optText(v.correctAnswer, MAX_TEXT);
  const childAnswer = optText(v.childAnswer, MAX_TEXT);
  const passage = optText(v.passage, MAX_TEXT);
  if (!prompt || !correctAnswer || childAnswer === null || passage === null) return null;

  let options: string[] | undefined;
  if (v.options !== undefined && v.options !== null) {
    if (!Array.isArray(v.options) || v.options.length > MAX_OPTIONS) return null;
    options = [];
    for (const o of v.options) {
      const s = optText(o, MAX_TEXT);
      if (!s) return null;
      options.push(s);
    }
  }

  let guidance: string[] | undefined;
  if (v.guidance !== undefined && v.guidance !== null) {
    if (!Array.isArray(v.guidance) || v.guidance.length > MAX_GUIDANCE) return null;
    guidance = [];
    for (const g of v.guidance) {
      const s = optText(g, MAX_TEXT);
      if (s === null) return null;
      if (s) guidance.push(s);
    }
  }

  return { prompt, correctAnswer, childAnswer, passage, options, guidance };
}

function validateBody(body: unknown): Validated {
  if (!isRecord(body)) return { ok: false, detail: "body must be a JSON object" };

  const slug = optText(body.slug, 40);
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return { ok: false, detail: "slug is required" };

  const action = body.action;
  if (typeof action !== "string" || !COACH_ACTIONS.includes(action as CoachAction)) {
    return { ok: false, detail: "unknown action" };
  }

  // Hard reject absurd sizes; otherwise strip control characters and cap at
  // MAX_SKILL_TITLE (kid titles are ~25 chars) so it is safe to log and prompt.
  const rawSkillTitle = optText(body.skillTitle, MAX_TEXT);
  if (rawSkillTitle === null) return { ok: false, detail: "skillTitle too long" };
  const skillTitle = cleanSkillTitle(rawSkillTitle);

  const childText = optText(body.childText, MAX_CHILD_TEXT);
  if (childText === null) return { ok: false, detail: "childText must be a string of at most 1500 characters" };

  let level: number | undefined;
  if (body.level !== undefined && body.level !== null) {
    if (typeof body.level !== "number" || !Number.isFinite(body.level) || body.level < 0 || body.level > 12) {
      return { ok: false, detail: "level must be a number between 0 and 12" };
    }
    level = body.level;
  }

  let question: CoachQuestion | undefined;
  if (body.question !== undefined && body.question !== null) {
    const q = validateQuestion(body.question);
    if (!q) return { ok: false, detail: "question is malformed or too long" };
    question = q;
  }

  if ((action === "hint" || action === "explain") && !question) return { ok: false, detail: `${action} needs a question` };
  if (action === "feedback" && !childText) return { ok: false, detail: "feedback needs childText" };

  return { ok: true, value: { slug, action: action as CoachAction, skillTitle, question, childText, level } };
}

// ---------------------------------------------------------------------------
// Logging to learn_coach_messages
// ---------------------------------------------------------------------------

// The table's CHECK constraint allows 'user' | 'assistant' | 'system'; the API
// exposes them as "child" | "coach" | "system".
const DB_ROLE = { child: "user", coach: "assistant" } as const;
const API_ROLE: Record<string, CoachLogMessage["role"]> = { user: "child", assistant: "coach", system: "system" };

function childSummary(req: CoachRequestBody): string {
  switch (req.action) {
    case "hint":
      return "Asked for a hint.";
    case "explain":
      return `Answered "${req.question?.childAnswer ?? ""}" (correct: "${req.question?.correctAnswer ?? ""}").`;
    case "cheer":
      return "Asked for a cheer.";
    case "feedback":
      return req.childText ?? "";
    case "passage":
      return `Asked for a reading passage${typeof req.level === "number" ? ` (level ${req.level})` : ""}.`;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", detail: "invalid JSON" }, { status: 400 });
  }
  const parsed = validateBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: "bad_request", detail: parsed.detail }, { status: 400 });
  const body = parsed.value;

  const learner = await loadLearnerBySlugServer(body.slug);
  if (!learner) return NextResponse.json({ error: "unknown_learner" }, { status: 404 });

  if (!coachEnabled()) return NextResponse.json({ error: "coach_unavailable" }, { status: 503 });
  if (!allowCall(learner.slug)) return NextResponse.json({ error: "slow_down" }, { status: 429 });

  const result = await askCoach({
    learner: { slug: learner.slug, name: learner.name, grade: learner.grade },
    action: body.action,
    skillTitle: body.skillTitle,
    question: body.question,
    childText: body.childText,
    level: body.level,
  });

  if (result.kind === "error") {
    const status = result.error === "coach_unavailable" || result.error === "busy" ? 503 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  const context = {
    action: body.action,
    skill: body.skillTitle ?? null,
    question: body.question
      ? {
          prompt: body.question.prompt,
          options: body.question.options ?? null,
          correctAnswer: body.question.correctAnswer,
          childAnswer: body.question.childAnswer ?? null,
        }
      : null,
    level: body.level ?? null,
  };
  const coachContent = result.kind === "passage" ? `${result.passage.title}\n\n${result.passage.text}` : result.text;
  const coachContext =
    result.kind === "passage"
      ? { action: body.action, passage: result.passage }
      : { action: body.action, refused: result.refused === true };

  // Two sequential inserts so created_at keeps child-before-coach order.
  // Logging must never fail the reply.
  try {
    const first = await supabase
      .from("learn_coach_messages")
      .insert({ learner_id: learner.id, role: DB_ROLE.child, content: childSummary(body), context });
    const second = await supabase
      .from("learn_coach_messages")
      .insert({ learner_id: learner.id, role: DB_ROLE.coach, content: coachContent, context: coachContext });
    if (first.error || second.error) console.warn("coach log insert failed", first.error ?? second.error);
  } catch (err) {
    console.warn("coach log insert failed", err);
  }

  if (result.kind === "passage") return NextResponse.json({ passage: result.passage });
  return NextResponse.json({ text: result.text });
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") ?? "").trim();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: "bad_request", detail: "slug is required" }, { status: 400 });
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Math.min(LOG_MAX, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : LOG_DEFAULT));

  const learner = await loadLearnerBySlugServer(slug);
  if (!learner) return NextResponse.json({ error: "unknown_learner" }, { status: 404 });

  const { data, error } = await supabase
    .from("learn_coach_messages")
    .select("id, role, content, context, created_at")
    .eq("learner_id", learner.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: "error", detail: error.message }, { status: 500 });

  type Row = { id: string; role: string; content: string; context: unknown; created_at: string };
  const messages: CoachLogMessage[] = ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    role: API_ROLE[row.role] ?? "system",
    text: row.content ?? "",
    context: isRecord(row.context) ? row.context : null,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ messages });
}
