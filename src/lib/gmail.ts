import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

export async function getGmailClient(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gmail_connections")
    .select("google_refresh_token")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("no_connection");
  }

  oauth2Client.setCredentials({ refresh_token: data.google_refresh_token });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
  } catch {
    throw new Error("token_expired");
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
  const query =
    "newer_than:30d (from:*.edu OR subject:(school OR field trip OR conference OR practice OR game OR picture day OR report card))";

  const listRes = await gmailClient.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 20,
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

    if (payload?.parts) {
      const textPart = payload.parts.find(
        (p) => p.mimeType === "text/plain"
      );
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
      }
    } else if (payload?.body?.data) {
      body = Buffer.from(payload.body.data, "base64url").toString("utf-8");
    }

    // Truncate body to 2000 chars
    if (body.length > 2000) {
      body = body.slice(0, 2000);
    }

    emails.push({ subject, snippet, body });
  }

  return emails;
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
        content: `You are extracting calendar events from school/teacher emails for a family calendar.

Today's date is ${today}. Extract any upcoming events (field trips, parent-teacher conferences, games, practices, picture days, school events, etc.).

For each event, return a JSON object with these fields:
- title: string (concise event name)
- date: string (YYYY-MM-DD format)
- startTime: string | null (HH:MM in 24h format, or null if not specified)
- endTime: string | null (HH:MM in 24h format, or null if not specified)
- location: string | null
- description: string | null (brief summary)
- emailSubject: string (the subject line of the source email)

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
      const startDate = e.startTime
        ? `${e.date}T${e.startTime}:00`
        : `${e.date}T09:00:00`;
      const endDate = e.endTime
        ? `${e.date}T${e.endTime}:00`
        : `${e.date}T10:00:00`;

      return {
        id: crypto.randomUUID(),
        title: e.title!,
        description: e.description ?? null,
        location: e.location ?? null,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        source_email: e.emailSubject ?? "(unknown)",
      };
    });
}
