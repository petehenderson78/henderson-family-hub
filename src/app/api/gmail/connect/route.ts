import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("gmail_connections")
    .select("google_email")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({
    connected: !!data,
    email: data?.google_email ?? null,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { refresh_token, email } = body;

  if (!refresh_token) {
    return NextResponse.json(
      { error: "refresh_token is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("gmail_connections").upsert(
    {
      user_id: user.id,
      google_refresh_token: refresh_token,
      google_email: email ?? null,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connected: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await supabase.from("gmail_connections").delete().eq("user_id", user.id);

  return NextResponse.json({ connected: false });
}
