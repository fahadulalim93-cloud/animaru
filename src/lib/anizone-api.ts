/**
 * AniZone Full Scraper — anizone.to
 *
 * Complete scraper for anime listings, detail, episodes, video streams (m3u8),
 * subtitle tracks (.srt/.ass), chapters (.vtt), and storyboard.
 *
 * Architecture:
 *   - AniZone is a Livewire (Laravel) SPA with Alpine.js
 *   - Titles are embedded in Alpine x-data via JSON.parse('{...}')
 *   - Video data is directly in the HTML of episode pages
 *   - CDN: suzaku.xin-cdn.xyz — uses UUID-per-episode pattern
 *   - Cloudflare protection: uses z-ai page_reader proxy as fallback
 *
 * Key URLs:
 *   Homepage:      https://anizone.to/
 *   Anime Index:   https://anizone.to/anime
 *   Episode Index: https://anizone.to/episode
 *   Anime Detail:  https://anizone.to/anime/{slug}
 *   Watch Episode: https://anizone.to/anime/{slug}/{epNum}
 *   Tags:          https://anizone.to/tag
 *
 * Video URLs:
 *   Stream:    https://suzaku.xin-cdn.xyz/{uuid}/master.m3u8
 *   Subtitle:  https://suzaku.xin-cdn.xyz/{uuid}/subtitles/{n}_{lang}.srt
 *   Chapters:  https://suzaku.xin-cdn.xyz/{uuid}/chapters.vtt
 *   Storyboard:https://suzaku.xin-cdn.xyz/{uuid}/storyboard.vtt
 *   Snapshot:  https://suzaku.xin-cdn.xyz/{uuid}/snapshot.webp
 *   Teaser:    https://suzaku.xin-cdn.xyz/{uuid}/teaser.webp
 *   Poster:    https://anizone.to/images/anime/{uuid}.jpg
 */

const ANIZONE_BASE = "https://anizone.to";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://anizone.to/",
};

// ── Types ──

export interface AniZoneAnime {
  slug: string;
  title: string;
  romajiTitle?: string;
  nativeTitle?: string;
  posterUrl: string;
  type?: string; // TV Series, OVA, Movie, etc.
  status?: string; // Ongoing, Completed, etc.
  episodeCount?: number;
  year?: number;
  synopsis?: string;
  tags: Array<{ slug: string; name: string }>;
  officialSite?: string;
}

export interface AniZoneEpisode {
  episodeNumber: number;
  title?: string;
  slug: string;
  type: number; // 0=All, 1=Regular, 2=Special, 3=OP/ED, 4=Trailer, 5=Parody, 6=Other
  typeLabel: string;
  summary?: string;
  airDate?: string;
}

export interface AniZoneVideoSource {
  m3u8Url: string;
  cdnUuid: string;
  subtitleTracks: AniZoneSubtitle[];
  chaptersUrl?: string;
  storyboardUrl?: string;
  snapshotUrl?: string;
  teaserUrl?: string;
}

export interface AniZoneSubtitle {
  url: string;
  lang: string;
  label: string;
  format: "srt" | "ass" | "vtt";
}

export interface AniZoneHomeSection {
  latestAnime: AniZoneAnime[];
  latestEpisodes: AniZoneEpisodeItem[];
  topTags: Array<{ slug: string; name: string }>;
}

export interface AniZoneEpisodeItem {
  animeSlug: string;
  episodeNumber: number;
  animeTitle: string;
  posterUrl: string;
  url: string;
}

export interface AniZoneAnimeDetail {
  anime: AniZoneAnime;
  episodes: AniZoneEpisode[];
  episodeTitles: Record<string, string>;
}

export interface AniZoneFilterOptions {
  sortOptions: Record<string, string>;
  typeOptions: string[];
  episodeTypeOptions: string[];
}

// ── Helpers ──

const LANG_NAMES: Record<string, string> = {
  en: "English",
  ar: "Arabic",
  de: "German",
  "es-419": "Spanish (Latin American)",
  es: "Spanish",
  fr: "French (European)",
  id: "Indonesian",
  it: "Italian",
  "pt-BR": "Portuguese (Brazilian)",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  vi: "Vietnamese",
  th: "Thai",
  pl: "Polish",
  tr: "Turkish",
  hi: "Hindi",
};

const EPISODE_TYPE_LABELS: Record<number, string> = {
  0: "All",
  1: "Regular Episode",
  2: "Special",
  3: "Opening/Ending",
  4: "Trailer/Promo/Ads",
  5: "Parody/Fandub",
  6: "Other",
};

/**
 * Fetch a page from AniZone. Uses direct fetch first,
 * falls back to z-ai page_reader proxy if Cloudflare blocks.
 */
async function fetchAniZonePage(url: string): Promise<string> {
  // Try direct fetch with browser headers
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      headers: HEADERS,
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      // Check if Cloudflare challenge page was returned
      if (html.includes("Just a moment") || html.includes("cf-chl-opt")) {
        console.log(`[anizone] CF challenge on direct fetch for ${url}, falling back to proxy`);
        return await fetchViaProxy(url);
      }
      return html;
    }

    console.log(`[anizone] Direct fetch HTTP ${res.status} for ${url}, falling back to proxy`);
    return await fetchViaProxy(url);
  } catch (err) {
    console.log(`[anizone] Direct fetch error for ${url}, falling back to proxy`);
    return await fetchViaProxy(url);
  }
}

/**
 * Fallback: use z-ai page_reader proxy to bypass Cloudflare.
 */
async function fetchViaProxy(url: string): Promise<string> {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const result = await zai.functions.invoke("page_reader", { url });
    if (result.data?.html) {
      return result.data.html;
    }
    console.error(`[anizone] Proxy returned empty HTML for ${url}`);
    return "";
  } catch (err) {
    console.error(`[anizone] Proxy fetch failed for ${url}:`, err);
    return "";
  }
}

/**
 * Decode Alpine.js JSON.parse blocks from HTML.
 * The format is: JSON.parse('{\\u0022key\\u0022:\\u0022value\\u0022}')
 * where \\u0022 = double quote character.
 */
function decodeAlpineJson(raw: string): Record<string, string> | null {
  try {
    // Replace the Livewire/Alpine unicode escaping
    const decoded = raw
      .replace(/\\u0022/g, '"')
      .replace(/\\u0027/g, "'")
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\u0026/g, "&")
      .replace(/\\u005c/g, "\\");
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}

/**
 * Extract all JSON.parse title blocks from an HTML page.
 * Returns an array of parsed title objects.
 */
function extractTitleBlocks(html: string): Record<string, string>[] {
  const pattern = /JSON\.parse\('([^']+)'\)/g;
  const blocks: Record<string, string>[] = [];

  for (const match of html.matchAll(pattern)) {
    const parsed = decodeAlpineJson(match[1]);
    if (parsed) blocks.push(parsed);
  }

  return blocks;
}

/**
 * Map title block keys to meaningful names.
 * Key "1" = english title, "5" = english title (variant), "8" = native/romaji title, "9" = romaji title
 */
function getTitleFromBlock(block: Record<string, string>): {
  englishTitle: string;
  nativeTitle?: string;
  romajiTitle?: string;
} {
  const englishTitle = block["1"] || block["5"] || block["english"] || "";
  const nativeTitle = block["8"] || block["native"] || undefined;
  const romajiTitle = block["9"] || block["romaji"] || undefined;
  return { englishTitle, nativeTitle, romajiTitle };
}

/**
 * Extract anime slug from a URL like /anime/{slug}
 */
function extractSlug(url: string): string {
  const match = url.match(/\/anime\/([a-z0-9]+)/);
  return match ? match[1] : "";
}

// ── Scraper Functions ──

/**
 * Get AniZone homepage sections.
 * Returns latest anime, latest episodes, and top tags.
 */
export async function getAniZoneHome(): Promise<AniZoneHomeSection | null> {
  const html = await fetchAniZonePage(`${ANIZONE_BASE}/`);
  if (!html) return null;

  const titleBlocks = extractTitleBlocks(html);
  const latestAnime: AniZoneAnime[] = [];

  // Extract Latest Anime section
  // Pattern: href="/anime/{slug}" with img poster and JSON.parse title block
  const animeLinkPattern = /href="https:\/\/anizone\.to\/anime\/([a-z0-9]+)"/g;
  const imgPattern = /src="https:\/\/anizone\.to\/images\/anime\/([a-f0-9-]+)\.jpg"/g;

  const animeLinks = [...html.matchAll(animeLinkPattern)];
  const animeImages = [...html.matchAll(imgPattern)];

  // Deduplicate slugs (each appears twice - link + image)
  const uniqueSlugs = [...new Set(animeLinks.map((m) => m[1]))];

  // Match slugs with their title blocks and images
  for (let i = 0; i < uniqueSlugs.length && i < titleBlocks.length; i++) {
    const slug = uniqueSlugs[i];
    const titles = getTitleFromBlock(titleBlocks[i]);

    // Find matching poster image
    const posterUuid =
      animeImages.length > i ? animeImages[i]?.[1] : animeImages[0]?.[1];
    const posterUrl = posterUuid
      ? `https://anizone.to/images/anime/${posterUuid}.jpg`
      : "";

    latestAnime.push({
      slug,
      title: titles.englishTitle,
      romajiTitle: titles.romajiTitle,
      nativeTitle: titles.nativeTitle,
      posterUrl,
      tags: [],
    });
  }

  // Extract Latest Episodes section
  const latestEpisodes: AniZoneEpisodeItem[] = [];
  const epLinkPattern =
    /href="https:\/\/anizone\.to\/anime\/([a-z0-9]+)\/(\d+)"/g;
  const epLinks = [...html.matchAll(epLinkPattern)];

  // Episodes section starts after "Latest Episodes" heading
  const epSectionStart =
    html.indexOf("Latest Episodes</span>") || html.indexOf("Latest Episodes");
  const epSectionEnd = html.indexOf("Top Tags");

  if (epSectionStart !== -1 && epSectionEnd !== -1) {
    const epSection = html.substring(epSectionStart, epSectionEnd);
    const epTitleBlocks = extractTitleBlocks(epSection);
    const epLinksInSection = [...epSection.matchAll(epLinkPattern)];
    const epImagesInSection = [
      ...epSection.matchAll(
        /src="https:\/\/anizone\.to\/images\/anime\/([a-f0-9-]+)\.jpg"/g,
      ),
    ];

    const uniqueEpSlugs = [
      ...new Set(epLinksInSection.map((m) => m[1])),
    ];

    for (let i = 0; i < uniqueEpSlugs.length && i < epTitleBlocks.length; i++) {
      const animeSlug = uniqueEpSlugs[i];
      const titles = getTitleFromBlock(epTitleBlocks[i]);
      const epNum = epLinksInSection.find(
        (m) => m[1] === animeSlug,
      )?.[2] || "1";
      const posterUuid =
        epImagesInSection.length > i
          ? epImagesInSection[i]?.[1]
          : epImagesInSection[0]?.[1];

      latestEpisodes.push({
        animeSlug,
        episodeNumber: parseInt(epNum),
        animeTitle: titles.englishTitle,
        posterUrl: posterUuid
          ? `https://anizone.to/images/anime/${posterUuid}.jpg`
          : "",
        url: `${ANIZONE_BASE}/anime/${animeSlug}/${epNum}`,
      });
    }
  }

  // Extract Top Tags section
  const topTags: Array<{ slug: string; name: string }> = [];
  const tagPattern =
    /href="https:\/\/anizone\.to\/tag\/([a-z0-9]+)"[^>]*title="([^"]+)"/g;
  const tagMatches = [...html.matchAll(tagPattern)];
  for (const match of tagMatches) {
    topTags.push({ slug: match[1], name: match[2] });
  }

  return { latestAnime, latestEpisodes, topTags };
}

/**
 * Get anime index (paginated list of all anime).
 * Supports sorting and type filtering via Livewire parameters.
 */
export async function getAniZoneAnimeIndex(
  page = 1,
  sort = "title-asc",
  type = "0",
): Promise<{ anime: AniZoneAnime[]; totalPages: number } | null> {
  const html = await fetchAniZonePage(`${ANIZONE_BASE}/anime`);
  if (!html) return null;

  const titleBlocks = extractTitleBlocks(html);
  const anime: AniZoneAnime[] = [];

  // Extract anime entries
  const animeLinkPattern =
    /href="https:\/\/anizone\.to\/anime\/([a-z0-9]+)"/g;
  const animeLinks = [...html.matchAll(animeLinkPattern)];
  const imgPattern =
    /src="https:\/\/anizone\.to\/images\/anime\/([a-f0-9-]+)\.jpg"/g;
  const animeImages = [...html.matchAll(imgPattern)];

  // Deduplicate
  const uniqueSlugs = [...new Set(animeLinks.map((m) => m[1]))];

  // Extract type/status/year metadata from spans
  const metaSpans = [
    ...html.matchAll(
      /class="inline-block">([^<]+)<\/span>/g,
    ),
  ];

  for (let i = 0; i < uniqueSlugs.length && i < titleBlocks.length; i++) {
    const slug = uniqueSlugs[i];
    const titles = getTitleFromBlock(titleBlocks[i]);
    const posterUuid = animeImages[i]?.[1];
    const posterUrl = posterUuid
      ? `https://anizone.to/images/anime/${posterUuid}.jpg`
      : "";

    // Try to find metadata near this anime entry
    // Each anime card has spans with type, status, episode count, year
    const entryStartIdx = html.indexOf(`/anime/${slug}`);
    let typeStr: string | undefined;
    let statusStr: string | undefined;
    let epCountStr: string | undefined;
    let yearStr: string | undefined;

    if (entryStartIdx !== -1) {
      const context = html.substring(entryStartIdx, entryStartIdx + 2000);
      const typeMatch = context.match(/class="inline-block">(TV Series|OVA|Movie|Web|TV Special|Music Video|Other|Unknown)<\/span>/);
      const statusMatch = context.match(/class="inline-block">(Ongoing|Completed|Upcoming|Cancelled|Hiatus)<\/span>/);
      const epCountMatch = context.match(/class="inline-block">(\d+) Episodes<\/span>/);
      const yearMatch = context.match(/class="inline-block">(\d{4})<\/span>/);
      typeStr = typeMatch?.[1];
      statusStr = statusMatch?.[1];
      epCountStr = epCountMatch?.[1];
      yearStr = yearMatch?.[1];
    }

    anime.push({
      slug,
      title: titles.englishTitle,
      romajiTitle: titles.romajiTitle,
      nativeTitle: titles.nativeTitle,
      posterUrl,
      type: typeStr,
      status: statusStr,
      episodeCount: epCountStr ? parseInt(epCountStr) : undefined,
      year: yearStr ? parseInt(yearStr) : undefined,
      tags: [],
    });
  }

  // Estimate total pages from Livewire data (listSize=24 per page)
  const totalPages = Math.ceil(uniqueSlugs.length > 0 ? 1000 : 0 / 24);

  return { anime, totalPages: Math.max(totalPages, 1) };
}

/**
 * Search AniZone for anime by title.
 * Uses the anime index page with search parameter.
 */
export async function searchAniZone(
  query: string,
): Promise<AniZoneAnime[] | null> {
  const html = await fetchAniZonePage(
    `${ANIZONE_BASE}/anime?search=${encodeURIComponent(query)}`,
  );
  if (!html) return null;

  const titleBlocks = extractTitleBlocks(html);
  const results: AniZoneAnime[] = [];

  const animeLinkPattern =
    /href="https:\/\/anizone\.to\/anime\/([a-z0-9]+)"/g;
  const animeLinks = [...html.matchAll(animeLinkPattern)];
  const imgPattern =
    /src="https:\/\/anizone\.to\/images\/anime\/([a-f0-9-]+)\.jpg"/g;
  const animeImages = [...html.matchAll(imgPattern)];

  const uniqueSlugs = [...new Set(animeLinks.map((m) => m[1]))];

  for (let i = 0; i < uniqueSlugs.length && i < titleBlocks.length; i++) {
    const slug = uniqueSlugs[i];
    const titles = getTitleFromBlock(titleBlocks[i]);
    const posterUuid = animeImages[i]?.[1];

    results.push({
      slug,
      title: titles.englishTitle,
      romajiTitle: titles.romajiTitle,
      nativeTitle: titles.nativeTitle,
      posterUrl: posterUuid
        ? `https://anizone.to/images/anime/${posterUuid}.jpg`
        : "",
      tags: [],
    });
  }

  return results;
}

/**
 * Get anime detail page — full info + episode list.
 */
export async function getAniZoneDetail(
  slug: string,
): Promise<AniZoneAnimeDetail | null> {
  const html = await fetchAniZonePage(`${ANIZONE_BASE}/anime/${slug}`);
  if (!html) return null;

  // ── Anime metadata ──
  const posterImages = [
    ...html.matchAll(
      /src="https:\/\/anizone\.to\/images\/anime\/([a-f0-9-]+)\.jpg"/g,
    ),
  ];
  const posterUrl = posterImages.length > 0
    ? `https://anizone.to/images/anime/${posterImages[0][1]}.jpg`
    : "";

  // Title from JSON.parse blocks (the epsTitles block contains title info)
  // But also look for the anime-detail component's x-data
  const titleBlocks = extractTitleBlocks(html);
  const mainTitles = titleBlocks.length > 0
    ? getTitleFromBlock(titleBlocks[0])
    : { englishTitle: "", nativeTitle: undefined, romajiTitle: undefined };

  // Also find anmSlug and epsTitles in the Alpine x-data
  const epsTitlesMatch = html.match(
    /epsTitles,\s*JSON\.parse\('([^']+)'\)/,
  );
  const episodeTitles: Record<string, string> = {};
  if (epsTitlesMatch) {
    const parsed = decodeAlpineJson(epsTitlesMatch[1]);
    if (parsed) {
      Object.assign(episodeTitles, parsed);
    }
  }

  // Extract metadata spans
  const typeMatch = html.match(
    /class="inline-block">(TV Series|OVA|Movie|Web|TV Special|Music Video|Other|Unknown)<\/span>/,
  );
  const statusMatch = html.match(
    /class="inline-block">(Ongoing|Completed|Upcoming|Cancelled|Hiatus)<\/span>/,
  );
  const epCountMatch = html.match(/class="inline-block">(\d+) Episodes<\/span>/);
  const yearMatch = html.match(/class="inline-block">(\d{4})<\/span>/);

  // Synopsis
  const synopsisIdx = html.indexOf("Synopsis</h3>");
  let synopsis: string | undefined;
  if (synopsisIdx !== -1) {
    const synSection = html.substring(synopsisIdx, synopsisIdx + 1000);
    const synMatch = synSection.match(/<div>([^<]+)<\/div>/);
    synopsis = synMatch?.[1];
  }

  // Tags
  const tags: Array<{ slug: string; name: string }> = [];
  const tagPattern =
    /href="https:\/\/anizone\.to\/tag\/([a-z0-9]+)"[^>]*title="([^"]+)"/g;
  for (const match of html.matchAll(tagPattern)) {
    tags.push({ slug: match[1], name: match[2] });
  }

  // Official site
  const officialSiteMatch = html.match(
    /href="([^"]+)"[^>]*target="_blank"[^>]*rel="nofollow noopener noreferrer"[^>]*aria-label="Official Site"/,
  );

  const anime: AniZoneAnime = {
    slug,
    title: mainTitles.englishTitle || slug,
    romajiTitle: mainTitles.romajiTitle,
    nativeTitle: mainTitles.nativeTitle,
    posterUrl,
    type: typeMatch?.[1],
    status: statusMatch?.[1],
    episodeCount: epCountMatch ? parseInt(epCountMatch[1]) : undefined,
    year: yearMatch ? parseInt(yearMatch[1]) : undefined,
    synopsis,
    tags,
    officialSite: officialSiteMatch?.[1],
  };

  // ── Episode list ──
  // Episodes are in the Livewire rendered HTML with wire:key patterns
  // Pattern: wire:key="{slug}-{epNum}"
  const episodes: AniZoneEpisode[] = [];
  const epKeyPattern = /wire:key="[^"]*-(\d+)"[^>]*>/g;

  // More reliable: find episode links from the episode section
  // Pattern: href="/anime/{slug}/{epNum}"
  const epLinkPattern = new RegExp(
    `href="https://anizone\\.to/anime/${slug}/(\\d+)"`,
    "g",
  );
  const epMatches = [...html.matchAll(epLinkPattern)];
  const uniqueEpNums = [...new Set(epMatches.map((m) => m[1]))];

  // Episode type filter values from the select dropdown
  for (const epNum of uniqueEpNums) {
    const num = parseInt(epNum);
    const title = episodeTitles[epNum] || episodeTitles[String(num)] || undefined;

    // Determine type — default to Regular Episode (1) unless we find evidence
    let epType = 1;

    // Check for type indicators in nearby context
    const epIdx = html.indexOf(`/${slug}/${epNum}`);
    if (epIdx !== -1) {
      const context = html.substring(epIdx, epIdx + 500);
      if (context.includes("Special")) epType = 2;
      else if (context.includes("Opening") || context.includes("Ending")) epType = 3;
      else if (context.includes("Trailer") || context.includes("Promo")) epType = 4;
    }

    episodes.push({
      episodeNumber: num,
      title,
      slug: String(num),
      type: epType,
      typeLabel: EPISODE_TYPE_LABELS[epType] || "Unknown",
    });
  }

  // Sort episodes by number
  episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

  return { anime, episodes, episodeTitles };
}

/**
 * Get video sources for a specific episode.
 * Returns m3u8 URL, all subtitle tracks, chapters, storyboard.
 */
export async function getAniZoneEpisodeVideo(
  slug: string,
  epNum: number,
): Promise<AniZoneVideoSource | null> {
  const html = await fetchAniZonePage(
    `${ANIZONE_BASE}/anime/${slug}/${epNum}`,
  );
  if (!html) return null;

  // ── Extract m3u8 URL ──
  const m3u8Match = html.match(
    /https:\/\/suzaku\.xin-cdn\.xyz\/([a-f0-9-]+)\/master\.m3u8/,
  );
  if (!m3u8Match) {
    console.error(`[anizone] no m3u8 found for ${slug}/${epNum}`);
    return null;
  }

  const m3u8Url = m3u8Match[0];
  const cdnUuid = m3u8Match[1];
  const cdnBase = `https://suzaku.xin-cdn.xyz/${cdnUuid}`;

  // ── Extract subtitle tracks ──
  // Pattern from track tags: <track src="{cdnBase}/subtitles/{n}_{lang}.srt" data-type="srt" label="{label}" srclang="{lang}">
  const subtitleTracks: AniZoneSubtitle[] = [];

  // Extract from track tags (more reliable — includes label)
  const trackPattern =
    /<track\s+src="https:\/\/suzaku\.xin-cdn\.xyz\/[a-f0-9-]+\/subtitles\/(\d+)_(\w[\w-]*)\.(\w+)"\s+data-type="(\w+)"[^>]*label="([^"]+)"[^>]*srclang="([^"]+)"/g;

  for (const match of html.matchAll(trackPattern)) {
    const [, index, langCode, ext, format, label, srclang] = match;
    subtitleTracks.push({
      url: `${cdnBase}/subtitles/${index}_${langCode}.${ext}`,
      lang: srclang || langCode,
      label: label || LANG_NAMES[langCode] || langCode,
      format: format as "srt" | "ass" | "vtt",
    });
  }

  // Fallback: extract from URL pattern if track tags weren't parsed
  if (subtitleTracks.length === 0) {
    const subUrlPattern =
      /https:\/\/suzaku\.xin-cdn\.xyz\/[a-f0-9-]+\/subtitles\/(\d+)_(\w[\w-]*)\.(srt|ass|vtt)/g;
    for (const match of html.matchAll(subUrlPattern)) {
      const [, index, langCode, ext] = match;
      subtitleTracks.push({
        url: `${cdnBase}/subtitles/${index}_${langCode}.${ext}`,
        lang: langCode,
        label: LANG_NAMES[langCode] || langCode,
        format: ext as "srt" | "ass" | "vtt",
      });
    }
  }

  // Deduplicate subtitle tracks
  const uniqueSubs = [...new Map(subtitleTracks.map((s) => [s.lang, s])).values()];

  // ── Chapters ──
  const chaptersUrl = `${cdnBase}/chapters.vtt`;

  // ── Storyboard ──
  const storyboardUrl = `${cdnBase}/storyboard.vtt`;

  // ── Snapshot / teaser images ──
  const snapshotUrl = `${cdnBase}/snapshot.webp`;
  const teaserUrl = `${cdnBase}/teaser.webp`;

  console.log(
    `[anizone] ${slug}/${epNum}: m3u8 found + ${uniqueSubs.length} subtitles`,
  );

  return {
    m3u8Url,
    cdnUuid,
    subtitleTracks: uniqueSubs,
    chaptersUrl,
    storyboardUrl,
    snapshotUrl,
    teaserUrl,
  };
}

/**
 * Get filter/sort options available on AniZone.
 */
export async function getAniZoneFilterOptions(): Promise<AniZoneFilterOptions | null> {
  const html = await fetchAniZonePage(`${ANIZONE_BASE}/anime`);
  if (!html) return null;

  // Parse from Livewire component snapshot
  const sortOptions: Record<string, string> = {};
  const sortMatch = html.match(
    /<option value="([^"]+)">([^<]+)<\/option>/g,
  );
  if (sortMatch) {
    for (const m of html.matchAll(
      /<option value="([^"]+)">([^<]+)<\/option>/g,
    )) {
      sortOptions[m[1]] = m[2];
    }
  }

  // Type options from Livewire data
  const typeOptions = [
    "All",
    "Unknown",
    "TV Series",
    "OVA",
    "Movie",
    "Other",
    "Web",
    "TV Special",
    "Music Video",
  ];

  const episodeTypeOptions = [
    "All",
    "Regular Episode",
    "Special",
    "Opening/Ending",
    "Trailer/Promo/Ads",
    "Parody/Fandub",
    "Other",
  ];

  return { sortOptions, typeOptions, episodeTypeOptions };
}

/**
 * Get episode index page (latest episodes across all anime).
 */
export async function getAniZoneEpisodeIndex(
  page = 1,
): Promise<AniZoneEpisodeItem[] | null> {
  const html = await fetchAniZonePage(`${ANIZONE_BASE}/episode`);
  if (!html) return null;

  const titleBlocks = extractTitleBlocks(html);
  const episodes: AniZoneEpisodeItem[] = [];

  const epLinkPattern =
    /href="https:\/\/anizone\.to\/anime\/([a-z0-9]+)\/(\d+)"/g;
  const epLinks = [...html.matchAll(epLinkPattern)];
  const imgPattern =
    /src="https:\/\/anizone\.to\/images\/anime\/([a-f0-9-]+)\.jpg"/g;
  const animeImages = [...html.matchAll(imgPattern)];

  const uniqueEpSlugs = [...new Set(epLinks.map((m) => m[1]))];

  for (let i = 0; i < uniqueEpSlugs.length && i < titleBlocks.length; i++) {
    const animeSlug = uniqueEpSlugs[i];
    const epNum =
      epLinks.find((m) => m[1] === animeSlug)?.[2] || "1";
    const titles = getTitleFromBlock(titleBlocks[i]);
    const posterUuid = animeImages[i]?.[1];

    episodes.push({
      animeSlug,
      episodeNumber: parseInt(epNum),
      animeTitle: titles.englishTitle,
      posterUrl: posterUuid
        ? `https://anizone.to/images/anime/${posterUuid}.jpg`
        : "",
      url: `${ANIZONE_BASE}/anime/${animeSlug}/${epNum}`,
    });
  }

  return episodes;
}

/**
 * Get tags index page.
 */
export async function getAniZoneTags(): Promise<
  Array<{ slug: string; name: string }> | null
> {
  const html = await fetchAniZonePage(`${ANIZONE_BASE}/tag`);
  if (!html) return null;

  const tags: Array<{ slug: string; name: string }> = [];
  const tagPattern =
    /href="https:\/\/anizone\.to\/tag\/([a-z0-9]+)"[^>]*title="([^"]+)"/g;

  for (const match of html.matchAll(tagPattern)) {
    tags.push({ slug: match[1], name: match[2] });
  }

  return tags;
}

/**
 * Resolve an AniList anime ID to AniZone slug + video streams.
 * This is the main function used by the anime streaming pipeline.
 */
export async function resolveAniZoneStream(
  anilistId: number,
  epNum: number,
  title: string,
): Promise<{
  m3u8Url: string;
  slug: string;
  subtitleTracks: AniZoneSubtitle[];
  chaptersUrl?: string;
  storyboardUrl?: string;
} | null> {
  // Search for the anime by title
  const results = await searchAniZone(title);
  if (!results || results.length === 0) return null;

  // Find best match
  const slug = results[0].slug;

  // Get video source for the episode
  const video = await getAniZoneEpisodeVideo(slug, epNum);
  if (!video) return null;

  return {
    m3u8Url: video.m3u8Url,
    slug,
    subtitleTracks: video.subtitleTracks,
    chaptersUrl: video.chaptersUrl,
    storyboardUrl: video.storyboardUrl,
  };
}
