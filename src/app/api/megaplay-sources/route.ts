import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ── Megaplay AES decryption (server-side, same as anikoto-direct.ts) ──
const MEGAPLAY_AES_KEY = Buffer.alloc(32, 0);
Buffer.from("i?LMTAx0Q6,:}50U", "utf8").copy(MEGAPLAY_AES_KEY, 0, 0, 16);
const MEGAPLAY_AES_IV = Buffer.from("W0;27ToaUpl_P%'c", "utf8");

function decryptMegaplayEnc(enc: string): string | null {
  try {
    let b64 = enc.replace(/-/g, "+").replace(/_/g, "/");
    const rem = b64.length % 4;
    if (rem) b64 += "====".slice(rem);
    const data = Buffer.from(b64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-cbc", MEGAPLAY_AES_KEY, MEGAPLAY_AES_IV);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    const text = decrypted.toString("utf8");
    const json = JSON.parse(text);
    if (json?.file && typeof json.file === "string") return json.file;
    if (/^https?:\/\//.test(text.trim())) return text.trim();
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/megaplay-sources?fileId={fileId}
 *
 * Proxies megaplay.buzz/stream/getSources server-side AND decrypts the enc
 * field to return the m3u8 URL directly.
 *
 * CRITICAL: Uses ?s=bcdn to get the ncdn.imgnex.top CDN URL instead of
 * cdn.imgnex.top. The original cdn.imgnex.top is fully Cloudflare-WAF-blocked
 * (403 for all data center IPs + all Referers). ncdn.imgnex.top works with
 * Referer: https://megaplay.buzz/.
 *
 * Returns: { m3u8Url, tracks, intro, outro }
 * - m3u8Url is on ncdn.imgnex.top (NOT cdn.imgnex.top)
 * - The player loads this URL through /api/megaplay-proxy which adds the
 *   correct Referer header server-side
 */
export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get("fileId");
  if (!fileId || !/^\d+$/.test(fileId)) {
    return NextResponse.json({ error: "Invalid fileId" }, { status: 400 });
  }

  try {
    // Use ?s=tcdn to get megap.norami.top CDN (segments on tiktokcdn.com — WORKS)
    // ?s=bcdn returns ncdn.imgnex.top → segments on bb.akirax.buzz → 404 for some anime
    // ?s=tcdn returns megap.norami.top → segments on tiktokcdn.com → 200 OK (tested)
    const url = `https://megaplay.buzz/stream/getSources?id=${fileId}&id=${fileId}&s=tcdn`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100100 Firefox/121.0",
        "Accept": "application/json, */*; q=0.01",
        "Referer": "https://megaplay.buzz/",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Megaplay returned ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();

    // Decrypt enc field server-side (browser doesn't need to do this anymore)
    let m3u8Url: string | null = null;
    if (data.sources?.file) {
      m3u8Url = data.sources.file;
    } else if (data.enc) {
      m3u8Url = decryptMegaplayEnc(data.enc);
    }

    // If m3u8Url is on cdn.imgnex.top, rewrite to ncdn.imgnex.top
    // (cdn.imgnex.top is WAF-blocked, ncdn.imgnex.top works with megaplay referer)
    if (m3u8Url && m3u8Url.includes("cdn.imgnex.top") && !m3u8Url.includes("ncdn.imgnex.top")) {
      m3u8Url = m3u8Url.replace("cdn.imgnex.top", "ncdn.imgnex.top");
    }

    // Don't wrap subtitles here — the player will wrap them via wrapM3u8UrlWithReferer
    // when it adds them as <track> elements. The CF Worker proxy handles them.
    return NextResponse.json({
      m3u8Url,
      tracks: data.tracks || [],
      intro: data.intro || null,
      outro: data.outro || null,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=300, max-age=300",
      },
    });
  } catch (err) {
    console.error("[megaplay-sources] error:", err);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
