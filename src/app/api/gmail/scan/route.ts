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

    if (message === "no_connection" || message === "token_expired") {
      return NextResponse.json({ error: "reconnect" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to scan emails" },
      { status: 500 }
    );
  }
}
