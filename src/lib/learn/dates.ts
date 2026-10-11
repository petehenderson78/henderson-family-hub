/**
 * Date helpers. Sessions are keyed by a YYYY-MM-DD string in the family's
 * timezone so the server (UTC on Vercel) and the phones agree on "today".
 * Pure — no DOM.
 */

export const FAMILY_TZ = "America/New_York";

/** YYYY-MM-DD for `now` in the family timezone. */
export function todayInFamilyTz(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FAMILY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Parse YYYY-MM-DD as a UTC midnight Date (for day arithmetic only). */
export function dateStrToUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

/** Format a UTC-midnight Date back to YYYY-MM-DD. */
export function utcToDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Add n days (negative allowed) to a YYYY-MM-DD string. */
export function addDaysToDateStr(dateStr: string, n: number): string {
  const d = dateStrToUtc(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToDateStr(d);
}

/** 0 = Monday … 6 = Sunday for a YYYY-MM-DD string. */
export function weekdayIndexMon(dateStr: string): number {
  return (dateStrToUtc(dateStr).getUTCDay() + 6) % 7;
}

/** Monday..Sunday date strings of the week containing `dateStr`. */
export function weekDates(dateStr: string): string[] {
  const monday = addDaysToDateStr(dateStr, -weekdayIndexMon(dateStr));
  return Array.from({ length: 7 }, (_, i) => addDaysToDateStr(monday, i));
}

/** ISO week number (1..53) — used to rotate weekly workshop picks. */
export function isoWeekNumber(dateStr: string): number {
  const d = dateStrToUtc(dateStr);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

export function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 86400000);
}

/** Short, friendly weekday label ("Mon"). */
export function weekdayShort(dateStr: string): string {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][weekdayIndexMon(dateStr)];
}

/** Saturday or Sunday (family norm: 105-minute weekend missions). */
export function isWeekend(dateStr: string): boolean {
  return weekdayIndexMon(dateStr) >= 5;
}

/** Friday → the brain block becomes the "mix-up" interleaved review. */
export function isFriday(dateStr: string): boolean {
  return weekdayIndexMon(dateStr) === 4;
}

/** Minutes since local midnight for `now` in the family timezone (0..1439). */
export function minutesSinceMidnightInFamilyTz(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FAMILY_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (hour % 24) * 60 + minute;
}

/** "HH:MM" (24h) → minutes since midnight; null when malformed. */
export function parseClock(hhmm: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Inclusive YYYY-MM-DD range test (string compare is safe for ISO dates). */
export function dateInRange(dateStr: string, from: string, to: string): boolean {
  return dateStr >= from && dateStr <= to;
}
