import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export async function getGmailClient(userId: string) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("missing_credentials");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gmail_connections")
    .select("google_refresh_token")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("no_connection");
  }

  const token = data.google_refresh_token;

  // A Google refresh token starts with "1//" — if it looks like an access token ("ya29."), it won't work
  if (token.startsWith("ya29.")) {
    throw new Error("token_is_access_token");
  }

  oauth2Client.setCredentials({ refresh_token: token });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`token_expired:${detail}`);
  }

  return google.gmail({ version: "v1", auth: oauth2Client });
}

interface EmailMessage {
  subject: string;
  snippet: string;
  body: string;
}

export async function searchEmails(
  gmailClient: ReturnType<typeof google.gmail>
) {
  const query = [
    "newer_than:60d (",
    "from:*.edu OR from:*k12* OR from:*middletownk12.org OR from:*school*",
    "OR from:*booking.com* OR from:*airbnb* OR from:*vrbo* OR from:*hotels.com* OR from:*marriott* OR from:*hilton* OR from:*hyatt*",
    "OR from:*delta* OR from:*united* OR from:*american* OR from:*southwest* OR from:*jetblue* OR from:*spirit* OR from:*frontier*",
    "OR from:*opentable* OR from:*resy* OR from:*yelp*",
    "OR from:*expedia* OR from:*kayak* OR from:*tripadvisor*",
    "OR subject:(school OR field trip OR conference OR practice OR game OR picture day OR report card OR permission OR dismissal OR PTA OR spirit OR schedule OR homework OR reminder",
    "OR reservation OR confirmation OR itinerary OR booking OR check-in OR flight OR hotel OR vacation OR travel)",
    ")",
  ].join(" ");

  const listRes = await gmailClient.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 30,
  });

  const messageIds = listRes.data.messages ?? [];
  if (messageIds.length === 0) return [];

  const emails: EmailMessage[] = [];

  for (const msg of messageIds) {
    if (!msg.id) continue;

    const detail = await gmailClient.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = detail.data.payload?.headers ?? [];
    const subject =
      headers.find((h) => h.name?.toLowerCase() === "subject")?.value ??
      "(no subject)";
    const snippet = detail.data.snippet ?? "";

    let body = "";
    const payload = detail.data.payload;

    // Recursively find a part by mimeType (handles nested multipart structures)
    function findPart(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parts: any[] | undefined,
      mime: string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): any | undefined {
      if (!parts) return undefined;
      for (const p of parts) {
        if (p.mimeType === mime && p.body?.data) return p;
        if (p.parts) {
          const found = findPart(p.parts, mime);
          if (found) return found;
        }
      }
      return undefined;
    }

    // Prefer text/plain, fall back to text/html (strip tags)
    const textPart = findPart(payload?.parts, "text/plain");
    const htmlPart = findPart(payload?.parts, "text/html");

    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    } else if (htmlPart?.body?.data) {
      const raw = Buffer.from(htmlPart.body.data, "base64url").toString("utf-8");
      // Strip HTML tags and decode common entities
      body = raw
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#\d+;/g, "")
        .replace(/\s+/g, " ")
        .trim();
    } else if (payload?.body?.data) {
      body = Buffer.from(payload.body.data, "base64url").toString("utf-8");
    }

    // Truncate body to 3000 chars to capture more detail from booking emails
    if (body.length > 3000) {
      body = body.slice(0, 3000);
    }

    emails.push({ subject, snippet, body });
  }

  return emails;
}

/**
 * Convert local date/time in a specific IANA timezone to a UTC Date.
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
    return new Date(utcMs);
  }
}

export async function extractEvents(emails: EmailMessage[]) {
  if (emails.length === 0) return [];

  const anthropic = new Anthropic();

  const emailText = emails
    .map(
      (e, i) =>
        `--- Email ${i + 1} ---\nSubject: ${e.subject}\nSnippet: ${e.snippet}\nBody:\n${e.body}`
    )
    .join("\n\n");

  const today = new Date().toISOString().split("T")[0];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are extracting calendar events from emails for a family calendar.

Today's date is ${today}. Extract any upcoming events, including:
- School events: field trips, parent-teacher conferences, games, practices, picture days, assemblies, virtual author visits, etc.
- Travel: flights (departure and arrival), hotel check-in/check-out dates, vacation rental stays, car rental pick-up/drop-off
- Dining: dinner reservations, restaurant bookings
- Other bookings: tours, activities, tickets with a confirmed date/time

For each event, return a JSON object with these fields:
- title: string (concise event name — include the airline, hotel, restaurant, or venue name when applicable, e.g. "Delta Flight 1234 to LAX" or "Hilton Garden Inn Check-in")
- date: string (YYYY-MM-DD format — for hotels use the check-in date)
- startTime: string | null (HH:MM in 24h format, or null if not specified)
- endTime: string | null (HH:MM in 24h format, or null if not specified)
- location: string | null
- description: string | null (brief summary — include confirmation numbers, booking references, flight numbers, and other key details found in the email)
- emailSubject: string (the subject line of the source email)

For hotel stays, create TWO events: one for check-in and one for check-out (each with the appropriate date).
For flights, use the departure date/time as the event time.

IMPORTANT: Look very carefully for times. Search the entire email body for any time references such as "10:00 AM", "2pm", "at noon", "from 9-10", "begins at 1:30", etc. Even if the time appears deep in the email body or in a different paragraph from the event title, extract it. Times are critical — always provide startTime and endTime when any time reference exists. All times are in Eastern Time (ET) unless the email specifies another timezone.

Return ONLY a JSON array. If no events are found, return [].
Do not include events that have already passed.

Emails:
${emailText}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = textBlock.text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  let parsed: Array<{
    title?: string;
    date?: string;
    startTime?: string | null;
    endTime?: string | null;
    location?: string | null;
    description?: string | null;
    emailSubject?: string;
  }>;

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  // Validate and transform
  return parsed
    .filter((e) => e.title && e.date)
    .map((e) => {
      const [sy, smo, sd] = e.date!.split("-").map(Number);
      const [sh, smi] = e.startTime ? e.startTime.split(":").map(Number) : [9, 0];
      const [eh, emi] = e.endTime ? e.endTime.split(":").map(Number) : [sh + 1, smi];

      return {
        id: crypto.randomUUID(),
        title: e.title!,
        description: e.description ?? null,
        location: e.location ?? null,
        start_date: tzToUtc(sy, smo - 1, sd, sh, smi, 0, "America/New_York").toISOString(),
        end_date: tzToUtc(sy, smo - 1, sd, eh, emi, 0, "America/New_York").toISOString(),
        source_email: e.emailSubject ?? "(unknown)",
      };
    });
}
