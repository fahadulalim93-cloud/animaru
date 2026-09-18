/**
 * AniKoto Direct — TypeScript port of anikoto.py
 * =================================================
 * Full scraper for anikototv.to / megaplay.buzz / vidwish.live
 *
 * Pipeline:
 *   PRIMARY: Megaplay direct
 *     1. Fetch https://megaplay.buzz/stream/ani/{anilistId}/{epNum}/{audio}
 *     2. Extract data-id (and data-realid) from HTML
 *     3. Call /stream/getSources?id={fileId} → m3u8 + subtitles + intro/outro
 *     4. Fan-out to VidWish (/stream/s-2/{realId}/{audio}) for secondary stream
 *     5. Fan-out to mapper.mewcdn.online for additional embeds
 *
 *   FALLBACK: Raw AniKoto scraper
 *     1. AniZip API → English title + MAL ID from AniList ID
 *     2. Jikan v4 → metadata (title_jp, year, type) for candidate scoring
 *     3. Search AniKoto via BOTH /ajax/anime/search AND /filter?keyword
 *     4. Score candidates by title (en/jp/romaji), type, year
 *     5. Fetch episode list via /ajax/episode/list/{showId}
 *     6. Get server list via /ajax/server/list?servers={ids}
 *     7. For each server, call /ajax/server?get={linkId} → embed URL
 *     8. For each embed URL, extract m3u8 via /stream/getSources API
 */

import crypto from "crypto";
import { validateSkipTime } from "./episode-metadata";

const ANIKOTO   = "https://anikototv.to";
const MEGAPLAY  = "https://megaplay.buzz";
// VidWish (vidwish.live) REMOVED — its CDN (fxpy7.watching.onl) returns 403
// for all stream URLs. Only Megaplay streams are used now.
const ANIZIP3   = "https://api.ani.zip/mappings";
const MAPPER    = "https://mapper.mewcdn.online/api/mal";
const JIKAN4    = "https://api.jikan.moe/v4";
const SPOOF_REF = "https://hianimes.re/";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const LANG_MAP: Record<string, string> = {
  en: "en", english: "en",
  ja: "ja", japanese: "ja",
  fr: "fr", french: "fr",
  de: "de", german: "de",
  es: "es", spanish: "es",
  pt: "pt", portuguese: "pt",
};

// ── Megaplay enc field decryption ─────────────────────────────────────────
// Megaplay changed their getSources API in Sep 2026 — instead of returning
// { sources: { file: "https://...m3u8" } } directly, they now return an
// encrypted `enc` field that must be AES-256-CBC decrypted to recover the
// m3u8 URL.
//
// The encryption keys are embedded in megaplay's newclient.min.js:
//   key = "i?LMTAx0Q6,:}50U" (16 chars, padded to 32 bytes with nulls)
//   iv  = "W0;27ToaUpl_P%'c" (16 chars)
// The decrypted output is JSON: {"file":"https://...master.m3u8"}
//
// Without this fix, all Inazuma Sub/Dub servers fall back to (Embed) which
// has no m3u8 URL and shows a black screen.
const MEGAPLAY_AES_KEY = Buffer.alloc(32, 0);
Buffer.from("i?LMTAx0Q6,:}50U", "utf8").copy(MEGAPLAY_AES_KEY, 0, 0, 16);
const MEGAPLAY_AES_IV  = Buffer.from("W0;27ToaUpl_P%'c", "utf8");

/**
 * Decrypt Megaplay's `enc` field → m3u8 URL string.
 * Returns null if decryption fails (malformed input, wrong key, etc.).
 *
 * `enc` is base64url-encoded AES-256-CBC ciphertext.
 * Plaintext is UTF-8 JSON: {"file":"https://...master.m3u8"}
 */
function decryptMegaplayEnc(enc: string): string | null {
  if (!enc || typeof enc !== "string") return null;
  try {
    // base64url → base64
    let b64 = enc.replace(/-/g, "+").replace(/_/g, "/");
    // pad to multiple of 4
    const rem = b64.length % 4;
    if (rem) b64 += "====".slice(rem);
    const data = Buffer.from(b64, "base64");

    // Try AES-256-CBC first (32-byte key)
    try {
      const decipher = crypto.createDecipheriv("aes-256-cbc", MEGAPLAY_AES_KEY, MEGAPLAY_AES_IV);
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      const text = decrypted.toString("utf8");
      const json = JSON.parse(text);
      if (json?.file && typeof json.file === "string") return json.file;
      // Some enc values return a bare URL instead of {file:"..."}
      if (/^https?:\/\//.test(text.trim())) return text.trim();
    } catch {
      // fall through to AES-128-CBC
    }

    // Fallback: AES-128-CBC with just the 16-byte key (legacy / future-proof)
    try {
      const decipher = crypto.createDecipheriv("aes-128-cbc", MEGAPLAY_AES_KEY.subarray(0, 16), MEGAPLAY_AES_IV);
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      const text = decrypted.toString("utf8");
      const json = JSON.parse(text);
      if (json?.file && typeof json.file === "string") return json.file;
      if (/^https?:\/\//.test(text.trim())) return text.trim();
    } catch {
      // both failed
    }
    return null;
  } catch {
    return null;
  }
}

// ── Types ──
export interface AniKotoServer {
  name: string;
  m3u8Url: string | null;
  embedUrl: string;
  type: "sub" | "dub";
  quality: string;
  referer: string;
  subtitleTracks?: Array<{ url: string; lang: string; label: string }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  // ── Client-side resolution for Megaplay cdn.imgnex.top URLs ──
  // When megaplayFileId is set, the browser calls megaplay.buzz/stream/getSources
  // directly (client-side), decrypts the enc field, and loads the cdn.imgnex.top
  // URL. This bypasses our VPS IP (which is blocked by cdn.imgnex.top).
  // Same approach as anikura.club — they resolve megaplay client-side too.
  megaplayFileId?: string;
  megaplayAudio?: "sub" | "dub";
}

export interface AniKotoResult {
  servers: AniKotoServer[];
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

// ── HTTP helpers ──

function baseHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": UA,
    "Accept": "text/html,*/*",
  };
  if (extra) Object.assign(h, extra);
  return h;
}

async function httpGet(url: string, referer?: string): Promise<string> {
  const res = await fetch(url, {
    headers: baseHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      ...(referer ? { Referer: referer } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

async function getJSON<T = any>(
  url: string,
  referer?: string,
  retries = 3,
): Promise<T> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    "Accept": "application/json, */*",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (referer) headers["Referer"] = referer;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "1", 10) || 1;
      const wait = retryAfter + attempt * 0.5;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.json() as Promise<T>;
  }
  throw new Error(`HTTP 429 exhausted retries for ${url}`);
}

// ── Parsers ──

interface EpisodeParsed {
  id: string;
  num: number;
  slug: string;
  mal: string;
  timestamp: string;
  hasSub: boolean;
  hasDub: boolean;
  ids: string;
}

function extractEpisodes(html: string): EpisodeParsed[] {
  const episodes: EpisodeParsed[] = [];
  const re = /<a\s[^>]*data-id="[^"]*"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const get = (attr: string) => {
      const x = new RegExp(`data-${attr}="([^"]*)"`, "").exec(tag);
      return x ? x[1] : "";
    };
    const id = get("id");
    const num = get("num");
    if (!id || !num) continue;
    episodes.push({
      id,
      num: parseInt(num, 10),
      slug: get("slug"),
      mal: get("mal"),
      timestamp: get("timestamp"),
      hasSub: get("sub") === "1",
      hasDub: get("dub") === "1",
      ids: get("ids"),
    });
  }
  return episodes;
}

interface SearchCandidate {
  slug: string;
  titleEn: string;
  titleJp: string;
  year: string;
  type: string;
}

function extractSearchCandidates(html: string): SearchCandidate[] {
  const results: SearchCandidate[] = [];
  const pattern = /<a class="item" href="https:\/\/anikototv\.to\/watch\/([^"]+)"([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const slug = m[1];
    const block = m[2];
    const enM = /class="name d-title"[^>]*>([^<]*)</.exec(block);
    const jpM = /data-jp="([^"]*)"/.exec(block);
    const yearM = /<span class="dot">(\d{4})<\/span>/.exec(block);
    const typeM = /<span class="dot">(TV|Movie|OVA|ONA|Special)<\/span>/.exec(block);
    results.push({
      slug,
      titleEn: enM ? enM[1].trim() : "",
      titleJp: jpM ? jpM[1].trim() : "",
      year:    yearM ? yearM[1] : "",
      type:    typeM ? typeM[1] : "",
    });
  }
  return results;
}

function normalize(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface JikanShow {
  title: string;
  title_english?: string;
  title_japanese?: string;
  year?: number;
  type?: string;
  aired?: { from?: string };
}

function scoreCandidate(c: SearchCandidate, jikan: JikanShow | null): number {
  if (!jikan) return 0;
  let score = 0;
  const normEn  = normalize(jikan.title_english || jikan.title || "");
  const normJp  = normalize(jikan.title_japanese || "");
  const normRom = normalize(jikan.title || "");
  const cEn = normalize(c.titleEn);
  const cJp = normalize(c.titleJp);

  if (normEn && cEn === normEn) score += 50;
  else if (normRom && cEn === normRom) score += 45;
  else if (normEn && cEn.startsWith(normEn)) score += 15;

  if (normJp && cJp === normJp) score += 40;
  else if (normRom && cJp === normRom) score += 35;

  const jikanType = jikan.type || "";
  if (c.type && jikanType) {
    if (c.type.toLowerCase() === jikanType.toLowerCase()) score += 20;
    else score -= 30;
  }

  const airedFrom = jikan.aired || {};
  const jikanYear = jikan.year ||
    (typeof airedFrom.from === "string" && airedFrom.from.length >= 4
      ? parseInt(airedFrom.from.slice(0, 4), 10)
      : undefined);
  if (c.year && jikanYear) {
    if (parseInt(c.year, 10) === jikanYear) score += 20;
    else score -= 15;
  }

  return score;
}

interface ServerItem { linkId: string; name: string; }

function extractServerItems(html: string, audio: "sub" | "dub"): ServerItem[] {
  const items: ServerItem[] = [];
  const typeRe = /<div class="type" data-type="(sub|dub)">([\s\S]*?)<\/ul>\s*<\/div>/g;
  let typeM: RegExpExecArray | null;
  while ((typeM = typeRe.exec(html)) !== null) {
    if (typeM[1] !== audio) continue;
    const ul = typeM[2];
    const liRe = /<li\s+([^>]*data-link-id[^>]*)>([\s\S]*?)<\/li>/g;
    let liM: RegExpExecArray | null;
    while ((liM = liRe.exec(ul)) !== null) {
      const linkIdM = /data-link-id="([^"]+)"/.exec(liM[1]);
      const name = liM[2].replace(/<[^>]+>/g, "").trim();
      if (linkIdM) items.push({ linkId: linkIdM[1], name });
    }
  }
  return items;
}

function skipRange(value: any): { start: number; end: number } | null {
  if (Array.isArray(value) && value.length >= 2) {
    return { start: Number(value[0]) || 0, end: Number(value[1]) || 0 };
  }
  if (value && typeof value === "object" && "start" in value && "end" in value) {
    return { start: Number(value.start) || 0, end: Number(value.end) || 0 };
  }
  return null;
}

interface MappedTrack {
  file: string;
  label: string;
  kind: string;
  default: boolean;
}

function mapTrack(t: any, source: string): { url: string; lang: string; label: string; } | null {
  const label = t.label || "";
  // Return the RAW subtitle URL — the watch-page-shell will wrap it through
  // /api/stream which handles the correct Referer per host AND strips VTT
  // STYLE blocks (which would create a black background).

  // Drop subtitle URLs on Cloudflare-blocked hosts. These always return 403
  // even with the right Referer (server IP triggers CF bot challenge).
  // Returning null here lets the watch-page-shell subtitle fallback kick in
  // and pull subs from another server (e.g. Chopper HD-2 has working subs on
  // cdn.anizara.store).
  const file = t.file || "";
  if (file.includes("kryntal.top")) return null;

  return {
    url: file,
    lang: LANG_MAP[label.toLowerCase()] || "und",
    label: label || "English",
  };
}

// ── Search / discovery ──

async function searchAnikoto(keyword: string): Promise<SearchCandidate[]> {
  const data = await getJSON<any>(
    `${ANIKOTO}/ajax/anime/search?keyword=${encodeURIComponent(keyword)}`,
    `${ANIKOTO}/`,
  );
  const htmlFromAjax = ((data?.result) || {}).html || "";
  let results = extractSearchCandidates(htmlFromAjax);

  // Also scrape /filter endpoint — it sometimes returns more candidates
  try {
    const html = await httpGet(
      `${ANIKOTO}/filter?keyword=${encodeURIComponent(keyword)}`,
      `${ANIKOTO}/`,
    );
    const filterRe = /<a class="name d-title" href="https:\/\/anikototv\.to\/watch\/([^"\/]+)(?:\/ep-\d+)?" data-jp="([^"]*)">([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = filterRe.exec(html)) !== null) {
      results.push({
        slug:    m[1],
        titleEn: m[3].replace(/<[^>]*>/g, "").trim(),
        titleJp: m[2].trim(),
        year:    "",
        type:    "",
      });
    }
  } catch { /* ignore */ }

  // Dedupe by slug
  const seen = new Set<string>();
  const unique: SearchCandidate[] = [];
  for (const r of results) {
    if (!seen.has(r.slug)) {
      seen.add(r.slug);
      unique.push(r);
    }
  }
  return unique;
}

async function findAnikotoShow(
  enTitle: string,
  jikanData: { data?: JikanShow } | null,
): Promise<{ slug: string; showId: string }> {
  const jpTitle  = jikanData?.data?.title_japanese || "";
  const romTitle = jikanData?.data?.title || "";

  // Search with all available titles in parallel
  const keywords = Array.from(new Set([enTitle, romTitle, jpTitle].filter(Boolean)));
  const searches = await Promise.allSettled(
    keywords.map(k => searchAnikoto(k)),
  );

  const seen = new Set<string>();
  let candidates: SearchCandidate[] = [];
  for (const r of searches) {
    if (r.status !== "fulfilled") continue;
    for (const c of r.value) {
      if (!seen.has(c.slug)) {
        seen.add(c.slug);
        candidates.push(c);
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(`Anime not found on anikoto: "${enTitle}"`);
  }

  // Score candidates against Jikan metadata
  if (jikanData?.data) {
    candidates = candidates
      .map(c => ({ c, score: scoreCandidate(c, jikanData.data!) }))
      .sort((a, b) => b.score - a.score)
      .map(x => x.c);
  }

  // Pick best candidate and fetch its show ID
  const chosenSlug = candidates[0].slug;
  const pageHtml = await httpGet(`${ANIKOTO}/watch/${chosenSlug}`, `${ANIKOTO}/`);
  const idM = /data-id="(\d+)"/.exec(pageHtml);
  if (!idM) throw new Error(`Could not find show ID for slug: ${chosenSlug}`);
  return { slug: chosenSlug, showId: idM[1] };
}

// ── Megaplay / VidWish extractors ──

interface ExtractedEmbed {
  fileId: string;
  data: any;
}

async function extractEmbedSource(
  embedUrl: string,
  referer?: string,
): Promise<ExtractedEmbed | null> {
  try {
    const page = await httpGet(embedUrl, referer || SPOOF_REF);
    const m = /data-id="([^"]*)"/.exec(page);
    if (!m || !m[1]) return null;
    const fileId = m[1];
    const parsed = new URL(embedUrl);
    const origin = `${parsed.protocol}//${parsed.host}`;
    const data = await getJSON<any>(
      `${origin}/stream/getSources?id=${fileId}&id=${fileId}`,
      `${origin}/`,
    );
    return { fileId, data };
  } catch {
    return null;
  }
}

// extractVidwish REMOVED — VidWish CDN (fxpy7.watching.onl) is broken upstream.
// All VidWish stream URLs return 403, so we no longer fetch from VidWish at all.

// ── Raw AniKoto scraper (fallback when Megaplay direct fails) ──

async function extractRawAnikotoStreams(
  anilistId: number,
  audio: "sub" | "dub",
  epNum: number,
  anilistTitle?: string,
): Promise<{
  streams: Array<{ url: string; type: string; referer: string; server: string; megaplayFileId?: string; embedUrl?: string }>;
  subtitles: Array<{ url: string; lang: string; label: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}> {
  // ── Title resolution strategy ──────────────────────────────────────────
  // AniZip's API is unreliable — for AniList 113415 (Demon Slayer) it
  // returns "Jujutsu Kaisen" (mal_id 40748) which is a DIFFERENT anime.
  // Trusting AniZip caused the scraper to search AniKoto for "Jujutsu
  // Kaisen" → 0 servers found → user sees no Inazuma source.
  //
  // FIX: Prefer the AniList title passed in from the route handler (which
  // comes directly from AniList's GraphQL API via cachedQuery). Fall back
  // to AniZip only if the AniList title is unavailable.
  //
  // For MAL ID: query AniList directly (it has idMal field) instead of
  // trusting AniZip's mapping.
  let enTitle = anilistTitle || "";
  let malId: number | undefined;

  if (!enTitle || !malId) {
    // Try AniList GraphQL for both title and MAL ID
    try {
      const { cachedQuery } = await import("./anilist-cache");
      const data = await cachedQuery<{ Media: { idMal?: number; title: { english?: string; romaji?: string } } } | null>(
        `query ($id: Int) { Media(id: $id, type: ANIME) { idMal title { english romaji } } }`,
        { id: anilistId },
        { ttl: 24 * 60 * 60 * 1000, timeoutMs: 5000 },
      );
      if (data?.Media) {
        if (!enTitle) enTitle = data.Media.title?.english || data.Media.title?.romaji || "";
        if (!malId) malId = data.Media.idMal || undefined;
      }
    } catch { /* AniList query failed — fall through to AniZip */ }
  }

  // Last resort: AniZip fallback (only if AniList failed)
  if (!enTitle) {
    const anizip = await getJSON<any>(`${ANIZIP3}?anilist_id=${anilistId}`);
    enTitle = (anizip?.titles || {}).en ||
      (anizip?.titles ? Object.values(anizip.titles)[0] as string : "");
    if (!malId) malId = (anizip?.mappings || {}).mal_id;
  }

  if (!enTitle) {
    console.warn(`[anikoto-direct] Could not resolve title for AniList ${anilistId}`);
    return { streams: [], subtitles: [], intro: null, outro: null };
  }

  // 2. Jikan metadata (for scoring)
  let jikanShow: { data?: JikanShow } | null = null;
  if (malId) {
    try {
      jikanShow = await getJSON<{ data?: JikanShow }>(`${JIKAN4}/anime/${malId}`);
    } catch { /* ignore */ }
  }

  // 3. Find show on anikoto
  const showInfo = await findAnikotoShow(enTitle, jikanShow);
  const showId = showInfo.showId;
  const slug = showInfo.slug;

  // 4. Episode list
  const listData = await getJSON<any>(
    `${ANIKOTO}/ajax/episode/list/${showId}`,
    `${ANIKOTO}/watch/${slug}`,
  );
  const eps = extractEpisodes(listData?.result || "");
  const ep = eps.find(e => e.num === epNum);
  if (!ep || !ep.ids) {
    return { streams: [], subtitles: [], intro: null, outro: null };
  }

  // 5. Server list
  const serverData = await getJSON<any>(
    `${ANIKOTO}/ajax/server/list?servers=${encodeURIComponent(ep.ids)}`,
    `${ANIKOTO}/`,
  );
  const items = extractServerItems(serverData?.result || "", audio);

  // 6. For each server, fetch embed URL → extract m3u8
  const streams: Array<{ url: string; type: string; referer: string; server: string }> = [];
  const subtitles: Array<{ url: string; lang: string; label: string }> = [];
  let intro: { start: number; end: number } | null = null;
  let outro: { start: number; end: number } | null = null;
  const seenEmbeds = new Set<string>();

  // Process servers sequentially (avoid hammering anikoto with parallel requests)
  for (const item of items) {
    let resolved: any = null;
    try {
      resolved = await getJSON<any>(
        `${ANIKOTO}/ajax/server?get=${encodeURIComponent(item.linkId)}`,
        `${ANIKOTO}/`,
      );
    } catch { continue; }

    const embedUrl = (resolved?.result || {}).url;
    if (!embedUrl || seenEmbeds.has(embedUrl)) continue;
    seenEmbeds.add(embedUrl);

    const extracted = await extractEmbedSource(embedUrl, SPOOF_REF);
    // Also try decrypting the enc field if sources.file is missing (Sep 2026 Megaplay API change)
    let m3u8Url: string | null = extracted?.data?.sources?.file || null;
    if (!m3u8Url && extracted?.data?.enc) {
      m3u8Url = decryptMegaplayEnc(extracted.data.enc);
    }
    // ── KEY FIX: Prefer megaplayFileId (client-side resolution) ──
    // The m3u8 URL points to cdn.imgnex.top or s1.akirax.buzz, which
    // 403-block our VPS IP AND the Cloudflare Worker IP. Returning the
    // m3u8 URL would result in a 403 when the player tries to load it.
    //
    // Instead, return the megaplayFileId so the player can call
    // megaplay.buzz/stream/getSources CLIENT-SIDE (browser IP → megaplay
    // → 200 OK), decrypt the enc field, and load cdn.imgnex.top directly
    // (browser IP → cdn.imgnex.top → 200 OK).
    //
    // This is the same approach used by the PRIMARY Megaplay path above
    // (line 718-731) which works reliably.
    if (extracted?.fileId) {
      // Extract subtitles + intro/outro (these don't depend on IP)
      for (const t of (extracted?.data?.tracks || [])) {
        const mapped = mapTrack(t, item.name);
        if (mapped) subtitles.push(mapped);
      }
      if (!intro) {
        intro = extracted.data.intro
          ? { start: extracted.data.intro.start, end: extracted.data.intro.end }
          : skipRange((resolved?.result || {}).skip_data?.intro);
      }
      if (!outro) {
        outro = extracted.data.outro
          ? { start: extracted.data.outro.start, end: extracted.data.outro.end }
          : skipRange((resolved?.result || {}).skip_data?.outro);
      }

      // Push server with fileId + embedUrl (NO m3u8 URL — browser resolves)
      streams.push({
        url: "",  // empty — browser uses megaplayFileId instead
        type: "hls",
        referer: `${MEGAPLAY}/`,
        server: item.name,
        megaplayFileId: extracted.fileId,
        embedUrl,
      });

      // Skip the broken m3u8 URL push below — we already pushed with fileId
      continue;
    }

    // Fallback: no fileId available — push the embed URL as-is (iframe)
    // (this path is rarely hit — every megaplay URL has a fileId)
    if (m3u8Url) {
      const parsed = new URL(embedUrl);
      const origin = `${parsed.protocol}//${parsed.host}`;
      streams.push({
        url: m3u8Url,
        type: "hls",
        referer: `${origin}/`,
        server: item.name,
      });
      for (const t of (extracted?.data?.tracks || [])) {
        const mapped = mapTrack(t, item.name);
        if (mapped) subtitles.push(mapped);
      }
      if (!intro) {
        intro = extracted.data.intro
          ? { start: extracted.data.intro.start, end: extracted.data.intro.end }
          : skipRange((resolved?.result || {}).skip_data?.intro);
      }
      if (!outro) {
        outro = extracted.data.outro
          ? { start: extracted.data.outro.start, end: extracted.data.outro.end }
          : skipRange((resolved?.result || {}).skip_data?.outro);
      }
    }

    // Always add the embed URL as a fallback stream
    const parsed2 = new URL(embedUrl);
    const origin2 = `${parsed2.protocol}//${parsed2.host}`;
    streams.push({
      url: embedUrl,
      type: "embed",
      referer: `${origin2}/`,
      server: `${item.name}-embed`,
    });
  }

  // Deduplicate subtitles by URL before returning
  const seenSubs = new Set<string>();
  const dedupedSubs = subtitles.filter(s => {
    if (seenSubs.has(s.url)) return false;
    seenSubs.add(s.url);
    return true;
  });

  return { streams, subtitles: dedupedSubs, intro, outro };
}

// ── Main: resolve m3u8 for AniList ID + episode ──
export async function resolveAniKoto(
  anilistId: number,
  episodeNum: number,
  title: string,
): Promise<AniKotoResult | null> {
  try {
    const servers: AniKotoServer[] = [];
    let intro: { start: number; end: number } | null = null;
    let outro: { start: number; end: number } | null = null;

    // ── PRIMARY PATH: Megaplay direct (uses AniList ID directly) ──
    // Try both sub and dub in parallel — Megaplay's URL structure uses the
    // AniList ID directly so no slug resolution needed.
    const megaplayResults = await Promise.allSettled(
      (["sub", "dub"] as const).map(async (audio) => {
        try {
          const embedUrl = `${MEGAPLAY}/stream/ani/${anilistId}/${episodeNum}/${audio}`;
          let megaHtml = await httpGet(embedUrl, SPOOF_REF);

          // If the page doesn't have data-id, follow the iframe src
          if (!/data-id="([^"]*)"/.test(megaHtml)) {
            const frameSrcM = /<iframe\b[^>]*src="([^"]+)"/i.exec(megaHtml);
            if (frameSrcM) {
              const fs = frameSrcM[1];
              const nextUrl = fs.startsWith("http") ? fs : `${MEGAPLAY}${fs}`;
              megaHtml = await httpGet(nextUrl, SPOOF_REF);
            }
          }

          const attr = (name: string): string | null => {
            const m = new RegExp(`data-${name}="([^"]*)"`).exec(megaHtml);
            return m ? m[1] : null;
          };

          const fileId = attr("id");

          if (!fileId) {
            return null;
          }

          // ── Client-side resolution: return fileId, skip getSources call ──
          const megaR = await getJSON<any>(
            `${MEGAPLAY}/stream/getSources?id=${fileId}&id=${fileId}`,
            `${MEGAPLAY}/`,
          ).catch(() => null);

          const subTracks: Array<{ url: string; lang: string; label: string }> = [];
          const seenSubUrls = new Set<string>();
          for (const t of (megaR?.tracks || [])) {
            const mapped = mapTrack(t, "Megaplay");
            if (mapped && !seenSubUrls.has(mapped.url)) {
              seenSubUrls.add(mapped.url);
              subTracks.push(mapped);
            }
          }
          const introV = megaR?.intro
            ? validateSkipTime({ start: megaR.intro.start, end: megaR.intro.end }, "intro")
            : null;
          const outroV = megaR?.outro
            ? validateSkipTime({ start: megaR.outro.start, end: megaR.outro.end }, "outro")
            : null;

          return {
            name: `Inazuma ${audio === "sub" ? "Sub" : "Dub"}`,
            m3u8Url: null,
            embedUrl,
            type: audio,
            quality: "1080p",
            referer: `${MEGAPLAY}/`,
            subtitleTracks: subTracks,
            intro: introV,
            outro: outroV,
            megaplayFileId: fileId,
            megaplayAudio: audio,
          } as AniKotoServer;
        } catch (err) {
          console.error(`[anikoto-direct] Megaplay ${audio} error:`, err);
          return null;
        }
      })
    );

    for (const result of megaplayResults) {
      if (result.status === "fulfilled" && result.value) {
        const s = result.value;
        servers.push(s);
        if (s.intro && !intro) intro = s.intro;
        if (s.outro && !outro) outro = s.outro;
      }
    }

    // ── FALLBACK: Raw AniKoto scraper — run sub + dub IN PARALLEL ──
    // Previously this ran sequentially (sub first, then dub), causing
    // 10-20s delays on first load. Running them in parallel cuts the
    // total time roughly in half.
    const rawResults = await Promise.allSettled([
      extractRawAnikotoStreams(anilistId, "sub", episodeNum, title),
      extractRawAnikotoStreams(anilistId, "dub", episodeNum, title),
    ]);

    for (const result of rawResults) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const raw = result.value;
      for (const s of raw.streams) {
        if (s.type !== "hls") continue;
        const serverLabel = s.server || "HD";
        const isDub = s === raw.streams.find(x => x.type === "hls" && x.server?.includes("dub"));
        // Determine type from the raw call context
        const type: "sub" | "dub" = result === rawResults[1] ? "dub" : "sub";

        if (s.megaplayFileId) {
          servers.push({
            name: `Inazuma ${serverLabel}${type === "dub" ? " (Dub)" : ""}`,
            m3u8Url: null,
            embedUrl: s.embedUrl || "",
            type,
            quality: "1080p",
            referer: s.referer,
            subtitleTracks: raw.subtitles,
            intro: raw.intro ? validateSkipTime(raw.intro, "intro") : null,
            outro: raw.outro ? validateSkipTime(raw.outro, "outro") : null,
            megaplayFileId: s.megaplayFileId,
            megaplayAudio: type,
          });
        } else if (s.url) {
          servers.push({
            name: `Inazuma ${serverLabel}${type === "dub" ? " (Dub)" : ""}`,
            m3u8Url: s.url,
            embedUrl: "",
            type,
            quality: "1080p",
            referer: s.referer,
            subtitleTracks: raw.subtitles,
            intro: raw.intro ? validateSkipTime(raw.intro, "intro") : null,
            outro: raw.outro ? validateSkipTime(raw.outro, "outro") : null,
          });
        }
        if (raw.intro && !intro) intro = validateSkipTime(raw.intro, "intro");
        if (raw.outro && !outro) outro = validateSkipTime(raw.outro, "outro");
      }
    }

    // Deduplicate servers by URL (remove exact duplicates)
    const seenUrls = new Set<string>();
    const dedupedServers = servers.filter(s => {
      const url = s.m3u8Url || s.embedUrl || "";
      if (seenUrls.has(url)) return false;
      if (url.includes("cdn.kryntal.top") || url.includes("kryntal.top")) return false;
      seenUrls.add(url);
      return true;
    });

    if (dedupedServers.length === 0) return null;

    console.log(
      `[anikoto-direct] resolved ${dedupedServers.length} servers for AniList ${anilistId} ep${episodeNum} ` +
      `(sub=${dedupedServers.filter(s => s.type === "sub").length} dub=${dedupedServers.filter(s => s.type === "dub").length})`,
    );

    return { servers: dedupedServers, intro, outro };
  } catch (err) {
    console.error(`[anikoto-direct] resolveAniKoto error:`, err);
    return null;
  }
}

// ── Fast path: resolve ONLY Megaplay servers (skips slow raw AniKoto scraper) ──
// Returns in ~2-4 seconds (just 2 parallel megaplay.buzz fetches).
// The raw AniKoto servers (HD-1, HD-2, VidPlay) are fetched separately
// via resolveAniKotoFull() and merged later.
export async function resolveAniKotoFast(
  anilistId: number,
  episodeNum: number,
): Promise<AniKotoResult | null> {
  try {
    const servers: AniKotoServer[] = [];
    let intro: { start: number; end: number } | null = null;
    let outro: { start: number; end: number } | null = null;

    const megaplayResults = await Promise.allSettled(
      (["sub", "dub"] as const).map(async (audio) => {
        try {
          const embedUrl = `${MEGAPLAY}/stream/ani/${anilistId}/${episodeNum}/${audio}`;
          let megaHtml = await httpGet(embedUrl, SPOOF_REF);

          if (!/data-id="([^"]*)"/.test(megaHtml)) {
            const frameSrcM = /<iframe\b[^>]*src="([^"]+)"/i.exec(megaHtml);
            if (frameSrcM) {
              const fs = frameSrcM[1];
              const nextUrl = fs.startsWith("http") ? fs : `${MEGAPLAY}${fs}`;
              megaHtml = await httpGet(nextUrl, SPOOF_REF);
            }
          }

          const attr = (name: string): string | null => {
            const m = new RegExp(`data-${name}="([^"]*)"`).exec(megaHtml);
            return m ? m[1] : null;
          };

          const fileId = attr("id");
          if (!fileId) return null;

          const megaR = await getJSON<any>(
            `${MEGAPLAY}/stream/getSources?id=${fileId}&id=${fileId}`,
            `${MEGAPLAY}/`,
          ).catch(() => null);

          const subTracks: Array<{ url: string; lang: string; label: string }> = [];
          const seenSubUrls = new Set<string>();
          for (const t of (megaR?.tracks || [])) {
            const mapped = mapTrack(t, "Megaplay");
            if (mapped && !seenSubUrls.has(mapped.url)) {
              seenSubUrls.add(mapped.url);
              subTracks.push(mapped);
            }
          }
          const introV = megaR?.intro
            ? validateSkipTime({ start: megaR.intro.start, end: megaR.intro.end }, "intro")
            : null;
          const outroV = megaR?.outro
            ? validateSkipTime({ start: megaR.outro.start, end: megaR.outro.end }, "outro")
            : null;

          return {
            name: `Inazuma ${audio === "sub" ? "Sub" : "Dub"}`,
            m3u8Url: null,
            embedUrl,
            type: audio,
            quality: "1080p",
            referer: `${MEGAPLAY}/`,
            subtitleTracks: subTracks,
            intro: introV,
            outro: outroV,
            megaplayFileId: fileId,
            megaplayAudio: audio,
          } as AniKotoServer;
        } catch (err) {
          console.error(`[anikoto-direct] Megaplay fast ${audio} error:`, err);
          return null;
        }
      })
    );

    for (const result of megaplayResults) {
      if (result.status === "fulfilled" && result.value) {
        const s = result.value;
        servers.push(s);
        if (s.intro && !intro) intro = s.intro;
        if (s.outro && !outro) outro = s.outro;
      }
    }

    if (servers.length === 0) return null;
    console.log(`[anikoto-direct] FAST path: ${servers.length} Megaplay servers for AniList ${anilistId} ep${episodeNum}`);
    return { servers, intro, outro };
  } catch (err) {
    console.error(`[anikoto-direct] resolveAniKotoFast error:`, err);
    return null;
  }
}
