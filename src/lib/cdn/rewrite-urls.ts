/**
 * LuffyTV CDN — Image URL Rewriter
 * =================================
 *
 * Rewrites external image URLs (AniList, AniClipse) to use our own
 * cdn.luffytv.live/media/anime/{cover,banner}/{filename} endpoint.
 *
 * Why: We have 30K+ images stored locally on the VPS. Serving them from
 * cdn.luffytv.live is faster, more reliable, and doesn't depend on AniList
 * being online.
 *
 * Input URL patterns we rewrite:
 *   https://s4.anilist.co/file/anilistcdn/media/anime/cover/{size}/bx{ID}-{HASH}.jpg
 *   https://s4.anilist.co/file/anilistcdn/media/anime/banner/{ID}-{HASH}.jpg
 *   https://cdn.aniclipse.com/media/anime/cover/{size}/bx{ID}-{HASH}.jpg
 *   https://cdn.aniclipse.com/media/anime/banner/{ID}-{HASH}.jpg
 *
 * Output:
 *   https://cdn.luffytv.live/media/anime/cover/{our_filename}   (looked up from DB by anilist_id)
 *   https://cdn.luffytv.live/media/anime/banner/{our_filename}  (looked up from DB by anilist_id)
 *
 * If we don't have the image locally, we leave the URL unchanged (so the
 * browser falls back to the original source).
 */

const CDN_BASE = "https://cdn.luffytv.live";

// Cache: anilist_id → { cover: filename, banner: filename }
// Populated lazily on first lookup.
let imageCache: Map<number, { cover?: string; banner?: string }> | null = null;
let cacheLoadAttempted = false;

function loadImageCache(): Map<number, { cover?: string; banner?: string }> | null {
  if (imageCache) return imageCache;
  if (cacheLoadAttempted) return null;
  cacheLoadAttempted = true;

  try {
    const fs = require("fs");
    const coverDir = "/data/luffytv-cdn-data/images/cover";
    const bannerDir = "/data/luffytv-cdn-data/images/banner";

    imageCache = new Map();

    // Index cover images by anilist_id
    // Filenames are either:
    //   bx{ID}-{HASH}.jpg  → extract ID
    //   {ID}.jpg           → extract ID
    //   {ID}-{HASH}.jpg    → extract ID
    if (fs.existsSync(coverDir)) {
      for (const fname of fs.readdirSync(coverDir)) {
        const id = extractAnilistId(fname);
        if (id) {
          const entry = imageCache.get(id) || {};
          entry.cover = fname;
          imageCache.set(id, entry);
        }
      }
    }

    // Index banner images by anilist_id
    // Banner filenames are always {ID}-{HASH}.jpg
    if (fs.existsSync(bannerDir)) {
      for (const fname of fs.readdirSync(bannerDir)) {
        const id = extractAnilistId(fname);
        if (id) {
          const entry = imageCache.get(id) || {};
          entry.banner = fname;
          imageCache.set(id, entry);
        }
      }
    }

    console.log(`[cdn-rewriter] Loaded image cache: ${imageCache.size} anime, ${countCovers()} covers, ${countBanners()} banners`);
    return imageCache;
  } catch (e) {
    console.warn(`[cdn-rewriter] Failed to load image cache:`, e instanceof Error ? e.message : e);
    return null;
  }
}

function countCovers(): number {
  if (!imageCache) return 0;
  let n = 0;
  for (const v of imageCache.values()) if (v.cover) n++;
  return n;
}

function countBanners(): number {
  if (!imageCache) return 0;
  let n = 0;
  for (const v of imageCache.values()) if (v.banner) n++;
  return n;
}

/**
 * Extract anilist_id from a filename like:
 *   bx21-ELSYx3yMPcKM.jpg → 21
 *   21-wf37VakJmZqs.jpg   → 21
 *   10000.jpg              → 10000
 */
function extractAnilistId(filename: string): number | null {
  // Try bx{ID} pattern first
  const bxMatch = filename.match(/^bx(\d+)/i);
  if (bxMatch) return parseInt(bxMatch[1], 10);

  // Try {ID}-{HASH}.jpg or {ID}.jpg
  const idMatch = filename.match(/^(\d+)(?:-|\.)/);
  if (idMatch) return parseInt(idMatch[1], 10);

  return null;
}

/**
 * Extract anilist_id from an external URL.
 *
 * AniList: https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg
 *   → /file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg
 *   → filename: bx21-ELSYx3yMPcKM.jpg → ID: 21
 *
 * AniClipse: https://cdn.aniclipse.com/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg
 *   → /media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg
 *   → filename: bx21-ELSYx3yMPcKM.jpg → ID: 21
 */
function extractIdFromUrl(url: string): { id: number; type: "cover" | "banner" } | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;

    // Determine type (cover or banner) from path
    let type: "cover" | "banner" | null = null;
    if (path.includes("/cover/")) type = "cover";
    else if (path.includes("/banner/")) type = "banner";
    else return null;

    // Extract filename from path (last segment)
    const parts = path.split("/");
    const filename = parts[parts.length - 1];
    if (!filename) return null;

    // Extract ID from filename
    const id = extractAnilistId(filename);
    if (!id) return null;

    return { id, type };
  } catch {
    return null;
  }
}

/**
 * Rewrite an external image URL to use our cdn.luffytv.live endpoint.
 * Returns the original URL if we don't have the image locally.
 */
export function rewriteImageUrl(url: string | null | undefined): string | null | undefined {
  if (!url || typeof url !== "string") return url;
  if (!url.startsWith("http")) return url;

  // Only rewrite AniList and AniClipse URLs
  if (!url.includes("anilist.co") && !url.includes("anilistcdn") && !url.includes("cdn.aniclipse.com")) {
    return url;
  }

  const extracted = extractIdFromUrl(url);
  if (!extracted) return url;

  const cache = loadImageCache();
  if (!cache) return url;

  const entry = cache.get(extracted.id);
  if (!entry) return url;

  const filename = extracted.type === "cover" ? entry.cover : entry.banner;
  if (!filename) return url;

  // Return our CDN URL
  return `${CDN_BASE}/media/anime/${extracted.type}/${filename}`;
}

/**
 * Rewrite image URLs inside a deeply-nested object.
 * Walks the object tree, finds any string that looks like an image URL,
 * and rewrites it.
 */
export function rewriteImageUrls<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    // Check if it looks like an AniList or AniClipse image URL
    if (
      (obj.includes("anilist.co") || obj.includes("anilistcdn") || obj.includes("cdn.aniclipse.com")) &&
      (obj.includes("/cover/") || obj.includes("/banner/"))
    ) {
      return rewriteImageUrl(obj) as unknown as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(rewriteImageUrls) as unknown as T;
  }

  if (typeof obj === "object") {
    const result: any = {};
    for (const key of Object.keys(obj as any)) {
      result[key] = rewriteImageUrls((obj as any)[key]);
    }
    return result;
  }

  return obj;
}

/**
 * Specifically rewrite the coverImage and bannerImage fields of an AniList-
 * shaped anime object.
 *
 * AniList shape:
 *   {
 *     id: 21,
 *     title: {...},
 *     coverImage: { extraLarge: "https://s4.anilist.co/...", large: "...", medium: "..." },
 *     bannerImage: "https://s4.anilist.co/..."
 *   }
 */
export function rewriteAnimeImages(anime: any): any {
  if (!anime || typeof anime !== "object") return anime;

  const result = { ...anime };

  // Rewrite coverImage fields (extraLarge, large, medium)
  if (result.coverImage && typeof result.coverImage === "object") {
    result.coverImage = {
      ...result.coverImage,
      extraLarge: rewriteImageUrl(result.coverImage.extraLarge) || result.coverImage.extraLarge,
      large: rewriteImageUrl(result.coverImage.large) || result.coverImage.large,
      medium: rewriteImageUrl(result.coverImage.medium) || result.coverImage.medium,
    };
  }

  // Rewrite bannerImage
  if (result.bannerImage) {
    result.bannerImage = rewriteImageUrl(result.bannerImage) || result.bannerImage;
  }

  return result;
}

/**
 * Rewrite image URLs for an array of anime objects.
 */
export function rewriteAnimeArray(animeList: any[]): any[] {
  if (!Array.isArray(animeList)) return animeList;
  return animeList.map(rewriteAnimeImages);
}
