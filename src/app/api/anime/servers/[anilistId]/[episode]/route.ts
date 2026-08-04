/**
 * GET /api/anime/servers/[anilistId]/[episode]
 *
 * Returns ONLY servers that have a VERIFIED working stream.
 * All servers checked IN PARALLEL (4s timeout each).
 *
 * Sources:
 *   - Animex (miku, yuki, beep, mimi, mochi, uwu, etc.) — HLS m3u8
 *   - AniVault (AnimeHeaven) — MP4 direct
 *   - AniVexa (animegg, allmanga, anikoto) — HLS m3u8 + MP4
 *
 * Each server includes a ready-to-play `streamUrl`.
 */
import { NextRequest, NextResponse } from "next/server";
import { animexGetAnime, animexServers, animexSources } from "@/lib/animex-api";
import {
  fetchAllAniDapSources,
  ANIDAP_PROVIDER_META,
  type AniDapProvider,
} from "@/lib/anidap-api";
import { fetchAniLightSources } from "@/lib/anilight-api";
import { wrapStreamUrl, wrapM3u8Url, wrapM3u8UrlWithReferer } from "@/lib/proxy";
import {
  fetchAllKyrenSources,
  KYREN_SERVER_NAMES,
  type KyrenServer,
} from "@/lib/kyren-api";
import { fetchAnikageSources } from "@/lib/anikage-api";
import { fetchMioAnimeSources } from "@/lib/mioanime-api";
import { fetchAnistreamSources } from "@/lib/anistream-api";
import { fetchAnikuroSources } from "@/lib/anikuro-api";
import { fetchAniPmSources } from "@/lib/anipm-api";
import { fetchAnimeHeavenSources } from "@/lib/animeheaven-api";
// AniWaves removed — not working (user request)
import { fetchAnimePaheSources as fetchAllAnimePaheSources } from "@/lib/animepahe-api";
import { fetchAllOnsenSources, ONSEN_ENABLED } from "@/lib/animeonsen-api";
import { fetchAllReAnimeSources, REANIME_ENABLED } from "@/lib/reanime-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ANIVAULT_API = "https://anivault-scraper.up.railway.app/api/watch/animeheaven";
const ANIVEXA_API = "https://anivexa-api-tawny.vercel.app";
const ANIVAULT_SENSHI = "https://anivault-scraper.up.railway.app/api/watch/senshi"; // broken — CF blocks

// AniVexa providers that work (tested) — reduced to 2 to avoid 60s timeout.
// Each provider × 2 types = 4 candidates, each with up to 8s API + 5s clock.json
// = 13s worst case per candidate. 4 candidates × 13s = 52s (under 60s limit).
// Original 4 providers × 2 = 8 candidates × 13s = 104s (OVER limit → 500 error).
const ANIVEXA_PROVIDERS = ["allmanga", "anineko"] as const;

/**
 * Build a proxy URL using proxy.anikuro.to — the same proxy that was working
 * before. It's a Cloudflare Worker that:
 *   - Rewrites m3u8 manifest (segments + AES keys + sub-playlists)
 *   - Sends correct Referer/Origin headers upstream
 *   - Adds permissive CORS headers for browser playback
 *
 * URL format: https://proxy.anikuro.to/{base64(url|referer)}.{m3u8|mp4}
 *
 * Note: Anikuro does NOT work for some Cloudflare-protected CDNs (e.g.
 * vault-XX.uwucdn.top from AniDap) — it returns 500 for those. AniDap
 * streams use their own buildAniDapProxyUrl() (also via Anikuro) defined
 * in /lib/anidap-api.ts. Subtitle URLs from AniDap use our own scraper
 * stream proxy because Anikuro 500s on those.
 */
/**
 * Build a playable URL for a stream using the 3-tier proxy system.
 * Uses wrapM3u8UrlWithReferer so the source-provided Referer is encoded in the token.
 */
function buildProxyUrl(streamUrl: string, referer: string, isMP4: boolean = false): string {
  if (isMP4) return wrapStreamUrl(streamUrl);
  return wrapM3u8UrlWithReferer(streamUrl, referer);
}

/**
 * Hard ceiling on a provider promise.
 *
 * Several sources in the fan-out below accept no timeout option at all
 * (fetchRawEpisodes, the animex slug->servers chain, the AniVault fetches,
 * fetchAllAnimePaheSources), so a single slow upstream set the runtime for the
 * whole route — measured at 93-180s against this function's 60s maxDuration,
 * which meant Vercel killed it and NONE of the 17 providers reached the player.
 * Promise.allSettled waits for the slowest member; this makes "slowest" bounded.
 *
 * Resolves to `fallback` on timeout rather than rejecting, so one dead provider
 * is simply an empty slot instead of a lost response.
 */
function withTimeout<T>(p: Promise<T> | T, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    Promise.resolve(p).catch(() => fallback),
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const ANIMEX_REFERERS: Record<string, string> = {
  beep: "https://animex.one/", mimi: "https://animex.one/",
  vee: "https://www.animeonsen.xyz/", yuki: "https://megaplay.buzz/",
  miku: "https://allanime.uns.bio", neko: "https://animeverse.to/",
  huzz: "https://kem.clvd.xyz/", mochi: "https://animex.one",
  uwu: "https://allanime.uns.bio", koto: "https://allanime.uns.bio",
  kiwi: "https://anidb.app/", kami: "https://animex.one/",
  sax: "https://animex.one/", yume: "https://animex.one/",
};

interface VerifiedServer {
  id: string;
  name: string;
  source: "animex" | "anivault" | "anivexa" | "senshi" | "anidap" | "anilight" | "kyren" | "anikage" | "mioanime" | "anixtv" | "anistream" | "anikuro" | "anipm" | "animeheaven" | "animepahe" | "animeonsen" | "reanime" | "animo4" | "animostream" | "anibd";
  provider: string;
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed?: boolean;
  isDASH?: boolean;  // DASH .mpd stream (AnimeOnsen — needs dash.js player)
  /**
   * Whether this stream has subtitles burned into the video (hard sub) vs
   * provided as a separate VTT track (soft sub). Used by the watch-page UI
   * to filter servers when the user picks "Hard Sub" vs "Soft Sub".
   *
   * Mapping:
   *   - AniDap beep/meme/uwu/kuro/sax/yume (under type=sub) → hardsub=true
   *   - AniDap mimi/mochi/uwu/kuro/sax/yume (under type=dub) → harddub=true
   *     (but we still mark hardsub=true since subs are burned in)
   *   - AniDap vee/yuki/miku/neko (under type=sub) → hardsub=false (soft sub)
   *   - Animex beep/mimi/miku/uwu/etc → hardsub=true (Animex doesn't do soft sub)
   *   - AniLight → hardsub=false (returns WebVTT subtitle tracks)
   *   - Kyren → hardsub=false (returns optional WebVTT subtitle tracks)
   *   - AniVexa/Senshi/AniVault → unknown, default false
   */
  hardsub?: boolean;
  /** Optional WebVTT subtitle tracks (AniDap/AniLight providers include these) */
  subtitleTracks?: Array<{ url: string; lang: string; label: string }>;
  /** Optional intro chapter for auto-skip */
  intro?: { start: number; end: number } | null;
  /** Optional outro chapter for auto-skip */
  outro?: { start: number; end: number } | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid anilistId" }, { status: 400 });
  }

  /**
   * Provider group. Everything in one request measured 98-173s against a 60s
   * maxDuration, so Vercel killed it and the player got NOTHING — capping the
   * providers hard enough to fit meant silently dropping miruro/animex, the two
   * highest-priority sources.
   *
   * Splitting instead: the client fires ?group=fast and ?group=slow in
   * parallel, so each half gets its own 60s budget and merges as it lands.
   * Nothing is dropped; the slow half just shows up later.
   *
   * ?group=all (the default) preserves the original single-request behaviour
   * for any caller that isn't group-aware.
   */
  const group = (_req.nextUrl.searchParams.get("group") || "all").toLowerCase();
  const wantFast = group === "all" || group === "fast";
  const wantSlow = group === "all" || group === "slow";
  // The slow half is alone in its request, so it can afford real patience.
  const SLOW_CAP = group === "slow" ? 45000 : 12000;

  try {
  // ─── Resolve anime title from AniList (needed for AnixTV search) ────────────
  // AnixTV's watch URL requires the anime title as a query param — without it,
  // AnixTV can't find the anime and returns no iframe → no hindi servers.
  let animeTitle = "Anime";
  let animeTitles: { english?: string; romaji?: string; native?: string } = {};
  let animeSeason = 1;  // hoisted out of try-block so AnixTV block can use it
  try {
    const titleRes = await Promise.race([
      fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query($id:Int){Media(id:$id,type:ANIME){id title{english romaji native}}}`,
          variables: { id },
        }),
      }),
      new Promise<Response | null>(r => setTimeout(() => r(null), 5000)),
    ]);
    if (titleRes && titleRes.ok) {
      const titleData = await titleRes.json();
      const t = titleData?.data?.Media?.title;
      animeTitles = { english: t?.english, romaji: t?.romaji, native: t?.native };
      animeTitle = t?.english || t?.romaji || t?.native || "Anime";
    }

    // Also fetch the anime's season + relations to determine the correct
    // season number for AnixTV (e.g. Slime S4 → season=4, not 1)
    //
    // Two strategies:
    //   1. Title heuristic: parse "Season N" / "S2" / "Part 2" from the title
    //      (most reliable for sequels that include the season number in title)
    //   2. AniList relation walk: count PREQUEL chain (any format — TV, ONA,
    //      OVA, MOVIE, SPECIAL — AniList sometimes lists OVAs as the prequel
    //      for sequel seasons, e.g. Slime S2 → "Visions of Coleus" OVA → S1)
    try {
      // Strategy 1: title heuristic
      const titleForSeason = animeTitles.english || animeTitles.romaji || animeTitle;
      const seasonMatch = titleForSeason.match(/\bSeason\s+(\d+)\b/i)
                       || titleForSeason.match(/\bS(\d{1,2})\b\s*$/i);
      if (seasonMatch) {
        const parsed = parseInt(seasonMatch[1], 10);
        if (parsed >= 1 && parsed <= 30) {
          animeSeason = parsed;
          console.log(`[Servers] AnixTV season from title: ${animeTitle} → season ${animeSeason}`);
        }
      }

      // Strategy 2: AniList relation walk (if title heuristic didn't fire)
      if (animeSeason === 1) {
        const seasonRes = await Promise.race([
          fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `query($id:Int){Media(id:$id,type:ANIME){id idMal season seasonYear format relations{edges{relationType node{id title{english romaji} format}}} } }`,
              variables: { id },
            }),
          }),
          new Promise<Response | null>(r => setTimeout(() => r(null), 5000)),
        ]);
        if (seasonRes && seasonRes.ok) {
          const seasonData = await seasonRes.json();
          const media = seasonData?.data?.Media;
          if (media?.relations?.edges) {
            // Include ALL formats in the prequel walk — AniList sometimes
            // lists OVAs/specials/movies as the prequel for a sequel season.
            const prequels = media.relations.edges.filter(
              (e: any) => e.relationType === "PREQUEL"
            );
            if (prequels.length > 0) {
              let count = 1;
              let currentPrequel = prequels[0];
              const visited = new Set<number>([id]);
              for (let i = 0; i < 15; i++) {
                if (!currentPrequel?.node?.id) break;
                if (visited.has(currentPrequel.node.id)) break;
                visited.add(currentPrequel.node.id);
                try {
                  const prequelRes = await fetch("https://graphql.anilist.co", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      query: `query($id:Int){Media(id:$id,type:ANIME){relations{edges{relationType node{id format title{english}}}} } }`,
                      variables: { id: currentPrequel.node.id },
                    }),
                  });
                  if (prequelRes.ok) {
                    const prequelData = await prequelRes.json();
                    const prequelEdges = prequelData?.data?.Media?.relations?.edges || [];
                    const nextPrequel = prequelEdges.find(
                      (e: any) => e.relationType === "PREQUEL"
                    );
                    if (nextPrequel) {
                      count++;
                      currentPrequel = nextPrequel;
                    } else {
                      count++;
                      break;
                    }
                  } else break;
                } catch { break; }
              }
              animeSeason = count;
            }
          }
          console.log(`[Servers] AnixTV season from relations: ${animeTitle} → season ${animeSeason}`);
        }
      }
    } catch { /* fallback to season 1 */ }
  } catch { /* fallback to "Anime" */ }

  // ─── Gather all candidate servers in parallel ─────────────────────
  interface Candidate {
    id: string; name: string;
    source: "animex" | "anivault" | "anivexa" | "senshi" | "anidap";
    provider: string; type: "sub" | "dub";
  }
  const candidates: Candidate[] = [];

  // ── INCREASED TIMEOUTS: each source gets more time to respond ──
  // Old: AniDap=4s, others=5-6s. New: AniDap=8s, others=8-10s.
  // This fixes AniDap servers not showing (4s was too short).
  const ANIDAP_TIMEOUT = 8000;
  const OTHER_TIMEOUT = 8000;

  // Fire AniDap resolver + sources fetch in parallel with the other sources.
  // AniDap gives us 11 providers × 2 types (sub/dub) — all verified playable.
  // Also fire AniLight + Kyren + AniKuro + AnimePahe in parallel — all return direct-playable streams.
  // Every entry is capped at FANOUT_TIMEOUT so the fan-out can't outlive the
  // route's budget. Providers that accept their own timeoutMs keep it (it fires
  // first and lets them fail cleanly); this is the backstop for the ones that
  // don't, which is what was pushing the route past 60s.
  const FANOUT_TIMEOUT = 12000;
  const [miruroRaw, animexData, anivaultSub, anivaultDub, anidapResults, anilightResults, kyrenResults, anikageResults, mioanimeResults, anistreamResults, anikuroResults, anipmResults, animetsuResults, animeheavenResults, animepaheResults, onsenResults, reanimeResults] = await Promise.allSettled(([
    // ── SLOW group ── these are the ones that blew the budget; they get the
    // whole 45s of their own request rather than being cut to fit alongside.
    // REMOVED: Miruro. Its episodes endpoint returns HTTP 403 (measured: fails
    // in ~172ms with providers: NONE), so it contributed nothing but a slot.
    // Miruro is still used for anime METADATA elsewhere — this is streams only.
    Promise.resolve(null),  // miruroRaw — provider removed
    wantSlow ? withTimeout<any>((async () => {
      const anime = await animexGetAnime(id);
      if (!anime?.slug) return null;
      return { slug: anime.slug, servers: await animexServers(anime.slug, epNum) };
    })(), SLOW_CAP, null) : Promise.resolve(null),
    wantSlow ? withTimeout<any>(fetch(`${ANIVAULT_API}/${id}/${epNum}/sub?server=AnimeHeaven`).then(r => r.ok ? r.json() : null).catch(() => null), SLOW_CAP, null) : Promise.resolve(null),
    wantSlow ? withTimeout<any>(fetch(`${ANIVAULT_API}/${id}/${epNum}/dub?server=AnimeHeaven`).then(r => r.ok ? r.json() : null).catch(() => null), SLOW_CAP, null) : Promise.resolve(null),
    // AniDap and AniKuro are fetched SEPARATELY via dedicated endpoints
    // (they're slow and were blocking the main servers route).
    // Watch page fetches them in parallel via /api/anime/{anidap,anikuro}-servers/
    Promise.resolve([] as any[]),  // anidapResults — fetched separately
    wantFast ? fetchAniLightSources(id, epNum, { sub: true, dub: true, timeoutMs: OTHER_TIMEOUT }) : Promise.resolve([] as any[]),
    wantFast ? fetchAllKyrenSources(id, epNum, { sub: true, dub: true, timeoutMs: OTHER_TIMEOUT }) : Promise.resolve([] as any[]),
    wantFast ? fetchAnikageSources(id, epNum, { timeoutMs: OTHER_TIMEOUT }) : Promise.resolve([] as any[]),
    wantFast ? fetchMioAnimeSources(id, epNum, { timeoutMs: OTHER_TIMEOUT }) : Promise.resolve([] as any[]),
    // Anistream.one: uses api.anistream.one (OWN REST API, NOT Cloudflare-protected).
    // Returns DIRECT stream URLs — no XOR wrapper, no cdn.animex.su needed.
    // Has embed providers too (ok.ru, mp4upload) for some servers.
    wantFast ? fetchAnistreamSources(id, epNum, { sub: true, dub: true, timeoutMs: OTHER_TIMEOUT }) : Promise.resolve([] as any[]),
    Promise.resolve([] as any[]),  // anikuroResults — fetched separately
    // Played as iframe embeds (kwik.cx blocks server-side scraping).
    // Ani.pm: Full scraper with categorized servers (Nova, Halo, Lyra, Cobalt, Orion, etc.)
    // Returns HLS (via worker proxy), MP4, and embed URLs.
    wantFast ? fetchAniPmSources(id, epNum, { sub: true, dub: true, timeoutMs: OTHER_TIMEOUT }) : Promise.resolve([] as any[]),
    Promise.resolve([] as any[]),  // animetsuResults — provider removed
    // AnimeHeaven.me — direct MP4 streams
    wantFast ? fetchAnimeHeavenSources(id, epNum, { timeoutMs: OTHER_TIMEOUT }) : Promise.resolve([] as any[]),
    // AnimePahe: external scraper with Cloudflare bypass (env-configured).
    // Skipped silently if ANIMEPAHE_SCRAPER_URL and ANIMEPAHE_CF_CLEARANCE are not set.
    wantSlow
      ? withTimeout<any>(fetchAllAnimePaheSources(id, epNum, animeTitles.english || animeTitles.romaji || ""), SLOW_CAP, [])
      : Promise.resolve([] as any[]),
    // AnimeOnsen: DASH .mpd streams with ASS subtitles (self-hosted CDN)
    ONSEN_ENABLED && wantSlow
      ? withTimeout<any>(fetchAllOnsenSources(id, epNum, animeTitles, { sub: true, dub: false, timeoutMs: SLOW_CAP }), SLOW_CAP, [])
      : Promise.resolve([] as any[]),
    // ReAnime: FlixCLOUD streaming via reanime.to — uses AniList ID directly
    // Returns m3u8 (if decryption succeeds) or embed URLs (if CF blocks decryption)
    REANIME_ENABLED && wantSlow
      ? withTimeout<any>(fetchAllReAnimeSources(id, epNum, animeTitles, { sub: true, dub: true, timeoutMs: SLOW_CAP }), SLOW_CAP, [])
      : Promise.resolve([] as any[]),
  ] as Promise<any>[]).map(p => withTimeout<any>(p, FANOUT_TIMEOUT, null)));

  // Animex — NOT included in the main servers endpoint.
  // Animex has its own dedicated endpoint: /api/anime/animex-servers/{id}/{ep}
  // The watch page fetches it separately so it doesn't compete for the 30s timeout.
  // Animex servers appear in the watch page after they finish loading.
  let animexSlug: string | null = null;
  if (animexData.status === "fulfilled" && animexData.value) {
    animexSlug = animexData.value.slug;
  }
  // No animexVerified here — it's fetched separately by the watch page.

  // AniVault (AnimeHeaven)
  if (anivaultSub.status === "fulfilled" && anivaultSub.value?.mp4) {
    candidates.push({ id: "anivault:animeheaven:sub", name: "NH-1", source: "anivault", provider: "AnimeHeaven", type: "sub" });
  }
  if (anivaultDub.status === "fulfilled" && anivaultDub.value?.mp4) {
    candidates.push({ id: "anivault:animeheaven:dub", name: "NH-1 Dub", source: "anivault", provider: "AnimeHeaven", type: "dub" });
  }

  // AniVexa (animegg, allmanga, anikoto, anineko)
  for (const prov of ANIVEXA_PROVIDERS) {
    for (const cat of ["sub", "dub"] as const) {
      candidates.push({
        id: `anivexa:${prov}:${cat}`,
        name: (() => { const m: Record<string,string> = { anineko: "NV-1", allmanga: "NA-1" }; return `${m[prov] || prov}${cat === "dub" ? " (Dub)" : ""}`; })(),
        source: "anivexa", provider: prov, type: cat,
      });
    }
  }

  // Senshi via AniVault anikoto source (CF bypass)
  // Only add 1 server (sub) to keep verification fast — dub is rarely used
  candidates.push({ id: "senshi:VidPlay-1:sub", name: "NS-1", source: "senshi", provider: "VidPlay-1", type: "sub" });

  // AniDap results are ALREADY verified playable (fetchAllAniDapSources filters out
  // providers with no playable stream). We push them straight into the final list
  // — no need to re-verify each one. We also pass through subtitles + intro/outro.
  const anidapVerified: VerifiedServer[] = [];
  if (anidapResults.status === "fulfilled" && anidapResults.value) {
    for (const r of anidapResults.value) {
      const meta = ANIDAP_PROVIDER_META[r.provider as AniDapProvider];
      const provName = meta?.name || (r.provider[0].toUpperCase() + r.provider.slice(1));
      const typeTag = r.type === "dub" ? " (Dub)" : (meta?.hardsub ? " (HS)" : "");
      // Detect embed URLs (ok.ru, mp4upload) — these need iframe playback
      const isEmbedUrl = r.streamUrl.includes("ok.ru/videoembed")
                      || r.streamUrl.includes("mp4upload.com/embed")
                      || r.streamUrl.includes("streamlare.com/e/")
                      || r.streamUrl.includes("streamsb.net/e/");
      anidapVerified.push({
        id: `anidap:${r.provider}:${r.type}`,
        name: `ND-${provName.slice(1)}${typeTag}`,
        source: "anidap",
        provider: r.provider,
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: isEmbedUrl,
        // Mark hardsub servers — from AniDap's metadata
        hardsub: meta?.hardsub === true,
        subtitleTracks: r.tracks.map(t => ({ url: t.url, lang: t.lang, label: t.label })),
        intro: r.intro,
        outro: r.outro,
      });
    }
    console.log(`[Servers] AniDap: ${anidapVerified.length} verified streams (already pre-checked)`);
  }

  // AniLight results — pre-verified playable, direct CDN URLs (no proxy needed).
  // AniLight results — includes BOTH:
  //   1. Quality variants (1080p, 720p, 360p) from /api/watch/mal — direct ESA CDN
  //   2. Death Note servers (Light, Near, Ryu, Misa, Kiwi, Misora, Raye, Rem) from /api/sources
  // All show with "AniLight" prefix.
  const anilightVerified: VerifiedServer[] = [];
  if (anilightResults.status === "fulfilled" && anilightResults.value) {
    for (const [alIdx, r] of anilightResults.value.entries()) {
      // Capitalize first letter for display
      const serverDisplay = r.server.charAt(0).toUpperCase() + r.server.slice(1);
      const typeTag = r.type === "dub" ? " (Dub)" : (r.hardsub ? " (HS)" : "");
      anilightVerified.push({
        id: `anilight:${r.server}:${r.type}`,
        name: `NL-${(alIdx+1)}${typeTag}`,
        source: "anilight",
        provider: r.server,
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        hardsub: r.hardsub,
        subtitleTracks: r.tracks.map(t => ({ url: t.url, lang: t.lang, label: t.label })),
      });
    }
    console.log(`[Servers] AniLight: ${anilightVerified.length} servers (quality variants + Death Note servers)`);
  }

  // Kyren results — pre-verified playable, HLS through kyren's CF Worker (permissive CORS)
  const kyrenVerified: VerifiedServer[] = [];
  if (kyrenResults.status === "fulfilled" && kyrenResults.value) {
    for (const [krIdx, r] of kyrenResults.value.entries()) {
      const serverName = KYREN_SERVER_NAMES[r.server as KyrenServer] || r.server;
      kyrenVerified.push({
        id: `kyren:${r.server}:${r.type}`,
        name: `NK-${krIdx+1}${r.type === "dub" ? " (Dub)" : ""}`,
        source: "kyren",
        provider: r.server,
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        // Kyren streams are soft sub (return optional WebVTT subtitle tracks)
        hardsub: false,
        subtitleTracks: r.tracks.map(t => ({ url: t.url, lang: t.lang, label: t.label || t.lang })),
      });
    }
    console.log(`[Servers] Kyren: ${kyrenVerified.length} verified streams (HLS via kyren Worker)`);
  }

  // Anikage results — HLS (prox.anikage.cc) + embeds (otakuvid, otakuhg, vibeplayer, etc.)
  const anikageVerified: VerifiedServer[] = [];
  if (anikageResults.status === "fulfilled" && anikageResults.value) {
    for (const [akIdx, r] of anikageResults.value.entries()) {
      const serverName = r.server.charAt(0).toUpperCase() + r.server.slice(1);
      const typeTag = r.type === "dub" ? " (Dub)" : (r.hardsub ? " (HS)" : "");
      anikageVerified.push({
        id: `anikage:${r.server}:${r.type}`,
        name: `NK-${akIdx+5}${typeTag}`,
        source: "anikage",
        provider: r.server,
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: r.isEmbed === true,
        hardsub: r.hardsub,
        subtitleTracks: r.tracks,
        intro: r.intro,
        outro: r.outro,
      });
    }
    console.log(`[Servers] Anikage: ${anikageVerified.length} servers`);
  }

  // MioAnime results — AniZone + Verse + Senshi + AllAnime (4 sources)
  const mioanimeVerified: VerifiedServer[] = [];
  if (mioanimeResults.status === "fulfilled" && mioanimeResults.value) {
    for (const [maIdx, r] of mioanimeResults.value.entries()) {
      const typeTag = r.type === "dub" ? " (Dub)" : (r.hardsub ? " (HS)" : "");
      const maNameMap: Record<string, string> = { "AniZone": "L1", "MegaPlay": "L2", "Senshi": "L3", "AniDB": "L4", "AnimeSalt": "L5", "AniBD": "L6", "AnimeNexus": "L7", "AllAnime": "NA-1" };
      const maDisplayName = maNameMap[r.name] || r.name;
      mioanimeVerified.push({
        id: r.id,
        name: `${maDisplayName}${typeTag}`,
        source: "mioanime",
        provider: r.id,
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: (r as any).isEmbed === true,
        hardsub: r.hardsub,
        subtitleTracks: r.subtitleTracks,
      });
    }
    console.log(`[Servers] MioAnime: ${mioanimeVerified.length} servers`);
  }

  // AnixTV (anixtv.in) — Hindi dubbed anime via the legacy hindi_1_player URL.
  //
  // Per user request (2026-07-18):
  //   "only this will show ... only this route it with anilist"
  //   https://anixtv.in/anime-watch?action=hindi_1_player&id={anilistId}
  //     &season={season}&episode={ep}&title={title}
  //
  // The hindi_1_player URL returns an iframe pointing to as-cdn21.top which
  // serves a multi-audio HLS stream (Hindi + English + Japanese audio tracks).
  //
  // - season is calculated from AniList prequel relations (Slime S4 has 3
  //   prequels → season=4). Falls back to season=1 if calculation fails.
  // - Always add the URL for ANY anime (no isHindiAnime gate — user wants
  //   it shown regardless; the player itself handles "not available" cases)
  // - Removed the 10 generic AnixTV embeds (TryEmbed/MegaPlay/VidNest/
  //   AnimePahe/Videasy × sub/dub) — those were noise the user didn't want
  // MOVED OUT: AnixTV Hindi now lives in its own route,
  // /api/anime/anixtv-servers/[anilistId]/[episode], fetched by the client in
  // parallel. It needs no scraping, so waiting behind this route's 17-provider
  // fan-out (measured 26-105s, past the 60s maxDuration) meant Hindi was the
  // one mode that never survived to the player. The season number is also
  // computed correctly there — TV-format prequels only.
  const anixtvVerified: VerifiedServer[] = [];

  // 4animo.xyz — sub/dub embeds from cdn.4animo.xyz
  // Uses AniList ID to search 4animo's catalog, then fetches the embed URL
  // from /stream/getSources API (returns subtitles + intro/outro skip times).
  // Returns 1 sub + 1 dub per anime (if both exist).
  const animo4Verified: VerifiedServer[] = [];
  try {
    if (!wantSlow) throw new Error("skip: fast group");
    const { searchAnimo4, resolveAnimo4Streams } = await import("@/lib/animo4-direct");
    // 4animo stores titles without colons — normalize for matching.
    // Also try the romaji title if english doesn't match.
    const normTitle = (t: string) => t.toLowerCase().replace(/[:',.\-!]/g, "").replace(/\s+/g, " ").trim();
    const titlesToTry = [animeTitles.english, animeTitles.romaji, animeTitle].filter(Boolean) as string[];
    let best: any = null;
    for (const t of titlesToTry) {
      // Capped: this loop runs up to 3 times sequentially, after the fan-out,
      // with no timeout of its own — one of the two blocks that kept this route
      // at 98-173s even once the fan-out itself was bounded.
      const matches = await withTimeout<any[]>(searchAnimo4(t), SLOW_CAP, []);
      if (matches.length === 0) continue;
      // Pick best match — exact normalized title match preferred
      const norm = normTitle(t);
      best = matches.find(m => normTitle(m.title) === norm)
          || matches.find(m => normTitle(m.title).startsWith(norm))
          || matches[0];
      if (best) break;
    }
    if (best) {
      const streams = await withTimeout<any[]>(resolveAnimo4Streams(best.id, epNum, best.slug, ["sub", "dub"]), SLOW_CAP, []);
      for (const r of streams) {
        animo4Verified.push({
          id: `animo4:${best.id}:${r.type}:${r.serverName}`,
        name: `NF-1 ${r.serverName}${r.type === "dub" ? " (Dub)" : ""}`,
          source: "animo4",
          provider: r.serverName.toLowerCase().replace(/\s/g, ""),
          type: r.type,
          quality: r.quality,
          streamUrl: r.streamUrl,
          isM3U8: r.isM3U8,
          isMP4: r.isMP4,
          isEmbed: r.isEmbed,
          hardsub: false,
          subtitleTracks: r.subtitleTracks || [],
          intro: r.intro || null,
          outro: r.outro || null,
        });
      }
      console.log(`[Servers] 4animo: ${animo4Verified.length} servers (matched "${best.title}" id=${best.id})`);
    } else {
      console.log(`[Servers] 4animo: no match for "${animeTitle}"`);
    }
  } catch (e: any) {
    console.log(`[Servers] 4animo: error — ${e?.message || e}`);
  }

  // animostream.com — Hindi-dubbed anime (Blogger feed, 240 entries)
  // Search by title, then fetch the per-post animeData to find stream URLs.
  // Each anime has 2 servers (Abyss + StreamTape) per episode, all Hindi dub.
  //
  // Per user request (2026-07-18):
  //   "i dont care is animostream return embed or m3u you have ad it ok stupid
  //    ass its not showing you have to ad it all animes ok"
  //   "prorpley make a scrape and ad it"
  //
  // MOVED OUT: AnimoStream Hindi now lives in its own route,
  // /api/anime/animostream-hindi/[anilistId]/[episode], fetched by the client
  // in parallel. Like AnixTV it was stranded behind this route's 17-provider
  // fan-out (measured 26-105s vs a 60s maxDuration), so the Hindi fallback
  // never survived to the player even for the ~250 titles it does carry.
  const animostreamVerified: VerifiedServer[] = [];

  // anibd.app — direct m3u8 streams (no login, CORS-enabled)
  // Uses AniList ID directly → epeng.animeapps.top/api2.php → apilink.php → m3u8
  const anibdVerified: VerifiedServer[] = [];
  try {
    if (!wantSlow) throw new Error("skip: fast group");
    const { resolveAnibdStreams } = await import("@/lib/anibd-direct");
    // Capped for the same reason as the 4animo block above — sequential,
    // post-fan-out, and previously unbounded.
    const streams = await withTimeout<any[]>(resolveAnibdStreams(id, epNum), SLOW_CAP, []);
    for (const r of streams) {
      anibdVerified.push({
        id: `anibd:${r.serverName}:${r.type}`,
        name: `NB-1 ${r.serverName}${r.type === "dub" ? " (Dub)" : ""}`,
        source: "anibd",
        provider: r.serverName.toLowerCase().replace(/\s/g, ""),
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: r.isEmbed,
        hardsub: false,
        subtitleTracks: r.subtitleTracks || [],
        intro: r.intro || null,
        outro: r.outro || null,
      });
    }
    console.log(`[Servers] AniBD: ${anibdVerified.length} servers`);
  } catch (e: any) {
    console.log(`[Servers] AniBD: error — ${e?.message || e}`);
  }

  // Anistream.one (api.anistream.one — OWN REST API, not CF-protected)
  // Returns DIRECT stream URLs — no XOR wrapper, no cdn.animex.su needed.
  // Has embed providers (ok.ru, mp4upload) + HLS providers (beep, yuki, mimi, mochi).
  const anistreamVerified: VerifiedServer[] = [];
  if (anistreamResults.status === "fulfilled" && anistreamResults.value) {
    for (const [asIdx, r] of anistreamResults.value.entries()) {
      const provName = r.server[0].toUpperCase() + r.server.slice(1);
      const typeTag = r.type === "dub" ? " (Dub)" : (r.hardsub ? " (HS)" : "");
      anistreamVerified.push({
        id: `anistream:${r.server}:${r.type}`,
        name: `NI-${asIdx+1}${typeTag}`,
        source: "anistream",
        provider: r.server,
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: r.isEmbed,
        hardsub: r.hardsub,
        subtitleTracks: r.tracks,
        intro: r.intro,
        outro: r.outro,
      });
    }
    console.log(`[Servers] Anistream: ${anistreamVerified.length} servers`);
  }

  // AniKuro.ru (Russian aggregator — 11 providers: animepahe, anikoto, animegg, etc.)
  // Returns proxy.anikuro.ru URLs (base64-encoded, CORS enabled, directly playable).
  const anikuroVerified: VerifiedServer[] = [];
  if (anikuroResults.status === "fulfilled" && anikuroResults.value) {
    const PROVIDER_NAMES: Record<string, string> = {
      animepahe: "AnimePahe", anikoto: "AniKoto", reanime: "ReAnime",
      animedao: "AnimeDao", animegg: "AnimeGG", anidb: "AniDB",
      animedunya: "AnimeDunya", animeverse: "AnimeVerse", allani: "AllAnime",
      senshi: "Senshi", animix: "AniMix",
    };
    for (const [akruIdx, r] of anikuroResults.value.entries()) {
      const provName = PROVIDER_NAMES[r.provider] || (r.provider[0].toUpperCase() + r.provider.slice(1));
      const typeTag = r.type === "dub" ? " (Dub)" : "";
      anikuroVerified.push({
        id: `anikuro:${r.provider}:${r.type}`,
        name: `NQ-${akruIdx+1}${typeTag}`,
        source: "anikuro",
        provider: r.provider,
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        hardsub: r.hardsub,
        subtitleTracks: r.tracks,
        intro: r.intro,
        outro: r.outro,
      });
    }
    console.log(`[Servers] AniKuro: ${anikuroVerified.length} servers`);
  }

  // Ani.pm results — only HLS + MP4 servers (skip embeds to avoid duplicates)
  // Each server gets a unique ID based on provider + name + type to prevent
  // the watch page from treating different servers as the same one.
  const anipmVerified: VerifiedServer[] = [];
  if (anipmResults.status === "fulfilled" && anipmResults.value) {
    const seenAnipm = new Set<string>();  // dedupe by provider+name+type
    for (const [apmIdx, r] of anipmResults.value.entries()) {
      // Skip embed URLs — they duplicate the HLS servers and cause confusion
      if (r.isEmbed) continue;

      // Dedupe by provider+name+type (in case API returns same server twice)
      const dedupeKey = `${r.provider}:${r.name}:${r.type}`;
      if (seenAnipm.has(dedupeKey)) continue;
      seenAnipm.add(dedupeKey);

      // Unique ID: anipm:provider:name:type (e.g. anipm:Lyra:Lyra·3:sub)
      const safeName = r.name.replace(/[^a-zA-Z0-9]/g, "");
      anipmVerified.push({
        id: `anipm:${r.provider}:${safeName}:${r.type}`,
        name: `NP-${apmIdx+1}`,
        source: "anipm",
        provider: r.provider,
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: false,
        hardsub: r.hardsub,
        subtitleTracks: r.tracks,
        intro: null,
        outro: null,
      });
    }
    console.log(`[Servers] AniPm: ${anipmVerified.length} servers (HLS only, deduped)`);
  }

  // REMOVED: Animetsu (provider retired).
  const animetsuVerified: VerifiedServer[] = [];

  // AnimeHeaven results — direct MP4 streams
  const animeheavenVerified: VerifiedServer[] = [];
  if (animeheavenResults.status === "fulfilled" && animeheavenResults.value) {
    for (const r of animeheavenResults.value) {
      animeheavenVerified.push({
        id: `animeheaven:${r.provider}:sub`,
        name: `NH-1`,
        source: "animeheaven",
        provider: r.provider,
        type: "sub",
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: false,
        hardsub: false,
        subtitleTracks: [],
        intro: null,
        outro: null,
      });
    }
    console.log(`[Servers] AnimeHeaven: ${animeheavenVerified.length} servers`);
  }

  // AniWaves removed — not working (user request). Block deleted.

  console.log(`[Servers] ${candidates.length} candidates — verifying in parallel...`);

  // ─── Verify ALL in parallel (4s timeout each) ─────────────────────
  const verifyPromises = candidates.map(async (c): Promise<VerifiedServer | null> => {
    try {
      // Animex servers are pre-built from AniDap's results (above) — skip verify
      if (c.source === "anivault") {
        const data = c.type === "dub" ? (anivaultDub.status === "fulfilled" ? anivaultDub.value : null) : (anivaultSub.status === "fulfilled" ? anivaultSub.value : null);
        if (data?.streamUrl) {
          return { ...c, quality: "MP4", streamUrl: data.streamUrl, isM3U8: !!data.m3u8, isMP4: !!data.mp4 };
        }
      }
      if (c.source === "anivexa") {
        // Fetch from AniVexa API (5s timeout — was 8s, caused 60s limit breaches)
        const res = await Promise.race([
          fetch(`${ANIVEXA_API}/watch/${c.provider}/${id}/${c.type}/${c.provider}-${epNum}`).then(r => r.ok ? r.json() : null),
          new Promise<null>(r => setTimeout(() => r(null), 5000)),
        ]);
        if (res) {
          let streamUrl: string | null = null;
          let streamReferer: string = "https://allmanga.to/";
          let quality: string = "auto";
          let isM3U8 = true;
          let isMP4 = false;

          if (c.provider === "animegg") {
            // Animegg returns MP4 streams in multiple qualities (360p, 480p, 720p, 1080p)
            // Pick the highest quality MP4 available
            const streams = (res.streams || []).filter((s: any) => s.type === "mp4" && s.url);
            // Prefer 1080p, then 720p, then 480p, then 360p, then first
            const qualityOrder = ["1080p", "720p", "480p", "360p"];
            const playable = streams.find((s: any) => s.quality === "1080p")
                          || streams.find((s: any) => s.quality === "720p")
                          || streams.find((s: any) => qualityOrder.includes(s.quality))
                          || streams[0];
            if (playable) {
              streamUrl = playable.url;
              streamReferer = playable.referer || "https://www.animegg.org/";
              quality = playable.quality || "auto";
              isMP4 = true;
              isM3U8 = false;
            }
          } else if (c.provider === "allmanga") {
            // AllManga returns 7 sources — 3 are clock.json resolvers (→ HLS m3u8),
            // 4 are iframe embeds (streamsb, mp4upload, ok.ru, streamlare — skip).
            // Resolve ALL clock.json sources and pick the first that returns HLS.
            const sources = res.sources || [];
            const clockSources = sources.filter((s: any) => s.url && s.url.includes("clock.json"));
            const ref = "https://allmanga.to";
            const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";
            for (const cs of clockSources) {
              try {
                const clockRes = await Promise.race([
                  fetch(cs.url, { headers: { Referer: ref, "User-Agent": ua }, cache: "no-store" }).then(r => r.ok ? r.json() : null),
                  new Promise<null>(r => setTimeout(() => r(null), 3000)),
                ]);
                if (clockRes?.links?.length) {
                  const hlsLink = clockRes.links.find((l: any) => l.hls) || clockRes.links[0];
                  if (hlsLink?.link) {
                    streamUrl = hlsLink.link;
                    streamReferer = ref;
                    quality = hlsLink.resolutionStr || cs.name || "auto";
                    isM3U8 = true;
                    isMP4 = false;
                    break; // Use first working clock.json source
                  }
                }
              } catch {
                // try next clock source
              }
            }
          } else if (c.provider === "anikoto") {
            // Anikoto returns ssub.streams[] / sdub.streams[]
            const key = c.type === "dub" ? "sdub" : "ssub";
            const streams = (res[key]?.streams || []).filter((s: any) => s.type === "hls" && s.url);
            if (streams.length > 0) {
              streamUrl = streams[0].url;
              streamReferer = streams[0].referer || "https://megaplay.buzz/";
              quality = streams[0].server || "auto";
              isM3U8 = true;
              isMP4 = false;
            }
          } else if (c.provider === "anineko") {
            // AniNeko returns streams[] directly (same as animegg shape)
            const streams = (res.streams || []).filter((s: any) => s.type === "hls" && s.url);
            if (streams.length > 0) {
              streamUrl = streams[0].url;
              streamReferer = streams[0].referer || "https://vibeplayer.site/";
              quality = streams[0].server || "auto";
              isM3U8 = true;
              isMP4 = false;
            }
          }

          if (streamUrl) {
            // For MP4, use mode=segment (no manifest rewriting needed)
            // For HLS, use mode=manifest (needs URL rewriting)
            const mode = isMP4 ? "segment" : "manifest";
            return { ...c, quality,
              streamUrl: buildProxyUrl(streamUrl, streamReferer, isMP4),
              isM3U8, isMP4 };
          }
        }
      }
      if (c.source === "senshi") {
        // Use AniVault's anikoto source (which scrapes senshi.live with CF bypass)
        // Endpoint: /api/watch/anikoto/{anilistId}/{ep}/{type}?server={serverId}
        const serverParam = c.provider; // e.g. "VidPlay-1"
        const res = await Promise.race([
          fetch(`${ANIVAULT_SENSHI.replace('/senshi', '/anikoto')}/${id}/${epNum}/${c.type}?server=${encodeURIComponent(serverParam)}`).then(r => r.ok ? r.json() : null),
          new Promise<null>(r => setTimeout(() => r(null), 3000)),
        ]);
        if (res?.hlsProxyUrl) {
          // AniVault already provides a proxied HLS URL — use it directly
          return { ...c, quality: res.server || "auto",
            streamUrl: res.hlsProxyUrl,
            isM3U8: true, isMP4: false };
        }
        if (res?.m3u8) {
          // Raw m3u8 — wrap through Anikuro proxy
          const ref = res.embedUrl ? new URL(res.embedUrl).origin + "/" : "https://senshi.live/";
          return { ...c, quality: res.server || "auto",
            streamUrl: buildProxyUrl(res.m3u8, ref, false),
            isM3U8: true, isMP4: false };
        }
      }
    } catch (e) { console.error(`[Servers] ${c.id} failed:`, e); }
    return null;
  });

  // Second hard ceiling. Most branches race their own 3-4s timeout, but not all
  // do, and this runs over every candidate — so without a cap the verification
  // pass could still push the route past its budget on its own.
  const VERIFY_TIMEOUT = group === "slow" ? 30000 : 10000;
  const results = await Promise.allSettled(
    verifyPromises.map(p => withTimeout<VerifiedServer | null>(p, VERIFY_TIMEOUT, null)),
  );
  const verified: VerifiedServer[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) verified.push(r.value);
  }

  // ─── AnimePahe — pre-verified HLS m3u8 + MP4 streams via kwik.si ───────────
  // (always fires — scraper URL is hardcoded with env var override)
  const animepaheVerified: VerifiedServer[] = [];
  if (animepaheResults.status === "fulfilled" && Array.isArray(animepaheResults.value)) {
    for (const r of animepaheResults.value) {
      const qualityLabel = r.quality || "auto";
      const typeTag = r.type === "dub" ? " (Dub)" : "";
      // Detect embed URLs (kwik.cx raw embed fallback)
      const isEmbed = r.isEmbed === true
                    || r.streamUrl.includes("kwik.cx/e/");
      animepaheVerified.push({
        id: `animepahe:${r.type}:${qualityLabel}`,
        name: `NQ-1 ${qualityLabel}${typeTag}`,
        source: "animepahe",
        provider: "animepahe",
        type: r.type,
        quality: qualityLabel,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed,
        hardsub: false,  // animepahe subs are soft (separate audio track available)
      });
    }
    if (animepaheVerified.length > 0) {
      console.log(`[Servers] AnimePahe: ${animepaheVerified.length} verified streams`);
    }
  }

  // ─── AnimeOnsen — DASH .mpd streams with ASS subtitles ────────────────────
  const onsenVerified: VerifiedServer[] = [];
  if (onsenResults.status === "fulfilled" && Array.isArray(onsenResults.value)) {
    for (const r of onsenResults.value) {
      onsenVerified.push({
        id: `animeonsen:${r.type}`,
        name: `NO-1 ${r.quality}`,
        source: "animeonsen",
        provider: "animeonsen",
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isDASH: r.isDASH || false,
        hardsub: false,
        subtitleTracks: r.subtitleTracks || [],
        intro: r.intro || null,
        outro: r.outro || null,
      });
    }
    if (onsenVerified.length > 0) {
      console.log(`[Servers] AnimeOnsen: ${onsenVerified.length} verified streams`);
    }
  }

  // ReAnime — FlixCLOUD streams (m3u8 or embed)
  const reanimeVerified: VerifiedServer[] = [];
  if (reanimeResults.status === "fulfilled" && Array.isArray(reanimeResults.value)) {
    for (const r of reanimeResults.value) {
      reanimeVerified.push({
        id: `reanime:${r.provider}`,
        name: `NR-1 ${r.provider.includes("hd-2") ? "HD-2" : "HD-1"} ${r.type === "dub" ? "Dub" : "Sub"}`,
        source: "reanime",
        provider: r.provider,
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: r.isEmbed || false,
        hardsub: !r.isEmbed && r.subtitleTracks?.length === 0,
        subtitleTracks: r.subtitleTracks || [],
        intro: r.intro || null,
        outro: r.outro || null,
      });
    }
    if (reanimeVerified.length > 0) {
      console.log(`[Servers] ReAnime: ${reanimeVerified.length} verified streams (m3u8=${reanimeVerified.filter(s => s.isM3U8).length}, embed=${reanimeVerified.filter(s => s.isEmbed).length})`);
    }
  }

  // Merge in the pre-verified AniDap + AniLight + Kyren streams (already have
  // playable streamUrl, subtitles, intro/outro chapters — no re-verification needed).
  verified.push(...anidapVerified);
  verified.push(...anilightVerified);
  verified.push(...kyrenVerified);
  verified.push(...anikageVerified);
  verified.push(...mioanimeVerified);
  verified.push(...anixtvVerified);
  verified.push(...anistreamVerified);
  verified.push(...anikuroVerified);
  verified.push(...anipmVerified);
  verified.push(...animetsuVerified);
  verified.push(...animeheavenVerified);
  // AniWaves removed — not working
  verified.push(...animepaheVerified);
  verified.push(...onsenVerified);
  verified.push(...reanimeVerified);
  // New providers
  verified.push(...animo4Verified);
  verified.push(...animostreamVerified);
  verified.push(...anibdVerified);
  // NOTE: Animex is NOT here — it's fetched separately via /api/anime/animex-servers

  // ── STRICT FILTER: only show servers with a playable stream URL ───────────
  // A server must have:
  //   1. A streamUrl that's > 10 chars (not empty/undefined)
  //   2. The URL must start with http://, https://, or / (relative proxy URL)
  //   3. Must NOT be a data: URI or blob:
  //   4. Must be a playable format:
  //      - HLS (m3u8) → isM3U8 must be true OR url contains .m3u8
  //      - MP4 → isMP4 must be true OR url contains .mp4
  //      - Embed (iframe) → isEmbed must be true (kwik.cx, ok.ru, mp4upload, anixtv)
  //   5. If neither isM3U8, isMP4, nor isEmbed → reject (no playable format)
  const beforeFilter = verified.length;
  const filtered = verified.filter(s => {
    if (!s.streamUrl || s.streamUrl.length <= 10) return false;
    if (s.streamUrl.startsWith("data:") || s.streamUrl.startsWith("blob:")) return false;
    if (!s.streamUrl.startsWith("http") && !s.streamUrl.startsWith("/")) return false;

    // Must have at least one playable format
    const url = s.streamUrl.toLowerCase();
    const isHls = s.isM3U8 === true || url.includes(".m3u8") || url.includes("/m3u8");
    const isMp4 = s.isMP4 === true || url.includes(".mp4");
    const isEmbed = s.isEmbed === true
                  || url.includes("kwik.cx")
                  || url.includes("ok.ru/videoembed")
                  || url.includes("mp4upload.com/embed")
                  || url.includes("streamlare.com/e/")
                  || url.includes("streamsb.net/e/")
                  || url.includes("anixtv.in")
                  || url.includes("/embed/")
                  || url.includes("otakuvid.online/embed")
                  || url.includes("otakuhg.site/e/")
                  || url.includes("bibiemb.xyz/")
                  || url.includes("vibeplayer.site/")
                  || url.includes("playmogo.com/e/")
                  || url.includes("doodstream.com/e/")
                  || url.includes("streamtape.com/e/")
                  || url.includes("voe.sx/e/")
                  || url.includes("mixdrop.ag/e/")
                  || url.includes("upstream.to/e/")
                  || url.includes("flixcloud.cc/e/")  // ReAnime FlixCLOUD embed
                  // New provider embeds
                  || url.includes("cdn.4animo.xyz/embed/")        // 4animo
                  || url.includes("abyssplayer.com/")             // animostream Abyss
                  || url.includes("animostream.embedseek.online/") // animostream StreamTape proxy
                  || url.includes("tryembed.us.cc/")              // AnixTV TryEmbed
                  || url.includes("megaplay.buzz/stream/")        // AnixTV MegaPlay
                  || url.includes("vidnest.fun/")                // AnixTV VidNest + AnimePahe
                  || url.includes("player.videasy.net/");         // AnixTV Videasy
    // Reject if no playable format detected
    const isDash = s.isDASH === true;
    if (!isHls && !isMp4 && !isEmbed && !isDash) return false;

    return true;
  });

  const totalPre = anidapVerified.length + anilightVerified.length + kyrenVerified.length + anikageVerified.length + mioanimeVerified.length + anixtvVerified.length + anistreamVerified.length + anikuroVerified.length + anipmVerified.length + animetsuVerified.length + animeheavenVerified.length + animepaheVerified.length + onsenVerified.length + reanimeVerified.length + animo4Verified.length + animostreamVerified.length + anibdVerified.length;
  console.log(`[Servers] ${filtered.length}/${beforeFilter} servers (filtered ${beforeFilter - filtered.length} empty/unplayable) — AniDap=${anidapVerified.length}, AniLight=${anilightVerified.length}, Kyren=${kyrenVerified.length}, Anikage=${anikageVerified.length}, MioAnime=${mioanimeVerified.length}, AnixTV=${anixtvVerified.length}, Anistream=${anistreamVerified.length}, AniKuro=${anikuroVerified.length}, AniPm=${anipmVerified.length}, Animetsu=${animetsuVerified.length}, AnimeHeaven=${animeheavenVerified.length}, AnimePahe=${animepaheVerified.length}, AnimeOnsen=${onsenVerified.length}, ReAnime=${reanimeVerified.length}, 4animo=${animo4Verified.length}, AnimoStream=${animostreamVerified.length}, AniBD=${anibdVerified.length}`);

  // ── SORT by priority: Animex → AniDap → AniKuro → AniKoto → AniNeko → others ──
  // User requested this specific order so the best servers appear first.
  const SOURCE_PRIORITY: Record<string, number> = {
    animex: 1,     // Animex (fetched separately, appended client-side)
    anidap: 2,     // AniDap (m3u8 + embed)
    animepahe: 3,  // AnimePahe
    animeonsen: 4,  // AnimeOnsen (DASH .mpd, high quality, ASS subs)
    reanime: 5,    // ReAnime (FlixCLOUD m3u8 + embed, uses AniList ID directly)
    anikuro: 6,    // AniKuro (m3u8 via proxy.anikuro.ru)
    anikage: 8,    // AniKage (m3u8 via prox.anikage.cc)
    kyren: 9,      // Kyren (m3u8 via worker)
    anipm: 10,     // AniPm
    animeheaven: 12, // AnimeHeaven (direct MP4)
    anilight: 13,  // AniLight (m3u8 via proxy)
    anivexa: 14,   // AniVexa (m3u8/mp4)
    mioanime: 15,  // MioAnime (m3u8 + embed)
    anistream: 16, // Anistream (m3u8 + embed)
    animo4: 17,    // 4animo (sub/dub embeds + subtitles + skip times)
    animostream: 18, // AnimoStream (Hindi dub — Abyss + StreamTape)
    anibd: 19,     // AniBD (direct m3u8, CORS-enabled, BD/uncensored)
    anixtv: 20,    // AnixTV (10 embed providers, Hindi 1 if in Hindi DB)
  };
  // Sort: sub before dub, then by source priority, then by quality
  const sorted = filtered.sort((a, b) => {
    // Sub first, then dub
    if (a.type !== b.type) return a.type === "sub" ? -1 : 1;
    // By source priority
    const pa = SOURCE_PRIORITY[a.source] || 99;
    const pb = SOURCE_PRIORITY[b.source] || 99;
    if (pa !== pb) return pa - pb;
    // By quality (1080p > 720p > 360p > auto)
    const qa = parseInt((a.quality || "").match(/(\d{3,4})/)?.[1] || "0", 10);
    const qb = parseInt((b.quality || "").match(/(\d{3,4})/)?.[1] || "0", 10);
    return qb - qa;
  });

  return NextResponse.json({ anilistId: id, episode: epNum, servers: sorted, total: sorted.length }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
  } catch (e: any) {
    console.error(`[Servers] FATAL error for ${anilistId} ep${epNum}:`, e?.message || e, e?.stack || "");
    return NextResponse.json({
      anilistId: id,
      episode: epNum,
      servers: [],
      total: 0,
      error: e?.message || "Internal server error",
    }, { status: 200 });  // return 200 with empty array so watch page doesn't crash
  }
}
