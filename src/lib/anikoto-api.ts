/**
 * AnikotoAPI Client
 *
 * API for browsing recent anime with sub/dub info and megaplay embed URLs.
 * Base URL: https://anikotoapi.site/
 * Rate limit: 60 requests per 120 seconds per IP
 *
 * Discovered from the megaplay.buzz ecosystem — this API powers
 * the anikototv.to anime catalog.
 */

const ANIKOTO_API = "https://anikotoapi.site";

// ---- Types ----

export interface AnikotoAnime {
  id: number;
  title: string;
  poster: string;
  is_dub: number;
  is_sub: number;
  episodes: string;
  ani_id: string;
  mal_id: string;
  terms_by_type: {
    genre?: string[];
    network?: string[];
  };
}

export interface AnikotoRecentResult {
  ok: boolean;
  anikoto_domains: string[];
  data: AnikotoAnime[];
  pagination?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export interface AnikotoEpisode {
  id: number;
  title: string;
  number: number;
  episode_embed_id: string;
  embed_url: {
    sub: string;
    dub: string;
  };
}

export interface AnikotoSeriesResult {
  ok: boolean;
  data: {
    anime: AnikotoAnime & {
      synopsis?: string;
      type?: string;
      status?: string;
      aired?: string;
      duration?: string;
      rating?: string;
      studios?: string[];
    };
    episodes: AnikotoEpisode[];
  };
}

// ---- In-memory rate limiter ----
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2100; // ~28 requests per minute (well under 60/120s limit)

async function rateLimitedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((r) =>
      setTimeout(r, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }
  lastRequestTime = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
        Accept: "application/json",
        ...(options?.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

// ---- API Functions ----

/** Get recent anime with sub/dub availability */
export async function anikotoRecentAnime(
  page: number = 1,
  perPage: number = 20
): Promise<AnikotoAnime[]> {
  try {
    const res = await rateLimitedFetch(
      `${ANIKOTO_API}/recent-anime?page=${page}&per_page=${perPage}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) throw new Error(`Recent anime failed: ${res.status}`);
    const data: AnikotoRecentResult = await res.json();
    return data.data || [];
  } catch (err) {
    console.error("[AnikotoAPI] Recent anime fetch failed:", err);
    return [];
  }
}

/** Get series info + episodes with embed URLs */
export async function anikotoSeries(
  id: number
): Promise<AnikotoSeriesResult | null> {
  try {
    const res = await rateLimitedFetch(`${ANIKOTO_API}/series/${id}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) throw new Error(`Series fetch failed: ${res.status}`);
    const data: AnikotoSeriesResult = await res.json();
    return data;
  } catch (err) {
    console.error(`[AnikotoAPI] Series ${id} fetch failed:`, err);
    return null;
  }
}

/** Health check - test if the API is reachable */
export async function anikotoHealth(): Promise<boolean> {
  try {
    const res = await rateLimitedFetch(ANIKOTO_API);
    return res.ok;
  } catch {
    return false;
  }
}
