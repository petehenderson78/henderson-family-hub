interface ParsedEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_date: string;
  end_date: string;
}

function unfoldLines(raw: string): string[] {
  // Normalize to LF, then unfold continuation lines (space or tab at start)
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && result.length > 0) {
      result[result.length - 1] += line.slice(1);
    } else {
      result.push(line);
    }
  }

  return result;
}

/**
 * Convert local date/time in a specific IANA timezone to a UTC Date.
 * Uses Intl.DateTimeFormat to compute the timezone's UTC offset.
 */
function tzToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number,
  tz: string
): Date {
  const utcMs = Date.UTC(year, month, day, hour, minute, second);
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date(utcMs));
    const p = (type: string) =>
      parseInt(parts.find((x) => x.type === type)?.value ?? "0");
    let h = p("hour");
    if (h === 24) h = 0;
    const tzMs = Date.UTC(p("year"), p("month") - 1, p("day"), h, p("minute"), p("second"));
    return new Date(utcMs - (tzMs - utcMs));
  } catch {
    // Invalid timezone name — treat as UTC
    return new Date(utcMs);
  }
}

function parseICSDate(value: string, paramPart: string, feedTz: string | null): Date | null {
  try {
    // All-day: VALUE=DATE:20260215
    if (paramPart.toUpperCase().includes("VALUE=DATE")) {
      const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (!match) return null;
      // Use noon UTC so the date stays correct in any US timezone
      return new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], 12, 0, 0));
    }

    // Extract TZID if present (e.g., ;TZID=America/New_York)
    const tzMatch = paramPart.match(/TZID=([^;:]+)/i);
    const tz = tzMatch ? tzMatch[1] : null;

    // UTC: 20260215T183000Z
    const utcMatch = value.match(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/
    );
    if (utcMatch) {
      return new Date(
        Date.UTC(
          +utcMatch[1],
          +utcMatch[2] - 1,
          +utcMatch[3],
          +utcMatch[4],
          +utcMatch[5],
          +utcMatch[6]
        )
      );
    }

    // Local / TZID: 20260215T183000
    const localMatch = value.match(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/
    );
    if (localMatch) {
      const effectiveTz = tz || feedTz || "America/New_York";
      return tzToUtc(
        +localMatch[1], +localMatch[2] - 1, +localMatch[3],
        +localMatch[4], +localMatch[5], +localMatch[6],
        effectiveTz
      );
    }

    // All-day without VALUE=DATE param
    const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (dateOnly) {
      return new Date(Date.UTC(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3], 12, 0, 0));
    }

    return null;
  } catch {
    return null;
  }
}

function unescapeICSText(text: string): string {
  return text
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function cleanTitle(raw: string): string {
  return raw.replace(/^(Game|Practice|Event|Other|Cancelled):\s*/i, "");
}

function cleanDescription(raw: string, location: string | null): string {
  return raw
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^https?:\/\//i.test(trimmed)) return false;
      if (/powered by teamsnap/i.test(trimmed)) return false;
      if (location && trimmed === location.trim()) return false;
      return true;
    })
    .join("\n")
    .trim();
}

export function parseICS(icsContent: string): ParsedEvent[] {
  const lines = unfoldLines(icsContent);
  const events: ParsedEvent[] = [];
  let inEvent = false;
  let inTimezone = false;
  let feedTz: string | null = null;
  let eventProps: Record<string, { params: string; value: string }> = {};

  for (const line of lines) {
    const trimmed = line.trim();

    // Track VTIMEZONE blocks to extract feed default timezone
    if (trimmed === "BEGIN:VTIMEZONE") {
      inTimezone = true;
      continue;
    }
    if (trimmed === "END:VTIMEZONE") {
      inTimezone = false;
      continue;
    }
    if (inTimezone) {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx !== -1) {
        const prop = trimmed.slice(0, colonIdx).toUpperCase();
        if (prop === "TZID" && !feedTz) {
          feedTz = trimmed.slice(colonIdx + 1);
        }
      }
      continue;
    }

    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      eventProps = {};
      continue;
    }

    if (trimmed === "END:VEVENT") {
      inEvent = false;

      // Extract fields
      const uid = eventProps["UID"]?.value || crypto.randomUUID();
      const summary = eventProps["SUMMARY"]?.value;
      if (!summary) continue; // skip events without title

      const dtStartEntry = eventProps["DTSTART"];
      if (!dtStartEntry) continue;

      const startDate = parseICSDate(dtStartEntry.value, dtStartEntry.params, feedTz);
      if (!startDate || isNaN(startDate.getTime())) continue;

      let endDate: Date | null = null;
      const dtEndEntry = eventProps["DTEND"];
      if (dtEndEntry) {
        endDate = parseICSDate(dtEndEntry.value, dtEndEntry.params, feedTz);
      }

      // If no valid end date, default to start + 1 hour
      if (!endDate || isNaN(endDate.getTime())) {
        endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      }

      // All-day events: if DTEND is a DATE value, it's exclusive, keep as-is
      // If DTSTART is DATE and no DTEND, set end to next midnight
      if (
        dtStartEntry.params.toUpperCase().includes("VALUE=DATE") &&
        !dtEndEntry
      ) {
        endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
      }

      const location = eventProps["LOCATION"]?.value
        ? unescapeICSText(eventProps["LOCATION"].value).trim() || null
        : null;

      let description: string | null = null;
      if (eventProps["DESCRIPTION"]?.value) {
        const cleaned = cleanDescription(
          unescapeICSText(eventProps["DESCRIPTION"].value),
          location
        );
        description = cleaned || null;
      }

      events.push({
        id: uid,
        title: cleanTitle(unescapeICSText(summary)),
        description,
        location,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      });

      continue;
    }

    if (!inEvent) continue;

    // Parse property line: NAME;PARAMS:VALUE
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const propPart = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const semiIdx = propPart.indexOf(";");
    const propName = semiIdx === -1 ? propPart : propPart.slice(0, semiIdx);
    const params = semiIdx === -1 ? "" : propPart.slice(semiIdx);

    eventProps[propName.toUpperCase()] = { params, value };
  }

  return events;
}
