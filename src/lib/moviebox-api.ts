// ============================================================
// MOVIEBOX API — TypeScript port of the Python moviebox_api.py
//
// API base: https://h5-api.aoneroom.com/wefeed-h5api-bff
// Stream domain: dynamically fetched from /media-player/get-domain
//                 (defaults to https://netfilm.world)
//
// Flow:
//   1. Get bearer token: GET {API_BASE}/home?host=moviebox.ph
//      → extract token from x-user response header (JSON: { token: "..." })
//   2. Search: POST {API_BASE}/subject/search
//      body: { keyword, page, perPage }
//      → returns items with subjectId + detailPath (slug)
//   3. Get stream domain: GET {API_BASE}/media-player/get-domain
//      → { data: "https://netfilm.world" }
//   4. Get stream: GET {domain}/wefeed-h5api-bff/subject/play
//                   ?subjectId={id}&se={se}&ep={ep}&detailPath={slug}
//      Referer: {domain}/spa/videoPlayPage/movies/{slug}
//                ?id={id}&type=/movie/detail&detailSe={se}&detailEp={ep}&lang=en
//      → { data: { streams: [{ url, resolutions, format, ... }], hls: [...] } }
// ============================================================

export interface MovieboxSearchResult {
  title: string;
  slug: string;
  subjectId: string;
  poster: string;
}

export interface MovieboxSource {
  url: string;
  quality: string;
  format: string;
}

export interface MovieboxHls {
  url: string;
  quality: string;
}

export interface MovieboxStreams {
  sources: MovieboxSource[];
  hls: MovieboxHls[];
}

const API_BASE = "https://h5-api.aoneroom.com/wefeed-h5api-bff";
const DEFAULT_DOMAIN = "https://netfilm.world";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  Referer: "https://moviebox.ph/",
  Origin: "https://moviebox.ph",
  "X-Client-Info": '{"timezone":"Asia/Dhaka"}',
  "X-Request-Lang": "en",
  Accept: "application/json",
  "Content-Type": "application/json",
  "sec-ch-ua": '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "cross-site",
};

const PLAYER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "X-Client-Info": '{"timezone":"Asia/Dhaka"}',
  "X-Source": "",
  "sec-ch-ua": '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
};

// In-memory bearer token cache — Moviebox tokens expire quickly, so we
// always fetch a fresh one for each request (don't cache).
let _streamDomain: string | null = null;

function extractTokenFromHeaders(res: Response): string | null {
  // x-user header is JSON: { token: "..." }
  const xUser = res.headers.get("x-user");
  if (xUser) {
    try {
      const parsed = JSON.parse(xUser);
      const tok = parsed?.token;
      if (tok && typeof tok === "string") return tok;
    } catch {
      /* ignore JSON parse errors */
    }
  }
  // Fallback: scan set-cookie for token=...
  const setCookie = res.headers.get("set-cookie") || "";
  const m = /token=([^;]+)/.exec(setCookie);
  if (m) return m[1];
  return null;
}

async function getBearerToken(): Promise<string> {
  // Always fetch a fresh token — Moviebox tokens expire within seconds.
  const url = `${API_BASE}/home?host=moviebox.ph`;
  const res = await fetch(url, {
    headers: DEFAULT_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  });
  const tok = extractTokenFromHeaders(res);
  if (!tok) {
    throw new Error("moviebox: failed to acquire bearer token");
  }
  return tok;
}

async function getStreamDomain(): Promise<string> {
  if (_streamDomain) return _streamDomain;
  const token = await getBearerToken();
  const url = `${API_BASE}/media-player/get-domain`;
  const res = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, Authorization: `Bearer ${token}` },
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    throw new Error(`moviebox: get-domain failed ${res.status}`);
  }
  const json = await res.json();
  const domain = (json?.data as string) || DEFAULT_DOMAIN;
  _streamDomain = domain.replace(/\/$/, "");
  return _streamDomain;
}

async function makeApiRequest<T = unknown>(
  url: string,
  method: "GET" | "POST" = "GET",
  payload?: Record<string, unknown>
): Promise<T> {
  const token = await getBearerToken();
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    Authorization: token ? `Bearer ${token}` : "",
  };

  const init: RequestInit = {
    method,
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  };
  if (method === "POST" && payload) {
    init.body = JSON.stringify(payload);
  }

  const res = await fetch(url, init);

  // Refresh token if server sends a new one in x-user header (for logging only)
  const _newTok = extractTokenFromHeaders(res);

  if (!res.ok) {
    throw new Error(`moviebox: ${method} ${url} failed ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * Search Moviebox by keyword.
 * Returns an array of { title, slug, subjectId, poster }.
 *
 * The API returns items in two possible shapes:
 *   1. { subject: { title, detailPath, subjectId, cover: { url } } }
 *   2. { title, detailPath, subjectId, cover: { url } } (flat)
 */
export async function searchMoviebox(query: string): Promise<MovieboxSearchResult[]> {
  const url = `${API_BASE}/subject/search`;
  const data = await makeApiRequest<{
    data?: { items?: unknown[]; list?: unknown[] };
  }>(url, "POST", { keyword: query, page: 1, perPage: 20 });

  const inner = data?.data || {};
  const raw = (inner as Record<string, unknown[]>).items || (inner as Record<string, unknown[]>).list || [];

  const results: MovieboxSearchResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    // The subject data might be nested under `subject` or at the top level
    const sub = (obj.subject as Record<string, unknown> | undefined) || obj;

    const title = (sub.title as string) || (obj.word as string) || "";
    const slug = (sub.detailPath as string) || "";
    const subjectId = String(sub.subjectId ?? "");
    const cover = (sub.cover as Record<string, unknown> | undefined)?.url as string | undefined;

    if (!title || !slug || !subjectId) continue;
    results.push({ title, slug, subjectId, poster: cover || "" });
  }
  return results;
}

/**
 * Fetch streams for a Moviebox subject.
 *
 * For movies, pass season=1 episode=1 (or omit).
 * For TV, pass the actual season/episode numbers.
 */
export async function getMovieboxStreams(
  subjectId: string,
  detailPath: string,
  season?: number,
  episode?: number
): Promise<MovieboxStreams> {
  const domain = await getStreamDomain();
  const se = season && season > 0 ? season : 1;
  const ep = episode && episode > 0 ? episode : 1;

  const playUrl = `${domain}/wefeed-h5api-bff/subject/play?subjectId=${encodeURIComponent(
    subjectId
  )}&se=${se}&ep=${ep}&detailPath=${encodeURIComponent(detailPath)}`;

  const playerReferer = `${domain}/spa/videoPlayPage/movies/${detailPath}?id=${encodeURIComponent(
    subjectId
  )}&type=/movie/detail&detailSe=${se}&detailEp=${ep}&lang=en`;

  const res = await fetch(playUrl, {
    headers: { ...PLAYER_HEADERS, Referer: playerReferer },
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    throw new Error(`moviebox: play request failed ${res.status}`);
  }
  const json = await res.json();
  const data = (json?.data ?? {}) as Record<string, unknown>;

  const rawStreams = (data.streams as Array<Record<string, unknown>> | undefined) || [];
  const rawHls = (data.hls as Array<Record<string, unknown>> | undefined) || [];

  const sources: MovieboxSource[] = rawStreams
    .map((s) => {
      const url = (s.url as string) || "";
      if (!url) return null;
      const resolutions = s.resolutions != null ? String(s.resolutions) : "";
      const quality = resolutions ? `${resolutions}p` : "unknown";
      const format = String(s.format || (url.includes(".m3u8") ? "hls" : "mp4")).toLowerCase();
      return { url, quality, format };
    })
    .filter((s): s is MovieboxSource => s !== null);

  const hls: MovieboxHls[] = rawHls
    .map((h) => {
      const url = (h.url as string) || "";
      if (!url) return null;
      const resolutions = h.resolutions != null ? String(h.resolutions) : "";
      const quality = resolutions ? `${resolutions}p` : "unknown";
      return { url, quality };
    })
    .filter((h): h is MovieboxHls => h !== null);

  if (sources.length === 0 && hls.length === 0) {
    throw new Error("moviebox: no streams returned for this subject");
  }
  return { sources, hls };
}
