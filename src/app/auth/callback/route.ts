import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // If this was a Google OAuth flow with a refresh token, save it for Gmail access
      const session = data?.session;
      if (session?.provider_refresh_token) {
        const { error: upsertError } = await supabase
          .from("gmail_connections")
          .upsert(
            {
              user_id: session.user.id,
              google_refresh_token: session.provider_refresh_token,
              google_email: session.user.email,
            },
            { onConflict: "user_id" }
          );
        if (upsertError) {
          console.error("Failed to save Gmail refresh token:", upsertError);
        }
      }

      // Pass a flag so the client knows to check for provider tokens
      const redirectUrl = new URL(`${origin}${next}`);
      if (session?.provider_refresh_token) {
        redirectUrl.searchParams.set("gmail_connected", "1");
      }
      return NextResponse.redirect(redirectUrl.toString());
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
