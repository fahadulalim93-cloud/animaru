/**
 * ═══════════════════════════════════════════════════════════════════════
 *  LuffyTV Anime Proxy — Cloudflare Worker v3
 *  Based on: https://github.com/OTAKUWeBer/anime-proxy
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  ENDPOINTS:
 *    /p/{base64url}          → primary: encoded "url\0referer" → proxy
 *    /proxy?url=...&ref=...  → legacy: query params (backward compat)
 *    /health                 → health check
 *
 *  DEPLOY:
 *    1. Cloudflare dashboard → Workers → luffytv-proxy → Edit code
 *    2. Paste this entire file → Save & Deploy
 *    3. Set NEXT_PUBLIC_PROXY_BASE in Vercel to your worker URL
 * ═══════════════════════════════════════════════════════════════════════
 */

// WORKER_BASE is resolved per-request from request.url.origin.
// This variable is kept for backward compatibility but is always
// overridden in proxyTarget() → rewriteM3u8().
let WORKER_BASE = '';

/* ─── CDN rule table — Referer/Origin per host ──────────────────────────── */
const CDN_RULES = [
  // 24stream.xyz CDN subdomains (Animex/AniDap providers)
  { test: h => h.endsWith('.24stream.xyz') || h === '24stream.xyz',
    referer: 'https://animex.one/', origin: 'https://animex.one', secSite: 'cross-site' },
  // Miruro CDNs
  { test: h => h.endsWith('.anidb.app') || h === 'anidb.app',
    referer: 'https://www.miruro.tv/', origin: 'https://www.miruro.tv', secSite: 'cross-site' },
  // nekostream.site CDNs (AniKoto) — need vidtube.site or megaplay.buzz referer
  { test: h => h.endsWith('.nekostream.site') || h === 'nekostream.site',
    referer: 'https://vidtube.site/', origin: 'https://vidtube.site', secSite: 'cross-site' },
  { test: h => h.endsWith('.owocdn.top') || h === 'owocdn.top',
    referer: 'https://kwik.cx/', origin: 'https://kwik.cx', secSite: 'cross-site' },
  { test: h => h.endsWith('.uwucdn.top') || h === 'uwucdn.top',
    referer: 'https://kwik.cx/', origin: 'https://kwik.cx', secSite: 'cross-site' },
  { test: h => h.endsWith('.krussdomi.com') || h === 'krussdomi.com',
    referer: 'https://krussdomi.com/', origin: 'https://krussdomi.com', secSite: 'same-origin' },
  { test: h => h.endsWith('.streamzone1.site') || h === 'streamzone1.site',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  // mewstream.buzz (AniKoto) — needs megaplay.buzz referer
  { test: h => h.endsWith('.mewstream.buzz') || h === 'mewstream.buzz',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  { test: h => h.endsWith('.cinewave2.site') || h === 'cinewave2.site',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  // vibeplayer / vivibebe
  { test: h => h === 'vibeplayer.site' || h.endsWith('.vibeplayer.site') ||
               h === 'vivibebe.site' || h.endsWith('.vivibebe.site'),
    referer: 'https://vibeplayer.site/', origin: 'https://vibeplayer.site', secSite: 'same-origin' },
  // playeng (beep provider) — CRITICAL: 403 without same-origin referer
  { test: h => h.endsWith('.animeapps.top') || h === 'animeapps.top',
    referer: 'https://playeng.animeapps.top/', origin: 'https://playeng.animeapps.top', secSite: 'same-origin' },
  // nanobyte (AniLight quality variants)
  { test: h => h.endsWith('.bigdreamsmalldih.site') || h === 'bigdreamsmalldih.site',
    referer: 'https://kwik.cx/', origin: 'https://kwik.cx', secSite: 'cross-site' },
  // kwik
  { test: h => h === 'kwik.cx' || h.endsWith('.kwik.cx'),
    referer: 'https://kwik.cx/', origin: 'https://kwik.cx', secSite: 'same-origin' },
  // AniKage
  { test: h => h === 'prox.anikage.cc' || h.endsWith('.anikage.cc'),
    referer: 'https://anikage.cc/', origin: 'https://anikage.cc', secSite: 'cross-site' },
  // allanime
  { test: h => h === 'allanime.uns.bio' || h.endsWith('.allanime.uns.bio'),
    referer: 'https://allanime.uns.bio/', origin: 'https://allanime.uns.bio', secSite: 'same-origin' },
  // harmonix (miku provider)
  { test: h => h.endsWith('.harmonixwellnessgroup.store'),
    referer: 'https://allanime.uns.bio/', origin: 'https://allanime.uns.bio', secSite: 'cross-site' },
  // megaplay
  { test: h => h === 'megaplay.buzz' || h.endsWith('.megaplay.buzz'),
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'same-origin' },
  // animeverse
  { test: h => h.endsWith('.animeverse.to') || h === 'animeverse.to',
    referer: 'https://animeverse.to/', origin: 'https://animeverse.to', secSite: 'same-origin' },
  // animeonsen
  { test: h => h.endsWith('.animeonsen.xyz') || h === 'animeonsen.xyz',
    referer: 'https://www.animeonsen.xyz/', origin: 'https://www.animeonsen.xyz', secSite: 'cross-site' },
  // anidb app
  { test: h => h === 'anidb.app',
    referer: 'https://anidb.app/', origin: 'https://anidb.app', secSite: 'same-origin' },
  // kem.clvd.xyz
  { test: h => h.endsWith('.clvd.xyz'),
    referer: 'https://kem.clvd.xyz/', origin: 'https://kem.clvd.xyz', secSite: 'cross-site' },
  // Raw IP addresses (Miruro Ally uses 185.237.x.x)
  { test: h => /^\d+\.\d+\.\d+\.\d+$/.test(h),
    referer: 'https://www.miruro.tv/', origin: 'https://www.miruro.tv', secSite: 'cross-site' },

  // ─── NEW SOURCES (added 2026-06-27) ───
  // Kyren (kyren.moe + api.kyren.moe) — CF-protected, needs kyren.moe referer
  { test: h => h === 'kyren.moe' || h.endsWith('.kyren.moe') ||
               h === 'api.kyren.moe' || h.endsWith('.api.kyren.moe'),
    referer: 'https://kyren.moe/', origin: 'https://kyren.moe', secSite: 'same-origin' },
  // Ani.pm (ani.pm API + streams) — CF-protected
  { test: h => h === 'ani.pm' || h.endsWith('.ani.pm'),
    referer: 'https://ani.pm/', origin: 'https://ani.pm', secSite: 'same-origin' },
  // AniLight (api.anilight.live) — CF-protected
  { test: h => h === 'api.anilight.live' || h.endsWith('.anilight.live'),
    referer: 'https://anilight.live/', origin: 'https://anilight.live', secSite: 'cross-site' },
  // Anistream (api.anistream.one) — CF-protected
  { test: h => h === 'api.anistream.one' || h.endsWith('.anistream.one'),
    referer: 'https://anistream.one/', origin: 'https://anistream.one', secSite: 'cross-site' },
  // AniKuro (anikuro.ru API + proxy.anikuro.ru streams)
  { test: h => h === 'anikuro.ru' || h.endsWith('.anikuro.ru') ||
               h === 'proxy.anikuro.ru',
    referer: 'https://anikuro.ru/', origin: 'https://anikuro.ru', secSite: 'same-origin' },
  // Animetsu scraper (animetsu-scraper-jade.vercel.app)
  { test: h => h === 'animetsu-scraper-jade.vercel.app',
    referer: 'https://animetsu.live/', origin: 'https://animetsu.live', secSite: 'cross-site' },
  // swiftstream.top (Animetsu stream CDN) — CF-protected
  { test: h => h === 'swiftstream.top' || h.endsWith('.swiftstream.top'),
    referer: 'https://animetsu.live/', origin: 'https://animetsu.live', secSite: 'cross-site' },
  // Animeyubi (animeyubi.com API)
  { test: h => h === 'animeyubi.com' || h.endsWith('.animeyubi.com'),
    referer: 'https://animeyubi.com/', origin: 'https://animeyubi.com', secSite: 'same-origin' },

  // ReAnime (reanime.to) — CF-protected, needs same-origin referer
  { test: h => h === 'reanime.to' || h.endsWith('.reanime.to'),
    referer: 'https://reanime.to/', origin: 'https://reanime.to', secSite: 'same-origin' },

  // ─── Vidlink CDN (movie/TV direct streams) ───
  // stormvv.vodvidl.site, storm.vodvidl.site — Vidlink MP4/DASH streams
  // Requires Referer: https://vidlink.pro/ (returns 403 without it)
  { test: h => h.endsWith('.vodvidl.site') || h === 'vodvidl.site',
    referer: 'https://vidlink.pro/', origin: 'https://vidlink.pro', secSite: 'cross-site' },
  // hakunaymatata.com — Vidlink CDN (bcdn, cacdn, sacdn subdomains)
  { test: h => h.endsWith('.hakunaymatata.com') || h === 'hakunaymatata.com',
    referer: 'https://vidlink.pro/', origin: 'https://vidlink.pro', secSite: 'cross-site' },

  // ─── Luna-Stream CDNs (added 2026-07-13) ───
  // seiryuu.vid-cdn.xyz — Luna AniZone HLS + ASS subtitles
  // Needs anizone.to referer (returns 403 without it)
  { test: h => h.endsWith('.vid-cdn.xyz') || h === 'vid-cdn.xyz',
    referer: 'https://anizone.to/', origin: 'https://anizone.to', secSite: 'cross-site' },
  // as-cdn21.top — Luna AnimeSalt HLS (already proxied through luna, but just in case)
  // Also used by AnixTV (same CDN, auth params handle authorization)
  { test: h => h.endsWith('.as-cdn21.top') || h === 'as-cdn21.top',
    referer: 'https://animesalt.to/', origin: 'https://animesalt.to', secSite: 'cross-site' },
  // AnixTV HLS CDN variants (as-cdn22..25.top) — need anixtv.in referer
  { test: h => /^as-cdn2[2-5]\.top$/.test(h) || /^as-cdn2[2-5]\.top$/.test(h),
    referer: 'https://anixtv.in/', origin: 'https://anixtv.in', secSite: 'cross-site' },
  // WatchAnimeWorld / Zephyrix — play.zephyrix.top serves HLS streams
  { test: h => h === 'play.zephyrix.top' || h.endsWith('.zephyrix.top'),
    referer: 'https://watchanimeworld.top/', origin: 'https://watchanimeworld.top', secSite: 'cross-site' },
  // as-cdn17.top — WatchAnimeWorld HLS segments
  { test: h => h.endsWith('.as-cdn17.top') || h === 'as-cdn17.top',
    referer: 'https://watchanimeworld.top/', origin: 'https://watchanimeworld.top', secSite: 'cross-site' },
  // stream.neongambit.com / stream2.neongambit.com — Luna HadFree
  { test: h => h.endsWith('.neongambit.com') || h === 'neongambit.com',
    referer: 'https://luna-stream.me/', origin: 'https://luna-stream.me', secSite: 'cross-site' },
  // api.anime.nexus / assets.anime.nexus — Luna AnimeNexus
  { test: h => h.endsWith('.anime.nexus') || h === 'anime.nexus',
    referer: 'https://anime.nexus/', origin: 'https://anime.nexus', secSite: 'same-origin' },
  // 1oe.lostproject.club — AniDap Yuki subtitle CDN
  { test: h => h.endsWith('.lostproject.club') || h === 'lostproject.club',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  // subbl.krussdomi.com — AniDap Sora subtitle CDN
  { test: h => h.endsWith('.krussdomi.com') || h === 'krussdomi.com',
    referer: 'https://krussdomi.com/', origin: 'https://krussdomi.com', secSite: 'same-origin' },

  // Catch-all: default to miruro.tv referer (matches proxy.ts default)
  { test: h => true,
    referer: 'https://www.miruro.tv/', origin: 'https://www.miruro.tv', secSite: 'cross-site' },
];

/* ─── Base64url helpers ──────────────────────────────────────────────────── */
function b64uEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(b64u) {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodePayload(url, referer) {
  return b64uEncode(url + '\0' + (referer || ''));
}

function decodePayload(b64u) {
  try {
    const plain = b64uDecode(b64u);
    const idx = plain.indexOf('\0');
    if (idx === -1) return { url: plain, ref: null };
    return { url: plain.slice(0, idx), ref: plain.slice(idx + 1) || null };
  } catch {
    return null;
  }
}

/* ─── Browser impersonation headers ─────────────────────────────────────── */
function browserHeaders(referer, origin, secSite) {
  const h = {
    'User-Agent':         'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':             '*/*',
    'Accept-Language':    'en-US,en;q=0.9',
    'Accept-Encoding':    'gzip, deflate, br',
    'Sec-Fetch-Dest':     'empty',
    'Sec-Fetch-Mode':     'cors',
    'Sec-Fetch-Site':     secSite || 'cross-site',
    'Sec-CH-UA':          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-CH-UA-Mobile':   '?0',
    'Sec-CH-UA-Platform': '"Windows"',
    'Connection':         'keep-alive',
    'Cache-Control':      'no-cache',
    'Pragma':             'no-cache',
  };
  if (referer) h['Referer'] = referer;
  if (origin)  h['Origin']  = origin;
  return h;
}

/* ─── CORS headers ───────────────────────────────────────────────────────── */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':   '*',
    'Access-Control-Allow-Methods':  'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers':  'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Accept-Ranges',
    'Accept-Ranges':                 'bytes',
  };
}

/* ─── Resolve relative URL against base ─────────────────────────────────── */
function resolveUrl(rel, base) {
  if (/^https?:\/\//i.test(rel)) return rel;
  try { return new URL(rel, base).href; } catch { return rel; }
}

/* ─── Rewrite M3U8: all segment/key URIs → /p/<base64url> ───────────────── */
function rewriteM3u8(text, baseUrl, referer, workerBase) {
  const lines = text.split('\n');
  return lines.map(raw => {
    const line = raw.trim();

    if (line.startsWith('#') && line.includes('URI="')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        const abs = resolveUrl(uri, baseUrl);
        // Encode null referer so the worker falls back to its CDN rule table
        // for each segment/key URL. If we encoded the m3u8's referer, segments
        // on a different CDN would get the wrong Referer header → 403.
        return `URI="${workerBase}/p/${encodePayload(abs, null)}"`;
      });
    }

    if (line && !line.startsWith('#')) {
      const abs = resolveUrl(line, baseUrl);
      // Encode null referer so the worker falls back to its CDN rule table
      // for each segment URL. The m3u8 referer may be wrong for the segment CDN.
      return `${workerBase}/p/${encodePayload(abs, null)}`;
    }

    return raw;
  }).join('\n');
}

/* ─── Core proxy logic ───────────────────────────────────────────────────── */
async function proxyTarget(targetUrl, refParam, request) {
  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
    if (parsedTarget.protocol !== 'https:' && parsedTarget.protocol !== 'http:') throw new Error('bad protocol');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid target URL' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const targetHost = parsedTarget.hostname.toLowerCase();
  const overrideReferer = refParam || null;

  const rule = CDN_RULES.find(r => r.test(targetHost));
  let effectiveReferer, effectiveOrigin, effectiveSecSite;

  if (rule) {
    effectiveReferer = overrideReferer || rule.referer || `https://${targetHost}/`;
    effectiveOrigin  = rule.origin || `https://${targetHost}`;
    effectiveSecSite = rule.secSite || 'cross-site';
  } else if (overrideReferer) {
    try {
      const refUrl = new URL(overrideReferer);
      effectiveReferer = overrideReferer;
      effectiveOrigin  = refUrl.origin;
      effectiveSecSite = 'cross-site';
    } catch {
      effectiveReferer = overrideReferer;
      effectiveOrigin  = `https://${targetHost}`;
      effectiveSecSite = 'cross-site';
    }
  } else {
    effectiveReferer = `https://${targetHost}/`;
    effectiveOrigin  = `https://${targetHost}`;
    effectiveSecSite = 'cross-site';
  }

  const headers = browserHeaders(effectiveReferer, effectiveOrigin, effectiveSecSite);
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) headers['Range'] = rangeHeader;

  let upstreamResp;
  try {
    upstreamResp = await fetch(targetUrl, {
      method:   request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      redirect: 'follow',
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Upstream fetch failed', detail: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

  if (!upstreamResp.ok && upstreamResp.status !== 206) {
    return new Response(
      JSON.stringify({ error: 'Upstream error', status: upstreamResp.status, host: targetHost }),
      { status: upstreamResp.status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

  const contentType = (upstreamResp.headers.get('Content-Type') || '').toLowerCase();
  const isM3u8 = contentType.includes('mpegurl') || contentType.includes('x-mpegurl')
               || targetUrl.split('?')[0].endsWith('.m3u8')
               || targetUrl.split('?')[0].endsWith('/master')
               || targetUrl.split('?')[0].endsWith('/index.m3u8');

  if (request.method === 'HEAD') {
    const h = { 'Content-Type': upstreamResp.headers.get('Content-Type') || 'application/octet-stream', ...corsHeaders() };
    const cl = upstreamResp.headers.get('Content-Length');
    if (cl) h['Content-Length'] = cl;
    return new Response(null, { status: upstreamResp.status, headers: h });
  }

  if (isM3u8) {
    const text = await upstreamResp.text();
    const workerBase = WORKER_BASE || new URL(request.url).origin;
    const rewritten = rewriteM3u8(text, targetUrl, effectiveReferer, workerBase);
    return new Response(rewritten, {
      status: upstreamResp.status,
      headers: {
        'Content-Type':  'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
        ...corsHeaders(),
      },
    });
  }

  // ── Subtitle files: convert SRT → WebVTT so browsers can render them ──
  // The <track> element ONLY supports text/vtt. SRT and ASS are not supported.
  // We convert SRT to VTT on-the-fly (timestamp comma → period + WEBVTT header).
  // ASS is too complex to convert losslessly, so we do a basic strip of the
  // styling header and extract dialogue lines as plain VTT cues.
  const urlPath = targetUrl.split('?')[0].toLowerCase().split('#')[0];

  if (urlPath.endsWith('.srt')) {
    const srtText = await upstreamResp.text();
    const vttBody = srtText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/^\uFEFF/, '')           // strip BOM
      .replace(/^\d+\s*\n(?=\d{2}:\d{2}:\d{2}[,.])/gm, '')  // strip SRT index lines (only before timestamps)
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')  // , → . in timestamps
      .trim();
    const vtt = `WEBVTT\n\n${vttBody}\n`;
    return new Response(vtt, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, immutable',
        ...corsHeaders(),
      },
    });
  }

  if (urlPath.endsWith('.vtt')) {
    // Pass through with correct content-type (many CDNs return octet-stream)
    const vttText = await upstreamResp.text();
    return new Response(vttText, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, immutable',
        ...corsHeaders(),
      },
    });
  }

  if (urlPath.endsWith('.ass')) {
    // Basic ASS → VTT conversion: strip [Script Info] / [V4+ Styles] / [Events]
    // header, extract Dialogue lines, strip ASS styling tags {\...}
    const assText = await upstreamResp.text();
    const lines = assText.split(/\r?\n/);
    const vttCues = [];
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
      vttCues.push(`${idx++}\n${vStart} --> ${vEnd}\n${text}\n`);
    }
    const vtt = `WEBVTT\n\n${vttCues.join('\n')}`;
    return new Response(vtt, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, immutable',
        ...corsHeaders(),
      },
    });
  }

  // Binary / TS segment: stream as-is with correct content-type
  let contentType = upstreamResp.headers.get('Content-Type') || 'application/octet-stream';

  const passHeaders = {
    'Content-Type':  contentType,
    'Cache-Control': 'public, max-age=86400, immutable',
    ...corsHeaders(),
  };
  // For HTML responses, add X-Frame-Options: ALLOWALL so they can be
  // loaded in an iframe (needed for embed players like AnixTV).
  if (contentType.includes('text/html')) {
    passHeaders['X-Frame-Options'] = 'ALLOWALL';
    passHeaders['Content-Security-Policy'] = 'frame-ancestors *';
  }
  const cl = upstreamResp.headers.get('Content-Length');
  if (cl) passHeaders['Content-Length'] = cl;
  const cr = upstreamResp.headers.get('Content-Range');
  if (cr) passHeaders['Content-Range'] = cr;

  return new Response(upstreamResp.body, { status: upstreamResp.status, headers: passHeaders });
}

/* ─── Main handler ───────────────────────────────────────────────────────── */
async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (url.pathname === '/health' || url.pathname === '/') {
    return new Response(JSON.stringify({ ok: true, worker: 'luffytv-proxy v3', ts: Date.now() }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  // Primary: /p/<base64url>
  if (url.pathname.startsWith('/p/')) {
    const b64u = url.pathname.slice(3);
    const decoded = decodePayload(b64u);
    if (!decoded) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }
    return proxyTarget(decoded.url, decoded.ref, request);
  }

  // Legacy: /proxy?url=...&ref=...
  if (url.pathname === '/proxy') {
    const targetRaw = url.searchParams.get('url');
    if (!targetRaw) {
      return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }
    let targetUrl;
    try { targetUrl = decodeURIComponent(targetRaw); } catch {
      return new Response(JSON.stringify({ error: 'Bad URL encoding' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }
    const refParam = url.searchParams.get('ref');
    return proxyTarget(targetUrl, refParam, request);
  }

  return new Response('Not found', { status: 404, headers: corsHeaders() });
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};
