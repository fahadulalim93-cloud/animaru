// ============================================================
// anime-music.ts — Fetch OP/ED themes from api.animethemes.moe
//
// Public API, no auth. We search by anime title, then fetch the
// full theme list (with song artists + video links) by slug.
// Used by the Music tab on the anime detail page.
// ============================================================

const AT_BASE = "https://api.animethemes.moe";

export interface AnimeThemeArtist {
  name: string;
  as?: string;
}

export interface AnimeThemeVideo {
  id: number;
  link: string;       // direct .webm URL (best quality, no subtitles)
  lyrics?: string | null;
  overlap?: string | null;
  resolution: number; // e.g. 480, 720, 1080
  nc?: boolean;       // no-credit (clean OP/ED)
  subbed?: boolean;
  audio?: { link: string }; // optional extracted audio
}

export interface AnimeThemeEntry {
  id: number;
  episodes?: string;
  nsfw?: boolean;
  spoiler?: boolean;
  videos: AnimeThemeVideo[];
}

export interface AnimeTheme {
  id: number;
  type: "OP" | "ED" | string; // OP1, OP2, ED1, etc.
  slug: string;       // "OP1", "ED2", ...
  song: {
    id: number;
    title: string;
    artists: AnimeThemeArtist[];
  };
  animethemeentries: AnimeThemeEntry[];
}

export interface AnimeThemeImage {
  facet: string;   // "Small Cover" | "Large Cover"
  link: string;
}

export interface AnimeThemesResult {
  id: number;
  slug: string;
  name: string;
  year?: number;
  season?: string;
  media_format?: string;
  animethemes: AnimeTheme[];
  images?: AnimeThemeImage[];
}

// ── Search the animethemes.moe /search endpoint by title ──
// Returns the top match (best-effort by string similarity).
export async function searchAnimeByTitle(title: string): Promise<{ slug: string; name: string; id: number; year?: number } | null> {
  const q = title.trim();
  if (!q) return null;

  const url = `${AT_BASE}/search?q=${encodeURIComponent(q)}&fields[search]=anime`;
  try {
    const res = await fetch(url, {
      // animethemes.moe can be slow — give it 8s
      signal: AbortSignal.timeout(8000),
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const list: any[] = data?.search?.anime || [];
    if (list.length === 0) return null;

    // Best-effort match: exact case-insensitive name, then starts-with, then first
    const lower = q.toLowerCase();
    const exact = list.find(a => (a.name || "").toLowerCase() === lower);
    const startsWith = list.find(a => (a.name || "").toLowerCase().startsWith(lower));
    const pick = exact || startsWith || list[0];
    return {
      slug: pick.slug,
      name: pick.name,
      id: pick.id,
      year: pick.year,
    };
  } catch {
    return null;
  }
}

// ── Fetch full theme list (OP/ED + song + videos) by slug ──
export async function getThemesBySlug(slug: string): Promise<AnimeThemesResult | null> {
  if (!slug) return null;
  const url = `${AT_BASE}/anime/${encodeURIComponent(slug)}?include=animethemes.song.artists,animethemes.animethemeentries.videos,images`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.anime as AnimeThemesResult) || null;
  } catch {
    return null;
  }
}

// ── Convenience: title → themes (one round-trip if slug known, two otherwise) ──
export async function getThemesByTitle(title: string): Promise<AnimeThemesResult | null> {
  const match = await searchAnimeByTitle(title);
  if (!match) return null;
  return getThemesBySlug(match.slug);
}

// ── FAST: Search + fetch themes in ONE API call ──
// The animethemes.moe /search endpoint supports include[anime]=... which
// returns full theme data (songs, videos, images) directly in the search
// response. This cuts the load time in half (1 round-trip instead of 2).
// Returns the best match with all its themes.
export async function searchAndFetchThemes(title: string): Promise<AnimeThemesResult | null> {
  const q = title.trim();
  if (!q) return null;

  // include[anime]=animethemes.song.artists,animethemes.animethemeentries.videos,images
  // — this makes the search response include full theme data
  const url = `${AT_BASE}/search?q=${encodeURIComponent(q)}&fields[search]=anime&include[anime]=animethemes.song.artists,animethemes.animethemeentries.videos,images`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const list: any[] = data?.search?.anime || [];
    if (list.length === 0) return null;

    // Best-effort match: exact case-insensitive name, then starts-with, then first
    const lower = q.toLowerCase();
    const exact = list.find(a => (a.name || "").toLowerCase() === lower);
    const startsWith = list.find(a => (a.name || "").toLowerCase().startsWith(lower));
    const pick = exact || startsWith || list[0];

    // The search response includes animethemes if the include param worked
    if (pick.animethemes && pick.animethemes.length > 0) {
      return pick as AnimeThemesResult;
    }

    // Fallback: if the include didn't work (some API versions), fetch by slug
    return getThemesBySlug(pick.slug);
  } catch {
    return null;
  }
}

// ── Pick the best video for a theme (prefer NC + highest resolution) ──
export function pickBestVideo(theme: AnimeTheme): AnimeThemeVideo | null {
  const all: AnimeThemeVideo[] = (theme.animethemeentries || []).flatMap(e => e.videos || []);
  if (all.length === 0) return null;

  // Prefer no-credit (clean), then highest resolution
  const nc = all.filter(v => v.nc);
  const pool = nc.length > 0 ? nc : all;
  pool.sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
  return pool[0];
}

// ── Pick a cover image from the animethemes images array ──
export function pickCoverImage(images: AnimeThemeImage[] | undefined): string {
  if (!images || images.length === 0) return "";
  const large = images.find(i => i.facet === "Large Cover");
  if (large) return large.link;
  const small = images.find(i => i.facet === "Small Cover");
  return small?.link || "";
}

// ── Format theme type for display: "OP1" → "Opening 1" ──
export function formatThemeType(type: string): string {
  if (!type) return "Theme";
  if (type.startsWith("OP")) return `Opening ${type.slice(2) || ""}`.trim();
  if (type.startsWith("ED")) return `Ending ${type.slice(2) || ""}`.trim();
  return type;
}
