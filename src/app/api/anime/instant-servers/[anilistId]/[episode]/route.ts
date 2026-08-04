import { NextRequest, NextResponse } from "next/server";
import { resolveAniDbEmbeds } from "@/lib/anidb-direct";
import { resolveAnimexMimiBoth } from "@/lib/animex-fast";
import { fetchAllAniDapSources, ANIDAP_PROVIDER_META } from "@/lib/anidap-api";
import { resolveAniKageBoth } from "@/lib/anikage-fast";
import { resolveUniqueStreamStreams } from "@/lib/uniquestream-direct";
import { resolveSenshi } from "@/lib/senshi-direct";
import { fetchAniLightSources } from "@/lib/anilight-api";
import { fetchAllKyrenSources } from "@/lib/kyren-api";
import { fetchAllLunaSources, LUNA_PROVIDER_META } from "@/lib/luna-api";
import { fetchAniPmSources } from "@/lib/anipm-api";
import { wrapM3u8Url, wrapM3u8UrlWithReferer } from "@/lib/proxy";
// Miruro removed from instant-servers — now has its own route at /api/anime/miruro-v3/servers/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // Reduced — we return early, don't need 60s

/**
 * GET /api/anime/instant-servers/[anilistId]/[episode]?title={title}
 *
 * Returns INSTANT servers with DIRECT m3u8 URLs (no embeds/iframes for top priority).
 *
 * PRIORITY ORDER (user-specified 2026-07-13):
 *   0.  AnimeX mimi (sub/dub) — FASTEST
 *   1.  AnimeX yuki (sub/dub)
 *   2.  AniDB (sub/dub)
 *   3.  Kyren (sub/dub)
 *   4.  AniDap (all providers: beep, mimi, yuki, loli, vee, kiwi, sora)
 *   5.  AniPm (sub/dub)
 *   6.  Senshi (sub)
 *   7.  AllAnime/AllManga (sub)
 *   8+. AniNeko, AniLight, AniZone, AniWaves, AniKoto, ReAnime, AniKage, Luna
 */
export async function GET(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  const title = _req.nextUrl.searchParams.get("title") || "";

  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid anilistId" }, { status: 400 });
  }

  try {
    function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
      return Promise.race([
        promise,
        new Promise<T>(r => setTimeout(() => r(fallback), ms)),
      ]);
    }

    // Wrap subtitle URLs through the DEDICATED subtitle worker (luffytv-subs).
    // This worker is SEPARATE from luffytv-proxy — it ONLY handles subtitles:
    //   1. Injects the correct Referer/Origin per CDN host (no 403s)
    //   2. Converts SRT → WebVTT on-the-fly (browsers only render VTT)
    //   3. Converts ASS → WebVTT (basic — strips styling, extracts Dialogue)
    //   4. Passes VTT through with correct content-type
    //   5. Caches at edge for 24h (subtitles don't change)
    //   6. Full CORS headers (Access-Control-Allow-Origin: *)
    //
    // If NEXT_PUBLIC_SUBS_PROXY_BASE isn't set, falls back to /api/stream
    // (Vercel route) which has the same SRT→VTT conversion.
    const SUBS_WORKER = process.env.NEXT_PUBLIC_SUBS_PROXY_BASE || "";

    function wrapSubs(tracks?: Array<{ url: string; lang: string; label: string }>): Array<{ url: string; lang: string; label: string }> | undefined {
      if (!tracks || tracks.length === 0) return undefined;
      // NOTE: .ass subtitles ARE included now — the luffytv-subs worker
      // converts them to VTT (basic conversion: strips styling tags, extracts
      // Dialogue lines). If the worker isn't deployed, /api/stream fallback
      // will pass them through with application/x-subrip content-type and the
      // browser won't render them — but at least the menu won't be cluttered
      // with broken tracks (the <track> element silently ignores unknown formats).
      return tracks.map(t => {
        const url = t.url || "";
        return {
          url: url.startsWith("http") ? wrapSubsUrl(url) : url,
          lang: t.lang || "en",
          label: t.label || "English",
        };
      });
    }

    // Wrap a subtitle URL through the dedicated subtitle worker.
    // Uses the /sub?url=<encoded>&ref=<encoded> endpoint (easy to debug).
    // Falls back to /api/stream if the worker isn't configured.
    function wrapSubsUrl(rawUrl: string): string {
      const url = rawUrl.replace(/^https?:\/\/\/+/i, "https://"); // fix triple-slash bug
      const referer = getRefererForSubtitle(url);
      if (SUBS_WORKER) {
        // Primary: dedicated subtitle worker
        return `${SUBS_WORKER}/sub?url=${encodeURIComponent(url)}&ref=${encodeURIComponent(referer)}`;
      }
      // Fallback: Vercel /api/stream route (has SRT→VTT conversion)
      return `/api/stream?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
    }

    // Determine the correct Referer for a subtitle URL based on its CDN host.
    // This is critical — many subtitle CDNs return 403 without the right Referer.
    function getRefererForSubtitle(url: string): string {
      try {
        const hostname = new URL(url).hostname;
        if (hostname.includes("animex") || hostname.includes("24stream")) return "https://animex.one/";
        if (hostname.includes("miruro") || hostname.includes("anidb")) return "https://www.miruro.tv/";
        if (hostname.includes("kwik")) return "https://kwik.cx/";
        if (hostname.includes("owocdn") || hostname.includes("uwucdn")) return "https://kwik.cx/";
        if (hostname.includes("krussdomi")) return "https://krussdomi.com/";
        if (hostname.includes("megaplay")) return "https://megaplay.buzz/";
        if (hostname.includes("vibeplayer") || hostname.includes("vivibebe")) return "https://vibeplayer.site/";
        if (hostname.includes("animeapps")) return "https://animex.one/";
        if (hostname.includes("nekostream")) return "https://www.miruro.tv/";
        if (hostname.includes("slopnet") || hostname.includes("flixcloud")) return "https://flixcloud.cc/";
        if (hostname.includes("kyren")) return "https://kyren.moe/";
        if (hostname.includes("anikage")) return "https://anikage.cc/";
        if (hostname.includes("ani.pm")) return "https://ani.pm/";
        if (hostname.includes("ninstream") || hostname.includes("senshi")) return "https://senshi.live/";
        if (hostname.includes("xin-cdn") || hostname.includes("anizone")) return "https://anizone.to/";
        if (hostname.includes("animeheaven")) return "https://animeheaven.me/";
        if (hostname.includes("allanime") || hostname.includes("allmanga")) return "https://allanime.uns.bio/";
        if (hostname.includes("lostproject")) return "https://megaplay.buzz/"; // VERIFIED: lostproject requires megaplay referer
        if (hostname.includes("animeonsen")) return "https://www.animeonsen.xyz/";
        if (hostname.includes("vid-cdn")) return "https://luna.animeaqua.net/";
        if (hostname.includes("anizara")) return "https://anineko.to/"; // AniNeko.to subtitle CDN
        if (hostname.includes("vidtube")) return "https://anikototv.to/"; // AniKoto embed CDN
        return "https://www.miruro.tv/"; // default
      } catch {
        return "https://www.miruro.tv/";
      }
    }

    // Wrap subtitle URLs through the dedicated subtitle worker (or /api/stream
    // fallback). Used for CF-protected CDNs. ASS subtitles are kept — the
    // luffytv-subs worker converts them to VTT.
    function wrapSubsVercel(tracks: Array<{ url: string; lang?: string; label?: string }> | undefined, referer: string): Array<{ url: string; lang: string; label: string }> {
      if (!tracks || tracks.length === 0) return [];
      return tracks.map(t => {
        const url = (t.url || "").replace(/^https?:\/\/\/+/i, "https://");
        const ref = referer || getRefererForSubtitle(url);
        if (SUBS_WORKER) {
          return {
            url: url.startsWith("http")
              ? `${SUBS_WORKER}/sub?url=${encodeURIComponent(url)}&ref=${encodeURIComponent(ref)}`
              : url,
            lang: t.lang || "en",
            label: t.label || "English",
          };
        }
        return {
          url: url.startsWith("http")
            ? `/api/stream?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(ref)}`
            : url,
          lang: t.lang || "en",
          label: t.label || "English",
        };
      });
    }

    const servers: Array<{
      id: string;
      name: string;
      source: "animex" | "anidb" | "anineko" | "anidap" | "anikage" | "senshi" | "allmanga" | "anizone" | "aniwaves" | "anilight" | "kyren" | "anikoto" | "reanime" | "luna" | "anipm" | "anichi" | "anineko-to";
      provider: string;
      type: "sub" | "dub";
      quality: string;
      streamUrl: string;
      isM3U8: boolean;
      isMP4: boolean;
      isDASH?: boolean;
      isEmbed: boolean;
      hardsub: boolean;
      priority: number;
      subtitleTracks?: Array<{ url: string; lang: string; label: string }>;
      intro?: { start: number; end: number } | null;
      outro?: { start: number; end: number } | null;
    }> = [];

    // ═══════════════════════════════════════════════════════════════
    //  WORKING PROVIDERS (audited 2026-07-17, re-added AniPm/Senshi/AniKage)
    //  Working: AnimeX mimi, AniDB, Kyren, AniDap, AniPm, Senshi,
    //           AniLight, AniKage, Luna
    //  Separate endpoints: AniKoto, AniNeko.to (need title)
    // ═══════════════════════════════════════════════════════════════

    let anikageIntro: { start: number; end: number } | null = null;
    let anikageOutro: { start: number; end: number } | null = null;

    const providerPromises: Promise<void>[] = [
      // AnimeX mimi (priority 0 sub, 0.5 dub) — FASTEST
      (async () => {
        try {
          const m = await withTimeout(resolveAnimexMimiBoth(id, epNum), 10000, { sub: null, dub: null });
          if (m.sub?.m3u8Url) servers.push({ id: "animex:mimi:sub", name: "NX-2", source: "animex", provider: "mimi", type: "sub", quality: m.sub.quality || "1080p", streamUrl: wrapM3u8Url(m.sub.m3u8Url), isM3U8: true, isMP4: false, isEmbed: false, hardsub: false, priority: 0, subtitleTracks: wrapSubs(m.sub.tracks), intro: m.sub.intro || null, outro: m.sub.outro || null });
          if (m.dub?.m3u8Url) servers.push({ id: "animex:mimi:dub", name: "NX-2 Dub", source: "animex", provider: "mimi", type: "dub", quality: m.dub.quality || "1080p", streamUrl: wrapM3u8Url(m.dub.m3u8Url), isM3U8: true, isMP4: false, isEmbed: false, hardsub: false, priority: 0.5, subtitleTracks: wrapSubs(m.dub.tracks), intro: m.dub.intro || null, outro: m.dub.outro || null });
        } catch {}
      })(),

      // AniDB (priority 2)
      (async () => {
        try {
          const r = await withTimeout(resolveAniDbEmbeds(id, epNum, title), 10000, { sub: null, dub: null });
          if (r.sub?.m3u8Url) servers.push({ id: "anidb:sub", name: "L4", source: "anidb", provider: "anidb", type: "sub", quality: "1080p", streamUrl: wrapM3u8Url(r.sub.m3u8Url), isM3U8: true, isMP4: false, isEmbed: false, hardsub: false, priority: 2 });
          else if (r.sub?.embedUrl) servers.push({ id: "anidb:sub", name: "L4", source: "anidb", provider: "anidb", type: "sub", quality: "1080p", streamUrl: r.sub.embedUrl, isM3U8: false, isMP4: false, isEmbed: true, hardsub: false, priority: 2 });
          if (r.dub?.m3u8Url) servers.push({ id: "anidb:dub", name: "L4 Dub", source: "anidb", provider: "anidb", type: "dub", quality: "1080p", streamUrl: wrapM3u8Url(r.dub.m3u8Url), isM3U8: true, isMP4: false, isEmbed: false, hardsub: false, priority: 2.5 });
          else if (r.dub?.embedUrl) servers.push({ id: "anidb:dub", name: "L4 Dub", source: "anidb", provider: "anidb", type: "dub", quality: "1080p", streamUrl: r.dub.embedUrl, isM3U8: false, isMP4: false, isEmbed: true, hardsub: false, priority: 2.5 });
        } catch {}
      })(),

      // Kyren (priority 3)
      (async () => {
        try {
          const kr = await withTimeout(fetchAllKyrenSources(id, epNum, { sub: true, dub: true, timeoutMs: 10000 }).catch(() => []), 10000, []);
          if (kr?.length) { let p = 3; let krIdx = 0; for (const r of kr) servers.push({ id: `kyren:${r.server}:${r.type}`, name: `NK-${krIdx+1}${r.type === "dub" ? " (Dub)" : ""}`, source: "kyren", provider: r.server, type: r.type, quality: r.quality || "1080p", streamUrl: r.streamUrl, isM3U8: r.isM3U8, isMP4: r.isMP4, isEmbed: false, hardsub: false, priority: p++, subtitleTracks: wrapSubsVercel(r.tracks as any, "https://kyren.moe/") }); krIdx++; }
        } catch {}
      })(),

      // AniDap (priority 4) — fetch ALL providers in parallel
      (async () => {
        try {
          const adResults = await withTimeout(
            fetchAllAniDapSources(id, epNum, { sub: true, dub: true, timeoutMs: 15000 }).catch(() => []),
            15000,
            [],
          );
          if (adResults?.length) {
            let p = 4;
            for (const r of adResults) {
              const meta = ANIDAP_PROVIDER_META[r.provider as keyof typeof ANIDAP_PROVIDER_META];
              const provName = meta?.name || (r.provider.charAt(0).toUpperCase() + r.provider.slice(1));
              const typeTag = r.type === "dub" ? " (Dub)" : (r.hardsub ? " (HS)" : "");
              servers.push({
                id: `anidap:${r.provider}:${r.type}`,
                name: `ND-${provName.slice(1)}${typeTag}`,
                source: "anidap",
                provider: r.provider,
                type: r.type,
                quality: r.quality || "auto",
                streamUrl: r.streamUrl,
                isM3U8: r.isM3U8,
                isMP4: r.isMP4,
                isDASH: r.isDASH === true,
                isEmbed: false,
                hardsub: r.hardsub,
                priority: p++,
                subtitleTracks: wrapSubsVercel(r.tracks as any, "https://megaplay.buzz/"),
                intro: r.intro || null,
                outro: r.outro || null,
              });
            }
          }
        } catch {}
      })(),

      // AniPm (priority 5) — works for many anime (8-14 servers)
      (async () => {
        try {
          const pm = await withTimeout(fetchAniPmSources(id, epNum, { sub: true, dub: true, timeoutMs: 15000 }).catch(() => []), 15000, []);
          if (pm?.length) { let p = 5; let pmIdx = 0; for (const r of pm) { if (!r.streamUrl) continue; servers.push({ id: `anipm:${r.provider}:${r.type}`, name: `NP-${pmIdx+1}${r.type === "dub" ? " (Dub)" : ""}`, source: "anipm" as any, provider: r.provider, type: r.type, quality: r.quality || "1080p", streamUrl: r.streamUrl, isM3U8: r.isM3U8, isMP4: r.isMP4, isEmbed: r.isEmbed, hardsub: r.hardsub, priority: p++, subtitleTracks: wrapSubsVercel(r.tracks as any, "https://ani.pm/") }); pmIdx++; } }
        } catch {}
      })(),

      // Senshi (priority 6) — sometimes returns 403 on search, but works when it doesn't
      (async () => {
        try {
          const s = await withTimeout(resolveSenshi(id, epNum, title).catch(() => null), 10000, null);
          if (s?.m3u8Url) servers.push({ id: "senshi:sub", name: "NS-1", source: "senshi", provider: "senshi", type: "sub", quality: "1080p", streamUrl: wrapM3u8UrlWithReferer(s.m3u8Url, "https://senshi.live/"), isM3U8: true, isMP4: false, isEmbed: false, hardsub: s.status === "HardSub", priority: 6, intro: s.intro, outro: s.outro });
        } catch {}
      })(),

      // AniLight (priority 9+)
      (async () => {
        try {
          const al = await withTimeout(fetchAniLightSources(id, epNum, { sub: true, dub: true, timeoutMs: 10000 }).catch(() => []), 10000, []);
          al.filter((r: any) => r.type === "sub").slice(0, 3).forEach((r: any, i: number) => servers.push({ id: `anilight:sub:${i}`, name: `NL-${i+1}`.trim(), source: "anilight", provider: "anilight", type: "sub", quality: r.quality || "1080p", streamUrl: r.streamUrl, isM3U8: r.isM3U8, isMP4: r.isMP4, isEmbed: false, hardsub: false, priority: 9 + i * 0.1, subtitleTracks: wrapSubsVercel(r.tracks as any, "https://anilight.live/") }))
          al.filter((r: any) => r.type === "dub").slice(0, 3).forEach((r: any, i: number) => servers.push({ id: `anilight:dub:${i}`, name: `NL-${i+4} Dub`.trim(), source: "anilight", provider: "anilight", type: "dub", quality: r.quality || "1080p", streamUrl: r.streamUrl, isM3U8: r.isM3U8, isMP4: r.isMP4, isEmbed: false, hardsub: false, priority: 9.5 + i * 0.1, subtitleTracks: wrapSubsVercel(r.tracks as any, "https://anilight.live/") }))
        } catch {}
      })(),

      // Miruro Direct — REMOVED from instant-servers.
      // Miruro now has its OWN separate route at /api/anime/miruro-v3/servers/[anilistId]/[episode]
      // This keeps miruro isolated and prevents conflicts with instant-server providers.
      // The frontend calls miruro-v3 separately via the EmbedServer config in embed-servers.ts.

      // AniKage (skip times + servers, priority 14) — works for some anime
      (async () => {
        try {
          const ak = await withTimeout(resolveAniKageBoth(id, epNum, title).catch(() => ({ sub: null, dub: null, intro: null, outro: null })), 10000, { sub: null, dub: null, intro: null, outro: null });
          if (ak.intro) anikageIntro = ak.intro;
          if (ak.outro) anikageOutro = ak.outro;
          const akServers = [...(ak.sub?.servers || []), ...(ak.dub?.servers || [])];
          let p = 14;
          for (const srv of akServers) {
            const isNin = srv.m3u8Url.includes("ninstream.com");
            servers.push({ id: `anikage:${srv.provider}:${p}`, name: `NK-${p-14+5}`, source: "anikage", provider: srv.provider, type: srv.type, quality: srv.quality, streamUrl: isNin ? wrapM3u8UrlWithReferer(srv.m3u8Url, "https://senshi.live/") : wrapM3u8Url(srv.m3u8Url), isM3U8: true, isMP4: false, isEmbed: false, hardsub: false, priority: p++, intro: ak.intro, outro: ak.outro });
          }
        } catch {}
      })(),

      // Luna-Stream (priority 15+) — fetches ALL Luna providers in parallel
      (async () => {
        try {
          const lunaResults = await withTimeout(
            fetchAllLunaSources(id, epNum, { timeoutMs: 15000 }).catch(() => []),
            15000,
            [],
          );
          if (lunaResults?.length) {
            let p = 15;
            for (const [lunaIdx, r] of lunaResults.entries()) {
              const meta = LUNA_PROVIDER_META[r.provider];
              const provName = meta?.name || (r.provider.charAt(0).toUpperCase() + r.provider.slice(1));
              const typeTag = r.type === "dub" ? " (Dub)" : (r.hardsub ? " (HS)" : "");
              servers.push({
                id: `luna:${r.provider}:${r.type}`,
                name: `LN-${lunaIdx+1}${typeTag}`,
                source: "luna",
                provider: r.provider,
                type: r.type,
                quality: r.quality || "auto",
                streamUrl: r.streamUrl,
                isM3U8: r.isM3U8,
                isMP4: r.isMP4,
                isEmbed: false,
                hardsub: r.hardsub,
                priority: p++,
                subtitleTracks: (r.tracks || []).map((t: any) => ({
                  url: t.url,
                  lang: t.lang || "en",
                  label: t.label || "English",
                })),
                intro: r.intro || null,
                outro: r.outro || null,
              });
            }
          }
        } catch {}
      })(),

      // UniqueStream.net (priority 0.7 — direct m3u8 with multi-language hardsubs)
      // Has direct m3u8 URLs from get4.mediacache.cc (signed, expire in ~24h)
      // Supports en-US dub + ja-JP sub + hardsub variants in 9 languages
      (async () => {
        try {
          const usResults = await withTimeout(
            resolveUniqueStreamStreams(id, epNum, title).catch(() => []),
            15000,
            [],
          );
          if (usResults?.length) {
            let p = 0.7;
            for (const r of usResults) {
              let urlKey = "unknown";
              try {
                const u = new URL(r.streamUrl);
                urlKey = (u.hostname.split(".")[0] + u.pathname).slice(0, 60);
              } catch {}
              servers.push({
                id: `uniquestream:${urlKey}:${r.type}${r.hardsub ? ":hsub" : ""}`,
                name: "NU-1",
                source: "uniquestream" as any,
                provider: r.serverName.toLowerCase().replace(/\s/g, ""),
                type: r.type,
                quality: r.quality || "1080p",
                streamUrl: r.isM3U8 ? wrapM3u8Url(r.streamUrl) : r.streamUrl,
                isM3U8: r.isM3U8,
                isMP4: r.isMP4,
                isEmbed: r.isEmbed,
                hardsub: r.hardsub,
                priority: p,
                subtitleTracks: [],
                intro: null,
                outro: null,
              });
              p += 0.1;
            }
          }
        } catch {}
      })(),

      // NOTE: AniKoto and AniNeko.to have their own dedicated endpoints:
      // /api/anime/anichi-servers and /api/anime/anineko-to-servers
      // They're called separately by the frontend when the title is available.
    ];

    // ── RESPONSE — wait up to 15s for all providers ──
    // Fast providers (AnimeX mimi, AniDB, Kyren) finish in 2-3s.
    // Slow providers (AniDap, AniPm, Luna, AniKage) may take 7-12s.
    // Previously raced at 4s which killed slow providers before they could
    // finish — users only saw 2-3 servers instead of 8-12. Now we wait
    // 15s so all providers have time to complete. The frontend also calls
    // /api/anime/anidap-servers and /api/anime/anichi-servers separately,
    // so any stragglers arrive via those endpoints too.
    await Promise.race([
      Promise.allSettled(providerPromises),
      new Promise(resolve => setTimeout(resolve, 15000)),
    ]);

    // Apply AniKage skip times to ALL servers
    if (anikageIntro || anikageOutro) {
      for (const s of servers) {
        if (!s.intro && anikageIntro) s.intro = anikageIntro;
        if (!s.outro && anikageOutro) s.outro = anikageOutro;
      }
      console.log(`[instant-servers] AniKage skip times applied to ALL servers: intro=${JSON.stringify(anikageIntro)} outro=${JSON.stringify(anikageOutro)}`);
    }

    // DEDUPLICATE — remove only EXACT URL duplicates (same full URL including
    // query string). We do NOT:
    //   - Strip query strings (they contain stream tokens — different query
    //     strings = different streams)
    //   - Dedup by source:provider:type (different URLs from the same provider
    //     are different mirrors and should all be shown)
    //   - Filter by type (embed, mp4, and hls are ALL shown — the user wants
    //     every server visible)
    const seenUrls = new Set<string>();
    const deduped: typeof servers = [];
    for (const s of servers) {
      if (seenUrls.has(s.streamUrl)) continue;
      seenUrls.add(s.streamUrl);
      deduped.push(s);
    }
    const dupesRemoved = servers.length - deduped.length;
    if (dupesRemoved > 0) {
      console.log(`[instant-servers] Removed ${dupesRemoved} exact-URL duplicate servers`);
    }

    // Sort by priority
    deduped.sort((a, b) => a.priority - b.priority);

    console.log(
      `[instant-servers] AniList ${id} ep ${epNum}: ${deduped.length} instant servers (animex:${deduped.some(s => s.source === "animex") ? "✓" : "✗"} anidb:${deduped.some(s => s.source === "anidb") ? "✓" : "✗"} anilight:${deduped.some(s => s.source === "anilight") ? "✓" : "✗"} kyren:${deduped.some(s => s.source === "kyren") ? "✓" : "✗"} anidap:${deduped.some(s => s.source === "anidap") ? "✓" : "✗"} luna:${deduped.some(s => s.source === "luna") ? "✓" : "✗"})`,
    );

    return NextResponse.json({ servers: deduped });
  } catch (err) {
    console.error("[instant-servers] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
