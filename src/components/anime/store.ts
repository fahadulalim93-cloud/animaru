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
  | { page: "watch"; id: string; episode: number; title?: string; image?: string }
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
  preferredLanguage: "sub" | "dub";
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
  setSectionSubPage: (subPage) => set({ sectionSubPage: subPage }),
  navigate: (route) => {
    // Reset section sub-page when navigating to a new section
    const subPage = "home";
    set({ route, sectionSubPage: subPage });
    if (typeof window !== "undefined") {
      if (route.page === "landing") window.location.hash = "";
      else if (route.page === "hub") window.location.hash = "hub";
      else if (route.page === "home") window.location.hash = "home";
      else if (route.page === "discover") window.location.hash = "discover";
      else if (route.page === "search" && route.query)
        window.location.hash = `search/${encodeURIComponent(route.query)}`;
      else if (route.page === "search") window.location.hash = "search";
      else if (route.page === "anime")
        window.location.hash = `anime/${route.id}`;
      else if (route.page === "watch")
        window.location.hash = `watch/${route.id}/${route.episode}`;
      else if (route.page === "genre")
        window.location.hash = `genre/${encodeURIComponent(route.genre)}`;
      else if (route.page === "bookmarks") window.location.hash = "bookmarks";
      else if (route.page === "watchlist") window.location.hash = "watchlist";
      else if (route.page === "history") window.location.hash = "history";
      else if (route.page === "movies") window.location.hash = "movies";
      else if (route.page === "tv") window.location.hash = "tv";
      else if (route.page === "manga") window.location.hash = "manga";
      else if (route.page === "manga-detail")
        window.location.hash = `manga/${route.id}`;
      else if (route.page === "manga-read")
        window.location.hash = `read-manga/${route.id}/${route.chapterId}`;
      else if (route.page === "movie-detail")
        window.location.hash = `movie/${route.id}`;
      else if (route.page === "tv-detail")
        window.location.hash = `tvshow/${route.id}`;
      else if (route.page === "movie-watch")
        window.location.hash = `watch-movie/${route.id}`;
      else if (route.page === "tv-watch")
        window.location.hash = `watch-tv/${route.id}/${route.season}/${route.episode}`;
      else if (route.page === "watchnow") window.location.hash = "watchnow";
      else if (route.page === "contact") window.location.hash = "contact";
      else if (route.page === "donate") window.location.hash = "donate";
      else if (route.page === "updates") window.location.hash = "updates";
      else if (route.page === "donate-crypto") window.location.hash = "donate/crypto";
      else if (route.page === "features") window.location.hash = "features";
      else if (route.page === "novel") window.location.hash = "novel";
      else if (route.page === "novel-detail") window.location.hash = `novel/${encodeURIComponent(route.novelId)}`;
      else if (route.page === "novel-read") window.location.hash = `read-novel/${encodeURIComponent(route.novelId)}/${route.chapterNum}`;
      else if (route.page === "signin") window.location.hash = "signin";
      else if (route.page === "signup") window.location.hash = "signup";
      else if (route.page === "profile") window.location.hash = "profile";
      else if (route.page === "settings") window.location.hash = "settings";
      else if (route.page === "music") window.location.hash = "music";
      else if (route.page === "torrent") window.location.hash = "torrent";
      else if (route.page === "download") window.location.hash = "download";
      else if (route.page === "scraper") window.location.hash = "scraper";
      else if (route.page === "scraper-anime") window.location.hash = `scraper/anime/${route.id}`;
      else if (route.page === "scraper-watch") window.location.hash = `scraper/watch/${route.site}/${route.id}/${encodeURIComponent(route.episode)}`;
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
  logout: () => set({ user: null }),
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

export function parseHash(hash: string): Route {
  const h = hash.replace("#", "");
  // Landing page removed — the site opens straight to the anime home.
  if (!h) return { page: "home" };
  const parts = h.split("/");
  if (parts[0] === "hub") return { page: "hub" };
  if (parts[0] === "home") return { page: "home" };
  if (parts[0] === "discover") return { page: "discover" };
  if (parts[0] === "search") return { page: "search", query: decodeURIComponent(parts[1] || "") };
  if (parts[0] === "anime" && parts[1]) return { page: "anime", id: parts[1] };
  if (parts[0] === "watch" && parts[1] && parts[2])
    return { page: "watch", id: parts[1], episode: parseInt(parts[2], 10) || 1 };
  // NOTE: "#genre/X" is handled below in the retired-sections block — it now
  // redirects to home (with sectionSubPage="genres" set in page.tsx handleHash).
  if (parts[0] === "bookmarks") return { page: "bookmarks" };
  if (parts[0] === "watchlist") return { page: "watchlist" };
  if (parts[0] === "history") return { page: "history" };
  // Legacy "#dub" links normalize to the single canonical anime home.
  if (parts[0] === "dub") return { page: "home" };
  // ── Retired sections — redirect ALL legacy Movies / TV / Live / WatchNow / Genre
  // hashes to the canonical anime home so old bookmarks and shared links don't
  // 404. (Genre also flips sectionSubPage → "genres" — handled in page.tsx
  // handleHash, since parseHash only returns a Route.)
  if (parts[0] === "movies") return { page: "home" };
  if (parts[0] === "tv") return { page: "home" };
  if (parts[0] === "live") return { page: "home" };
  if (parts[0] === "watchnow") return { page: "home" };
  if (parts[0] === "genre") return { page: "home" };
  if (parts[0] === "movie" && parts[1]) return { page: "home" };
  if (parts[0] === "tvshow" && parts[1]) return { page: "home" };
  if (parts[0] === "watch-movie" && parts[1]) return { page: "home" };
  if (parts[0] === "watch-tv") return { page: "home" };
  if (parts[0] === "live-watch") return { page: "home" };
  if (parts[0] === "live-tv-watch") return { page: "home" };
  if (parts[0] === "manga" && parts[1]) return { page: "manga-detail", id: parts[1] };
  if (parts[0] === "manga") return { page: "manga" };
  if (parts[0] === "read-manga" && parts[1] && parts[2])
    return { page: "manga-read", id: parts[1], chapterId: parts[2] };
  if (parts[0] === "contact") return { page: "contact" };
  if (parts[0] === "donate") return { page: "donate" };
  if (parts[0] === "donate" && parts[1] === "crypto") return { page: "donate-crypto" };
  if (parts[0] === "updates") return { page: "updates" };
  if (parts[0] === "guide") return { page: "guide" };
  if (parts[0] === "features") return { page: "features" };
  if (parts[0] === "novel" && parts[1]) return { page: "novel-detail", novelId: decodeURIComponent(parts[1]), novelTitle: "", novelCover: "", novelAuthor: "", novelSource: "readlightnovel" };
  if (parts[0] === "novel") return { page: "novel" };
  if (parts[0] === "read-novel" && parts[1] && parts[2]) return { page: "novel-read", novelId: decodeURIComponent(parts[1]), novelTitle: "", chapterId: `chapter-${parts[2]}`, chapterNum: parseInt(parts[2]), chapterTitle: "", totalChapters: 0, novelSource: "readlightnovel" };
  if (parts[0] === "signin") return { page: "signin" };
  if (parts[0] === "signup") return { page: "signup" };
  if (parts[0] === "profile") return { page: "profile" };
  if (parts[0] === "leaderboard") return { page: "leaderboard" };
  if (parts[0] === "mod") return { page: "mod" };
  if (parts[0] === "settings") return { page: "settings" };
  if (parts[0] === "scraper" && parts[1] === "anime" && parts[2])
    return { page: "scraper-anime", id: parts[2] };
  if (parts[0] === "scraper" && parts[1] === "watch" && parts[2] && parts[3] && parts[4])
    return { page: "scraper-watch", site: parts[2], id: parts[3], episode: decodeURIComponent(parts[4]) };
  if (parts[0] === "scraper") return { page: "scraper" };
  if (parts[0] === "music") return { page: "music" };
  if (parts[0] === "torrent") return { page: "torrent" };
  if (parts[0] === "download") return { page: "download" };
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
