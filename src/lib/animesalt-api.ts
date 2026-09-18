/**
 * AnimeSalt API Client
 * --------------------
 * AnimeSalt (https://animesalt.cx/) is a Hindi/Tamil/Telugu/English/Japanese
 * multi-audio anime streaming portal built on WordPress. The site exposes:
 *
 *   - Series pages:  https://animesalt.cx/series/{slug}/
 *     Each series page lists every episode as
 *     https://animesalt.cx/episode/{series-slug}-{season}x{episode}/
 *
 *   - Episode pages:  https://animesalt.cx/episode/{slug}/
 *     Each episode page embeds ONE iframe pointing at the ASCDN player:
 *       https://as-cdn26.top/video/{32-char-hash}
 *     Plus an optional multi-language player iframe:
 *       https://animesalt.cx/multi-lang-plyr/player.php?data={base64-JSON}
 *     The base64 JSON is an array of {language, link} objects pointing to
 *     short.icu shortlinks (which we cannot resolve from Vercel — DNS-blocked).
 *     So we use the ASCDN player which is the default and direct.
 *
 *   - ASCDN player:   https://as-cdn{21..29}.top/video/{hash}
 *     1. GET the video page → sets fireplayer_player cookie + returns HTML
 *        containing the FirePlayer shell (hash is in the URL).
 *     2. POST https://as-cdn{N}.top/player/index.php?data={hash}&do=getVideo
 *        Body (form-encoded): hash={hash}&r={video_page_url}
 *        Returns JSON: { hls: true, videoSource: "https://as-cdn{N}.top/cdn/hls/{md5}/master.m3u8?md5=...&expires=..." }
 *     3. The videoSource URL is a standard HLS master playlist — playable
 *        directly with hls.js. CORS is permissive. No decryption needed.
 *
 * Title → slug mapping:
 *   AnimeSalt does NOT expose an AniList ID. We resolve slugs by:
 *     (a) Slugifying the AniList english/romaji title (lowercase, replace
 *         non-alphanumeric with hyphens, strip diacritics).
 *     (b) Probing /series/{slug}/ directly. If 200, we're done.
 *     (c) If 404, fetch /letter/{first-letter}/ (a-z0-9) — these pages
 *         list every series starting with that letter — and match by
 *         normalized title. Cache the result.
 *
 * Multi-audio:
 *   The ASCDN HLS playlist is multi-audio — Hindi/Tamil/Telugu/English/Japanese
 *   audio tracks are exposed via #EXT-X-MEDIA audio groups in the master
 *   playlist. The player picks the default audio track; users can switch
 *   inside the player UI. No separate per-language m3u8 is needed.
 *
 * IMPORTANT — Referer required:
 *   The ASCDN m3u8 returns 403 unless the request includes
 *   Referer: https://animesalt.cx/
 *   This rule is set in BOTH src/lib/proxy.ts (CDN_REFERERS) and
 *   src/app/p/[token]/route.ts (CDN_RULES) — keep them in sync.
 */

import { curlFetch } from "./curl-fetch";

const ANIMESALT_BASE = "https://animesalt.cx";
const ASCDN_BASE = "https://as-cdn26.top";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// ── In-memory caches (per-serverless-instance) ─────────────────────────────
// These caches persist for the lifetime of the warm Vercel function instance,
// which is typically 5–15 minutes between cold starts.
const slugCache = new Map<string, { slug: string | null; ts: number }>();
const letterCache = new Map<string, { entries: Array<{ slug: string; title: string }>; ts: number }>();
const audioTracksCache = new Map<string, { langs: string[]; ts: number }>();
const SLUG_CACHE_TTL = 60 * 60 * 1000;       // 1 hour
const LETTER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours (animesalt catalog changes slowly)
const AUDIO_TRACKS_CACHE_TTL = 60 * 60 * 1000; // 1 hour — same video hash always has same audio tracks

export interface AnimeSaltServer {
  id: string;
  name: string;
  source: "animesalt";
  provider: string;
  type: "dub" | "sub";
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  hardsub: boolean;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

export interface AnimeSaltFetchResult {
  servers: AnimeSaltServer[];
  matchedSlug: string | null;
  videoHash: string | null;
  languages: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Slug utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a title into an animesalt-style slug.
 * "Bleach: Thousand-Year Blood War" → "bleach-thousand-year-blood-war"
 * "Jujutsu Kaisen"                  → "jujutsu-kaisen"
 * "Dr. Stone"                       → "dr-stone"
 * "My Hero Academia"                → "my-hero-academia"
 *
 * Special cases: animesalt.cx uses shorter slugs than the AniList title for
 * franchises where it consolidates all seasons under one series page:
 *   "Demon Slayer: Kimetsu no Yaiba" → "demon-slayer"
 *   "Dr. Stone: Stone Wars"          → "dr-stone"
 */
export function slugifyTitle(title: string): string {
  // Strip ": {subtitle}" suffix for franchises where animesalt consolidates
  // multiple seasons under one series page. Without this, the slug probe fails.
  // NOTE: only add franchises where animesalt.cx actually consolidates under
  // the short name. Verify by fetching /letter/{X}/ before adding.
  const consolidatedFranchises = [
    "demon slayer",                  // Demon Slayer: Kimetsu no Yaiba → demon-slayer
    "dr. stone",                     // Dr. Stone: Stone Wars → dr-stone
    "attack on titan",               // Attack on Titan: Final Season → attack-on-titan
    "jujutsu kaisen",                // Jujutsu Kaisen Season 2 → jujutsu-kaisen
    "my hero academia",              // My Hero Academia Season 5 → my-hero-academia
    "kaiju no 8",                    // Kaiju No.8 → kaiju-no-8
  ];
  const lowerTitle = title.toLowerCase().replace(/[''`]/g, "").trim();
  for (const f of consolidatedFranchises) {
    if (lowerTitle.startsWith(f + ":") || lowerTitle === f) {
      title = f.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      break;
    }
  }

  return title
    .toLowerCase()
    .normalize("NFKD")                         // split diacritics from letters
    .replace(/[\u0300-\u036f]/g, "")           // strip diacritics
    .replace(/[''`]/g, "")                     // strip apostrophes
    .replace(/[:·—–-]+/g, " ")                 // colons, em/en dashes → space
    .replace(/[^a-z0-9]+/g, "-")               // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, "")                    // trim leading/trailing hyphens
    .replace(/-{2,}/g, "-");                    // collapse runs of hyphens
}

/**
 * Strip "Season N" / "SN" / "Part N" / "Cour N" / Roman numerals from a title
 * so the resulting slug matches AnimeSalt's series (not season) URL.
 *
 * AnimeSalt organizes seasons as separate episode ranges under ONE series
 * page. e.g. /series/naruto/ contains episodes naruto-1x1, naruto-1x2, ...
 * /series/bleach-thousand-year-blood-war/ contains episodes bleach-thousand-year-blood-war-1x1, ...
 * So we strip ALL season markers before slugifying.
 */
export function stripSeasonFromTitle(title: string): string {
  return title
    .replace(/\s*\(?\s*(?:season|part|cour)\s*\d+\s*\)?\s*$/i, "")
    .replace(/\s+\d+(?:st|nd|rd|th)\s+season\s*$/i, "")
    .replace(/\s+S\d+\s*$/i, "")
    .replace(/\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)\s*$/g, "")  // Roman season markers
    .replace(/\s*:\s*(?:season|part|cour)\s*\d+\s*$/i, "")
    .trim();
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers — uses curlFetch (curl subprocess) to bypass Cloudflare
// bot detection. animesalt.cx series/episode pages are CF-protected and
// return a JS challenge page to Node's native fetch.
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchHtml(url: string, referer?: string): Promise<string | null> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (referer) headers["Referer"] = referer;

  try {
    const res = await curlFetch(url, { headers, timeoutMs: 12000 });
    if (!res.ok) return null;
    const text = await res.text();
    // Detect CF challenge page — these have <title>Just a moment...</title>
    // and are typically 5–6KB. Real series/episode pages are >100KB.
    if (text.length < 8000 && /Just a moment/i.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Letter index — fallback for fuzzy title matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the /letter/{X}/ page and parse out all series slugs + titles.
 * Cached for 24h.
 */
async function fetchLetterEntries(letter: string): Promise<Array<{ slug: string; title: string }>> {
  const lower = letter.toLowerCase();
  const cached = letterCache.get(lower);
  if (cached && Date.now() - cached.ts < LETTER_CACHE_TTL) return cached.entries;

  const url = `${ANIMESALT_BASE}/letter/${encodeURIComponent(lower)}/`;
  const html = await fetchHtml(url);
  if (!html) return [];

  // Extract series links + the link text. Pattern:
  //   <a href="https://animesalt.cx/series/{slug}/" ...>{Title}</a>
  // The title is usually the anchor text; sometimes it's inside an <h3> child.
  const entries: Array<{ slug: string; title: string }> = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href="https?:\/\/animesalt\.cx\/series\/([a-z0-9-]+)\/?"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    // Strip tags from inner HTML, decode entities
    const titleRaw = m[2]
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&#\d+;/g, " ")
      .trim();
    if (titleRaw) entries.push({ slug, title: titleRaw });
  }

  letterCache.set(lower, { entries, ts: Date.now() });
  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Title → slug resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the AnimeSalt series slug for an AniList anime.
 *
 * Strategy (in order):
 *   1. Strip season markers from the title, slugify, probe /series/{slug}/.
 *   2. Try the same with the romaji title if english failed.
 *   3. Fall back to /letter/{first-letter}/ scan with normalized fuzzy match.
 *   4. If still nothing, return null (anime not on AnimeSalt).
 */
export async function resolveSlug(
  englishTitle: string,
  romajiTitle: string = "",
): Promise<string | null> {
  const cacheKey = (englishTitle + "|" + romajiTitle).toLowerCase();
  const cached = slugCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SLUG_CACHE_TTL) return cached.slug;

  const candidates: string[] = [];
  const eng = stripSeasonFromTitle(englishTitle || "");
  const rom = stripSeasonFromTitle(romajiTitle || "");
  if (eng) candidates.push(slugifyTitle(eng));
  if (rom && slugifyTitle(rom) !== slugifyTitle(eng)) candidates.push(slugifyTitle(rom));

  // Strategy 1+2: direct probe
  for (const slug of candidates) {
    if (!slug) continue;
    const html = await fetchHtml(`${ANIMESALT_BASE}/series/${slug}/`);
    if (html && html.length > 5000 && /<h1|entry-title|episode/i.test(html)) {
      slugCache.set(cacheKey, { slug, ts: Date.now() });
      return slug;
    }
  }

  // Strategy 3: letter scan + fuzzy match
  const firstLetter = (eng || rom)[0]?.toLowerCase() || "a";
  if (!/[a-z0-9]/.test(firstLetter)) {
    slugCache.set(cacheKey, { slug: null, ts: Date.now() });
    return null;
  }
  const entries = await fetchLetterEntries(firstLetter);
  if (entries.length === 0) {
    slugCache.set(cacheKey, { slug: null, ts: Date.now() });
    return null;
  }

  const targetNorm = normalizeForMatch(eng) || normalizeForMatch(rom);
  if (!targetNorm) {
    slugCache.set(cacheKey, { slug: null, ts: Date.now() });
    return null;
  }

  // Try exact match first, then prefix match, then includes match.
  let bestSlug: string | null = null;
  for (const e of entries) {
    if (normalizeForMatch(e.title) === targetNorm) { bestSlug = e.slug; break; }
  }
  if (!bestSlug) {
    for (const e of entries) {
      if (normalizeForMatch(e.title).startsWith(targetNorm)) { bestSlug = e.slug; break; }
    }
  }
  if (!bestSlug) {
    for (const e of entries) {
      if (normalizeForMatch(e.title).includes(targetNorm)) { bestSlug = e.slug; break; }
    }
  }

  // If we found a fuzzy match, verify by probing the series page
  if (bestSlug) {
    const html = await fetchHtml(`${ANIMESALT_BASE}/series/${bestSlug}/`);
    if (html && html.length > 5000) {
      slugCache.set(cacheKey, { slug: bestSlug, ts: Date.now() });
      return bestSlug;
    }
  }

  slugCache.set(cacheKey, { slug: null, ts: Date.now() });
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Series page → episode slugs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given a series slug + season + episode number, construct the episode slug
 * and verify it exists by HEAD/GET probing.
 *
 * Episode URL pattern: /episode/{series-slug}-{season}x{episode}/
 * Example: /episode/naruto-1x1/, /episode/naruto-1x10/
 *
 * Returns the episode URL (or null if 404).
 */
export async function resolveEpisodeUrl(
  seriesSlug: string,
  season: number,
  episode: number,
): Promise<string | null> {
  const epSlug = `${seriesSlug}-${season}x${episode}`;
  const url = `${ANIMESALT_BASE}/episode/${epSlug}/`;
  const html = await fetchHtml(url);
  if (!html || html.length < 1000) return null;
  // 404 page is tiny (~1.5KB) and lacks the iframe; real episode pages
  // contain the ASCDN iframe.
  if (!/as-cdn\d+\.top\/video\//.test(html)) return null;
  return url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Episode page → ASCDN hash + languages
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch an episode page and extract:
 *   - The ASCDN video hash (32-char hex)
 *   - The list of available languages from the multi-lang-plyr base64
 *   - Subtitle track URLs from the ASCDN video page (playerjsSubtitle var)
 *
 * SUBTITLE DISCOVERY:
 *   The master.m3u8 itself does NOT contain #EXT-X-MEDIA:TYPE=SUBTITLES entries.
 *   Instead, subtitles are referenced in the ASCDN video page (the /video/{hash}
 *   page that contains the FirePlayer) as a JS variable:
 *     var playerjsSubtitle = "[English]https://as-cdn26.top/p/{token}.jpg,...";
 *   Format: comma-separated [Label]URL pairs.
 *   The .jpg URLs return WebVTT content (the .jpg extension is a disguise
 *   to bypass ad-blockers — content-type is text/html, body is WEBVTT).
 */
export async function fetchEpisodeData(episodeUrl: string): Promise<{
  videoHash: string | null;
  ascdnUrl: string | null;
  languages: string[];
  multiLangLinks: Array<{ language: string; link: string }>;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
}> {
  const html = await fetchHtml(episodeUrl);
  if (!html) return { videoHash: null, ascdnUrl: null, languages: [], multiLangLinks: [], subtitleTracks: [] };

  // Find the ASCDN iframe: <iframe src="https://as-cdn26.top/video/{hash}">
  const ascdnMatch = html.match(/https?:\/\/as-cdn\d+\.top\/video\/([a-f0-9]{32})/i);
  const videoHash = ascdnMatch?.[1] ?? null;
  const ascdnUrl = ascdnMatch?.[0] ?? null;

  // Find the multi-lang-plyr base64 and decode it for the language list
  const multiLangLinks: Array<{ language: string; link: string }> = [];
  const languages: string[] = [];
  const b64Match = html.match(/multi-lang-plyr\/player\.php\?data=([A-Za-z0-9+/=]+)/);
  if (b64Match) {
    try {
      const decoded = Buffer.from(b64Match[1], "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.language && item.link) {
            multiLangLinks.push({ language: item.language, link: item.link });
            languages.push(item.language);
          }
        }
      }
    } catch {
      // ignore — base64 / JSON parse failure is non-fatal; ASCDN stream still works
    }
  }

  // Fetch the ASCDN video page to extract the playerjsSubtitle variable
  // (subtitle URLs are NOT in the m3u8 — they're in the player page HTML)
  let subtitleTracks: Array<{ url: string; lang: string; label: string }> = [];
  if (ascdnUrl) {
    try {
      const playerPageHtml = await fetchHtml(ascdnUrl, ANIMESALT_BASE + "/");
      if (playerPageHtml) {
        // var playerjsSubtitle = "[English]https://as-cdn26.top/p/{token}.jpg,[Spanish]https://...";
        const subMatch = playerPageHtml.match(/var\s+playerjsSubtitle\s*=\s*"([^"]+)"/);
        if (subMatch) {
          const raw = subMatch[1];
          // Parse [Label]URL pairs (comma-separated)
          const parts = raw.split(/\[([^\]]+)\]/);
          for (let i = 1; i + 1 < parts.length; i += 2) {
            const label = parts[i].trim();
            const url = parts[i + 1].replace(/,$/, "").trim();
            if (url && /^https?:\/\//.test(url)) {
              // Map common labels to ISO language codes
              const labelLower = label.toLowerCase();
              let lang = "en";
              if (labelLower.includes("english") || labelLower === "eng") lang = "en";
              else if (labelLower.includes("spanish")) lang = "es";
              else if (labelLower.includes("french")) lang = "fr";
              else if (labelLower.includes("arabic")) lang = "ar";
              else if (labelLower.includes("portuguese")) lang = "pt";
              else if (labelLower.includes("german")) lang = "de";
              else if (labelLower.includes("italian")) lang = "it";
              else if (labelLower.includes("russian")) lang = "ru";
              else if (labelLower.includes("hindi")) lang = "hi";
              else if (labelLower.includes("tamil")) lang = "ta";
              else if (labelLower.includes("telugu")) lang = "te";
              else if (labelLower.includes("japanese") || labelLower === "jpn") lang = "ja";
              else if (labelLower === "undefined") { lang = "en"; }  // "Undefined" = English usually
              subtitleTracks.push({ url, lang, label: label === "Undefined" ? "English" : label });
            }
          }
        }
      }
    } catch {
      // subtitle extraction is best-effort — don't fail the whole request
    }
  }

  return { videoHash, ascdnUrl, languages, multiLangLinks, subtitleTracks };
}

// ─────────────────────────────────────────────────────────────────────────────
// ASCDN → m3u8 stream URL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given an ASCDN video hash + the ascdn page URL, POST to the player's
 * getVideo endpoint and return the master.m3u8 URL.
 *
 * Flow:
 *   1. GET the /video/{hash} page (sets fireplayer_player cookie)
 *   2. POST /player/index.php?data={hash}&do=getVideo
 *      Body: hash={hash}&r={video_page_url}
 *   3. Parse JSON response: { hls: true, videoSource: "{m3u8 URL}" }
 *
 * The videoSource URL is signed with md5 + expires query params and is
 * typically valid for ~2 hours. We return it as-is.
 */
export async function fetchAscdnM3u8(
  videoHash: string,
  ascdnUrl: string,
): Promise<string | null> {
  // Step 1: warm the cookie by fetching the video page (curl to bypass CF)
  try {
    await curlFetch(ascdnUrl, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": ANIMESALT_BASE + "/",
      },
      timeoutMs: 10000,
    });
  } catch {
    // non-fatal — cookie may already be set
  }

  // Step 2: POST to getVideo via curl (ASCDN may also block Node fetch)
  try {
    const postUrl = `${ASCDN_BASE}/player/index.php?data=${videoHash}&do=getVideo`;
    const body = `hash=${videoHash}&r=${encodeURIComponent(ascdnUrl)}`;
    const res = await curlFetch(postUrl, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": ascdnUrl,
        "Origin": ASCDN_BASE,
      },
      body,
      timeoutMs: 10000,
    });
    if (!res.ok) return null;
    const data = await res.json() as { hls?: boolean; videoSource?: string; securedLink?: string };
    if (data.videoSource) return data.videoSource;
    if (data.securedLink) return data.securedLink;
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// m3u8 audio track parser — the SOURCE OF TRUTH for available languages
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map ISO 639-1 / ISO 639-3 codes (used in the m3u8 LANGUAGE= attribute)
 * → human-readable language name (matches AnimeSalt's labels).
 *
 * The m3u8 #EXT-X-MEDIA:TYPE=AUDIO line looks like:
 *   #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Hindi",DEFAULT=YES,
 *   AUTOSELECT=YES,LANGUAGE="hin",URI="..."
 *
 * We extract LANGUAGE="..." (which is the ISO code) and map it to the
 * full language name so we can match against our INDIAN_LANGUAGES set.
 */
const ISO_TO_LANG_NAME: Record<string, string> = {
  hi: "Hindi",    hin: "Hindi",
  ta: "Tamil",    tam: "Tamil",
  te: "Telugu",   tel: "Telugu",
  en: "English",  eng: "English",
  ja: "Japanese", jpn: "Japanese",
  ml: "Malayalam", mal: "Malayalam",
  bn: "Bengali",   ben: "Bengali",
  mr: "Marathi",   mar: "Marathi",
  kn: "Kannada",   kan: "Kannada",
};

/**
 * Fetch the ASCDN master.m3u8 server-side (with the correct Referer that
 * the browser can't send due to CORS, and from the VPS IP that the m3u8
 * is signed for) and extract the list of audio track languages.
 *
 * WHY THIS EXISTS:
 *   AnimeSalt's episode page contains a multi-lang-plyr base64 blob that
 *   lists ALL languages they offer via short.icu shortlinks (Hindi, Tamil,
 *   Telugu, English, Japanese) — EVEN WHEN the actual ASCDN m3u8 only
 *   has Japanese audio. This happens for newly-added episodes that
 *   haven't been dubbed yet (e.g. Slime S4 on launch day).
 *
 *   Trusting the multi-lang-plyr data caused LuffyTV to show fake
 *   "AnimeSalt Hindi" servers that actually played Japanese audio. By
 *   parsing the m3u8 #EXT-X-MEDIA:TYPE=AUDIO lines, we know the REAL
 *   audio tracks and can return empty (no servers) when no Indian dub
 *   is actually present.
 *
 * Cache: results are cached per videoHash (1h TTL) since the same
 * video always has the same audio tracks.
 */
async function fetchM3u8AudioTracks(
  m3u8Url: string,
  videoHash: string,
): Promise<string[]> {
  // Check cache first — same videoHash always has same audio tracks.
  const cached = audioTracksCache.get(videoHash);
  if (cached && Date.now() - cached.ts < AUDIO_TRACKS_CACHE_TTL) {
    return cached.langs;
  }

  try {
    const res = await curlFetch(m3u8Url, {
      headers: {
        "User-Agent": UA,
        "Accept": "*/*",
        "Referer": ANIMESALT_BASE + "/",
        // NOTE: NO Origin header — ASCDN rejects requests with Origin
      },
      timeoutMs: 10000,
    });
    if (!res.ok) return [];
    const text = await res.text();
    // 403 page is small HTML — detect and reject
    if (!text.startsWith("#EXTM3U")) return [];

    const langs: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("#EXT-X-MEDIA:TYPE=AUDIO")) {
        const langMatch = line.match(/LANGUAGE="([^"]+)"/);
        if (langMatch) langs.push(langMatch[1].toLowerCase());
      }
    }
    audioTracksCache.set(videoHash, { langs, ts: Date.now() });
    return langs;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve an AnimeSalt stream for a given AniList anime + episode.
 *
 * @param anilistId    AniList anime ID
 * @param episode       Episode number (1-indexed)
 * @param season        Season number (default 1)
 * @param englishTitle  AniList English title
 * @param romajiTitle    AniList Romaji title (optional, fallback)
 */
export async function fetchAnimeSaltServers(
  anilistId: number,
  episode: number,
  season: number = 1,
  englishTitle: string,
  romajiTitle: string = "",
): Promise<AnimeSaltFetchResult> {
  const empty: AnimeSaltFetchResult = {
    servers: [],
    matchedSlug: null,
    videoHash: null,
    languages: [],
  };

  // 1. Resolve series slug from title
  const seriesSlug = await resolveSlug(englishTitle, romajiTitle);
  if (!seriesSlug) return empty;

  // 2. Resolve episode URL — verify the season/episode combo exists
  const episodeUrl = await resolveEpisodeUrl(seriesSlug, season, episode);
  if (!episodeUrl) return empty;

  // 3. Extract ASCDN hash + language list + subtitle tracks from the episode page
  const { videoHash, ascdnUrl, languages, subtitleTracks } = await fetchEpisodeData(episodeUrl);
  if (!videoHash || !ascdnUrl) return empty;

  // 4. POST to ASCDN to get the signed master.m3u8 URL
  const m3u8Url = await fetchAscdnM3u8(videoHash, ascdnUrl);
  if (!m3u8Url) return empty;

  // 5. Fetch the actual master.m3u8 and parse the REAL audio tracks.
  //    The multi-lang-plyr data from the episode page is UNRELIABLE — it
  //    lists ALL languages animesalt offers via shortlinks (Hindi, Tamil,
  //    Telugu, English, Japanese) even when the ASCDN m3u8 only has
  //    Japanese audio. This happens for newly-added episodes that haven't
  //    been dubbed yet (e.g. Slime S4 on launch day).
  //
  //    By parsing the m3u8 #EXT-X-MEDIA:TYPE=AUDIO lines, we know EXACTLY
  //    which audio tracks are actually present and can return empty
  //    (no servers) when no Indian dub is available — instead of showing
  //    a fake "AnimeSalt Hindi" server that plays Japanese audio.
  const m3u8AudioIsoCodes = await fetchM3u8AudioTracks(m3u8Url, videoHash);

  let langs: string[];
  if (m3u8AudioIsoCodes.length > 0) {
    // m3u8 fetched OK — use REAL audio tracks (source of truth).
    // Map ISO codes → language name. Return ALL languages the m3u8 has:
    //   - Hindi, Tamil, Telugu, Malayalam, Bengali, Marathi, Kannada (Indian dubs)
    //   - English (English dub)
    //   - Japanese (original Japanese audio — usually with subtitles)
    // User wants all of these visible so they can pick any language.
    // The watch page UI (Sub/Dub/Hindi tabs) handles which tab each shows in.
    const allLangs = m3u8AudioIsoCodes
      .map(code => ISO_TO_LANG_NAME[code] || "")
      .filter(name => name.length > 0);  // skip unknown ISO codes
    if (allLangs.length === 0) {
      // m3u8 has audio tracks but none we recognize → return empty
      return {
        servers: [],
        matchedSlug: seriesSlug,
        videoHash,
        languages: [],
      };
    }
    // Dedupe (m3u8 may list the same language with different NAME= attributes)
    langs = [...new Set(allLangs)];
  } else {
    // m3u8 fetch failed (network error, IP lock, 403, etc.) → fall back to
    // multi-lang-plyr data (best-effort, may be inaccurate but better than
    // nothing). This path is rare on the VPS — the m3u8 is IP-locked to
    // the VPS, so this only triggers on transient failures.
    // Don't filter by Indian languages here either — return ALL.
    if (languages.length === 0) {
      // No multi-lang-plyr data → assume Multi (backwards compat for
      // episodes where the base64 wasn't parsed at all)
      langs = ["Multi"];
    } else {
      // Return all languages from multi-lang-plyr data
      langs = [...new Set(languages)];
    }
  }

  // 6. Build server objects — one per available language.
  //    Each server's streamUrl points to OUR /api/anime/animesalt-playlist
  //    endpoint which:
  //      1. Fetches the master.m3u8 server-side (with Referer: animesalt.cx/)
  //      2. Rewrites the audio track matching this server's language to
  //         DEFAULT=YES (so hls.js auto-selects it)
  //      3. Returns the rewritten m3u8 to the player
  //    Without this rewrite, hls.js picks the FIRST audio track (Japanese)
  //    regardless of which server the user picked — so they'd hear Japanese
  //    even when they selected "AnimeSalt Hindi".
  //
  // Type field:
  //   - Japanese → "sub" (original audio with subtitles)
  //   - English, Hindi, Tamil, etc → "dub" (dubbed audio)
  // The watch page uses type to decide which tab to show the server in:
  //   Sub tab: Japanese AnimeSalt server + Inazuma Sub + Chopper HD Sub + etc.
  //   Dub tab: English AnimeSalt server + Inazuma Dub + Dao HD Dub + etc.
  //   Hindi tab: Hindi/Tamil/Telugu AnimeSalt servers
  const servers: AnimeSaltServer[] = langs.map((lang, idx) => {
    const langLower = lang.toLowerCase();
    // Japanese audio = original = "sub". Everything else = "dub".
    const serverType: "sub" | "dub" = langLower === "japanese" ? "sub" : "dub";
    // Wrap through our playlist rewriter so the correct audio track is
    // marked DEFAULT=YES. The rewriter handles the Referer header too, so
    // the player doesn't need to.
    const playlistUrl = `/api/anime/animesalt-playlist?lang=${encodeURIComponent(langLower)}&url=${encodeURIComponent(m3u8Url)}`;
    return {
      id: `animesalt:${langLower}:s${season}e${episode}:${idx}`,
      name: `AnimeSalt ${lang}`,
      source: "animesalt",
      provider: langLower,
      type: serverType,
      quality: "1080p",
      streamUrl: playlistUrl,
      isM3U8: true,
      isMP4: false,
      hardsub: false,
      // Subtitle tracks come from the ASCDN video page (playerjsSubtitle var).
      // The m3u8 itself has no #EXT-X-MEDIA:TYPE=SUBTITLES entries — the
      // subtitles are loaded by FirePlayer as a side channel.
      // Pass them to the player via subtitleTracks so they appear in the
      // LuffyTV subtitle menu.
      subtitleTracks: subtitleTracks.map(s => ({
        url: s.url,
        lang: s.lang,
        label: s.label,
      })),
      intro: null,
      outro: null,
    };
  });

  return {
    servers,
    matchedSlug: seriesSlug,
    videoHash,
    languages: langs,
  };
}
