import { readFileSync, existsSync } from "fs";

const METADATA_FILE = "/data/luffytv-cdn-data/manga-metadata.json";
const CDN_BASE = "https://cdn.luffytv.live/media/manga/cover";

let lookupMap: Map<string, string> | null = null;

function getLookupMap(): Map<string, string> {
  if (lookupMap) return lookupMap;
  lookupMap = new Map();
  try {
    if (existsSync(METADATA_FILE)) {
      const data = JSON.parse(readFileSync(METADATA_FILE, "utf-8"));
      for (const t of (data.titles || [])) {
        if (t.originalPosterUrl && t.coverFile) {
          lookupMap.set(t.originalPosterUrl, t.coverFile);
          lookupMap.set(t.originalPosterUrl.replace(/\.[^.]+$/, ""), t.coverFile);
        }
      }
    }
  } catch {}
  return lookupMap;
}

export function rewriteMangaImageUrl(url: string | null | undefined): string | null | undefined {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("atsu.moe") && !url.includes("static/posters/")) return url;
  const match = url.match(/static\/(posters\/[^?#]+)/);
  if (!match) return url;
  const posterPath = match[1];
  const map = getLookupMap();
  if (map.has(posterPath)) return `${CDN_BASE}/${map.get(posterPath)}`;
  const base = posterPath.replace(/\.[^.]+$/, "");
  if (map.has(base)) return `${CDN_BASE}/${map.get(base)}`;
  const idMatch = posterPath.match(/posters\/([^-.]+)/);
  if (idMatch) {
    for (const [key, filename] of map.entries()) {
      if (key.includes(idMatch[1])) return `${CDN_BASE}/${filename}`;
    }
  }
  return url;
}

export function rewriteMangaArray<T>(items: T[]): T[] {
  return items.map((item: any) => {
    if (typeof item !== "object" || item === null) return item;
    if (item.poster) item.poster = rewriteMangaImageUrl(item.poster);
    if (item.cover) item.cover = rewriteMangaImageUrl(item.cover);
    if (item.posterMedium) item.posterMedium = rewriteMangaImageUrl(item.posterMedium);
    if (item.banner) item.banner = rewriteMangaImageUrl(item.banner);
    return item;
  });
}
