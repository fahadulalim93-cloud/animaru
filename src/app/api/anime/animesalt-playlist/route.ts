import { NextRequest, NextResponse } from "next/server";
import { curlFetch } from "@/lib/curl-fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * GET /api/anime/animesalt-playlist?lang=hindi&url={m3u8_url}
 *
 * Fetches the AnimeSalt master.m3u8 server-side (with the correct Referer
 * header that the browser cannot send due to CORS), rewrites two things,
 * and returns the rewritten m3u8 to the player:
 *
 *   1. AUDIO TRACK DEFAULT SELECTION:
 *      Marks the audio track matching the requested language as DEFAULT=YES
 *      so hls.js auto-selects it. (Without this, hls.js picks the FIRST
 *      audio track, which is Japanese, even when the user picked
 *      "AnimeSalt Hindi".)
 *
 *   2. VARIANT STREAM + AUDIO URI REWRITING:
 *      The original m3u8 has RELATIVE URLs like `/hls/{base64}`. We rewrite
 *      them to ABSOLUTE `https://as-cdn{N}.top/hls/{base64}` URLs wrapped
 *      through our /p/{token} proxy (which sets Referer: animesalt.cx/
 *      and omits Origin). This way the player can fetch segments + audio
 *      playlists correctly.
 *
 * WHY THIS EXISTS:
 *   AnimeSalt m3u8s are multi-audio (Hindi, Tamil, Telugu, English, Japanese,
 *   Malayalam). Without intervention, hls.js picks the FIRST audio track
 *   (Japanese), so users hear Japanese even when they selected "AnimeSalt Hindi".
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Map our server "provider" field (lowercase language name) → ISO 639-3 code
// used in the m3u8 LANGUAGE= attribute.
const LANG_TO_ISO: Record<string, string[]> = {
  hindi:    ["hin", "hi"],
  tamil:    ["tam", "ta"],
  telugu:   ["tel", "te"],
  english:  ["eng", "en"],
  japanese: ["jpn", "ja"],
  malayalam:["mal", "ml"],
  bengali:  ["ben", "bn"],
  marathi:  ["mar", "mr"],
  kannada:  ["kan", "kn"],
  multi:    [],  // don't rewrite — let the player pick default
};

function rewriteM3u8(content: string, lang: string, baseUrl: string): string {
  // baseUrl is the original master.m3u8 URL — used to resolve relative URIs
  const lines = content.split(/\r?\n/);
  let foundDefaultTrack = false;
  const isoCodes = lang === "multi" ? [] : (LANG_TO_ISO[lang.toLowerCase()] || []);

  const rewritten = lines.map((line) => {
    // 1. AUDIO TRACK DEFAULT SELECTION
    if (line.startsWith("#EXT-X-MEDIA:TYPE=AUDIO")) {
      if (isoCodes.length === 0) return line;

      const langMatch = line.match(/LANGUAGE="([^"]+)"/);
      if (!langMatch) return line;
      const trackLang = langMatch[1].toLowerCase();

      const isTarget = isoCodes.includes(trackLang) || isoCodes.some(c => trackLang.startsWith(c));

      if (isTarget && !foundDefaultTrack) {
        foundDefaultTrack = true;
        let updated = line
          .replace(/DEFAULT=NO/i, "DEFAULT=YES")
          .replace(/AUTOSELECT=NO/i, "AUTOSELECT=YES");
        if (!/DEFAULT=/i.test(updated)) {
          updated = updated.replace(/(TYPE=AUDIO,)/, "$1DEFAULT=YES,");
        }
        // Rewrite the URI= attribute to be absolute + proxied
        updated = rewriteUriAttribute(updated, baseUrl);
        return updated;
      }

      // All other audio tracks → DEFAULT=NO
      let demoted = line.replace(/DEFAULT=YES/i, "DEFAULT=NO");
      demoted = rewriteUriAttribute(demoted, baseUrl);
      return demoted;
    }

    // 2. URI= attributes in other tag types (e.g. #EXT-X-MAP, subtitles)
    if (line.startsWith("#") && line.includes('URI="')) {
      return rewriteUriAttribute(line, baseUrl);
    }

    // 3. Variant stream lines (relative /hls/... paths)
    // ⚠️ ASCDN m3u8s (master, variant, audio) are ALL IP-locked to the VPS IP.
    // CF Worker gets 403. So ALL m3u8s go through VPS /p/{token}.
    // The VPS route fetches the m3u8, then rewrites segment URLs inside to
    // go through the CF Worker (segments are NOT IP-locked).
    if (line.startsWith("/hls/") || line.startsWith("hls/")) {
      const absolute = new URL(line, baseUrl).href;
      return encodeVpsToken(absolute);
    }
    if (line.startsWith("http")) {
      return encodeVpsToken(line);
    }

    return line;
  });

  return rewritten.join("\n");
}

// XOR key — must match src/lib/proxy.ts and the CF Worker
const XOR_KEY = "10b06cdc1ca48c9fb0b94af97cc040cf";

/**
 * Encode a URL + referer as a VPS /p/{token} (XOR + base64url).
 * Uses the SAME XOR encoding as proxy.ts + CF Worker.
 * Used for ALL ASCDN m3u8s (IP-locked to VPS — CF Worker gets 403).
 */
function encodeVpsToken(url: string): string {
  const referer = "https://animesalt.cx/";
  const combined = url + "\0" + referer;
  const keyBytes = new TextEncoder().encode(XOR_KEY);
  const dataBytes = new TextEncoder().encode(combined);
  const xored = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) xored[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  let binary = "";
  for (let i = 0; i < xored.length; i++) binary += String.fromCharCode(xored[i]);
  const token = Buffer.from(binary, "binary").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `/p/${token}`;
}

/**
 * Rewrite the URI="..." attribute in a tag line to an absolute URL
 * wrapped through VPS /p/{token} proxy.
 */
function rewriteUriAttribute(line: string, baseUrl: string): string {
  return line.replace(/URI="([^"]+)"/g, (_, uri) => {
    const absolute = new URL(uri, baseUrl).href;
    const proxied = encodeVpsToken(absolute);
    return `URI="${proxied}"`;
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const lang = (searchParams.get("lang") || "hindi").toLowerCase();

  if (!url) {
    return NextResponse.json(
      { error: "url parameter required" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  // Security: only allow animesalt ASCDN URLs
  if (!/as-cdn\d+\.top\//i.test(url)) {
    return NextResponse.json(
      { error: "Only as-cdn*.top URLs are allowed" },
      { status: 403, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  try {
    const res = await curlFetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "*/*",
        "Referer": "https://animesalt.cx/",
        // NOTE: NO Origin header — ASCDN rejects requests with Origin
      },
      timeoutMs: 10000,
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream ${res.status}` },
        { status: 502, headers: { "Access-Control-Allow-Origin": "*" } },
      );
    }

    const m3u8 = await res.text();

    // 403 page is small HTML — detect and reject
    if (!m3u8.startsWith("#EXTM3U")) {
      return NextResponse.json(
        { error: "Upstream did not return m3u8", preview: m3u8.slice(0, 200) },
        { status: 502, headers: { "Access-Control-Allow-Origin": "*" } },
      );
    }

    const rewritten = rewriteM3u8(m3u8, lang, url);

    return new NextResponse(rewritten, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Playlist fetch failed";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
}

