/**
 * Google Sign-In (OAuth2 token client) — client-side only, no client secret.
 *
 * Setup: go to https://console.cloud.google.com/apis/credentials, create an
 * OAuth 2.0 Client ID (Application type: "Web application"), add this site's
 * origin (e.g. https://yourdomain.com) under "Authorized JavaScript origins"
 * (no redirect URI needed — this uses the token popup flow), then put the
 * Client ID in NEXT_PUBLIC_GOOGLE_CLIENT_ID.
 *
 * Flow: load Google's GSI script → open the account picker popup → get an
 * access token → fetch the user's profile (name/email/picture) → hand it
 * back to the caller, which signs the profile into the site's local account
 * system (auto-filling name/email instead of manual entry).
 */

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export function isGoogleConfigured() {
  return !!GOOGLE_CLIENT_ID;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

let scriptPromise: Promise<void> | null = null;

function loadGsiScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google sign-in script"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Opens the Google account picker popup and resolves with the signed-in user's profile. */
export async function signInWithGoogle(): Promise<GoogleProfile> {
  if (!isGoogleConfigured()) throw new Error("Google sign-in is not configured");
  await loadGsiScript();

  const accessToken = await new Promise<string>((resolve, reject) => {
    const google = (window as any).google;
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "openid email profile",
      callback: (res: any) => {
        if (res?.access_token) resolve(res.access_token);
        else reject(new Error("Google sign-in was cancelled or failed"));
      },
      error_callback: () => reject(new Error("Google sign-in was cancelled or failed")),
    });
    client.requestAccessToken();
  });

  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Google profile");
  const data = await res.json();

  return {
    googleId: data.sub,
    email: data.email,
    name: data.name || data.given_name || data.email.split("@")[0],
    picture: data.picture,
  };
}
