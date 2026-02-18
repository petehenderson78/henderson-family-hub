import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGmailClient, searchEmails, extractEvents } from "@/lib/gmail";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const gmailClient = await getGmailClient(user.id);
    const emails = await searchEmails(gmailClient);
    const events = await extractEvents(emails);

    return NextResponse.json({ events });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";

    if (message === "no_connection") {
      return NextResponse.json(
        { error: "no_connection", detail: "No Gmail connection found. Please connect Gmail first." },
        { status: 401 }
      );
    }

    if (message === "token_expired") {
      return NextResponse.json(
        { error: "token_expired", detail: "Gmail token expired or invalid. Please reconnect." },
        { status: 401 }
      );
    }

    if (message === "missing_credentials") {
      return NextResponse.json(
        { error: "config_error", detail: "Server missing Google OAuth credentials." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "scan_failed", detail: String(message) },
      { status: 500 }
    );
  }
}
