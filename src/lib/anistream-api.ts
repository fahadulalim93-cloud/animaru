/**
 * Anistream.one API Client
 * ------------------------
 * anistream.one has its OWN REST API at api.anistream.one — separate from
 * graphql.animex.one (which it uses for metadata only).
 *
 * API flow:
 *   1. Resolve AniList ID → anistream slug (via graphql.animex.one searchAnime)
 *      e.g. anilistId=21 → slug="one-piece-p8k27"
 *   2. GET https://api.anistream.one/rest/api/servers?id={slug}&epNum={ep}
 *      → returns { subProviders: [{id, tip, type?, url?}], dubProviders: [...] }
 *      Providers with type="embed" have a direct embed URL (ok.ru, mp4upload).
 *      Providers without type="embed" need step 3.
 *   3. GET https://api.anistream.one/rest/api/sources?id={slug}&epNum={ep}&type={sub|dub}&providerId={id}
 *      → returns { sources: [{url, quality, type}], tracks, chapters, headers: {Referer} }
 *      The stream URL is a DIRECT m3u8/mp4 URL — no XOR encoding, no proxy needed.
 *      The Referer header in the response tells us what to send.
 *
 * KEY ADVANTAGE: api.anistream.one is NOT Cloudflare-protected (unlike anixtv.in).
 * Direct fetch from Vercel works — no worker proxy needed for the API calls.
 * Stream URLs just need proper Referer (handled by our worker).
 *
 * This is the SAME backend as our existing animex integration (graphql.animex.one),
 * but anistream.one has a SEPARATE REST API (api.anistream.one) that returns
 * DIRECT stream URLs — no cdn.animex.su XOR wrapper needed.
 */

import { wrapStreamUrl, wrapM3u8Url } from "./proxy";

const ANISTREAM_API = "https://api.anistream.one/rest/api";
const GRAPHQL_API = "https://graphql.animex.one/graphql";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://anistream.one",
  "Referer": "https://anistream.one/",
};

// ─── Worker proxy helper ────────────────────────────────────────────────────
// api.anistream.one is Cloudflare-protected — returns {"error":"bot_detected"}
// when fetched from Vercel IPs. Route ALL API calls through our Cloudflare
// Worker, which runs on Cloudflare's network and bypasses bot detection.
const WORKER_BASE = process.env.NEXT_PUBLIC_PROXY_BASE || "https://luffytv-proxy.ggy892767.workers.dev";

function workerWrap(url: string): string {
  if (!WORKER_BASE) return url;  // fallback: try direct (works locally, fails on Vercel)
  return `${WORKER_BASE}/proxy?url=${encodeURIComponent(url)}&ref=${encodeURIComponent("https://anistream.one/")}`;
}

// ─── m3u8 verification ──────────────────────────────────────────────────────
// Same as AniLight: fetch the proxied m3u8 and check if it starts with #EXTM3U.
// Filters out servers whose CDN is down (returns Cloudflare error HTML).
async function verifyM3u8Playable(proxiedUrl: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await Promise.race([
      fetch(proxiedUrl, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return false;
    const text = await res.text();
    const trimmed = text.trimStart().replace(/^\uFEFF/, "");
    return trimmed.startsWith("#EXTM3U");
  } catch {
    return false;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnistreamProvider {
  id: string;
  tip: string;
  default?: boolean;
  type?: string;   // "embed" for third-party embeds (ok.ru, mp4upload)
  url?: string;    // present when type="embed"
}

export interface AnistreamServersResponse {
  subProviders: AnistreamProvider[];
  dubProviders: AnistreamProvider[];
}

export interface AnistreamSource {
  url: string;
  quality: string;
  type: string;
}

export interface AnistreamSourcesResponse {
  sources: AnistreamSource[];
  tracks?: Array<{ id: string; url: string; lang: string; label: string; kind: string; default?: boolean }> | null;
  audio?: any;
  chapters?: Array<{ title: string; start: number; end: number }> | null;
  headers?: { Referer?: string };
  error?: string;
}

export interface AnistreamVerifiedResult {
  server: string;
  type: "sub" | "dub";
  streamUrl: string;
  quality: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  tracks: Array<{ url: string; lang: string; label: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

// ─── Slug cache (AniList ID → anistream slug) ────────────────────────────────

const slugCache = new Map<number, string | null>();

/**
 * Resolve AniList ID → anistream.one slug via graphql.animex.one search.
 * e.g. anilistId=21 → "one-piece-p8k27"
 */
export async function resolveAnistreamSlug(anilistId: number): Promise<string | null> {
  if (slugCache.has(anilistId)) return slugCache.get(anilistId)!;

  try {
    // Step 1: Get anime title from AniList
    const titleRes = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        query: `query($id:Int){Media(id:$id,type:ANIME){id title{english romaji native}}}`,
        variables: { id: anilistId },
      }),
    });
    if (!titleRes.ok) { slugCache.set(anilistId, null); return null; }
    const titleData = await titleRes.json();
    const title = titleData?.data?.Media?.title?.english || titleData?.data?.Media?.title?.romaji;
    if (!title) { slugCache.set(anilistId, null); return null; }

    // Step 2: Search graphql.animex.one for the slug
    const res = await fetch(GRAPHQL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...HEADERS },
      body: JSON.stringify({
        query: `{ searchAnime(query: "${title.replace(/"/g, '\\"')}") { items { id anilistId } } }`,
      }),
    });
    if (!res.ok) { slugCache.set(anilistId, null); return null; }
    const data = await res.json();
    const items = data?.data?.searchAnime?.items || [];
    const match = items.find((i: any) => i.anilistId === anilistId) || items[0];
    if (!match?.id) { slugCache.set(anilistId, null); return null; }

    slugCache.set(anilistId, match.id);
    console.log(`[Anistream] anilistId=${anilistId} → slug=${match.id}`);
    return match.id;
  } catch {
    slugCache.set(anilistId, null);
    return null;
  }
}

// ─── Fetch servers list ──────────────────────────────────────────────────────

export async function getAnistreamServers(
  slug: string,
  epNum: number,
  timeoutMs = 8000
): Promise<AnistreamServersResponse | null> {
  const url = `${ANISTREAM_API}/servers?id=${slug}&epNum=${epNum}`;
  try {
    const res = await Promise.race([
      fetch(workerWrap(url), { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    return await res.json() as AnistreamServersResponse;
  } catch {
    return null;
  }
}

// ─── Fetch sources for a specific provider ───────────────────────────────────

export async function getAnistreamSources(
  slug: string,
  epNum: number,
  type: "sub" | "dub",
  providerId: string,
  timeoutMs = 8000
): Promise<AnistreamSourcesResponse | null> {
  const url = `${ANISTREAM_API}/sources?id=${slug}&epNum=${epNum}&type=${type}&providerId=${providerId}`;
  try {
    const res = await Promise.race([
      fetch(workerWrap(url), { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    const data = await res.json() as AnistreamSourcesResponse;
    if (data?.error || !data?.sources?.length) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── Main: fetch ALL Anistream servers ────────────────────────────────────────

export async function fetchAnistreamSources(
  anilistId: number,
  epNum: number,
  options?: { sub?: boolean; dub?: boolean; timeoutMs?: number }
): Promise<AnistreamVerifiedResult[]> {
  const wantSub = options?.sub ?? true;
  const wantDub = options?.dub ?? true;
  const timeoutMs = options?.timeoutMs ?? 8000;

  const slug = await resolveAnistreamSlug(anilistId);
  if (!slug) {
    console.log(`[Anistream] no slug for anilistId=${anilistId}`);
    return [];
  }

  const serversList = await getAnistreamServers(slug, epNum, timeoutMs);
  if (!serversList) {
    console.log(`[Anistream] no servers for slug=${slug}`);
    return [];
  }

  // Build job list from the dynamic server list
  const jobs: Array<{ provider: AnistreamProvider; type: "sub" | "dub" }> = [];
  if (wantSub) {
    for (const p of (serversList.subProviders || [])) {
      jobs.push({ provider: p, type: "sub" });
    }
  }
  if (wantDub) {
    for (const p of (serversList.dubProviders || [])) {
      jobs.push({ provider: p, type: "dub" });
    }
  }

  console.log(`[Anistream] ${slug} ep${epNum}: ${jobs.length} server×type combos`);

  const results = await Promise.allSettled(
    jobs.map(async (job): Promise<AnistreamVerifiedResult | null> => {
      const { provider, type } = job;

      // If provider has type="embed" + url, use the embed URL directly (no /sources call needed)
      if (provider.type === "embed" && provider.url) {
        const isHardsub = provider.tip?.toLowerCase().includes("hard");
        return {
          server: provider.id,
          type,
          streamUrl: provider.url,  // embed URL (ok.ru, mp4upload) — loaded in iframe
          quality: "auto",
          isM3U8: false,
          isMP4: false,
          isEmbed: true,
          hardsub: isHardsub,
          tracks: [],
          intro: null,
          outro: null,
        };
      }

      // Otherwise, fetch sources from /rest/api/sources
      const data = await getAnistreamSources(slug, epNum, type, provider.id, timeoutMs);
      if (!data?.sources?.length) return null;

      const source = data.sources[0];
      if (!source?.url) return null;

      const isHls = source.type?.includes("mpegurl") || source.url.includes(".m3u8");
      const isMp4 = source.type?.includes("mp4") || source.url.includes(".mp4");

      // Determine hardsub from the provider tip
      const isHardsub = provider.tip?.toLowerCase().includes("hard");

      // Route through our worker — it adds the correct Referer from the response headers
      const streamUrl = isHls ? wrapM3u8Url(source.url) : wrapStreamUrl(source.url);

      // Verify the m3u8 is actually playable (not a Cloudflare error page)
      if (isHls) {
        const isValid = await verifyM3u8Playable(streamUrl, 3000);
        if (!isValid) {
          console.log(`[Anistream] Server ${provider.id} (${type}) — m3u8 not playable, skipping`);
          return null;
        }
      }

      const tracks = (data.tracks || []).filter(t => t?.url).map(t => ({
        url: t.url,
        lang: t.lang || "en",
        label: t.label || t.lang || "English",
      }));

      // Parse intro/outro from chapters
      const chapters = data.chapters || [];
      const intro = chapters.find(c => /intro/i.test(c.title)) || null;
      const outro = chapters.find(c => /outro|ending|ed/i.test(c.title)) || null;

      return {
        server: provider.id,
        type,
        streamUrl,
        quality: source.quality || "auto",
        isM3U8: isHls,
        isMP4: isMp4,
        isEmbed: false,
        hardsub: isHardsub ?? false,
        tracks,
        intro: intro ? { start: intro.start, end: intro.end } : null,
        outro: outro ? { start: outro.start, end: outro.end } : null,
      };
    })
  );

  const verified: AnistreamVerifiedResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) verified.push(r.value);
  }

  console.log(`[Anistream] ${verified.length}/${jobs.length} servers verified`);
  return verified;
}
