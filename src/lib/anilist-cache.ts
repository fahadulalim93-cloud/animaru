/**
 * Centralized AniList Cache — 4-Layer Progressive Cache
 * ======================================================
 *
 * ALL AniList GraphQL queries in the app MUST go through this module.
 *
 * Layered cache strategy (in order):
 *   1. In-memory LRU (10K entries, 2h TTL) — instant for repeat requests
 *   2. PostgreSQL AniListCache table (persistent, survives restarts)
 *      — Every AniList response is saved here automatically
 *      — Over time, this DB grows to cover every anime users have ever queried
 *   3. AniList direct API (4s timeout) — fetch + save to DB
 *   4. Embedded JSON DB (1.5MB, 10K records) — last-resort offline fallback
 *
 * The DB layer (layer 2) is the key innovation: it persists across restarts,
 * so the cache only grows over time. After a few days of normal traffic,
 * the hit rate on layers 1+2 should be 99%+, eliminating AniList API calls
 * for popular content entirely.
 *
 * Usage:
 *   import { cachedQuery } from "./anilist-cache";
 *   const data = await cachedQuery(query, variables, { ttl: 7200000 });
 */

import { db } from "./db";

const ANILIST_API = "https://graphql.anilist.co";

// ─── Embedded Anime Database (offline fallback) ─────────────────────────────
// Loaded LAZILY on first lookup via dynamic import of 'fs'.
// Edge routes can't import 'fs' at top level.

interface EmbeddedAnimeRecord {
  t?: string;
  r?: string;
  n?: string;
  c?: string;
  b?: string;
  d?: string;
  f?: string;
  s?: string;
  e?: number;
  y?: number;
  se?: string;
  g?: string[];
  du?: number;
  tr?: string;
  sc?: number;
  m?: {
    a?: number;
    ad?: number;
    m?: number;
    tv?: number;
    tm?: number;
  };
}

let animeDb: Map<string, EmbeddedAnimeRecord> | null = null;
let animeDbLoadAttempted = false;

async function getAnimeDb(): Promise<Map<string, EmbeddedAnimeRecord> | null> {
  if (animeDb) return animeDb;
  if (animeDbLoadAttempted) return null;
  animeDbLoadAttempted = true;
  try {
    const fs = await import("fs");
    const path = await import("path");
    const dbPath = path.join(process.cwd(), "data", "anime-db.json");
    const raw = fs.readFileSync(dbPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, EmbeddedAnimeRecord>;
    animeDb = new Map(Object.entries(parsed));
    console.log(`[anilist-cache] Embedded DB loaded: ${animeDb.size} anime records`);
    return animeDb;
  } catch (e) {
    console.warn(`[anilist-cache] Failed to load embedded DB:`, e instanceof Error ? e.message : e);
    return null;
  }
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─── LRU Cache (in-memory, layer 1) ───────────────────────────────────────

class LRUCache<V> {
  private cache = new Map<string, { value: V; ts: number; ttl: number }>();
  private maxSize: number;

  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
  }

  get(key: string): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V, ttl: number): void {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, ts: Date.now(), ttl });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  stats(): { size: number; maxSize: number } {
    return { size: this.cache.size, maxSize: this.maxSize };
  }
}

const gqlCache = new LRUCache<any>(10000);
const titleCache = new LRUCache<AniListTitleInfo | null>(15000);

const DEFAULT_TTL = 2 * 60 * 60 * 1000;       // 2 hours (in-memory)
const DB_TTL = 7 * 24 * 60 * 60 * 1000;        // 7 days (DB layer — metadata rarely changes)
const TITLE_TTL = 24 * 60 * 60 * 1000;         // 24 hours
const ERROR_TTL = 2 * 60 * 1000;              // 2 min (don't hammer on errors)

const inflightRequests = new Map<string, Promise<any>>();

// ── AniList health check ─────────────────────────────────────────────────
// Tracks when AniList was last reachable. If the last attempt failed
// (429/5xx/timeout), we skip AniList API for the next 60 seconds and
// go directly to the SQLite fallback (20K anime DB).
// This prevents 3-10s timeouts on every cache miss when AniList is down.
let anilistLastOk = Date.now();        // assume OK at startup
let anilistLastError = 0;
const ANILIST_SKIP_DURATION_MS = 60 * 1000; // skip for 60s after a failure

function isAniListHealthy(): boolean {
  // If never errored, AniList is healthy
  if (anilistLastError === 0) return true;
  // If last error was >60s ago, try AniList again
  if (Date.now() - anilistLastError > ANILIST_SKIP_DURATION_MS) return true;
  // AniList recently failed — skip
  return false;
}

function markAniListSuccess() {
  anilistLastOk = Date.now();
  anilistLastError = 0;
}

function markAniListFailure() {
  anilistLastError = Date.now();
}

let stats = {
  hits: 0,           // LRU cache hits (layer 1)
  dbHits: 0,         // PostgreSQL hits (layer 2)
  misses: 0,         // AniList fetch (layer 3)
  embeddedHits: 0,   // Embedded JSON DB hits (layer 4)
  sqliteHits: 0,     // SQLite anime DB hits (layer 5)
  dedupHits: 0,
  errors: 0,
  rateLimits: 0,
  dbSaves: 0,
  anilistSkipped: 0,  // times we skipped AniList due to health check
};

// ─── Core: cached AniList GraphQL query ────────────────────────────────────

export interface CacheOptions {
  ttl?: number;
  timeoutMs?: number;
  revalidate?: number;
  noCache?: boolean;
}

export async function cachedQuery<T = any>(
  query: string,
  variables?: Record<string, unknown>,
  options?: CacheOptions
): Promise<T | null> {
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const timeoutMs = options?.timeoutMs ?? 4000;
  const revalidate = options?.revalidate ?? 3600;
  const cacheKey = buildCacheKey(query, variables);

  // Layer 1: in-memory LRU
  if (!options?.noCache) {
    const cached = gqlCache.get(cacheKey);
    if (cached !== undefined) {
      stats.hits++;
      return cached as T;
    }
  }

  // Request dedup
  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    stats.dedupHits++;
    return inflight as Promise<T | null>;
  }

  const fetchPromise = executeWithAllLayers<T>(query, variables, cacheKey, timeoutMs, revalidate, ttl);
  inflightRequests.set(cacheKey, fetchPromise);

  try {
    const result = await fetchPromise;
    if (result !== null) {
      gqlCache.set(cacheKey, result, ttl);
      stats.misses++;
    } else {
      gqlCache.set(cacheKey, null, ERROR_TTL);
      stats.errors++;
    }
    return result;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

// ─── 4-layer strategy execution ────────────────────────────────────────────

async function executeWithAllLayers<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  cacheKey: string,
  timeoutMs: number,
  revalidate: number,
  ttl: number
): Promise<T | null> {
  // Layer 2: PostgreSQL AniListCache (persistent cache)
  // Skip for noCache option
  try {
    const dbResult = await lookupFromDb(cacheKey);
    if (dbResult !== null) {
      stats.dbHits++;
      // Refresh in-memory LRU with DB hit
      gqlCache.set(cacheKey, dbResult, ttl);
      // ── DO NOT call incrementDbHit() here ──
      // Previously we did `incrementDbHit(cacheKey)` to bump a `hits` counter
      // on every DB read. That was a bug because:
      //   1. It caused a DB WRITE on every READ (defeats the purpose of caching)
      //   2. Prisma's @updatedAt directive auto-refreshes `updatedAt` on every
      //      UPDATE, which broke the 7-day TTL check in lookupFromDb() — the
      //      entry never expired because `updatedAt` kept getting bumped.
      //   3. Stale data persisted forever instead of being refreshed weekly.
      // Hit count is a vanity metric; we compute it from access logs instead.
      return dbResult as T;
    }
  } catch (e) {
    console.warn(`[anilist-cache] DB lookup failed:`, e instanceof Error ? e.message : e);
  }

  // Layer 3: AniList direct API (with health check)
  // ── If AniList recently failed (429/5xx/timeout), skip it and go directly
  // to the SQLite fallback. This prevents 3-10s timeouts on every cache miss
  // when AniList is down. After 60s, we retry AniList to check if it's back.
  let anilistResult: T | null = null;
  if (isAniListHealthy()) {
    anilistResult = await fetchAniListDirect<T>(query, variables, timeoutMs, revalidate);
    if (anilistResult !== null) {
      markAniListSuccess();
      // Save to DB (fire-and-forget, don't block response)
      saveToDb(cacheKey, query, variables, anilistResult, "anilist").catch(() => {});
      return anilistResult;
    }
    // AniList failed — mark it as unhealthy
    markAniListFailure();
  } else {
    stats.anilistSkipped++;
  }

  // Layer 5: SQLite anime DB (20K records — only for single anime lookups)
  // Tries to find the anime in our pre-built SQLite DB. Each row has the
  // FULL AniList GraphQL response in raw_json, so we can return it directly.
  // Only applies to Media(id:$id) queries (single anime by AniList ID).
  if (variables && typeof (variables as any).id === "number") {
    try {
      const { getAnimeByAnilistId } = await import("./anime-db-sqlite");
      const sqliteResult = getAnimeByAnilistId((variables as any).id);
      if (sqliteResult) {
        stats.sqliteHits++;
        // Save to PostgreSQL so future lookups hit Layer 2 instead
        saveToDb(cacheKey, query, variables, sqliteResult, "sqlite-backfill").catch(() => {});
        return sqliteResult as T;
      }
    } catch (e) {
      console.warn(`[anilist-cache] SQLite fallback error:`, e instanceof Error ? e.message.slice(0, 100) : e);
      // SQLite module not available or failed — fall through to embedded DB
    }
  }

  // Layer 4: Embedded JSON DB (last-resort fallback)
  const embeddedResult = await fetchFromEmbeddedDb(variables);
  if (embeddedResult) {
    try {
      const json = await embeddedResult.json();
      const data = (json as any)?.data as T;
      if (data) {
        stats.embeddedHits++;
        // Backfill to DB so next lookup hits layer 2 instead
        saveToDb(cacheKey, query, variables, data, "embedded-db-backfill").catch(() => {});
        return data;
      }
    } catch {}
  }

  return null;
}

// ─── Layer 2: PostgreSQL lookup + save ─────────────────────────────────────

async function lookupFromDb(cacheKey: string): Promise<any | null> {
  if (!db) return null;
  try {
    const entry = await (db as any).aniListCache.findUnique({
      where: { cacheKey },
      select: { response: true, updatedAt: true, errorCount: true },
    });
    if (!entry) return null;

    // If this was an error entry with high error count, treat as miss (try AniList again)
    if (entry.errorCount > 5) return null;

    // Check TTL — if entry is older than DB_TTL, treat as stale (return null to refresh)
    const ageMs = Date.now() - entry.updatedAt.getTime();
    if (ageMs > DB_TTL) return null;

    return entry.response;
  } catch (e) {
    // If table doesn't exist yet, error is expected — return null silently
    return null;
  }
}

async function saveToDb(
  cacheKey: string,
  query: string,
  variables: Record<string, unknown> | undefined,
  data: any,
  source: string
): Promise<void> {
  if (!db) return;
  try {
    // Extract anilistId from variables (if Media(id:$id) query)
    let anilistId: number | null = null;
    if (variables && typeof variables.id === "number") {
      anilistId = variables.id;
    }

    // Detect operation type from query
    let operation: string | null = null;
    const opMatch = query.match(/\b(Media|Page|Studio|Character|Staff|MediaList|User|AiringSchedule)\b/);
    if (opMatch) operation = opMatch[1];

    await (db as any).aniListCache.upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        anilistId,
        operation,
        response: data,
        source,
        hits: 0,
        errorCount: 0,
      },
      update: {
        response: data,
        source,
        updatedAt: new Date(),
        errorCount: 0,  // reset error count on success
      },
    });
    stats.dbSaves++;
  } catch (e) {
    // Don't fail the request if DB write fails — just log
    console.warn(`[anilist-cache] DB save failed:`, e instanceof Error ? e.message.slice(0, 80) : e);
  }
}

async function incrementDbHit(cacheKey: string): Promise<void> {
  if (!db) return;
  try {
    await (db as any).aniListCache.update({
      where: { cacheKey },
      data: { hits: { increment: 1 } },
    });
  } catch {}
}

// ─── Layer 3: AniList direct ──────────────────────────────────────────────

async function fetchAniListDirect<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  timeoutMs: number,
  revalidate: number
): Promise<T | null> {
  const body = JSON.stringify({ query, variables });

  const res = await fetchWithTimeout(ANILIST_API, body, timeoutMs, { revalidate });
  if (!res) return null;

  if (res.status === 429) {
    stats.rateLimits++;
    return null;
  }
  if (res.status >= 500) return null;
  if (!res.ok) return null;

  try {
    const json = await res.json();
    if (json.errors) {
      console.warn(`[anilist-cache] GraphQL error:`, json.errors[0]?.message || 'unknown');
      return null;
    }
    return (json.data as T) ?? null;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  body: string,
  timeoutMs: number,
  nextOptions: { revalidate?: number }
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchOptions: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": UA,
      },
      body,
      signal: controller.signal,
    };
    if (nextOptions.revalidate && typeof window === "undefined") {
      (fetchOptions as any).next = { revalidate: nextOptions.revalidate };
    }
    const r = await fetch(url, fetchOptions);
    clearTimeout(timeout);
    return r;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ─── Layer 4: Embedded DB ─────────────────────────────────────────────────

async function fetchFromEmbeddedDb(
  variables: Record<string, unknown> | undefined
): Promise<Response | null> {
  if (!variables || typeof variables.id !== "number") return null;
  const anilistId = variables.id;
  const db = await getAnimeDb();
  if (!db) return null;
  const record = db.get(String(anilistId));
  if (!record) return null;

  const title: any = {};
  if (record.t) title.english = record.t;
  if (record.r) title.romaji = record.r;
  if (record.n) title.native = record.n;

  const coverImage: any = {};
  if (record.c) {
    coverImage.large = record.c;
    coverImage.extraLarge = record.c;
    coverImage.medium = record.c;
  }

  const media: any = {
    id: anilistId,
    idMal: record.m?.m,
    title,
    coverImage,
    description: record.d,
    type: "ANIME",
    format: record.f,
    status: record.s,
    episodes: record.e,
    duration: record.du,
    season: record.se,
    seasonYear: record.y,
    genres: record.g || [],
    averageScore: record.sc,
    meanScore: record.sc,
    bannerImage: record.b,
    trailer: record.tr ? { id: record.tr, site: "youtube" } : undefined,
    mappings: {
      anilist_id: anilistId,
      mal_id: record.m?.m,
      anidb_id: record.m?.ad,
      thetvdb_id: record.m?.tv,
      tvdb_id: record.m?.tv,
      tmdb_id: record.m?.tm,
    },
    recommendations: { nodes: [] },
    relations: { edges: [] },
    studios: { nodes: [] },
    characters: { nodes: [] },
    staff: { nodes: [] },
    nextAiringEpisode: undefined,
    _source: "embedded-db",
  };

  return new Response(JSON.stringify({ data: { Media: media } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function buildCacheKey(query: string, variables?: Record<string, unknown>): string {
  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  const varsKey = variables ? JSON.stringify(variables, Object.keys(variables).sort()) : "";
  return `${normalizedQuery}:${varsKey}`;
}

// ─── Title-specific cache ──────────────────────────────────────────────────

const TITLE_QUERY = `
query($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { english romaji native }
    coverImage { large }
    episodes
    format
    status
  }
}
`;

export interface AniListTitleInfo {
  title: string;
  english?: string;
  romaji?: string;
  native?: string;
  image?: string;
  episodes?: number;
  format?: string;
  status?: string;
}

export async function getCachedTitle(
  anilistId: number,
  options?: { timeoutMs?: number }
): Promise<AniListTitleInfo | null> {
  const cacheKey = `title:${anilistId}`;
  const cached = titleCache.get(cacheKey);
  if (cached !== undefined) {
    stats.hits++;
    return cached;
  }
  const data = await cachedQuery(TITLE_QUERY, { id: anilistId }, {
    ttl: TITLE_TTL,
    timeoutMs: options?.timeoutMs ?? 6000,
  });
  if (!data?.Media) {
    titleCache.set(cacheKey, null, ERROR_TTL);
    return null;
  }
  const media = data.Media;
  const english = media.title?.english;
  const romaji = media.title?.romaji;
  const native = media.title?.native;
  const title = english || romaji || native || "";
  if (!title) {
    titleCache.set(cacheKey, null, ERROR_TTL);
    return null;
  }
  const entry: AniListTitleInfo = {
    title,
    english,
    romaji,
    native,
    image: media.coverImage?.large,
    episodes: media.episodes,
    format: media.format,
    status: media.status,
  };
  titleCache.set(cacheKey, entry, TITLE_TTL);
  return entry;
}

export async function getTitle(anilistId: number): Promise<string | null> {
  const info = await getCachedTitle(anilistId);
  return info?.title ?? null;
}

export async function batchGetTitles(
  ids: number[],
  concurrency = 5
): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += concurrency) {
    batches.push(ids.slice(i, i + concurrency));
  }
  for (const batch of batches) {
    const settled = await Promise.allSettled(
      batch.map(async (id) => {
        const title = await getTitle(id);
        return { id, title };
      })
    );
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value.title) {
        results.set(r.value.id, r.value.title);
      }
    }
  }
  return results;
}

export function getCacheStats() {
  const titleStats = titleCache.stats();
  const gqlStats = gqlCache.stats();
  const totalLookups = stats.hits + stats.dbHits + stats.misses + stats.embeddedHits + stats.sqliteHits + stats.dedupHits;
  const hitRate = totalLookups > 0
    ? ((stats.hits + stats.dbHits + stats.dedupHits + stats.embeddedHits + stats.sqliteHits) / totalLookups) * 100
    : 0;
  return {
    ...stats,
    hitRate,
    anilistHealthy: isAniListHealthy(),
    anilistLastOk: anilistLastError === 0 ? anilistLastOk : 0,
    size: gqlStats.size + titleStats.size,
    titleCache: titleStats,
    gqlCache: gqlStats,
    inflightRequests: inflightRequests.size,
  };
}

export function preWarm(entries: Array<{ id: number; title: string }>) {
  for (const e of entries) {
    const cacheKey = `title:${e.id}`;
    if (!titleCache.has(cacheKey)) {
      titleCache.set(cacheKey, { title: e.title } as AniListTitleInfo, TITLE_TTL);
    }
  }
}

export function clearAllCaches() {
  gqlCache.clear();
  titleCache.clear();
  stats = {
    hits: 0,
    dbHits: 0,
    misses: 0,
    embeddedHits: 0,
    sqliteHits: 0,
    dedupHits: 0,
    errors: 0,
    rateLimits: 0,
    dbSaves: 0,
    anilistSkipped: 0,
  };
}

export function invalidateTitle(anilistId: number) {
  titleCache.set(`title:${anilistId}`, undefined as any, 0);
}
