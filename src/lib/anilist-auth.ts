/**
 * AniList OAuth (implicit grant) — client-side only, no client secret required.
 *
 * Setup: register an app at https://anilist.co/settings/developer, set its
 * Redirect URL to this site's homepage (e.g. https://yourdomain.com/), and
 * put the Client ID in NEXT_PUBLIC_ANILIST_CLIENT_ID. AniList redirects back
 * with `#access_token=...&token_type=Bearer&expires_in=...` in the URL hash.
 */

export const ANILIST_CLIENT_ID = process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID || "";

export function isAniListConfigured() {
  return !!ANILIST_CLIENT_ID;
}

export function getAniListAuthUrl(): string {
  return `https://anilist.co/api/v2/oauth/authorize?client_id=${encodeURIComponent(ANILIST_CLIENT_ID)}&response_type=token`;
}

/** Parses `#access_token=...&expires_in=...` out of a location.hash string. Returns null if not present. */
export function extractAniListTokenFromHash(hash: string): { token: string; expiresIn: number } | null {
  const raw = hash.replace(/^#/, "");
  if (!raw.includes("access_token=")) return null;
  const params = new URLSearchParams(raw);
  const token = params.get("access_token");
  if (!token) return null;
  const expiresIn = parseInt(params.get("expires_in") || "0", 10) || 0;
  return { token, expiresIn };
}

export interface AniListViewer {
  id: number;
  name: string;
  avatar?: string;
}

export interface AniListListEntry {
  mediaId: number;
  status: string;
  progress: number;
  title: string;
  cover?: string;
}

/** Fetches the logged-in viewer, then their current anime list (AniList's schema needs the real userId, not a "me" shortcut). */
export async function fetchAniListViewerAndList(token: string): Promise<{ viewer: AniListViewer; entries: AniListListEntry[] }> {
  const viewerRes = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: `query { Viewer { id name avatar { medium } } }` }),
  });
  if (!viewerRes.ok) throw new Error(`AniList viewer request failed (${viewerRes.status})`);
  const viewerData = await viewerRes.json();
  const v = viewerData?.data?.Viewer;
  if (!v?.id) throw new Error("AniList viewer response missing id");
  const viewer: AniListViewer = { id: v.id, name: v.name, avatar: v.avatar?.medium };

  const listRes = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: `
        query ($userId: Int) {
          MediaListCollection(userId: $userId, type: ANIME, status_in: [CURRENT, REPEATING]) {
            lists { entries { status progress media { id title { english romaji } coverImage { medium } } } }
          }
        }
      `,
      variables: { userId: viewer.id },
    }),
  });
  let entries: AniListListEntry[] = [];
  if (listRes.ok) {
    const listData = await listRes.json();
    const lists = listData?.data?.MediaListCollection?.lists || [];
    for (const l of lists) {
      for (const e of l.entries || []) {
        entries.push({
          mediaId: e.media?.id,
          status: e.status,
          progress: e.progress,
          title: e.media?.title?.english || e.media?.title?.romaji || "Untitled",
          cover: e.media?.coverImage?.medium,
        });
      }
    }
  }
  return { viewer, entries: entries.slice(0, 6) };
}

/* ── Full watchlist: every entry across every status, plus real AniList
   watch-time stats — powers the Watchlist page. ── */

export interface AniListFullEntry {
  entryId: number;
  mediaId: number;
  status: string;
  progress: number;
  score: number;
  title: string;
  cover?: string;
  episodes: number | null;
  format?: string;
}

export interface AniListStats {
  count: number;
  episodesWatched: number;
  minutesWatched: number;
}

/** Fetches every list entry (all statuses) plus real watch-time stats from AniList's own profile stats. */
export async function fetchFullAniListCollection(token: string, userId: number): Promise<{ entries: AniListFullEntry[]; stats: AniListStats }> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: `
        query ($userId: Int) {
          User(id: $userId) { statistics { anime { count episodesWatched minutesWatched } } }
          MediaListCollection(userId: $userId, type: ANIME) {
            lists { entries { id status progress score media { id title { english romaji } coverImage { large medium } episodes format } } }
          }
        }
      `,
      variables: { userId },
    }),
  });
  if (!res.ok) throw new Error(`AniList collection request failed (${res.status})`);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || "AniList collection request failed");

  const lists = data?.data?.MediaListCollection?.lists || [];
  const entries: AniListFullEntry[] = [];
  for (const l of lists) {
    for (const e of l.entries || []) {
      entries.push({
        entryId: e.id,
        mediaId: e.media?.id,
        status: e.status,
        progress: e.progress || 0,
        score: e.score || 0,
        title: e.media?.title?.english || e.media?.title?.romaji || "Untitled",
        cover: e.media?.coverImage?.large || e.media?.coverImage?.medium,
        episodes: e.media?.episodes ?? null,
        format: e.media?.format,
      });
    }
  }

  const s = data?.data?.User?.statistics?.anime;
  const stats: AniListStats = { count: s?.count || 0, episodesWatched: s?.episodesWatched || 0, minutesWatched: s?.minutesWatched || 0 };

  return { entries, stats };
}

/* ── Per-anime list entry: fetch / save / delete (powers the "+" edit modal) ── */

export interface AniListMediaEntry {
  id: number; // the MediaListEntry's own id (needed for delete) — null if the anime isn't on the list yet
  status: string;
  score: number;
  progress: number;
  repeat: number;
  notes: string;
  startedAt: string; // "yyyy-mm-dd" or ""
  completedAt: string;
}

function fuzzyDateToStr(d?: { year?: number; month?: number; day?: number } | null): string {
  if (!d || !d.year) return "";
  const mm = String(d.month || 1).padStart(2, "0");
  const dd = String(d.day || 1).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

function strToFuzzyDate(s: string): { year: number; month: number; day: number } | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y) return null;
  return { year: y, month: m || 1, day: d || 1 };
}

/** Fetches the signed-in user's existing list entry for a given AniList media id, if any. */
export async function fetchAniListEntry(token: string, mediaId: number, userId: number): Promise<AniListMediaEntry | null> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: `
        query ($mediaId: Int, $userId: Int) {
          MediaList(mediaId: $mediaId, userId: $userId) { id status score progress repeat notes startedAt { year month day } completedAt { year month day } }
        }
      `,
      variables: { mediaId, userId },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const e = data?.data?.MediaList;
  if (!e) return null;
  return {
    id: e.id,
    status: e.status || "PLANNING",
    score: e.score || 0,
    progress: e.progress || 0,
    repeat: e.repeat || 0,
    notes: e.notes || "",
    startedAt: fuzzyDateToStr(e.startedAt),
    completedAt: fuzzyDateToStr(e.completedAt),
  };
}

/** Creates or updates the signed-in user's list entry for an anime — this is the actual AniList sync. */
export async function saveAniListEntry(token: string, entry: {
  mediaId: number; status: string; score: number; progress: number; repeat: number; notes: string; startedAt: string; completedAt: string;
}): Promise<void> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: `
        mutation ($mediaId: Int, $status: MediaListStatus, $score: Float, $progress: Int, $repeat: Int, $notes: String, $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput) {
          SaveMediaListEntry(mediaId: $mediaId, status: $status, score: $score, progress: $progress, repeat: $repeat, notes: $notes, startedAt: $startedAt, completedAt: $completedAt) { id }
        }
      `,
      variables: {
        mediaId: entry.mediaId,
        status: entry.status,
        score: entry.score,
        progress: entry.progress,
        repeat: entry.repeat,
        notes: entry.notes,
        startedAt: strToFuzzyDate(entry.startedAt),
        completedAt: strToFuzzyDate(entry.completedAt),
      },
    }),
  });
  if (!res.ok) throw new Error(`AniList save failed (${res.status})`);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || "AniList save failed");
}

/** Removes an anime from the signed-in user's AniList — id is the MediaListEntry's own id (from fetchAniListEntry), not the media id. */
export async function deleteAniListEntry(token: string, entryId: number): Promise<void> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: `mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }`,
      variables: { id: entryId },
    }),
  });
  if (!res.ok) throw new Error(`AniList delete failed (${res.status})`);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || "AniList delete failed");
}
