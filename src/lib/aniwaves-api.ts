/**
 * AniWaves API Client
 * -------------------
 * AniWaves (https://aniwaves.ru) is an anime streaming site with
 * server/embed based playback.
 *
 * Flow:
 *   1. Search: GET /filter?keyword={query} → parse watch links
 *   2. Episodes: GET /ajax/episode/list/{watchId} → parse episode IDs
 *   3. Servers: GET /ajax/server/list?servers={episodeId} → parse server IDs
 *   4. Embed: GET /ajax/sources?id={sourceId} → get embed URL
 *
 * Embed URLs are iframe-based (vidstream, megacloud, etc.)
 * We extract the actual stream URL from the embed and wrap through aniwatchtv.
 */

import { wrapStreamUrl } from "./proxy";

const BASE = "https://aniwaves.ru";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept": "text/html,application/json,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": BASE + "/",
  "Origin": BASE,
};

function titleSlug(input: string): string {
  return input.replace(/-\d+$/, "").toLowerCase();
}

function serverType(raw: string): "sub" | "dub" {
  const value = raw.toLowerCase();
  if (value.includes("dub")) return "dub";
  return "sub";
}

export interface AniWavesResult {
  provider: string;
  type: "sub" | "dub";
  streamUrl: string;
  quality: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  tracks: never[];
}

// ─── Fetch helper ────────────────────────────────────────────────────
async function fetchUrl(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await Promise.race([
      fetch(url, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchJson<T = any>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const res = await Promise.race([
      fetch(url, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ─── Search ──────────────────────────────────────────────────────────
async function searchAniWaves(query: string, timeoutMs = 8000): Promise<string | null> {
  const html = await fetchUrl(`${BASE}/filter?keyword=${encodeURIComponent(query)}`, timeoutMs);
  if (!html) return null;

  // Parse watch links: href="/watch/some-anime-12345"
  const matches = html.match(/href="\/watch\/[^"]+-(\d+)"/g) || [];
  if (matches.length === 0) return null;

  // Return the first anime ID
  const id = matches[0]!.match(/-(\d+)"/)?.[1];
  return id || null;
}

// ─── Resolve watch ID ────────────────────────────────────────────────
async function resolveWatchId(animeId: string, timeoutMs = 8000): Promise<string | null> {
  // animeId from AniList search might be a slug, need to find the numeric ID
  const html = await fetchUrl(`${BASE}/filter?keyword=${encodeURIComponent(titleSlug(animeId))}`, timeoutMs);
  if (!html) return null;

  const matches = html.match(/href="\/watch\/[^"]+-(\d+)"/g) || [];
  if (matches.length === 0) return null;

  return matches[0]!.match(/-(\d+)"/)?.[1] || null;
}

// ─── Get episodes ────────────────────────────────────────────────────
async function getEpisodes(watchId: string, epNum: number, timeoutMs = 8000): Promise<string | null> {
  const data = await fetchJson<{ result?: string; html?: string }>(
    `${BASE}/ajax/episode/list/${watchId}`,
    timeoutMs
  );
  if (!data) return null;

  const html = data.result || data.html || (typeof data === "string" ? data : "");
  if (!html) return null;

  // Parse: <a data-ids="epId" data-num="1">
  const epRegex = /data-ids="([^"]+)"[^>]*data-num="(\d+)"/g;
  let match;
  while ((match = epRegex.exec(html)) !== null) {
    const id = match[1];
    const num = parseInt(match[2], 10);
    if (num === epNum) return id;
  }

  // Fallback: return first episode
  const first = html.match(/data-ids="([^"]+)"/);
  return first ? first[1] : null;
}

// ─── Get servers ─────────────────────────────────────────────────────
interface WaveServer {
  name: string;
  sourceId: string;
  type: "sub" | "dub";
}

async function getServers(episodeId: string, timeoutMs = 8000): Promise<WaveServer[]> {
  const data = await fetchJson<{ result?: string; html?: string }>(
    `${BASE}/ajax/server/list?servers=${episodeId}`,
    timeoutMs
  );
  if (!data) return [];

  const html = data.result || data.html || "";
  if (!html) return [];

  const servers: WaveServer[] = [];

  // Parse: <div data-link-id="sourceId" ... data-type="sub|dub">
  const serverRegex = /data-link-id="([^"]+)"[^>]*>/g;
  const typeRegex = /data-type="(sub|dub|raw)"/gi;

  // Simple approach: find all data-link-id and nearby data-type
  const parts = html.split(/(?=<.*data-link-id)/);
  for (const part of parts) {
    const idMatch = part.match(/data-link-id="([^"]+)"/);
    if (!idMatch) continue;
    const sourceId = idMatch[1];

    // Find type in surrounding context
    const typeMatch = part.match(/data-type="(sub|dub|raw)"/i);
    const rawType = typeMatch ? typeMatch[1] : "sub";
    const type = serverType(rawType);

    // Find name
    const nameMatch = part.match(/>([^<]{2,30})</);
    const name = nameMatch ? nameMatch[1].trim() : `Server ${servers.length + 1}`;

    servers.push({ name, sourceId, type });
  }

  return servers;
}

// ─── Get embed URL ───────────────────────────────────────────────────
async function getEmbedUrl(sourceId: string, timeoutMs = 8000): Promise<string | null> {
  if (/^https?:\/\//i.test(sourceId)) return sourceId;

  const data = await fetchJson<{ result?: { url?: string; link?: string; server?: string } }>(
    `${BASE}/ajax/sources?id=${sourceId}&asi=0&autoPlay=0`,
    timeoutMs
  );
  if (!data) return null;

  const result: any = data.result || data;
  return result?.url || result?.link || null;
}

// ─── Main: fetch ALL AniWaves sources ────────────────────────────────
export async function fetchAniWavesSources(
  anilistId: number,
  epNum: number,
  options?: { sub?: boolean; dub?: boolean; timeoutMs?: number }
): Promise<AniWavesResult[]> {
  const wantSub = options?.sub ?? true;
  const wantDub = options?.dub ?? true;
  const timeoutMs = options?.timeoutMs ?? 8000;

  // Get title from AniList
  let title: string;
  try {
    const titleRes = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        query: `query($id:Int){Media(id:$id,type:ANIME){id title{english romaji native}}}`,
        variables: { id: anilistId },
      }),
      cache: "no-store",
    });
    const titleData = await titleRes.json();
    title = titleData?.data?.Media?.title?.english || titleData?.data?.Media?.title?.romaji || "";
    if (!title) return [];
  } catch {
    return [];
  }

  // Step 1: Search for anime
  const watchId = await searchAniWaves(title, timeoutMs);
  if (!watchId) {
    console.log(`[AniWaves] no results for "${title}"`);
    return [];
  }

  // Step 2: Get episode ID
  const episodeId = await getEpisodes(watchId, epNum, timeoutMs);
  if (!episodeId) {
    console.log(`[AniWaves] no episode ${epNum} found`);
    return [];
  }

  // Step 3: Get servers
  const servers = await getServers(episodeId, timeoutMs);
  if (servers.length === 0) {
    console.log(`[AniWaves] no servers for episode ${epNum}`);
    return [];
  }

  console.log(`[AniWaves] ${servers.length} servers found for ep ${epNum}`);

  // Step 4: Get embed URLs for each server (in parallel)
  const results = await Promise.allSettled(
    servers.map(async (server): Promise<AniWavesResult | null> => {
      if (!wantSub && server.type === "sub") return null;
      if (!wantDub && server.type === "dub") return null;

      const embedUrl = await getEmbedUrl(server.sourceId, timeoutMs);
      if (!embedUrl) return null;

      // Wrap through aniwatchtv proxy
      const streamUrl = wrapStreamUrl(embedUrl);

      return {
        provider: server.name,
        type: server.type,
        streamUrl,
        quality: "auto",
        isM3U8: false,
        isMP4: false,
        isEmbed: true,
        hardsub: false,
        tracks: [],
      };
    })
  );

  const verified: AniWavesResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) verified.push(r.value);
  }

  console.log(`[AniWaves] ${verified.length}/${servers.length} servers returned embed URLs`);
  return verified;
}
