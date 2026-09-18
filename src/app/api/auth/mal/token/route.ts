import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Exchanges a MAL OAuth authorization code for an access token. Runs
// server-side because MAL's token endpoint requires a client secret, which
// must never be exposed to the browser.
export async function POST(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_MAL_CLIENT_ID || "";
  const clientSecret = process.env.MAL_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "MyAnimeList OAuth is not configured on this server." }, { status: 501 });
  }

  const { code, codeVerifier, redirectUri } = await request.json();
  if (!code || !codeVerifier || !redirectUri) {
    return NextResponse.json({ error: "Missing code, codeVerifier, or redirectUri" }, { status: 400 });
  }

  try {
    const tokenRes = await fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      // Parse MAL's error JSON: {"error":"invalid_client","message":"Client authentication failed"}
      // The most common cause is a missing/wrong MAL_CLIENT_SECRET env var on the server.
      let detail = text;
      let hint = "";
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error === "invalid_client" || parsed?.message?.includes("Client authentication")) {
          hint = " (This usually means MAL_CLIENT_SECRET is missing or wrong on the server. Double-check the value in your Railway/Vercel env vars — it must match the Client Secret shown at https://myanimelist.net/apiconfig exactly.)";
          detail = `${parsed.error}: ${parsed.message}`;
        }
      } catch {}
      console.error("[MAL OAuth] token exchange failed:", detail);
      return NextResponse.json({ error: `MAL token exchange failed: ${detail}${hint}` }, { status: 502 });
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token as string;

    const viewerRes = await fetch("https://api.myanimelist.net/v2/users/@me?fields=name,picture", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!viewerRes.ok) {
      return NextResponse.json({ error: "MAL viewer request failed" }, { status: 502 });
    }
    const viewerData = await viewerRes.json();

    return NextResponse.json({
      viewer: { id: viewerData.id, name: viewerData.name, avatar: viewerData.picture },
      accessToken,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
    });
  } catch {
    return NextResponse.json({ error: "MAL token exchange failed" }, { status: 502 });
  }
}
