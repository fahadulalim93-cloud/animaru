/**
 * Unified Anime Scraper — adapter layer.
 *
 * Normalizes 4 streaming sites (miruro, animex, lunar, plus existing miruro-api)
 * into one tagged-source schema with sub/dub/hardsub/harddub variants.
 *
 * AniList is used for all metadata (title, cover, episodes, description, etc.).
 * The streaming sites only provide episode lists + stream URLs.
 *
 * This is the "new proper AniList" integration the user asked for.
 */

import {
  getAnimeDetails,
  searchAnime,
  getTrending,
  getPopular,
  type AniListMedia,
} from "./anilist-api";
import {
  miruroEpisodes,
  miruroWatch,
  type MiruroEpisode,
} from "./miruro-api";
import {
  animexGetAnime,
  animexEpisodes,
  animexWatch,
} from "./animex-api";
import {
  lunarEpisodes,
  lunarWatch,
} from "./lunar-api";

// ─── Variant Taxonomy ─────────────────────────────────────────────────────────
export type Variant = "sub" | "dub" | "hardsub" | "harddub";
export type StreamFormat = "hls" | "mp4" | "dash";

// ─── Unified Types ────────────────────────────────────────────────────────────
export interface UnifiedEpisode {
  number: number;
  /** Opaque episode ID — pass back to fetchSources() */
  id: string;
  title?: string;
  thumbnail?: string;
  description?: string;
  duration?: number;
  isFiller?: boolean;
  airDate?: string;
  /** Which variants are available: sub, dub, hardsub, harddub */
  variants: Variant[];
}

export interface UnifiedSource {
  url: string;
  variant: Variant;
  audio: "jp" | "en" | "es" | "fr" | "de" | "pt" | string;
  subtitle: "none" | "soft" | "hard";
  quality: string;
  format: StreamFormat;
  provider: string;
  subProvider: string;
  fansub?: string;
  headers: Record<string, string>;
  proxyRequired: boolean;
  isM3U8: boolean;
  isMP4: boolean;
}

export interface UnifiedEpisodesResponse {
  site: string;
  anilistId: number;
  title: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  totalEpisodes: number | null;
  episodes: UnifiedEpisode[];
}

export interface UnifiedSourcesResponse {
  site: string;
  episodeId: string;
  sources: UnifiedSource[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  subtitles: Array<{ url: string; lang: string; label: string }>;
  triedProviders?: string[];
}

export interface SiteInfo {
  site: string;
  name: string;
  baseUrl: string;
  supportsSub: boolean;
  supportsDub: boolean;
  supportsHardsub: boolean;
  supportsHarddub: boolean;
}

// ─── Site Registry ─────────────────────────────────────────────────────────────
export const SITES: SiteInfo[] = [
  {
    site: "miruro",
    name: "Site-A",
    baseUrl: "https://www.miruro.tv",
    supportsSub: true,
    supportsDub: true,
    supportsHardsub: false,
    supportsHarddub: false,
  },
  {
    site: "animex",
    name: "Site-B",
    baseUrl: "https://animex.one",
    supportsSub: true,
    supportsDub: true,
    supportsHardsub: true,
    supportsHarddub: true,
  },
  {
    site: "lunar",
    name: "Site-C",
    baseUrl: "https://lunaranime.ru",
    supportsSub: true,
    supportsDub: false,
    supportsHardsub: true,
    supportsHarddub: false,
  },
];

// ─── Metadata via AniList ────────────────────────────────────────────────────
export async function getAnimeMeta(anilistId: number): Promise<AniListMedia | null> {
  return getAnimeDetails(anilistId);
}

export async function searchAnilist(query: string, page = 1, perPage = 20) {
  return searchAnime(query, page, perPage);
}

export async function getTrendingAnime(page = 1, perPage = 20) {
  return getTrending(page, perPage);
}

export async function getPopularAnime(page = 1, perPage = 20) {
  return getPopular(page, perPage);
}

// ─── Unified Episodes ────────────────────────────────────────────────────────
export async function fetchEpisodes(
  site: string,
  anilistId: number
): Promise<UnifiedEpisodesResponse> {
  // Always fetch AniList metadata first (proper AniList integration)
  const meta = await getAnimeMeta(anilistId);

  const base: UnifiedEpisodesResponse = {
    site,
    anilistId,
    title: meta?.title?.english || meta?.title?.romaji || null,
    coverImage: meta?.coverImage?.large || meta?.coverImage?.extraLarge || null,
    bannerImage: meta?.bannerImage || null,
    totalEpisodes: meta?.episodes ?? null,
    episodes: [],
  };

  if (site === "miruro") {
    const result = await miruroEpisodes(anilistId);
    const variants = (cat: "sub" | "dub"): Variant[] =>
      cat === "dub" ? ["dub"] : ["sub"];
    const all: UnifiedEpisode[] = [];
    const subSeen = new Set<number>();
    const dubSeen = new Set<number>();
    for (const ep of result.sub as MiruroEpisode[]) {
      if (subSeen.has(ep.number)) continue;
      subSeen.add(ep.number);
      all.push({
        number: ep.number,
        id: `miruro:${result.defaultProvider}:sub:${anilistId}:${ep.number}`,
        title: ep.title || `Episode ${ep.number}`,
        thumbnail: ep.thumbnail || ep.image || "",
        isFiller: ep.isFiller || ep.filler,
        airDate: ep.airDate,
        variants: variants("sub"),
      });
    }
    for (const ep of result.dub as MiruroEpisode[]) {
      if (dubSeen.has(ep.number)) continue;
      dubSeen.add(ep.number);
      const existing = all.find((a) => a.number === ep.number);
      if (existing) {
        if (!existing.variants.includes("dub")) existing.variants.push("dub");
      } else {
        all.push({
          number: ep.number,
          id: `miruro:${result.defaultProvider}:dub:${anilistId}:${ep.number}`,
          title: ep.title || `Episode ${ep.number}`,
          thumbnail: ep.thumbnail || ep.image || "",
          isFiller: ep.isFiller || ep.filler,
          airDate: ep.airDate,
          variants: ["dub"],
        });
      }
    }
    all.sort((a, b) => a.number - b.number);
    base.episodes = all;
    return base;
  }

  if (site === "animex") {
    const anime = await animexGetAnime(anilistId);
    if (!anime) return base;
    const eps = await animexEpisodes(anime.slug);
    base.episodes = eps.map((ep) => ({
      number: ep.number,
      id: `animex:${anime.slug}:${ep.number}`,
      title: ep.title || `Episode ${ep.number}`,
      isFiller: ep.isFiller,
      // Animex supports sub/dub/hardsub/harddub depending on provider — declare all
      variants: ["sub", "hardsub", "dub", "harddub"],
    }));
    return base;
  }

  if (site === "lunar") {
    const result = await lunarEpisodes(anilistId);
    base.episodes = result.episodes.map((e) => ({
      number: e.number,
      id: e.id,
      title: e.title,
      thumbnail: e.thumbnail,
      variants: e.variants as Variant[],
    }));
    return base;
  }

  return base;
}

// ─── Unified Sources ─────────────────────────────────────────────────────────
export async function fetchSources(
  site: string,
  episodeId: string
): Promise<UnifiedSourcesResponse> {
  if (site === "miruro") {
    // Parse: miruro:{provider}:{category}:{anilistId}:{epNum}
    const parts = episodeId.split(":");
    if (parts.length < 5) {
      return { site, episodeId, sources: [], subtitles: [] };
    }
    const [, provider, category, anilistIdStr, epNumStr] = parts;
    const anilistId = parseInt(anilistIdStr, 10);
    const epNum = parseInt(epNumStr, 10);
    const translationType = (category === "dub" ? "dub" : "sub") as "sub" | "dub";

    // Use miruroWatch — it auto-switches providers if first fails
    // We pass the slug as epNum which works for the deployed API
    const result = await miruroWatch(provider, anilistId, translationType, String(epNum));

    const variant: Variant = category === "dub" ? "dub" : "sub";
    const audio = category === "dub" ? "en" : "jp";
    const subtitle = category === "dub" ? "none" : "soft";

    const sources: UnifiedSource[] = result.sources
      .filter((s) => s.url && !s.url.includes("ok.ru")) // ok.ru embeds don't play
      .map((s) => {
        const isM3U8 = !!s.isM3U8 || s.url.includes(".m3u8");
        const isMP4 = !isM3U8 && s.url.includes(".mp4");
        const format: StreamFormat = isMP4 ? "mp4" : "hls";
        return {
          url: s.url,
          variant,
          audio,
          subtitle,
          quality: s.quality || "auto",
          format,
          provider: "miruro",
          subProvider: provider,
          headers: {
            Referer: "https://www.miruro.tv/",
            Origin: "https://www.miruro.tv",
            ...(result.headers || {}),
          },
          proxyRequired: true,
          isM3U8,
          isMP4,
        };
      });

    return {
      site,
      episodeId,
      sources,
      intro: result.intro,
      outro: result.outro,
      subtitles: (result.subtitles || []).map((s) => ({
        url: s.url,
        lang: s.lang,
        label: s.language,
      })),
      triedProviders: result.triedProviders,
    };
  }

  if (site === "animex") {
    // Parse: animex:{slug}:{epNum}
    const parts = episodeId.split(":");
    if (parts.length < 3) {
      return { site, episodeId, sources: [], subtitles: [] };
    }
    const [, slug, epNumStr] = parts;
    const epNum = parseInt(epNumStr, 10);

    const result = await animexWatch(slug ? parseInt(slug.split("-").pop() || "0", 10) || 0 : 0, epNum, "sub");
    // ^ Note: animexWatch expects anilistId; we encoded slug not anilistId. Need a different call path.
    // Actually animexWatch takes anilistId and resolves slug internally. Let's parse slug's suffix:
    // slug format like "one-piece-p8k27" — we need to call animexEpisodes+animexSources directly.

    // Use direct path: animexEpisodes + animexServers + animexSources
    const { animexServers, animexSources } = await import("./animex-api");
    const servers = await animexServers(slug, epNum);
    const subProviders = servers.subProviders.map((p) => p.id);
    const dubProviders = servers.dubProviders.map((p) => p.id);

    const sources: UnifiedSource[] = [];
    let intro: { start: number; end: number } | undefined;
    let outro: { start: number; end: number } | undefined;
    const subtitles: Array<{ url: string; lang: string; label: string }> = [];
    const triedProviders: string[] = [];

    // Animex provider priority
    const PROVIDER_PRIORITY = ["miku", "yuki", "beep", "mimi", "uwu", "huzz", "koto", "vee", "mochi", "neko", "kiwi", "kami"];
    const PROVIDER_HEADERS: Record<string, Record<string, string>> = {
      beep: {},
      mimi: { Origin: "https://animex.one", Referer: "https://animex.one/" },
      vee: { Referer: "https://www.animeonsen.xyz/" },
      yuki: { Referer: "https://megaplay.buzz/" },
      miku: { Referer: "https://allanime.uns.bio", "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36" },
      neko: { Referer: "https://animeverse.to/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0" },
      huzz: { Origin: "https://kem.clvd.xyz", Referer: "https://kem.clvd.xyz/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0" },
      mochi: { Referer: "https://animex.one" },
      uwu: { Referer: "https://allanime.uns.bio", "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36" },
      koto: { Referer: "https://allanime.uns.bio", "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36" },
      kiwi: { Origin: "https://anidb.app", Referer: "https://anidb.app/" },
      kami: { Origin: "https://animex.one", Referer: "https://animex.one/" },
    };
    // Hardsub-capable providers
    const HARDSUB_PROVIDERS = new Set(["beep", "mimi", "miku", "neko", "huzz", "mochi", "uwu", "koto", "kiwi", "kami"]);
    const HARDDUB_PROVIDERS = new Set(["mimi", "miku", "mochi", "uwu", "kiwi"]);

    // Try sub providers first (priority order)
    let foundSources = false;
    for (const pid of PROVIDER_PRIORITY) {
      if (!subProviders.includes(pid)) continue;
      triedProviders.push(`${pid}:sub`);
      const sourceData = await animexSources(slug, epNum, "sub", pid);
      if (!sourceData || !sourceData.sources.length) continue;

      // Add hardsub variant if provider supports it
      const variants: Variant[] = ["sub"];
      if (HARDSUB_PROVIDERS.has(pid)) variants.push("hardsub");

      for (const s of sourceData.sources) {
        const isM3U8 = s.url.includes(".m3u8") || s.type?.includes("mpegurl") || (s.url.includes(".txt") && s.type?.includes("mpegurl"));
        const isMP4 = !isM3U8 && s.url.includes(".mp4");
        if (s.url.includes(".mpd")) continue; // skip DASH
        const format: StreamFormat = isMP4 ? "mp4" : "hls";
        const headers = { ...PROVIDER_HEADERS[pid] || {} };
        // Add each variant as separate source
        for (const v of variants) {
          sources.push({
            url: s.url,
            variant: v,
            audio: "jp",
            subtitle: v === "hardsub" ? "hard" : "soft",
            quality: (s.quality || "auto").toLowerCase(),
            format,
            provider: "animex",
            subProvider: pid,
            headers,
            proxyRequired: true,
            isM3U8,
            isMP4,
          });
        }
      }
      if (sourceData.intro) intro = sourceData.intro;
      if (sourceData.outro) outro = sourceData.outro;
      for (const t of sourceData.tracks || []) {
        if (t.kind === "captions" || t.kind === "subtitles") {
          subtitles.push({ url: t.url, lang: t.lang || "en", label: t.label || t.lang || "English" });
        }
      }
      foundSources = true;
      break; // stop at first working sub provider
    }

    // Try dub providers
    if (dubProviders.length > 0) {
      for (const pid of PROVIDER_PRIORITY) {
        if (!dubProviders.includes(pid)) continue;
        triedProviders.push(`${pid}:dub`);
        const sourceData = await animexSources(slug, epNum, "dub", pid);
        if (!sourceData || !sourceData.sources.length) continue;

        const variants: Variant[] = ["dub"];
        if (HARDDUB_PROVIDERS.has(pid)) variants.push("harddub");

        for (const s of sourceData.sources) {
          const isM3U8 = s.url.includes(".m3u8") || s.type?.includes("mpegurl");
          const isMP4 = !isM3U8 && s.url.includes(".mp4");
          if (s.url.includes(".mpd")) continue;
          const format: StreamFormat = isMP4 ? "mp4" : "hls";
          const headers = { ...PROVIDER_HEADERS[pid] || {} };
          for (const v of variants) {
            sources.push({
              url: s.url,
              variant: v,
              audio: "en",
              subtitle: v === "harddub" ? "hard" : "none",
              quality: (s.quality || "auto").toLowerCase(),
              format,
              provider: "animex",
              subProvider: pid,
              headers,
              proxyRequired: true,
              isM3U8,
              isMP4,
            });
          }
        }
        if (!intro && sourceData.intro) intro = sourceData.intro;
        if (!outro && sourceData.outro) outro = sourceData.outro;
        break;
      }
    }

    return { site, episodeId, sources, intro, outro, subtitles, triedProviders };
  }

  if (site === "lunar") {
    const result = await lunarWatch(episodeId);
    const sources: UnifiedSource[] = result.sources.map((s) => ({
      url: s.url,
      variant: s.variant,
      audio: s.audio,
      subtitle: s.subtitle,
      quality: s.quality,
      format: s.format,
      provider: "lunar",
      subProvider: s.subProvider,
      headers: s.headers,
      proxyRequired: s.proxyRequired,
      isM3U8: s.isM3U8,
      isMP4: false,
    }));
    return { site, episodeId, sources, subtitles: [] };
  }

  return { site, episodeId, sources: [], subtitles: [] };
}
