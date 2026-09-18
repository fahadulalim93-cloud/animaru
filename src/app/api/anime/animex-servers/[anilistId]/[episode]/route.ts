/**
 * GET /api/anime/animex-servers/[anilistId]/[episode]
 *
 * Fetches Animex servers INDEPENDENTLY from pp.animex.one (AnimeX's own API).
 * This runs as a SEPARATE request from the main servers endpoint,
 * so it doesn't compete with other sources for the Vercel 30s timeout.
 *
 * The watch page fetches this in parallel with /api/anime/servers —
 * main servers load first, Animex servers get appended when ready.
 *
 * Dynamically fetches the actual sub/dub provider list from /servers endpoint
 * (no more hardcoding provider IDs that drift over time).
 * Fallback to known-good lists if /servers endpoint fails.
 */
import { NextRequest, NextResponse } from "next/server";
import { animexGetAnime, animexServers, animexSources } from "@/lib/animex-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s — generous timeout for batched fetching

const ANIMEX_REFERERS: Record<string, string> = {
  beep: "https://animex.one/", mimi: "https://animex.one/",
  vee: "https://www.animeonsen.xyz/", yuki: "https://megaplay.buzz/",
  miku: "https://allanime.uns.bio", neko: "https://animeverse.to/",
  huzz: "https://kem.clvd.xyz/", mochi: "https://animex.one",
  uwu: "https://allanime.uns.bio", koto: "https://allanime.uns.bio",
  kiwi: "https://anidb.app/", kami: "https://animex.one/",
  sax: "https://animex.one/", yume: "https://animex.one/",
  loli: "https://allanime.uns.bio", sora: "https://allanime.uns.bio",
};

interface AnimexServer {
  id: string;
  name: string;
  source: "animex";
  provider: string;
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  hardsub: boolean;
  priority: number;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

// Providers that serve SOFT SUB (subtitles as separate track, not burned in).
// Everything else is hardsub. Matches what animex.one reports.
const ANIMEX_SOFTSUB = new Set(["beep", "yuki"]);

// ── AnimeX provider priority order (within priority 2.x) ──
// All AnimeX servers are priority 2 (user-specified 3rd after AniNeko, AniKoto).
// Sub-providers get 2.0-2.4, dub-providers get 2.5-2.9.
// mimi is the fastest/most reliable → 2.0. Others follow by quality.
const ANIMEX_PROVIDER_PRIORITY: Record<string, number> = {
  // Sub providers (2.0 - 2.4)
  mimi: 2.0,   // Default dub CDN, fastest, most reliable
  beep: 2.1,   // Default sub CDN
  yuki: 2.2,   // .jpg-TS format
  uwu: 2.3,    // .txt format
  kiwi: 2.4,   // CF-protected, anidb.app CDN
  miku: 2.15,  // .txt format, best quality
  neko: 2.16,  // MP4 direct
  huzz: 2.17,  // HLS
  mochi: 2.18, // MP4 token
  koto: 2.19,  // .txt format
  kami: 2.20,  // HLS alt
  vee: 2.21,   // DASH
  sax: 2.22,
  yume: 2.23,
  loli: 2.24,
  sora: 2.25,
};

// Hardcoded fallback lists — used only if /servers endpoint fails to return a list.
// These match what animex.one currently reports (verified 2026-06).
// Actual sub: beep, yuki, miku, neko, mochi, uwu (6 providers — meets "minimum 6" requirement)
// Actual dub: yuki, miku, mochi, uwu (4 providers)
// Only include providers that return UNIQUE streams (tested):
// mimi=vivibebe.site, beep=playeng.animeapps.top, yuki=cdn.mewstream.buzz,
// uwu=vault-XX.uwucdn.top, kiwi=hls.anidb.app
// Removed duplicates: miku, koto, kami, huzz, vee, neko, lolly (all return same URL as mimi)
// Removed broken: mochi (returns error)
const FALLBACK_SUB_PROVIDERS = ["mimi", "beep", "yuki", "uwu", "kiwi"];
const FALLBACK_DUB_PROVIDERS = ["mimi", "yuki", "uwu"];

/**
 * Build a proxy URL using our Cloudflare Worker.
 * Encoding: XOR(url + "\0" + referer, key) → base64url → /p/{token}
 * Key: "10b06cdc1ca48c9fb0b94af97cc040cf"
 */
function buildProxyUrl(streamUrl: string, referer: string, isMP4: boolean = false): string {
  const XOR_KEY = "10b06cdc1ca48c9fb0b94af97cc040cf";
  const combined = streamUrl + "\0" + referer;
  const keyBytes = Buffer.from(XOR_KEY);
  const dataBytes = Buffer.from(combined);
  const xored = Buffer.alloc(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    xored[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  const token = xored.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  // Same-domain proxy (relative URL → browser reuses HTTP/2 connection from page load)
  return `/p/${token}`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  if (isNaN(id) || id <= 0 || isNaN(epNum) || epNum <= 0) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  try {
    // Step 1: Resolve AniList ID → Animex slug
    const anime = await animexGetAnime(id);
    if (!anime?.slug) {
      return NextResponse.json({ servers: [], total: 0, message: "Anime not found on Animex" });
    }

    // Step 2: Fetch the ACTUAL provider list from /servers endpoint.
    // This returns subProviders + dubProviders arrays — we use these instead
    // of hardcoding provider IDs (which drift over time as animex adds/removes providers).
    const serversList = await animexServers(anime.slug, epNum);
    const subProviderIds: string[] = (serversList.subProviders || []).map((p: any) => p.id);
    const dubProviderIds: string[] = (serversList.dubProviders || []).map((p: any) => p.id);

    // Fall back to known-good lists if /servers endpoint returns nothing
    const subProviders = subProviderIds.length > 0 ? subProviderIds : FALLBACK_SUB_PROVIDERS;
    const dubProviders = dubProviderIds.length > 0 ? dubProviderIds : FALLBACK_DUB_PROVIDERS;

    // Step 3: Build job list — sub + dub providers
    const jobs: Array<{ provider: string; type: "sub" | "dub" }> = [];
    for (const p of subProviders) jobs.push({ provider: p, type: "sub" });
    for (const p of dubProviders) jobs.push({ provider: p, type: "dub" });

    // ── Fetch ALL providers in parallel (no batch gaps) ──────────────────
    // Previously: BATCH=3 with 500ms gap between batches = 1.5s+ wasted.
    // Now: all providers fire simultaneously with a 5s per-provider timeout.
    // Fast providers (mimi, beep) resolve in ~1-2s; slow ones (kiwi) in ~3-4s.
    // Total time ≈ max(individual provider times) instead of sum of batches.
    // Per-provider timeout — reduced from 8s to 5s for faster VPS response.
    // Slow providers (kiwi, CF-blocked) will timeout and be skipped.
    // The watch page also fetches individual providers separately for speed.
    const PROVIDER_TIMEOUT_MS = 4000; // Reduced from 5s — curl is faster
    const servers: AnimexServer[] = [];

    // ── Fetch providers in 2 waves for faster VPS response ──
    // Wave 1 (FAST): Top providers that always respond in <2s → return immediately
    // Wave 2 (SLOW): Remaining providers → append if they succeed
    const FAST_PROVIDERS = new Set(["mimi", "beep", "yuki"]);
    const fastJobs = jobs.filter(j => FAST_PROVIDERS.has(j.provider));
    const slowJobs = jobs.filter(j => !FAST_PROVIDERS.has(j.provider));

    const allResults = await Promise.allSettled(
      jobs.map(async (job) => {
        const result = await Promise.race([
          animexSources(anime.slug, epNum, job.type, job.provider),
          new Promise<null>(r => setTimeout(() => r(null), PROVIDER_TIMEOUT_MS)),
        ]);
        if (!result?.sources?.length) return null;

        const p = result.sources.find(s => {
          const u = s.url || "", t = s.type || "";
          return ((u.includes(".m3u8") || t.includes("mpegurl") || (u.includes(".txt") && t.includes("mpegurl")) || u.includes(".mp4")) && !u.includes(".mpd"));
        });
        if (!p?.url) return null;

        const ref = ANIMEX_REFERERS[job.provider] || "https://animex.one/";
        const isM3U8 = p.url.includes(".m3u8") || p.type?.includes("mpegurl");

        // Use the ORIGINAL stream URL through our Cloudflare Worker proxy.
        const streamUrl = p.url;
        const proxyUrl = buildProxyUrl(streamUrl, ref, !isM3U8);

        // ── VERIFICATION REMOVED ──
        // HEAD verification was killing valid servers (CDNs return 403 on HEAD
        // but 200 on GET; signed URLs expire between verify and playback).
        // Return ALL servers — the player retries on failure.

        const isHardsub = !ANIMEX_SOFTSUB.has(job.provider);
        const provName = job.provider[0].toUpperCase() + job.provider.slice(1).toLowerCase();
        const typeTag = job.type === "dub" ? " (Dub)" : (isHardsub ? " (HS)" : "");

        // Priority: all AnimeX servers are in the 2.x range
        const basePriority = ANIMEX_PROVIDER_PRIORITY[job.provider] ?? 2.3;
        const priority = job.type === "dub" ? basePriority + 0.5 : basePriority;

        return {
          id: `animex:${job.provider}:${job.type}`,
          name: `Animex ${provName}${typeTag}`,
          source: "animex" as const,
          provider: job.provider,
          type: job.type,
          quality: p.quality || "auto",
          streamUrl: proxyUrl,
          isM3U8,
          isMP4: !isM3U8,
          hardsub: isHardsub,
          priority,
          subtitleTracks: (result.tracks || []).map((t: any) => {
            const subUrl = t.url || "";
            const proxiedUrl = subUrl.startsWith("/api/") || subUrl.startsWith("blob:")
              ? subUrl
              : `/api/stream?url=${encodeURIComponent(subUrl)}&referer=${encodeURIComponent("https://pp.animex.one/")}`;
            return { url: proxiedUrl, lang: t.lang || "en", label: t.label || t.lang || "English" };
          }),
          intro: result.intro || null,
          outro: result.outro || null,
        };
      })
    );

    for (const r of allResults) {
      if (r.status === "fulfilled" && r.value) servers.push(r.value);
    }

    // ── FILTER + DEDUPE servers ─────────────────────────────────────────────
    // Many AnimeX providers return the SAME stream URL (e.g. mimi, miku, koto,
    // kami, huzz, vee, neko, lolly all return the same vivibebe.site URL).
    // Dedupe by stream URL so only unique streams are shown.
    const seenUrls = new Set<string>();
    const filteredServers = servers.filter(s => {
      if (!s.streamUrl || s.streamUrl.length < 10) return false;
      // Extract the base URL for dedup (strip proxy wrapper to compare real URLs)
      const baseUrl = s.streamUrl.includes("/p/")
        ? s.streamUrl // already proxied — compare full token
        : s.streamUrl.split("?")[0]; // strip query params
      if (seenUrls.has(baseUrl)) return false;
      seenUrls.add(baseUrl);
      return true;
    });

    console.log(`[Animex-Servers] ${filteredServers.length}/${jobs.length} servers for anilistId=${id} ep${epNum} (sub:${subProviders.length} dub:${dubProviders.length})`);

    // Sort by priority (lower = better)
    filteredServers.sort((a, b) => a.priority - b.priority);

    return NextResponse.json({
      anilistId: id,
      episode: epNum,
      servers: filteredServers,
      total: filteredServers.length,
      subProviders,
      dubProviders,
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e: any) {
    return NextResponse.json({
      error: "Animex fetch failed",
      message: e?.message || String(e),
      servers: [],
      total: 0,
    }, { status: 502 });
  }
}
