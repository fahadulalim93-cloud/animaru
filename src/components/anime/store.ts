"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { trackXPForUser } from "@/lib/xp-tracker";

// ============================================================
// Anime Types (from AllAnime + Miruro)
// ============================================================

export interface AnimeItem {
  _id: string;
  name: string;
  englishName?: string;
  thumbnail?: string;
  score?: number;
  type?: string;
  status?: string;
  genres?: string[];
  availableEpisodes?: Record<string, number>;
  season?: string;
  description?: string;
}

export interface MiruroAnimeItem {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  coverImage?: { extraLarge?: string; large?: string; medium?: string; color?: string };
  bannerImage?: string;
  genres?: string[];
  averageScore?: number;
  popularity?: number;
  episodes?: number;
  type?: string;
  status?: string;
  description?: string;
  season?: string;
  seasonYear?: number;
  countryOfOrigin?: string;
}

// ============================================================
// TMDB Content Types
// ============================================================

export interface TMDBContentItem {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  popularity?: number;
  media_type?: "movie" | "tv";
  adult?: boolean;
  origin_country?: string[];
  original_language?: string;
}

// ============================================================
// Bookmark & History
// ============================================================

export interface BookmarkItem {
  id: string;
  animeId: string;
  animeName: string;
  thumbnail?: string;
  score?: number;
  type?: string;
  status?: string;
  createdAt: string;
}

export interface HistoryItem {
  id: string;
  animeId: string;
  animeName: string;
  thumbnail?: string;
  episodeNum: number;
  progress: number;
  duration: number;
  updatedAt: string;
}

// ============================================================
// Generic per-type Library / Progress / Activity
// (anime keeps its own history/bookmarks above; this covers
//  manga, movies, tv & novels so the profile can show every
//  section in sync)
// ============================================================

export type MediaKind = "manga" | "movie" | "tv" | "novel";

/** A saved title ("My List" / bookmark) for a non-anime section. */
export interface LibraryEntry {
  key: string;          // `${kind}:${mediaId}`
  kind: MediaKind;
  mediaId: string;
  title: string;
  cover?: string;
  meta?: string;        // e.g. "Manhwa" / "2021" / "24 ch"
  score?: number;
  addedAt: number;      // epoch ms
  resume: Route;        // detail route to reopen the title
}

/** Latest reading/watching position for a non-anime title (Continue). */
export interface MediaProgressEntry {
  key: string;          // `${kind}:${mediaId}`
  kind: MediaKind;
  mediaId: string;
  title: string;
  cover?: string;
  unitLabel: string;    // "Ch. 45" / "S1·E3" / "Ch. 12"
  percent: number;      // 0-100 best-effort
  updatedAt: number;    // epoch ms
  resume: Route;        // exact watch/read route to resume
}

/** Append-only activity log — powers XP, level, streaks & heatmap. */
export interface ActivityEvent {
  ts: number;                       // epoch ms
  kind: MediaKind | "anime";
  xp: number;
}

// ============================================================
// Route Types
// ============================================================

type Route =
  | { page: "landing" }
  | { page: "hub" }
  | { page: "home" }
  | { page: "discover" }
  | { page: "search"; query?: string }
  | { page: "anime"; id: string }
  | { page: "watch"; id: string; episode: number; title?: string; image?: string; language?: string }
  | { page: "watch-together"; code?: string }
  | { page: "genre"; genre: string }
  | { page: "bookmarks" }
  | { page: "history" }
  | { page: "watchlist" }
  | { page: "movies" }
  | { page: "tv" }
  | { page: "manga" }
  | { page: "manga-detail"; id: string }
  | { page: "manga-read"; id: string; chapterId: string }
  | { page: "movie-detail"; id: number }
  | { page: "tv-detail"; id: number }
  | { page: "movie-watch"; id: number }
  | { page: "tv-watch"; id: number; season: number; episode: number }
  | { page: "watchnow" }
  | { page: "contact" }
  | { page: "donate" }
  | { page: "updates" }
  | { page: "donate-crypto" }
  | { page: "guide" }
  | { page: "features" }
  | { page: "novel" }
  | { page: "novel-detail"; novelId: string; novelTitle: string; novelCover: string; novelAuthor: string; novelSource: string }
  | { page: "novel-read"; novelId: string; novelTitle: string; chapterId: string; chapterNum: number; chapterTitle: string; totalChapters: number; novelSource: string }
  | { page: "signin" }
  | { page: "signup" }
  | { page: "profile" }
  | { page: "leaderboard" }
  | { page: "mod" }
  | { page: "settings" }
  | { page: "music" }
  | { page: "torrent" }
  | { page: "download" }
  | { page: "scraper" }
  | { page: "scraper-anime"; id: string }
  | { page: "scraper-watch"; id: string; episode: string; site: string };

// ============================================================
// App Store
// ============================================================

// Section sub-page type — each section can have its own sub-navigation
export type SectionSubPage = "home" | "sub" | "dub" | "schedule" | "genres" | "browse" | "trending" | "top-rated" | "tv-channels" | "sports" | "news" | "popular" | "recently-added" | "recently-updated";

interface AppState {
  route: Route;
  navigate: (route: Route) => void;
  sectionSubPage: SectionSubPage;
  setSectionSubPage: (subPage: SectionSubPage) => void;
  bookmarks: BookmarkItem[];
  setBookmarks: (items: BookmarkItem[]) => void;
  history: HistoryItem[];
  setHistory: (items: HistoryItem[]) => void;
  /** Add or update a history entry (called when user starts/resumes watching) */
  addToHistory: (item: {
    animeId: string;
    animeName: string;
    thumbnail?: string;
    episodeNum: number;
    progress?: number;
    duration?: number;
  }) => void;
  /** Update progress for an existing history entry (called periodically during playback) */
  updateHistoryProgress: (animeId: string, episodeNum: number, progress: number, duration: number) => void;
  isBookmarked: (animeId: string) => boolean;
  // ── Generic per-type library / progress / activity (manga/movie/tv/novel) ──
  library: LibraryEntry[];
  mediaProgress: MediaProgressEntry[];
  activity: ActivityEvent[];
  /** Toggle-add a title to the user's library ("My List"). */
  addToLibrary: (entry: Omit<LibraryEntry, "key" | "addedAt"> & { addedAt?: number }) => void;
  removeFromLibrary: (kind: MediaKind, mediaId: string) => void;
  isInLibrary: (kind: MediaKind, mediaId: string) => boolean;
  /** Upsert a Continue-position and log an activity event (awards XP). */
  recordMediaProgress: (
    entry: Omit<MediaProgressEntry, "key" | "updatedAt"> & { updatedAt?: number },
    xp?: number,
  ) => void;
  // ── Auth (localStorage-based, persisted) ──
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
  // ── Auth modal (overlay — appears on top of any page) ──
  // Per user request: sign-in/sign-up should appear as a centered modal
  // overlay on top of the current anime page, NOT navigate to a separate page.
  authModal: { mode: "signin" | "signup"; message?: string } | null;
  openAuthModal: (mode: "signin" | "signup", message?: string) => void;
  closeAuthModal: () => void;
  // ── AniList account link (OAuth implicit grant, persisted) ──
  anilistToken: string | null;
  anilistUser: { id: number; name: string; avatar?: string } | null;
  anilistEntries: { mediaId: number; status: string; progress: number; title: string; cover?: string }[];
  setAnilistAuth: (
    token: string,
    user: { id: number; name: string; avatar?: string },
    entries: { mediaId: number; status: string; progress: number; title: string; cover?: string }[],
  ) => void;
  clearAnilistAuth: () => void;
  // ── MyAnimeList account link (OAuth PKCE, persisted) ──
  malToken: string | null;
  malUser: { id: number; name: string; avatar?: string } | null;
  setMalAuth: (token: string, user: { id: number; name: string; avatar?: string }) => void;
  clearMalAuth: () => void;
  // ── Add-to-list connect prompt (shown from "+" buttons when the user
  //     hasn't linked AniList or MAL yet) ──
  connectListModalOpen: boolean;
  openConnectListModal: () => void;
  closeConnectListModal: () => void;
  // ── Auth error toast (shown when MAL/AniList OAuth fails) ──
  authError: string | null;
  setAuthError: (msg: string | null) => void;
  // ── Auth notice toast (info / success states) ──
  // Used to tell the user "Connecting to AniList..." then "Successfully
  // connected!" so they have feedback that the OAuth flow is working.
  authNotice: { type: "info" | "success"; message: string } | null;
  setAuthNotice: (n: { type: "info" | "success"; message: string } | null) => void;
  // ── Edit list entry modal (shown from "+" buttons once AniList/MAL is
  //     linked — status/score/progress/dates/notes, synced to AniList) ──
  editListTarget: { id: number; title: string; cover?: string } | null;
  openEditListModal: (anime: { id: number; title: string; cover?: string }) => void;
  closeEditListModal: () => void;
  // ── App preferences / settings (persisted) ──
  prefs: AppPrefs;
  setPref: <K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) => void;
}

// ============================================================
// App preferences (Settings page)
// ============================================================
export interface AppPrefs {
  theme: string; // theme key — see THEMES in settings-page
  // General
  homepageTrailer: boolean;
  titleLanguage: "english" | "romaji";
  episodeThumbnails: boolean;
  episodeSortAsc: boolean;
  preferredLanguage: "sub" | "dub" | "hindi";
  preferredServer: string; // server id to auto-select (empty = auto-select best)
  nsfw: boolean;
  comments: boolean;
  // Player defaults
  autoNext: boolean;
  autoSkip: boolean;
  autoplay: boolean;
  muteAudio: boolean;
  skipForward: number; // seconds
  playbackRate: number;
  quality: "auto" | "360" | "480" | "720" | "1080";
  loadStrategy: "idle" | "visible" | "eager";
  skipFillers: boolean;
  ambientMode: boolean;
  volume: number; // 0-100
  fullscreenRetain: boolean; // keep fullscreen on episode change
  // Account
  privacyPublic: boolean;
  incognito: boolean;
}

export const DEFAULT_PREFS: AppPrefs = {
  theme: "default",
  homepageTrailer: true,
  titleLanguage: "english",
  episodeThumbnails: true,
  episodeSortAsc: true,
  preferredLanguage: "sub",
  preferredServer: "",
  nsfw: false,
  comments: true,
  autoNext: true,
  autoSkip: false,
  autoplay: true,
  muteAudio: false,
  skipForward: 85,
  playbackRate: 1,
  quality: "auto",
  loadStrategy: "eager",
  skipFillers: false,
  ambientMode: false,
  volume: 100,
  fullscreenRetain: true,
  privacyPublic: true,
  incognito: false,
};

// ============================================================
// User type
// ============================================================
export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar?: string;       // emoji or letter
  avatarColor?: string;  // bg color for avatar
  bio?: string;
  createdAt: string;
  // ── Profile customization ──
  accentColor?: string;  // themes XP bar / badges / active tabs
  avatarEmoji?: string;  // optional emoji shown instead of the letter
  banner?: string;       // header banner preset key
  favorites?: string[];  // favorite genres shown as chips
  tagline?: string;      // short flair under the name
  avatarFrame?: string;  // equipped avatar frame key (see FRAMES in avatar-frames.ts)
  avatarImage?: string;  // custom avatar image (character portrait or imported image/data URI)
  bannerImage?: string;  // custom profile banner image (overrides the random AniList banner)
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  route: { page: "home" },
  sectionSubPage: "home",
  setSectionSubPage: (subPage) => {
    set({ sectionSubPage: subPage });
    // Sync the URL bar when sub-page changes (e.g. Browse, Schedule, Genres)
    if (typeof window !== "undefined") {
      const currentRoute = get().route;
      if (currentRoute.page === "home") {
        const subPagePath: Record<string, string> = {
          "home": "/",
          "browse": "/browse",
          "schedule": "/schedule",
          "genres": "/genres",
          "sub": "/sub",
          "dub": "/dub",
          "trending": "/trending",
          "top-rated": "/top-rated",
        };
        const path = subPagePath[subPage] || `/${subPage}`;
        history.replaceState(null, "", path);
      }
    }
  },
  navigate: (route) => {
    // Reset section sub-page when navigating to a new section
    const subPage = "home";
    set({ route, sectionSubPage: subPage });
    if (typeof window !== "undefined") {
      let path = "/";
      if (route.page === "landing") path = "/";
      else if (route.page === "hub") path = "/hub";
      else if (route.page === "home") path = "/";
      else if (route.page === "discover") path = "/discover";
      else if (route.page === "search" && route.query)
        path = `/search/${encodeURIComponent(route.query)}`;
      else if (route.page === "search") path = "/search";
      else if (route.page === "anime")
        path = `/anime/${route.id}`;
      else if (route.page === "watch")
        path = `/watch/${route.id}/${route.episode}${route.language ? `/${route.language}` : ""}`;
      else if (route.page === "watch-together")
        path = route.code ? `/watch-together/${route.code}` : "/watch-together";
      else if (route.page === "genre")
        path = `/genre/${encodeURIComponent(route.genre)}`;
      else if (route.page === "bookmarks") path = "/bookmarks";
      else if (route.page === "watchlist") path = "/watchlist";
      else if (route.page === "history") path = "/history";
      else if (route.page === "movies") path = "/movies";
      else if (route.page === "tv") path = "/tv";
      else if (route.page === "manga") path = "/manga";
      else if (route.page === "manga-detail")
        path = `/manga/${route.id}`;
      else if (route.page === "manga-read")
        path = `/read-manga/${route.id}/${route.chapterId}`;
      else if (route.page === "movie-detail")
        path = `/movie/${route.id}`;
      else if (route.page === "tv-detail")
        path = `/tvshow/${route.id}`;
      else if (route.page === "movie-watch")
        path = `/watch-movie/${route.id}`;
      else if (route.page === "tv-watch")
        path = `/watch-tv/${route.id}/${route.season}/${route.episode}`;
      else if (route.page === "watchnow") path = "/watchnow";
      else if (route.page === "contact") path = "/contact";
      else if (route.page === "donate") path = "/donate";
      else if (route.page === "updates") path = "/updates";
      else if (route.page === "donate-crypto") path = "/donate/crypto";
      else if (route.page === "features") path = "/features";
      else if (route.page === "novel") path = "/novel";
      else if (route.page === "novel-detail") path = `/novel/${encodeURIComponent(route.novelId)}`;
      else if (route.page === "novel-read") path = `/read-novel/${encodeURIComponent(route.novelId)}/${route.chapterNum}`;
      else if (route.page === "signin") path = "/signin";
      else if (route.page === "signup") path = "/signup";
      else if (route.page === "profile") path = "/profile";
      else if (route.page === "settings") path = "/settings";
      else if (route.page === "music") path = "/music";
      else if (route.page === "torrent") path = "/torrent";
      else if (route.page === "download") path = "/download";
      else if (route.page === "scraper") path = "/scraper";
      else if (route.page === "scraper-anime") path = `/scraper/anime/${route.id}`;
      else if (route.page === "scraper-watch") path = `/scraper/watch/${route.site}/${route.id}/${encodeURIComponent(route.episode)}`;
      history.pushState(null, "", path);
      window.scrollTo(0, 0);
    }
  },
  bookmarks: [],
  setBookmarks: (items) => set({ bookmarks: items }),
  history: [],
  setHistory: (items) => set({ history: items }),
  addToHistory: (item) => set((state) => {
    const id = `${item.animeId}-${item.episodeNum}`;
    const now = new Date().toISOString();
    // Remove any existing entry for this anime+episode, then prepend
    const filtered = state.history.filter(
      (h) => !(h.animeId === item.animeId && h.episodeNum === item.episodeNum)
    );
    const newEntry: HistoryItem = {
      id,
      animeId: item.animeId,
      animeName: item.animeName,
      thumbnail: item.thumbnail,
      episodeNum: item.episodeNum,
      progress: item.progress || 0,
      duration: item.duration || 0,
      updatedAt: now,
    };
    // Keep at most 50 entries
    // ── Secret XP: award 10 XP for watching an episode (fire-and-forget) ──
    trackXPForUser(get().user, 10, "episode_watched");
    return { history: [newEntry, ...filtered].slice(0, 50) };
  }),
  updateHistoryProgress: (animeId, episodeNum, progress, duration) => set((state) => ({
    history: state.history.map((h) =>
      h.animeId === animeId && h.episodeNum === episodeNum
        ? { ...h, progress, duration, updatedAt: new Date().toISOString() }
        : h
    ),
  })),
  isBookmarked: (animeId) => get().bookmarks.some((b) => b.animeId === animeId),
  // ── Generic library / progress / activity ──
  library: [],
  mediaProgress: [],
  activity: [],
  addToLibrary: (entry) => set((state) => {
    const key = `${entry.kind}:${entry.mediaId}`;
    if (state.library.some((e) => e.key === key)) return {};
    const newEntry: LibraryEntry = { ...entry, key, addedAt: entry.addedAt ?? Date.now() };
    return { library: [newEntry, ...state.library].slice(0, 500) };
  }),
  removeFromLibrary: (kind, mediaId) => set((state) => ({
    library: state.library.filter((e) => e.key !== `${kind}:${mediaId}`),
  })),
  isInLibrary: (kind, mediaId) => get().library.some((e) => e.key === `${kind}:${mediaId}`),
  recordMediaProgress: (entry, xp = 0) => set((state) => {
    const key = `${entry.kind}:${entry.mediaId}`;
    const now = entry.updatedAt ?? Date.now();
    const existing = state.mediaProgress.find((p) => p.key === key);
    // Award XP at most once per title per calendar day (keeps XP/heatmap honest
    // even though progress ticks fire often).
    const sameDay = (a: number, b: number) => {
      const da = new Date(a), db = new Date(b);
      return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
    };
    const grant = xp > 0 && !(existing && sameDay(existing.updatedAt, now));
    const filtered = state.mediaProgress.filter((p) => p.key !== key);
    const newEntry: MediaProgressEntry = { ...entry, key, updatedAt: now };
    const activity = grant
      ? [{ ts: now, kind: entry.kind, xp }, ...state.activity].slice(0, 3000)
      : state.activity;
    return {
      mediaProgress: [newEntry, ...filtered].slice(0, 200),
      activity,
    };
  }),
  // ── Auth state ──
  user: null,
  setUser: (user) => {
    set({ user });
    // Close the auth modal automatically on successful sign-in / sign-up
    if (user) set({ authModal: null });
  },
  logout: () => {
    // Notify server to destroy the session cookie (best-effort, no await —
    // we don't want to block the UI on a network request).
    try {
      if (typeof window !== "undefined") {
        fetch("/api/users/logout", { method: "POST", credentials: "include" }).catch(() => {});
      }
    } catch {}
    set({ user: null });
  },
  // ── Auth modal actions ──
  authModal: null,
  openAuthModal: (mode, message) => set({ authModal: { mode, message } }),
  closeAuthModal: () => set({ authModal: null }),
  // ── AniList account link ──
  anilistToken: null,
  anilistUser: null,
  anilistEntries: [],
  setAnilistAuth: (token, user, entries) => set({ anilistToken: token, anilistUser: user, anilistEntries: entries }),
  clearAnilistAuth: () => set({ anilistToken: null, anilistUser: null, anilistEntries: [] }),
  // ── MyAnimeList account link ──
  malToken: null,
  malUser: null,
  setMalAuth: (token, user) => set({ malToken: token, malUser: user }),
  clearMalAuth: () => set({ malToken: null, malUser: null }),
  // ── Add-to-list connect prompt ──
  connectListModalOpen: false,
  openConnectListModal: () => set({ connectListModalOpen: true }),
  closeConnectListModal: () => set({ connectListModalOpen: false }),
  authError: null,
  setAuthError: (msg) => set({ authError: msg }),
  authNotice: null,
  setAuthNotice: (n) => set({ authNotice: n }),
  // ── Edit list entry modal ──
  editListTarget: null,
  openEditListModal: (anime) => set({ editListTarget: anime }),
  closeEditListModal: () => set({ editListTarget: null }),
  // ── App preferences ──
  prefs: DEFAULT_PREFS,
  setPref: (key, value) => set((state) => ({ prefs: { ...state.prefs, [key]: value } })),
    }),
    {
      name: "luffytv-store",
      partialize: (state) => ({
        history: state.history,
        bookmarks: state.bookmarks,
        user: state.user,
        anilistToken: state.anilistToken,
        anilistUser: state.anilistUser,
        anilistEntries: state.anilistEntries,
        malToken: state.malToken,
        malUser: state.malUser,
        prefs: state.prefs,
        library: state.library,
        mediaProgress: state.mediaProgress,
        activity: state.activity,
      }),
    }
  )
);

// Get the section-specific nav links based on current route
export function getSectionNavLinks(route: Route): { id: SectionSubPage; label: string }[] {
  const page = route.page;

  // Manga section — has its OWN navbar (Popular, Top Rated, Recently Added)
  if (page === "manga" || page === "manga-detail" || page === "manga-read") {
    return [
      { id: "home", label: "Home" },
      { id: "popular", label: "Popular" },
      { id: "top-rated", label: "Top Rated" },
      { id: "recently-added", label: "Recently Added" },
    ];
  }
  
  // Anime section (includes home, anime detail, watch, genre, bookmarks, history)
  if (page === "home" || page === "anime" || page === "watch" || page === "genre" || page === "bookmarks" || page === "history") {
    return [
      { id: "home", label: "Home" },
      { id: "sub", label: "SUB" },
      { id: "dub", label: "DUB" },
      { id: "browse", label: "Browse" },
      { id: "schedule", label: "Schedule" },
      { id: "genres", label: "Genres" },
    ];
  }
  
  
  // Default — no section-specific nav
  return [];
}

/**
 * Extract numeric AniList ID from slug-ID format.
 * "one-piece-21" → "21" (the AniList ID)
 * "21" → "21" (already numeric)
 * "some-slug" → "some-slug" (pure slug, no embedded ID — return as-is)
 */
function extractAnilistIdFromSlug(input: string): string {
  // Pure numeric — already an ID
  if (/^\d+$/.test(input)) return input;
  // Slug-ID format: "one-piece-21" → extract trailing number
  const match = input.match(/-(\d+)$/);
  if (match) return match[1];
  // Pure slug with no ID — return as-is (component will search by slug)
  return input;
}

export function parsePath(pathname: string): { route: Route; subPage: SectionSubPage } {
  // Remove leading slash
  const p = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  // Root path → anime home
  if (!p) return { route: { page: "home" }, subPage: "home" };
  const parts = p.split("/");

  // ── First-class sub-page paths (SEO-friendly URLs) ──
  if (parts[0] === "browse") return { route: { page: "home" }, subPage: "browse" };
  if (parts[0] === "schedule") return { route: { page: "home" }, subPage: "schedule" };
  if (parts[0] === "genres") return { route: { page: "home" }, subPage: "genres" };
  if (parts[0] === "sub") return { route: { page: "home" }, subPage: "sub" };
  if (parts[0] === "dub") return { route: { page: "home" }, subPage: "dub" };
  if (parts[0] === "trending") return { route: { page: "home" }, subPage: "trending" };
  if (parts[0] === "top-rated") return { route: { page: "home" }, subPage: "top-rated" };

  if (parts[0] === "hub") return { route: { page: "hub" }, subPage: "home" };
  if (parts[0] === "home") return { route: { page: "home" }, subPage: "home" };
  if (parts[0] === "discover") return { route: { page: "discover" }, subPage: "home" };
  if (parts[0] === "search") return { route: { page: "search", query: decodeURIComponent(parts[1] || "") }, subPage: "home" };
  // ── Anime detail: /anime/{slug-ID} or /anime/{numeric-ID} ──
  // "one-piece-21" → id="21" (AniList ID extracted from slug)
  // "21" → id="21" (plain numeric ID)
  if (parts[0] === "anime" && parts[1]) return { route: { page: "anime", id: extractAnilistIdFromSlug(parts[1]) }, subPage: "home" };
  // ── Watch page: /watch/{slug-ID}/{episode} ──
  if (parts[0] === "watch" && parts[1] && parts[2])
    return { route: { page: "watch", id: extractAnilistIdFromSlug(parts[1]), episode: parseInt(parts[2], 10) || 1 }, subPage: "home" };
  if (parts[0] === "bookmarks") return { route: { page: "bookmarks" }, subPage: "home" };
  if (parts[0] === "watchlist") return { route: { page: "watchlist" }, subPage: "home" };
  if (parts[0] === "history") return { route: { page: "history" }, subPage: "home" };
  // Retired sections — redirect to anime home
  if (parts[0] === "movies") return { route: { page: "home" }, subPage: "home" };
  if (parts[0] === "tv") return { route: { page: "home" }, subPage: "home" };
  if (parts[0] === "live") return { route: { page: "home" }, subPage: "home" };
  if (parts[0] === "watchnow") return { route: { page: "home" }, subPage: "home" };
  if (parts[0] === "genre" && parts[1]) return { route: { page: "genre", genre: decodeURIComponent(parts[1].replace(/-/g, " ")) }, subPage: "home" };
  if (parts[0] === "genre") return { route: { page: "home" }, subPage: "genres" };
  if (parts[0] === "movie" && parts[1]) return { route: { page: "home" }, subPage: "home" };
  if (parts[0] === "tvshow" && parts[1]) return { route: { page: "home" }, subPage: "home" };
  if (parts[0] === "watch-movie" && parts[1]) return { route: { page: "home" }, subPage: "home" };
  if (parts[0] === "watch-tv") return { route: { page: "home" }, subPage: "home" };
  if (parts[0] === "live-watch") return { route: { page: "home" }, subPage: "home" };
  if (parts[0] === "live-tv-watch") return { route: { page: "home" }, subPage: "home" };
  if (parts[0] === "manga" && parts[1]) return { route: { page: "manga-detail", id: parts[1] }, subPage: "home" };
  if (parts[0] === "manga") return { route: { page: "manga" }, subPage: "home" };
  if (parts[0] === "read-manga" && parts[1] && parts[2])
    return { route: { page: "manga-read", id: parts[1], chapterId: parts[2] }, subPage: "home" };
  if (parts[0] === "contact") return { route: { page: "contact" }, subPage: "home" };
  if (parts[0] === "donate" && parts[1] === "crypto") return { route: { page: "donate-crypto" }, subPage: "home" };
  if (parts[0] === "donate") return { route: { page: "donate" }, subPage: "home" };
  if (parts[0] === "updates") return { route: { page: "updates" }, subPage: "home" };
  if (parts[0] === "guide") return { route: { page: "guide" }, subPage: "home" };
  if (parts[0] === "features") return { route: { page: "features" }, subPage: "home" };
  if (parts[0] === "novel" && parts[1]) return { route: { page: "novel-detail", novelId: decodeURIComponent(parts[1]), novelTitle: "", novelCover: "", novelAuthor: "", novelSource: "readlightnovel" }, subPage: "home" };
  if (parts[0] === "novel") return { route: { page: "novel" }, subPage: "home" };
  if (parts[0] === "read-novel" && parts[1] && parts[2]) return { route: { page: "novel-read", novelId: decodeURIComponent(parts[1]), novelTitle: "", chapterId: `chapter-${parts[2]}`, chapterNum: parseInt(parts[2]), chapterTitle: "", totalChapters: 0, novelSource: "readlightnovel" }, subPage: "home" };
  if (parts[0] === "signin") return { route: { page: "signin" }, subPage: "home" };
  if (parts[0] === "signup") return { route: { page: "signup" }, subPage: "home" };
  if (parts[0] === "profile") return { route: { page: "profile" }, subPage: "home" };
  if (parts[0] === "leaderboard") return { route: { page: "leaderboard" }, subPage: "home" };
  if (parts[0] === "mod") return { route: { page: "mod" }, subPage: "home" };
  if (parts[0] === "settings") return { route: { page: "settings" }, subPage: "home" };
  if (parts[0] === "scraper" && parts[1] === "anime" && parts[2])
    return { route: { page: "scraper-anime", id: parts[2] }, subPage: "home" };
  if (parts[0] === "scraper" && parts[1] === "watch" && parts[2] && parts[3] && parts[4])
    return { route: { page: "scraper-watch", site: parts[2], id: parts[3], episode: decodeURIComponent(parts[4]) }, subPage: "home" };
  if (parts[0] === "scraper") return { route: { page: "scraper" }, subPage: "home" };
  if (parts[0] === "music") return { route: { page: "music" }, subPage: "home" };
  if (parts[0] === "torrent") return { route: { page: "torrent" }, subPage: "home" };
  if (parts[0] === "download") return { route: { page: "download" }, subPage: "home" };
  // Fallback
  return { route: { page: "home" }, subPage: "home" };
}

// Legacy hash-based parser (kept for AniList/MAL OAuth redirect handling)
export function parseHash(hash: string): Route {
  const h = hash.replace("#", "");
  if (!h) return { page: "home" };
  const parts = h.split("/");
  if (parts[0] === "anime" && parts[1]) return { page: "anime", id: parts[1] };
  if (parts[0] === "watch" && parts[1] && parts[2]) {
    // /watch/{id}/{ep}[/{language}]
    // parts[3] (optional) = language hint (hindi/tamil/telugu/...)
    const episode = parseInt(parts[2], 10) || 1;
    const language = parts[3] ? parts[3].toLowerCase() : undefined;
    return { page: "watch", id: parts[1], episode, language };
  }
  if (parts[0] === "watch-together") {
    return parts[1] ? { page: "watch-together", code: parts[1] } : { page: "watch-together" };
  }
  return { page: "home" };
}

// ============================================================
// Helper Functions
// ============================================================

export function getAnimeTitle(anime: AnimeItem | MiruroAnimeItem): string {
  if (!anime) return "Unknown";
  if ("name" in anime) return anime.englishName || anime.name || "Unknown";
  const title = anime.title;
  if (!title) return "Unknown";
  return title.english || title.romaji || title.native || "Unknown";
}

export function getAnimeImage(anime: AnimeItem | MiruroAnimeItem): string {
  if (!anime) return "";
  if ("thumbnail" in anime) return anime.thumbnail || "";
  const cover = (anime as MiruroAnimeItem).coverImage;
  if (!cover) return "";
  return cover.extraLarge || cover.large || cover.medium || "";
}

export function getTMDBTitle(item: TMDBContentItem): string {
  return item.title || item.name || item.original_title || item.original_name || "Unknown";
}

export function getTMDBImage(item: TMDBContentItem): string {
  if (item.poster_path) return `https://image.tmdb.org/t/p/w500${item.poster_path}`;
  return "";
}

export function getTMDBBackdrop(item: TMDBContentItem): string {
  if (item.backdrop_path) return `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`;
  return "";
}

export function getTMDBYear(item: TMDBContentItem): string {
  const date = item.release_date || item.first_air_date;
  return date ? date.split("-")[0] : "";
}

export function getTMDBMediaType(item: TMDBContentItem): "movie" | "tv" {
  if (item.media_type === "movie" || item.media_type === "tv") return item.media_type;
  if (item.release_date || item.original_title) return "movie";
  return "tv";
}
