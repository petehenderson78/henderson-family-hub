import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseICS } from "@/lib/ics-parser";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json(
        { error: "URL must be http or https" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "CalendarFeedSync/1.0" },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Feed returned ${response.status}` },
        { status: 502 }
      );
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_SIZE) {
      return NextResponse.json(
        { error: "Feed too large (>5MB)" },
        { status: 502 }
      );
    }

    const text = await response.text();
    if (text.length > MAX_SIZE) {
      return NextResponse.json(
        { error: "Feed too large (>5MB)" },
        { status: 502 }
      );
    }

    const events = parseICS(text);
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch feed" },
      { status: 502 }
    );
  }
}
