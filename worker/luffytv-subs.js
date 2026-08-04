/**
 * ═══════════════════════════════════════════════════════════════════════
 *  LuffyTV Subtitle Proxy — Cloudflare Worker
 *  Worker name: luffytv-subs
 *  URL: https://luffytv-subs.<your-account>.workers.dev
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  DEDICATED proxy for subtitle files ONLY (.vtt, .srt, .ass).
 *  Does NOT handle video streams or m3u8 manifests — use luffytv-proxy for those.
 *
 *  What it does:
 *    1. Injects the correct Referer/Origin/User-Agent per CDN host
 *    2. Converts SRT → WebVTT on-the-fly (browsers only render VTT)
 *    3. Converts ASS → WebVTT (basic — strips styling, extracts Dialogue)
 *    4. Passes VTT through with correct content-type
 *    5. Sniffs content when file extension is missing/ambiguous
 *    6. Caches responses at edge for 24h (subtitles don't change)
 *    7. Full CORS headers (Access-Control-Allow-Origin: *)
 *
 *  ENDPOINTS:
 *    /sub?url=<encoded>&ref=<encoded>   → query params (easy to debug)
 *    /s/<base64url-token>               → token-encoded (XOR url\0referer)
 *    /health                            → health check
 *
 *  DEPLOY:
 *    1. Cloudflare dashboard → Workers & Pages → Create → Worker
 *    2. Name it: luffytv-subs
 *    3. Paste this entire file → Save & Deploy
 *    4. Set NEXT_PUBLIC_SUBS_PROXY_BASE in Vercel to:
 *         https://luffytv-subs.<your-account>.workers.dev
 *    5. Redeploy the Vercel app so the env var takes effect
 * ═══════════════════════════════════════════════════════════════════════
 */

const WORKER_NAME = 'luffytv-subs';
const VERSION = 'v1.0.0';

// XOR key — SAME as luffytv-proxy so tokens are interchangeable.
// 32 ASCII bytes.
const XOR_KEY = '10b06cdc1ca48c9fb0b94af97cc040cf';

/* ─── CDN Referer table for subtitle hosts ────────────────────────────────
 * Maps hostname → { referer, origin }
 * Many subtitle CDNs return 403 without the exact Referer they expect.
 * Listed in priority order — first match wins.
 */
const SUB_CDN_RULES = [
  // ── Animex / AniDap subtitle CDNs ──
  { test: h => h.includes('krussdomi'),       referer: 'https://krussdomi.com/',     origin: 'https://krussdomi.com' },
  // lostproject.club (AniDap Yuki subs) — VERIFIED: requires megaplay.buzz referer (not animex.one)
  { test: h => h.includes('lostproject'),     referer: 'https://megaplay.buzz/',      origin: 'https://megaplay.buzz' },
  { test: h => h.includes('24stream'),        referer: 'https://animex.one/',         origin: 'https://animex.one' },
  { test: h => h.includes('mewstream'),       referer: 'https://megaplay.buzz/',      origin: 'https://megaplay.buzz' },
  { test: h => h.includes('streamzone1'),     referer: 'https://megaplay.buzz/',      origin: 'https://megaplay.buzz' },
  { test: h => h.includes('cinewave2'),       referer: 'https://megaplay.buzz/',      origin: 'https://megaplay.buzz' },
  { test: h => h.includes('vibeplayer') || h.includes('vivibebe'),
    referer: 'https://vibeplayer.site/',      origin: 'https://vibeplayer.site' },
  { test: h => h.includes('animeapps'),       referer: 'https://animex.one/',         origin: 'https://animex.one' },
  { test: h => h.includes('nekostream'),      referer: 'https://www.miruro.tv/',      origin: 'https://www.miruro.tv' },
  { test: h => h.includes('anidb'),           referer: 'https://www.miruro.tv/',      origin: 'https://www.miruro.tv' },

  // ── Kwik / owucdn / uwucdn ──
  { test: h => h.includes('kwik'),            referer: 'https://kwik.cx/',            origin: 'https://kwik.cx' },
  { test: h => h.includes('owocdn') || h.includes('uwucdn'),
    referer: 'https://kwik.cx/',              origin: 'https://kwik.cx' },

  // ── MegaPlay ──
  { test: h => h.includes('megaplay'),        referer: 'https://megaplay.buzz/',      origin: 'https://megaplay.buzz' },

  // ── FlixCLOUD / SlopNet (ReAnime) ──
  { test: h => h.includes('slopnet') || h.includes('flixcloud'),
    referer: 'https://flixcloud.cc/',         origin: 'https://flixcloud.cc' },

  // ── Kyren ──
  { test: h => h.includes('kyren'),           referer: 'https://kyren.moe/',          origin: 'https://kyren.moe' },

  // ── AniKage ──
  { test: h => h.includes('anikage'),         referer: 'https://anikage.cc/',         origin: 'https://anikage.cc' },

  // ── Ani.pm ──
  { test: h => h.includes('ani.pm'),          referer: 'https://ani.pm/',             origin: 'https://ani.pm' },

  // ── Senshi (ninstream) ──
  { test: h => h.includes('ninstream') || h.includes('senshi'),
    referer: 'https://senshi.live/',          origin: 'https://senshi.live' },

  // ── AniZone / xin-cdn ──
  { test: h => h.includes('xin-cdn') || h.includes('anizone'),
    referer: 'https://anizone.to/',           origin: 'https://anizone.to' },

  // ── AnimeHeaven ──
  { test: h => h.includes('animeheaven'),     referer: 'https://animeheaven.me/',     origin: 'https://animeheaven.me' },

  // ── allanime / allmanga ──
  { test: h => h.includes('allanime') || h.includes('allmanga'),
    referer: 'https://allanime.uns.bio/',     origin: 'https://allanime.uns.bio' },

  // ── AnimeOnsen ──
  { test: h => h.includes('animeonsen'),      referer: 'https://www.animeonsen.xyz/', origin: 'https://www.animeonsen.xyz' },

  // ── vid-cdn (Luna) ──
  { test: h => h.includes('vid-cdn'),         referer: 'https://luna.animeaqua.net/', origin: 'https://luna.animeaqua.net' },

  // ── AniWaves ──
  { test: h => h.includes('echovideo') || h.includes('gn1r5n'),
    referer: 'https://aniwaves.ru/',          origin: 'https://aniwaves.ru' },

  // ── AniNeko.to subtitle CDN (anizara.store) — no referer required, works directly ──
  { test: h => h.includes('anizara.store') || h.includes('anizara'),
    referer: 'https://anineko.to/',            origin: 'https://anineko.to' },

  // ── AniKoto / VidTube / MegaPlay embed CDNs ──
  { test: h => h.includes('vidtube.site'),
    referer: 'https://anikototv.to/',             origin: 'https://anikototv.to' },
  { test: h => h.includes('megaplay.buzz'),
    referer: 'https://megaplay.buzz/',         origin: 'https://megaplay.buzz' },
];

function getRefererFor(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const rule of SUB_CDN_RULES) {
      if (rule.test(hostname)) {
        return { referer: rule.referer, origin: rule.origin };
      }
    }
  } catch {}
  // Default — miruro is a safe default that works for most CDNs
  return { referer: 'https://www.miruro.tv/', origin: 'https://www.miruro.tv' };
}

/* ─── CORS headers ──────────────────────────────────────────────────────── */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/* ─── Token encoding/decoding (same XOR scheme as luffytv-proxy) ────────── */
function encodeToken(url, referer) {
  const combined = url + '\0' + referer;
  const keyBytes = new TextEncoder().encode(XOR_KEY);
  const dataBytes = new TextEncoder().encode(combined);
  const xored = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    xored[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  // base64url encode
  let binary = '';
  for (let i = 0; i < xored.length; i++) binary += String.fromCharCode(xored[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeToken(token) {
  try {
    // base64url decode
    let b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    // XOR decode
    const keyBytes = new TextEncoder().encode(XOR_KEY);
    const decoded = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      decoded[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return new TextDecoder().decode(decoded);
  } catch {
    return null;
  }
}

/* ─── SRT → WebVTT conversion ───────────────────────────────────────────── */
function srtToVtt(srt) {
  const body = srt
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\uFEFF/, '')                    // strip BOM
    .replace(/^\d+\s*$/gm, '')                  // strip index lines like "1", "2"...
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')  // , → . in timestamps
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

/* ─── ASS → WebVTT conversion (basic, strips styling) ───────────────────── */
function assToVtt(ass) {
  const lines = ass.split(/\r?\n/);
  const cues = [];
  let idx = 1;
  for (const line of lines) {
    if (!line.startsWith('Dialogue:')) continue;
    const parts = line.split(',');
    // Dialogue: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
    if (parts.length < 10) continue;
    const start = parts[1].trim();
    const end = parts[2].trim();
    const text = parts.slice(9).join(',').trim()
      .replace(/\{[^}]*\}/g, '')    // strip ASS override tags {\...}
      .replace(/\\N/g, '\n')         // \N → newline
      .replace(/\\n/g, ' ')          // \n → space
      .replace(/\\h/g, ' ');         // \h → hard space
    if (!text) continue;
    // ASS time format: H:MM:SS.cc → VTT: HH:MM:SS.mmm
    const fmt = (t) => {
      const m = t.match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/);
      if (!m) return null;
      return `${m[1].padStart(2,'0')}:${m[2]}:${m[3]}.${m[4]}0`;
    };
    const vStart = fmt(start);
    const vEnd = fmt(end);
    if (!vStart || !vEnd) continue;
    cues.push(`${idx++}\n${vStart} --> ${vEnd}\n${text}\n`);
  }
  return `WEBVTT\n\n${cues.join('\n')}`;
}

/* ─── Strip inline STYLE blocks from VTT ────────────────────────────────
 * VTT files from some providers contain STYLE blocks with ::cue rules
 * like `::cue { background: black; color: white; }` which override
 * our CSS and create the ugly black box behind subtitles.
 * This function removes all STYLE blocks so our CSS ::cue rules apply.
 */
function stripVttStyles(vtt) {
  // Remove STYLE blocks — everything from "STYLE" to the next blank line
  return vtt.replace(/^STYLE\s*\n[\s\S]*?(?=\n\n|\n$|$)/gm, '');
}

/* ─── Content sniffer — detect format when extension is missing ─────────── */
function sniffFormat(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('WEBVTT')) return 'vtt';
  if (trimmed.startsWith('[Script Info]')) return 'ass';
  // SRT pattern: index line, then "00:00:01,000 --> 00:00:04,000"
  if (/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(text)) return 'srt';
  return 'unknown';
}

/* ─── Response helpers ──────────────────────────────────────────────────── */
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function vttResponse(content) {
  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, immutable',
      ...corsHeaders(),
    },
  });
}

/* ─── Main handler ──────────────────────────────────────────────────────── */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Health check
    if (url.pathname === '/health' || url.pathname === '/') {
      return jsonResponse({
        ok: true,
        worker: WORKER_NAME,
        version: VERSION,
        ts: Date.now(),
      });
    }

    // Parse target URL + referer from either endpoint style
    let targetUrl, referer, origin;

    if (url.pathname.startsWith('/s/')) {
      // Token style: /s/{base64url}
      const token = url.pathname.slice(3);
      const decoded = decodeToken(token);
      if (!decoded) return jsonResponse({ error: 'Invalid token' }, 400);
      const parts = decoded.split('\0');
      targetUrl = parts[0];
      referer = parts[1] || '';
    } else if (url.pathname === '/sub' || url.pathname === '/subtitle') {
      // Query param style: /sub?url=<encoded>&ref=<encoded>
      targetUrl = url.searchParams.get('url');
      referer = url.searchParams.get('ref') || url.searchParams.get('referer') || '';
      if (!targetUrl) return jsonResponse({ error: 'url parameter required' }, 400);
    } else {
      return jsonResponse({ error: 'Not found', path: url.pathname }, 404);
    }

    // Normalize URL — fix the triple-slash bug from sora's track URLs:
    //   "https:///subbl.krussdomi.com/..." → "https://subbl.krussdomi.com/..."
    targetUrl = targetUrl.replace(/^https?:\/\/\/+/i, 'https://');

    // Validate URL
    try {
      new URL(targetUrl);
    } catch {
      return jsonResponse({ error: 'Invalid URL', url: targetUrl }, 400);
    }

    // Determine referer if not provided
    if (!referer) {
      const r = getRefererFor(targetUrl);
      referer = r.referer;
      origin = r.origin;
    } else {
      try { origin = new URL(referer).origin; } catch { origin = ''; }
    }

    // Fetch the subtitle file
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
      'Referer': referer,
    };
    if (origin) fetchHeaders['Origin'] = origin;

    let upstreamResp;
    try {
      upstreamResp = await fetch(targetUrl, {
        headers: fetchHeaders,
        redirect: 'follow',
        cf: { cacheTtl: 86400, cacheEverything: true },
      });
    } catch (e) {
      return jsonResponse({ error: 'Fetch failed', details: e.message }, 502);
    }

    if (!upstreamResp.ok) {
      return jsonResponse({
        error: `Upstream ${upstreamResp.status}`,
        url: targetUrl,
        referer,
      }, upstreamResp.status);
    }

    // Read body as text (subtitles are small, no streaming needed)
    let text;
    try {
      text = await upstreamResp.text();
    } catch (e) {
      return jsonResponse({ error: 'Failed to read body', details: e.message }, 502);
    }

    // Determine format from URL extension first, then sniff content
    const urlPath = targetUrl.split('?')[0].toLowerCase().split('#')[0];
    let format;
    if (urlPath.endsWith('.vtt')) format = 'vtt';
    else if (urlPath.endsWith('.srt')) format = 'srt';
    else if (urlPath.endsWith('.ass')) format = 'ass';
    else format = sniffFormat(text);

    // Convert / pass through
    let vttContent;
    switch (format) {
      case 'vtt':
        // Strip any inline STYLE blocks from the VTT — these contain
        // ::cue { background: black } rules that override our CSS and
        // create the ugly black box behind subtitles.
        vttContent = stripVttStyles(text);
        break;
      case 'srt':
        vttContent = srtToVtt(text);
        break;
      case 'ass':
        vttContent = assToVtt(text);
        break;
      default:
        // Unknown format — try to render as VTT anyway (best effort)
        vttContent = text.startsWith('WEBVTT') ? text : `WEBVTT\n\n${text}`;
    }

    return vttResponse(vttContent);
  },
};
