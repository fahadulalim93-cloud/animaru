/**
 * NovelArchive API Client
 * -----------------------
 * Proxies to novelarchive.cc's public API at /api/novels/*
 *
 * All endpoints are server-side (Node.js runtime) with in-memory caching
 * to reduce latency and avoid rate limiting.
 */

const NA_BASE = "https://novelarchive.cc/api";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Novel {
  id: string;
  title: string;
  author: string;
  description: string;
  genres: string;
  cover_url: string;
  image_url: string;
  novel_image: string;
  total_chapters: string;
  views: string;
  views_number: number;
  rating: number;
  rating_count: number;
  latest_release: string;
  release_status: string;
  ongoing: string;
  updated_at?: string;
}

export interface NovelDetail {
  novel: Novel;
  chapter_names: string[];
}

export interface Chapter {
  number: number;
  name: string;
  content: string;
}

export interface ChapterResponse {
  novel: Pick<Novel, "id" | "title" | "author" | "genres" | "total_chapters" | "views" | "views_number">;
  chapter: Chapter;
  navigation: { prev: number | null; next: number | null };
  chapter_names: string[];
}

export interface NovelListResponse {
  novels: Novel[];
}

// ── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { data: any; ts: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() });
}

// ── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchNA<T>(path: string, timeoutMs = 15000): Promise<T | null> {
  const cached = getCached<T>(path);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${NA_BASE}${path}`, {
      headers: {
        "User-Agent": UA,
        "Accept": "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`[NA] ${path} HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    setCached(path, data);
    return data as T;
  } catch (err) {
    console.error(`[NA] ${path} error:`, err);
    return null;
  }
}

// ── Cover URL helper ─────────────────────────────────────────────────────────

export function coverUrl(novel: Pick<Novel, "cover_url" | "image_url" | "novel_image" | "id">, width = 400): string {
  const path = novel.cover_url || novel.image_url || novel.novel_image;
  if (!path) return "";
  if (path.startsWith("http")) return path;
  // Path is like /api/novels/{id}/cover?w=640&q=72&format=webp
  // Rewrite width and use novelarchive.cc as base
  return `https://novelarchive.cc${path.replace(/w=\d+/, `w=${width}`)}`;
}

// ── API methods ──────────────────────────────────────────────────────────────

export async function getTrending(limit = 20): Promise<Novel[]> {
  const data = await fetchNA<NovelListResponse>(`/novels/trending?limit=${limit}`);
  return data?.novels || [];
}

export async function getRecent(limit = 20): Promise<Novel[]> {
  const data = await fetchNA<NovelListResponse>(`/novels/recent?limit=${limit}`);
  return data?.novels || [];
}

export async function getRecentlyUpdated(limit = 20): Promise<Novel[]> {
  const data = await fetchNA<NovelListResponse>(`/novels/recently-updated?limit=${limit}`);
  return data?.novels || [];
}

export async function getEditorsChoice(limit = 10): Promise<Novel[]> {
  const data = await fetchNA<NovelListResponse>(`/novels/editors-choice?limit=${limit}`);
  return data?.novels || [];
}

export async function getGenres(): Promise<{ value: string; label: string }[]> {
  const data = await fetchNA<{ genres: any[] }>(`/novels/genres`);
  if (!data?.genres) return [];
  // Genres can be strings or {value, label} objects — normalize to {value, label}
  return data.genres.map((g: any) => {
    if (typeof g === "string") return { value: g.toLowerCase(), label: g };
    return { value: g.value || String(g).toLowerCase(), label: g.label || String(g) };
  });
}

export async function searchNovels(query: string, limit = 20): Promise<Novel[]> {
  // Use the /novels (browse) endpoint with search param — the /list endpoint
  // doesn't return search results, only the browse endpoint does.
  const data = await fetchNA<any>(`/novels?search=${encodeURIComponent(query)}&fuzzy=1&per_page=${limit}`);
  return data?.novels || [];
}

export async function browseNovels(params: {
  search?: string;
  genres?: string;
  sort?: string;
  page?: number;
  limit?: number;
}): Promise<{ novels: Novel[]; total?: number; page?: number; totalPages?: number }> {
  const q = new URLSearchParams();
  if (params.search) {
    q.set("search", params.search);
    q.set("fuzzy", "1");
  }
  if (params.genres) q.set("genres_include", params.genres);
  if (params.sort) q.set("sort", params.sort);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("per_page", String(params.limit));
  // /novels is the browse endpoint (not /novels/browse which requires a novel ID)
  const data = await fetchNA<any>(`/novels?${q.toString()}`);
  return {
    novels: data?.novels || [],
    total: data?.pagination?.total,
    page: data?.pagination?.page,
    totalPages: data?.pagination?.totalPages,
  };
}

export async function getNovelDetail(id: string): Promise<NovelDetail | null> {
  const data = await fetchNA<any>(`/novels/${id}`);
  if (!data) return null;
  // API returns { novel: {...}, chapter_names: [...] }
  const novel = data.novel || data;
  const chapter_names = data.chapter_names || novel.chapter_names || [];
  return { novel, chapter_names };
}

export async function getChapter(novelId: string, chapterNum: number): Promise<ChapterResponse | null> {
  const data = await fetchNA<ChapterResponse>(`/novels/${novelId}/chapters/${chapterNum}`);
  return data;
}
