interface ParsedEvent {
  id: string;
  title: string;
  description: string | null;
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

function parseICSDate(value: string, paramPart: string): Date | null {
  try {
    // All-day: VALUE=DATE:20260215
    if (paramPart.includes("VALUE=DATE")) {
      const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (!match) return null;
      return new Date(+match[1], +match[2] - 1, +match[3], 0, 0, 0);
    }

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
      return new Date(
        +localMatch[1],
        +localMatch[2] - 1,
        +localMatch[3],
        +localMatch[4],
        +localMatch[5],
        +localMatch[6]
      );
    }

    // All-day without VALUE=DATE param
    const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (dateOnly) {
      return new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3], 0, 0, 0);
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

export function parseICS(icsContent: string): ParsedEvent[] {
  const lines = unfoldLines(icsContent);
  const events: ParsedEvent[] = [];
  let inEvent = false;
  let eventProps: Record<string, { params: string; value: string }> = {};

  for (const line of lines) {
    const trimmed = line.trim();

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

      const startDate = parseICSDate(dtStartEntry.value, dtStartEntry.params);
      if (!startDate || isNaN(startDate.getTime())) continue;

      let endDate: Date | null = null;
      const dtEndEntry = eventProps["DTEND"];
      if (dtEndEntry) {
        endDate = parseICSDate(dtEndEntry.value, dtEndEntry.params);
      }

      // If no valid end date, default to start + 1 hour
      if (!endDate || isNaN(endDate.getTime())) {
        endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      }

      // All-day events: if DTEND is a DATE value, it's exclusive, keep as-is
      // If DTSTART is DATE and no DTEND, set end to next midnight
      if (
        dtStartEntry.params.includes("VALUE=DATE") &&
        !dtEndEntry
      ) {
        endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
      }

      let description: string | null = null;
      const descParts: string[] = [];
      if (eventProps["DESCRIPTION"]?.value) {
        descParts.push(unescapeICSText(eventProps["DESCRIPTION"].value));
      }
      if (eventProps["LOCATION"]?.value) {
        descParts.push(`📍 ${unescapeICSText(eventProps["LOCATION"].value)}`);
      }
      if (descParts.length > 0) {
        description = descParts.join("\n");
      }

      events.push({
        id: uid,
        title: unescapeICSText(summary),
        description,
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

    eventProps[propName.toUpperCase()] = { params: params.toUpperCase(), value };
  }

  return events;
}
