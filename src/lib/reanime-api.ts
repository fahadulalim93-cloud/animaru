/**
 * ReAnime API Client
 * ===================
 *
 * ReAnime (reanime.to) is a streaming platform with a public REST API.
 * It uses AniList IDs directly — no slug resolution needed.
 *
 * API endpoints:
 *   GET /api/v1/search?q=...&limit=N          → search anime
 *   GET /api/v1/anime/{slug}/episodes?limit=N  → episode list
 *   GET /api/flix/{anilistId}/{episode}        → streaming servers (FlixCLOUD)
 *   GET /api/v1/home/latest-aired?limit=N      → latest aired
 *   GET /api/v1/home/upcoming?limit=N          → upcoming
 *   GET /api/v1/top/anime?period=week&limit=N  → top ranked
 *   GET /api/v1/schedule?tz=...&year=...&month=... → schedule
 *
 * Streaming pipeline (FlixCLOUD):
 *   1. GET /api/flix/{anilistId}/{episode} → server list with dataLink URLs
 *   2. Each dataLink points to flixcloud.cc/e/{accessId}?v=N
 *   3. FlixCLOUD embed page handles client-side decryption (WASM + AES-256-CBC)
 *   4. Result: HLS m3u8 stream from fetch1.flixcloud.cc
 *
 * Since FlixCLOUD embed pages are CF-protected for server-side requests,
 * we return the embed URLs as iframe sources. The browser handles decryption.
 * This is the same approach used for AnimePahe's kwik.cx embeds.
 *
 * ReAnime has NO manga section — anime only.
 */

import { wrapStreamUrl, wrapM3u8UrlWithReferer } from "./proxy";
import { validateSkipTime } from "./episode-metadata";

const REANIME_BASE = "https://reanime.to";
const FLIXCLOUD_BASE = "https://flixcloud.cc";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${REANIME_BASE}/`,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReAnimeSearchResult {
  anime_id: string;
  title: {
    english?: string;
    native?: string;
    romaji?: string;
  };
  cover_image?: {
    extra_large?: string;
    large?: string;
    medium?: string;
  };
  format?: string;
  status?: string;
  genres?: string[];
  season?: string;
  season_year?: number;
  episodes?: number;
  duration?: string;
  subbed?: number;
  dubbed?: number;
  average_score?: number;
  popularity?: number;
  rating?: string;
}

export interface ReAnimeEpisode {
  episodeId: string;
  episode_number: number;
  title: string;
  title_japanese?: string;
  title_romanji?: string;
  aired?: string;
  is_filler?: boolean;
  is_recap?: boolean;
  thumbnail?: string;
  description?: string;
  duration?: number;
  site?: string;
  url?: string;
}

export interface ReAnimeFlixServer {
  id: string;
  serverName: string;
  dataLink: string;
  dataType: "sub" | "dub";
  softsub: boolean;
  continue_: boolean;
}

export interface ReAnimeVerifiedResult {
  provider: string;
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

const WORKER_BASE = process.env.NEXT_PUBLIC_PROXY_BASE || "https://luffytv-proxy.ggy892767.workers.dev";

async function reanimeFetch<T = any>(
  path: string,
  timeoutMs = 15000
): Promise<T | null> {
  try {
    const targetUrl = path.startsWith("http") ? path : `${REANIME_BASE}${path}`;
    // Route through /api/stream (Vercel server proxy) — reanime.to is CF-protected
    // and blocks both Vercel direct fetch AND Cloudflare Workers (CF-to-CF).
    // Vercel's /api/stream sends proper headers that bypass CF for API endpoints.
    const proxyUrl = `/api/stream?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent("https://reanime.to/")}`;
    const res = await Promise.race([
      fetch(proxyUrl, { headers: { "Accept": "application/json" }, cache: "no-store" }),
      new Promise<Response | null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) {
      console.error(`[ReAnime] ${path} → HTTP ${res?.status || "timeout"}`);
      return null;
    }
    const text = await res.text();
    if (text.startsWith("<") || text.startsWith("{\"error")) {
      console.error(`[ReAnime] ${path} → blocked or error`);
      return null;
    }
    return JSON.parse(text) as T;
  } catch (e: any) {
    console.error(`[ReAnime] ${path} failed:`, e?.message || e);
    return null;
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchReAnime(
  query: string,
  limit = 10
): Promise<ReAnimeSearchResult[]> {
  const data = await reanimeFetch<{
    results: ReAnimeSearchResult[];
    total: number;
  }>(`/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  return data?.results || [];
}

// ─── Episodes ─────────────────────────────────────────────────────────────────

export async function getReAnimeEpisodes(
  slug: string,
  limit = 2000
): Promise<ReAnimeEpisode[]> {
  const data = await reanimeFetch<{ data: ReAnimeEpisode[]; total: number }>(
    `/api/v1/anime/${slug}/episodes?limit=${limit}`
  );
  return data?.data || [];
}

// ─── FlixCLOUD servers (main streaming endpoint) ──────────────────────────────

export async function getReAnimeFlixServers(
  anilistId: number,
  episode: number
): Promise<ReAnimeFlixServer[]> {
  const data = await reanimeFetch<{
    success: boolean;
    servers: Array<{
      $id: string;
      serverName: string;
      dataLink: string;
      dataType: "sub" | "dub";
      softsub: boolean;
      continue: boolean;
    }>;
  }>(`/api/flix/${anilistId}/${episode}`);

  if (!data?.servers) return [];

  return data.servers.map((s) => ({
    id: s.$id,
    serverName: s.serverName,
    dataLink: s.dataLink,
    dataType: s.dataType,
    softsub: s.softsub,
    continue_: s.continue,
  }));
}

// ─── Home data ────────────────────────────────────────────────────────────────

export async function getReAnimeLatestAired(limit = 20): Promise<ReAnimeSearchResult[]> {
  const data = await reanimeFetch<{ data: ReAnimeSearchResult[] }>(
    `/api/v1/home/latest-aired?limit=${limit}`
  );
  return data?.data || [];
}

export async function getReAnimeUpcoming(limit = 20): Promise<ReAnimeSearchResult[]> {
  const data = await reanimeFetch<{ data: ReAnimeSearchResult[] }>(
    `/api/v1/home/upcoming?limit=${limit}`
  );
  return data?.data || [];
}

export async function getReAnimeTop(
  period: "day" | "week" | "month" = "week",
  limit = 20
): Promise<ReAnimeSearchResult[]> {
  const data = await reanimeFetch<{ data: ReAnimeSearchResult[] }>(
    `/api/v1/top/anime?period=${period}&limit=${limit}`
  );
  return data?.data || [];
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export async function getReAnimeSchedule(
  tz = "America/New_York",
  year?: number,
  month?: number
): Promise<any> {
  const now = new Date();
  const y = year || now.getFullYear();
  const m = month || now.getMonth() + 1;
  const data = await reanimeFetch(
    `/api/v1/schedule?tz=${encodeURIComponent(tz)}&year=${y}&month=${m}`
  );
  return data;
}

// ─── FlixCLOUD Decryption (server-side) ───────────────────────────────────────
//
// The full decryption pipeline:
//   1. Fetch FlixCLOUD embed HTML → parse SvelteKit data
//   2. Derive field names from obfuscation_seed via SHA-256 chains
//   3. Extract key fragments, IV, token from obfuscated data
//   4. Fetch /api/m3u8/{token} → one-time payload
//   5. WASM key derivation + PBKDF2 + XOR + SHA-256 → AES-256-CBC key
//   6. Decrypt → m3u8 URL
//
// NOTE: FlixCLOUD embed pages are CF-protected. On Vercel, fetch() usually
// works because Vercel's edge runtime has proper TLS. If CF blocks, we fall
// back to embed URL as iframe source.

import { createHash, createDecipheriv, pbkdf2Sync } from "crypto";

function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

interface DerivedFields {
  videoField: string;
  keyField: string;
  ivField: string;
  containerName: string;
  arrayName: string;
  objectName: string;
  tokenField: string;
  keyFrag2Field: string;
}

function deriveFieldNames(seed: string): DerivedFields {
  let e = seed;
  for (let o = 0; o < 3; o++) e = sha256hex(e + o.toString());
  let s = e;
  for (let o = 0; o < 3; o++) s = sha256hex(s + o.toString());
  return {
    videoField: `vf_${e.substring(0, 8)}`,
    keyField: `kf_${e.substring(8, 16)}`,
    ivField: `ivf_${e.substring(16, 24)}`,
    containerName: `cd_${e.substring(24, 32)}`,
    arrayName: `ad_${e.substring(32, 40)}`,
    objectName: `od_${e.substring(40, 48)}`,
    tokenField: `${e.substring(48, 64)}_${e.substring(56, 64)}`,
    keyFrag2Field: `${s.substring(0, 16)}_${s.substring(16, 24)}`,
  };
}

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

// WASM key derivation — the FlixCLOUD embed page includes a small WASM module
// that processes key fragments. We load and execute it server-side.
async function wasmKeyDerive(
  frag1: Uint8Array,
  keyFrag2: Uint8Array,
  tokenKeyData: Uint8Array,
  seedFirst8HexAsInt: number
): Promise<Uint8Array> {
  // This is the WASM binary embedded in FlixCLOUD embed pages.
  // It has 3 exports: _s (set seed), _r (process), _c (compute)
  // The WASM is stable and rarely changes.
  const wPayloadB64 =
    "AGFzbQEAAAABEQNgAX8AYAV/f39/fwBgAAF/AwQDAAECBQMBAAEGBgF/AUEACwcZBAZtZW1vcnkCAAJfcwAAAl9yAAECX2MAAgrRAQMGACAAJAALiQEBA39BACEFA0ACQCAFIARPDQAgACAFai0AACABIAVqLQAAcyACIAVqLQAAcyEGIAZBqgFzIQYgBkEDdEH/AXEgBkEFdnIhBiAGQRxrQf8BcSEGIAZBjAFqQf8BcSEGIAVBNWwjAGpB/wFxIQcgBiAHcyEGIAMgBWogBjoAACAFQQFqIQUMAQsLCz0BAX9BACEAA0ACQCAAQSBPDQBBkBAgAGpB0A8gAGotAABB8A8gAGotAABzOgAAIABBAWohAAwBCwtBkBALC0cBAEHQDwtAW1YjHji3UA4OcYOKT37mEFKkYHsdvRT+dpTZyIOZYH7R8WFzSwhwLGTcgHO0Z4IlarO8COjTC8GF2eg3UIzCpg==";
  const wasmBinary = Buffer.from(wPayloadB64, "base64");
  const { instance } = await WebAssembly.instantiate(wasmBinary, {});
  const mem = instance.exports.memory as WebAssembly.Memory;
  if (mem.buffer.byteLength === 0) mem.grow(1);
  const view = new Uint8Array(mem.buffer);

  const k = frag1.length;
  const base = 1000;
  view.set(frag1, base);
  view.set(keyFrag2, base + k);
  view.set(tokenKeyData, base + 2 * k);

  (instance.exports._s as Function)(seedFirst8HexAsInt);
  (instance.exports._r as Function)(base, base + k, base + 2 * k, base + 3 * k, k);

  const result = new Uint8Array(k);
  result.set(view.subarray(base + 3 * k, base + 4 * k));
  return result;
}

/**
 * Attempt to decrypt a FlixCLOUD embed page to get the direct m3u8 URL.
 * Returns the m3u8 URL on success, or null on failure.
 */
async function decryptFlixCloudEmbed(
  accessId: string,
  version: number | string = 1
): Promise<{
  m3u8Url: string;
  videoId: string;
  subtitles: Array<{ url: string; language: string; format: string; default: boolean }>;
  intro?: { start: number; end: number; title?: string } | null;
  outro?: { start: number; end: number; title?: string } | null;
} | null> {
  try {
    // Step 1: Fetch embed page
    const embedUrl = `${FLIXCLOUD_BASE}/e/${accessId}?v=${version}`;
    const embedRes = await fetch(embedUrl, {
      headers: {
        "User-Agent": UA,
        Referer: `${REANIME_BASE}/`,
        Accept: "text/html",
      },
      cache: "no-store",
    });

    if (!embedRes.ok) {
      console.error(`[ReAnime] FlixCLOUD embed HTTP ${embedRes.status}`);
      return null;
    }

    const html = await embedRes.text();

    // Check for CF challenge
    if (html.includes("Just a moment") || html.length < 5000) {
      console.error("[ReAnime] FlixCLOUD embed returned CF challenge");
      return null;
    }

    // Step 2: Parse SvelteKit data
    const marker = 'type:"data",data:{';
    const idx = html.indexOf(marker);
    if (idx < 0) {
      console.error("[ReAnime] Could not find SvelteKit data in embed");
      return null;
    }

    const objStart = idx + marker.length - 1;
    let braceCount = 0;
    let objEnd = -1;
    for (let i = objStart; i < html.length; i++) {
      if (html[i] === "{") braceCount++;
      if (html[i] === "}") {
        braceCount--;
        if (braceCount === 0) {
          objEnd = i + 1;
          break;
        }
      }
    }

    if (objEnd < 0) {
      console.error("[ReAnime] Could not find end of data object");
      return null;
    }

    // Use Function constructor instead of eval for safer parsing
    const dataStr = html.substring(objStart, objEnd);
    const data = new Function("return " + dataStr)();

    const seed = data.obfuscation_seed as string;
    const videoId = data.video_id as string;
    const subtitles = data.subtitles || [];
    const intro = data.intro_chapter || null;
    const outro = data.outro_chapter || null;

    if (!seed || !data.obfuscated_crypto_data) {
      console.error("[ReAnime] Missing obfuscation data");
      return null;
    }

    // Step 3: Derive field names
    const fields = deriveFieldNames(seed);

    // Step 4: Extract crypto data
    const obfData = data.obfuscated_crypto_data;
    const container = obfData[fields.containerName];
    if (!container) {
      console.error("[ReAnime] Container not found:", fields.containerName);
      return null;
    }
    const arr = container[fields.arrayName];
    if (!arr || !Array.isArray(arr) || arr.length === 0) {
      console.error("[ReAnime] Array not found:", fields.arrayName);
      return null;
    }
    const obj = arr[0][fields.objectName];
    if (!obj) {
      console.error("[ReAnime] Object not found:", fields.objectName);
      return null;
    }
    const frag1_b64 = obj[fields.keyField] as string;
    const iv_b64 = obj[fields.ivField] as string;
    if (!frag1_b64 || !iv_b64) {
      console.error("[ReAnime] Missing key/IV fields");
      return null;
    }

    const keyFrag2 = data[fields.keyFrag2Field] as string;
    const token = data[fields.tokenField] as string;
    if (!keyFrag2 || !token) {
      console.error("[ReAnime] Missing keyFrag2 or token");
      return null;
    }

    // Step 5: Fetch one-time m3u8 token payload
    const m3u8Res = await fetch(`${FLIXCLOUD_BASE}/api/m3u8/${token}`, {
      headers: {
        "User-Agent": UA,
        Referer: `${FLIXCLOUD_BASE}/`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!m3u8Res.ok) {
      console.error(`[ReAnime] m3u8 token API HTTP ${m3u8Res.status}`);
      return null;
    }

    const m3u8Data = await m3u8Res.json();
    const vidKey = sha256hex(token + "vid").substring(0, 10);
    const keyKey = sha256hex(token + "key").substring(0, 10);
    const v = m3u8Data[vidKey] as string;
    const T = m3u8Data[keyKey] as string;

    if (!v || !T) {
      console.error("[ReAnime] Missing v/T from m3u8 response");
      return null;
    }

    // Step 6: WASM key derivation
    const frag1Bytes = b64ToBytes(frag1_b64);
    const keyFrag2Bytes = b64ToBytes(keyFrag2);
    const TKeyBytes = b64ToBytes(T);
    const seedInt = parseInt(seed.substring(0, 8), 16);

    const wasmResult = await wasmKeyDerive(frag1Bytes, keyFrag2Bytes, TKeyBytes, seedInt);

    // Step 7: PBKDF2
    const derivedKey = pbkdf2Sync(
      wasmResult,
      Buffer.from(seed, "utf8"),
      1000,
      32,
      "sha256"
    );
    const derivedBytes = new Uint8Array(derivedKey);

    // Step 8: XOR with seed
    for (let i = 0; i < 32; i++) {
      derivedBytes[i] ^= seed.charCodeAt(i % seed.length);
    }

    // Step 9: SHA-256 → AES key
    const aesKey = createHash("sha256").update(derivedBytes).digest();

    // Step 10: AES-256-CBC decrypt
    const iv = b64ToBytes(iv_b64);
    const encryptedData = b64ToBytes(v);

    const decipher = createDecipheriv("aes-256-cbc", aesKey, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    const m3u8Url = decrypted.toString("utf8").trim();

    if (!m3u8Url || !m3u8Url.startsWith("http")) {
      console.error("[ReAnime] Decrypted URL is invalid:", m3u8Url?.substring(0, 50));
      return null;
    }

    console.log(`[ReAnime] Decrypted m3u8: ${m3u8Url.substring(0, 80)}...`);
    return { m3u8Url, videoId, subtitles, intro, outro };
  } catch (e: any) {
    console.error("[ReAnime] decryptFlixCloudEmbed failed:", e?.message || e);
    return null;
  }
}

// ─── Main: Fetch all ReAnime sources for an episode ───────────────────────────

export async function fetchAllReAnimeSources(
  anilistId: number,
  episodeNum: number,
  _titles?: { english?: string; romaji?: string; native?: string },
  options?: { sub?: boolean; dub?: boolean; timeoutMs?: number }
): Promise<ReAnimeVerifiedResult[]> {
  const wantSub = options?.sub ?? true;
  const wantDub = options?.dub ?? true;

  try {
    // Step 1: Get FlixCLOUD server list (uses AniList ID directly!)
    const servers = await getReAnimeFlixServers(anilistId, episodeNum);
    if (!servers.length) {
      console.log(`[ReAnime] No servers for anilistId=${anilistId} ep${episodeNum}`);
      return [];
    }

    console.log(`[ReAnime] Found ${servers.length} servers for anilistId=${anilistId} ep${episodeNum}`);

    const results: ReAnimeVerifiedResult[] = [];
    const seenAccessIds = new Set<string>();

    // Deduplicate by access_id (same dataLink appears for both sub and dub)
    for (const server of servers) {
      // Filter by sub/dub
      if (server.dataType === "sub" && !wantSub) continue;
      if (server.dataType === "dub" && !wantDub) continue;

      // Extract access_id from dataLink
      const accessIdMatch = server.dataLink.match(/e\/([^?]+)/);
      if (!accessIdMatch) continue;
      const accessId = accessIdMatch[1];
      const version = server.dataLink.match(/v=(\d+)/)?.[1] || "1";

      // Deduplicate
      const dedupeKey = `${accessId}_${server.dataType}`;
      if (seenAccessIds.has(dedupeKey)) continue;
      seenAccessIds.add(dedupeKey);

      // Try to decrypt for direct m3u8
      const decrypted = await decryptFlixCloudEmbed(accessId, version);

      if (decrypted?.m3u8Url) {
        // Direct m3u8 stream — wrap through proxy
        const proxiedUrl = wrapM3u8UrlWithReferer(
          decrypted.m3u8Url,
          "https://flixcloud.cc/"
        );

        // Wrap subtitle URLs through worker proxy (ASS from slopnet.site)
        const subtitleTracks = (decrypted.subtitles || [])
          .filter((s: any) => s?.url)
          .map((s: any) => ({
            url: wrapStreamUrl(s.url),
            lang: s.language || s.lang || "en",
            label: s.language || s.lang || "English",
          }));

        results.push({
          provider: `reanime-${server.serverName.toLowerCase()}-${server.dataType}`,
          type: server.dataType,
          quality: server.serverName === "HD-2" ? "1080p" : "720p",
          streamUrl: proxiedUrl,
          isM3U8: true,
          isMP4: false,
          isEmbed: false,
          subtitleTracks,
          intro: validateSkipTime(
            decrypted.intro
              ? { start: decrypted.intro.start, end: decrypted.intro.end }
              : null,
            "intro",
          ),
          outro: validateSkipTime(
            decrypted.outro
              ? { start: decrypted.outro.start, end: decrypted.outro.end }
              : null,
            "outro",
          ),
        });
      } else {
        // Fall back to embed URL as iframe source
        // The FlixCLOUD embed page is a self-contained player that
        // handles decryption client-side (same as kwik.cx for AnimePahe)
        results.push({
          provider: `reanime-${server.serverName.toLowerCase()}-${server.dataType}`,
          type: server.dataType,
          quality: server.serverName === "HD-2" ? "1080p" : "720p",
          streamUrl: server.dataLink,
          isM3U8: false,
          isMP4: false,
          isEmbed: true,
          subtitleTracks: [],
          intro: null,
          outro: null,
        });
      }
    }

    console.log(
      `[ReAnime] ${anilistId} ep${episodeNum}: ${results.length} streams ` +
        `(m3u8=${results.filter((r) => r.isM3U8).length}, embed=${results.filter((r) => r.isEmbed).length})`
    );
    return results;
  } catch (e: any) {
    console.error(
      `[ReAnime] fetchAllSources failed for ${anilistId} ep${episodeNum}:`,
      e?.message || e
    );
    return [];
  }
}

export const REANIME_ENABLED = true;
