/**
 * Ani.pm API Client
 * ------------------
 * ani.pm is an anime streaming site with a public API at /api/anime/.
 * It's Cloudflare-protected — all API calls + HLS streams go through
 * our Cloudflare Worker proxy with Referer: https://ani.pm/
 *
 * API flow:
 *   1. Search: GET /api/anime/search?q={query}
 *      → { items: [{ id, title, anilistId, malId, poster, ... }] }
 *   2. Source Servers: GET /api/anime/src/servers?title={title}&ep={ep}&anilistId={id}
 *      → { sub: [{ provider, name, kind, url, subtitle, tracks }], dub: [...] }
 *      kind: "hls" | "file" | "embed"
 *      subtitle: "none" | "hard" | "soft"
 *      url: relative path like "/api/anime/src/hls?t={token}" or full embed URL
 *   3. Stream: HLS URLs from step 2 are wrapped through the Worker proxy
 *      (workerWrap) which rewrites m3u8 segment URLs automatically.
 *
 * Providers (categorized):
 *   HLS: Nova, Halo, Vega (file), Lyra, Cobalt, Orion, Onyx
 *   Embed: ok.ru, mp4upload, bibiemb, otakuhg, otakuvid, playmogo, vivibebe, myvidplay, vidnest
 *
 * The HLS URLs are relative (/api/anime/src/hls?t={token}) and get wrapped
 * through the Worker's /proxy?url=...&ref=https://ani.pm/ endpoint.
 */

const ANI_PM = "https://ani.pm";
const WORKER_BASE = process.env.NEXT_PUBLIC_PROXY_BASE || "https://luffytv-proxy.ggy892767.workers.dev";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AniPmServer {
  provider: string;      // "Nova", "Halo", "Lyra", etc.
  name: string;          // "Nova · 1", "Lyra · 3"
  kind: string;          // "hls" | "file" | "embed"
  url: string;           // relative "/api/anime/src/hls?t=..." or full embed URL
  priority: number;
  subtitle: string;      // "none" | "hard" | "soft"
  tracks?: Array<{ url: string; label: string; default?: boolean }>;
}

export interface AniPmSourcesResponse {
  sub: AniPmServer[];
  dub: AniPmServer[];
}

export interface AniPmVerifiedResult {
  provider: string;
  name: string;
  type: "sub" | "dub";
  streamUrl: string;     // full URL ready to play (through worker for HLS, direct for embed)
  quality: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  tracks: Array<{ url: string; lang: string; label: string }>;
}

// ─── Worker proxy helper ────────────────────────────────────────────────────
function workerWrap(url: string): string {
  return `${WORKER_BASE}/proxy?url=${encodeURIComponent(url)}&ref=${encodeURIComponent("https://ani.pm/")}`;
}

// ─── Fetch JSON through worker ──────────────────────────────────────────────
async function workerFetchJson<T = any>(url: string, timeoutMs = 15000): Promise<T | null> {
  try {
    const wrapped = workerWrap(url);
    const res = await Promise.race([
      fetch(wrapped, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    const text = await res.text();
    if (!text || text.startsWith("<!DOCTYPE") || text.startsWith("<html")) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ─── Search anime ────────────────────────────────────────────────────────────

export interface AniPmSearchResult {
  id: number;
  title: string;
  anilistId?: number;
  malId?: number;
  poster?: string;
  year?: number;
  type?: string;
  score?: number;
}

export async function searchAniPm(query: string, timeoutMs = 8000): Promise<AniPmSearchResult[]> {
  const url = `${ANI_PM}/api/anime/search?q=${encodeURIComponent(query)}`;
  const data = await workerFetchJson<{ items: AniPmSearchResult[] }>(url, timeoutMs);
  return data?.items || [];
}

// ─── Resolve AniList ID → ani.pm anime ID ────────────────────────────────────

const anilistToAniPmCache = new Map<number, { animeId: number; title: string } | null>();

export async function resolveAniPmId(anilistId: number, timeoutMs = 8000): Promise<{ animeId: number; title: string } | null> {
  if (anilistToAniPmCache.has(anilistId)) return anilistToAniPmCache.get(anilistId)!;

  try {
    // Get title from AniList
    const titleRes = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        query: `query($id:Int){Media(id:$id,type:ANIME){id title{english romaji native}}}`,
        variables: { id: anilistId },
      }),
      cache: "no-store",
    });
    if (!titleRes.ok) { anilistToAniPmCache.set(anilistId, null); return null; }
    const titleData = await titleRes.json();
    const title = titleData?.data?.Media?.title?.english
               || titleData?.data?.Media?.title?.romaji;
    if (!title) { anilistToAniPmCache.set(anilistId, null); return null; }

    // Search ani.pm
    const results = await searchAniPm(title, timeoutMs);
    // Find exact match by anilistId, or by title
    const match = results.find(r => r.anilistId === anilistId)
               || results.find(r => r.title?.toLowerCase() === title.toLowerCase())
               || results[0];
    if (!match?.id) { anilistToAniPmCache.set(anilistId, null); return null; }

    const result = { animeId: match.id, title: match.title };
    anilistToAniPmCache.set(anilistId, result);
    console.log(`[AniPm] anilistId=${anilistId} → animeId=${result.animeId} (${result.title})`);
    return result;
  } catch {
    anilistToAniPmCache.set(anilistId, null);
    return null;
  }
}

// ─── Fetch source servers ────────────────────────────────────────────────────

export async function getAniPmSources(
  anilistId: number,
  epNum: number,
  timeoutMs = 10000
): Promise<AniPmSourcesResponse | null> {
  // Resolve AniList ID → title
  const resolved = await resolveAniPmId(anilistId, timeoutMs);
  if (!resolved) return null;

  const url = `${ANI_PM}/api/anime/src/servers?title=${encodeURIComponent(resolved.title)}&ep=${epNum}&anilistId=${anilistId}`;
  const data = await workerFetchJson<AniPmSourcesResponse>(url, timeoutMs);
  if (!data) return null;
  return data;
}

// ─── Main: Fetch ALL AniPm servers ───────────────────────────────────────────

export async function fetchAniPmSources(
  anilistId: number,
  epNum: number,
  options?: { sub?: boolean; dub?: boolean; timeoutMs?: number }
): Promise<AniPmVerifiedResult[]> {
  const wantSub = options?.sub ?? true;
  const wantDub = options?.dub ?? true;
  const timeoutMs = options?.timeoutMs ?? 8000;

  const data = await getAniPmSources(anilistId, epNum, timeoutMs);
  if (!data) {
    console.log(`[AniPm] no sources for anilistId=${anilistId} ep${epNum}`);
    return [];
  }

  const verified: AniPmVerifiedResult[] = [];

  const processServers = (servers: AniPmServer[], type: "sub" | "dub") => {
    for (const s of servers) {
      if (!s?.url) continue;

      const isHls = s.kind === "hls";
      const isFile = s.kind === "file";
      const isEmbed = s.kind === "embed";

      // Build stream URL
      let streamUrl: string;
      if (isEmbed) {
        // Embed URLs are full URLs (ok.ru, mp4upload, etc.) — used directly
        streamUrl = s.url;
      } else {
        // HLS/file URLs are relative (/api/anime/src/hls?t=...) — prepend ani.pm
        // and wrap through the Worker proxy. The worker rewrites m3u8 segments
        // automatically and sends the correct Referer: https://ani.pm/
        const fullUrl = s.url.startsWith("http") ? s.url : `${ANI_PM}${s.url}`;
        streamUrl = workerWrap(fullUrl);
      }

      // Determine hardsub
      const hardsub = s.subtitle === "hard";

      // Parse subtitle tracks — wrap through the Worker proxy (same proxy)
      const tracks = (s.tracks || []).filter(t => t?.url).map(t => {
        const fullTrackUrl = t.url.startsWith("http") ? t.url : `${ANI_PM}${t.url}`;
        return {
          url: workerWrap(fullTrackUrl),
          lang: "en",
          label: t.label || "English",
        };
      });

      // Extract quality from name (e.g. "Nova · 1" → "auto", "HD-1" → "auto")
      const quality = "auto";

      verified.push({
        provider: s.provider,
        name: s.name,
        type,
        streamUrl,
        quality,
        isM3U8: isHls,
        isMP4: isFile,
        isEmbed,
        hardsub,
        tracks,
      });
    }
  };

  if (wantSub && data.sub) processServers(data.sub, "sub");
  if (wantDub && data.dub) processServers(data.dub, "dub");

  // DEDUPLICATE by provider:type — AniPm returns MANY servers with the same
  // provider name (e.g. "Lyra" appears 20+ times with different URLs).
  // We keep only ONE per provider:type combo: prefer HLS over embed,
  // then prefer the first occurrence. This prevents the server list from
  // being flooded with 47 AniPm servers.
  const seen = new Set<string>();
  const deduped: AniPmVerifiedResult[] = [];
  // Sort: HLS first (isM3U8=true), then file (isMP4), then embed — so the
  // first occurrence of each provider is the best quality.
  const sorted = [...verified].sort((a, b) => {
    const aRank = a.isM3U8 ? 0 : (a.isMP4 ? 1 : 2);
    const bRank = b.isM3U8 ? 0 : (b.isMP4 ? 1 : 2);
    return aRank - bRank;
  });
  for (const r of sorted) {
    const key = `${r.provider}:${r.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  console.log(`[AniPm] ${deduped.length} servers (deduped from ${verified.length} by provider:type)`);
  return deduped;
}
