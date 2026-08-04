"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAppStore } from "./store";
import AnimeComments from "./anime-comments";

/* ═══════════════════════════════════════════════════════════════
   MANGA DETAIL PAGE — v4 (site-blue, mirrors anime-detail layout)
   ─────────────────────────────────────────────────────────────────
   STRUCTURE — mirrors anime-section-page detail:
   1. Full-screen hero (blurred banner + poster + title + info + buttons)
   2. Synopsis section
   3. Chapter list (searchable, sortable, grouped)

   DATA
   • /api/manga/detail?id={id} — atsumaru info + chapters
   • /api/manga/banners?ids={anilistId} — AniList banner image enrichment

   ACCENT — site blue #1e88ff (matches the manga home page)
   ═══════════════════════════════════════════════════════════════ */

const ACCENT = "#1e88ff";
// Matches anime-detail.tsx's heading treatment exactly
const TEXT_GRADIENT = "linear-gradient(180deg, #ffffff 0%, #a3a3a3 100%)";

// Language badge colors — includes regional variants (es-419, pt-br, etc.)
// English is white (neutral) so it blends in; only non-English gets colored.
const LANG_COLORS: Record<string, string> = {
  en: "#ffffff",                  // English = white (neutral, no special color)
  es: "#EF4444", "es-419": "#EF4444", "es-es": "#EF4444",
  fr: "#6366F1", "fr-ca": "#6366F1",
  id: "#10B981", it: "#22C55E",
  "pt-br": "#F59E0B", "pt-pt": "#F59E0B", pt: "#F59E0B",
  vi: "#EC4899", zh: "#F43F5E", "zh-hans": "#F43F5E", "zh-hant": "#F43F5E",
  th: "#8B5CF6", pl: "#EAB308", ja: "#06B6D4", ko: "#3B82F6",
  de: "#F97316", ru: "#A855F7", ka: "#14B8A6", ms: "#06B6D4",
  he: "#84CC16",
};

interface MangaChapter {
  id: string;
  title: string;
  number: number;
  date?: string;
  scanGroup?: string;
  pageCount?: number;
  pages?: number;
  lang?: string;
  /** atsu.moe scanlation group ID (links to scanlators[].id on detail). */
  scanId?: string;
  /** Chapter index inside its scanlation (atsu.moe specific). */
  chapterIndex?: number;
}

interface MangaScanlator {
  id: string;
  name: string;
}

interface RelationItem {
  relationType: string;
  id: number;
  title: string;
  cover: string;
  type?: string;
  format?: string;
  status?: string;
}

interface CharacterItem {
  role: string;
  id: number;
  name: string;
  image: string;
}

interface RecommendationItem {
  id: number;
  title: string;
  cover: string;
  status?: string;
  chapters?: number | null;
  format?: string;
  type?: string;
}

interface MangaDetailData {
  id: string;
  title: string;
  englishTitle?: string;
  altTitles?: string[];
  poster?: string;
  cover?: string;
  banner?: string;
  description?: string;
  type?: string;
  status?: string;
  year?: number;
  authors?: string | string[];
  artists?: string[];
  genres?: string[];
  isAdult?: boolean;
  tags?: string[];
  anilistId?: number;
  malId?: number;
  totalChapters?: number;
  rating?: number;
  views?: number | string;
  chapters?: MangaChapter[];
  source?: string;
  slug?: string;
  /** Scanlation groups / "sources" for this manga (from atsu.moe). */
  scanlators?: MangaScanlator[];
}

interface MangaDetailProps {
  mangaId: string;
}

export default function MangaDetailPage({ mangaId }: MangaDetailProps) {
  const navigate = useAppStore(s => s.navigate);
  const user = useAppStore(s => s.user);
  const openAuthModal = useAppStore(s => s.openAuthModal);
  const addToLibrary = useAppStore(s => s.addToLibrary);
  const removeFromLibrary = useAppStore(s => s.removeFromLibrary);
  const inLibrary = useAppStore(s => s.library.some(e => e.key === `manga:${mangaId}`));
  const anilistToken = useAppStore(s => s.anilistToken);
  const openConnectListModal = useAppStore(s => s.openConnectListModal);
  const openEditListModal = useAppStore(s => s.openEditListModal);
  const [manga, setManga] = useState<MangaDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string>("");
  const [tmdbBackdrop, setTmdbBackdrop] = useState<string>("");
  const [relations, setRelations] = useState<RelationItem[]>([]);
  const [showAllRelations, setShowAllRelations] = useState(false);
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [showAllCharacters, setShowAllCharacters] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [chapterSearch, setChapterSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [selectedLang, setSelectedLang] = useState<string>("all");

  // ── New UI-only state for atsu.moe-style redesign ──
  // (does NOT touch any existing data-fetching / chapter-filter logic)
  const [showAllTags, setShowAllTags] = useState(false);
  const [showAllAltTitles, setShowAllAltTitles] = useState(false);
  const [selectedScanlator, setSelectedScanlator] = useState<string>("all");

  // ── Chapter list pagination — true paged (Previous/Next), 12 per page,
  // matching the reference. Resets to page 1 whenever filters/search/sort change. ──
  const CHAPTERS_PER_PAGE = 12;
  const [chapterPage, setChapterPage] = useState(1);

  // ── Our own view + rating stats (layered on atsu.moe's base) ──
  const [ourViews, setOurViews] = useState(0);
  const [ourRating, setOurRating] = useState(0);
  const [ourRatingCount, setOurRatingCount] = useState(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [ratingInput, setRatingInput] = useState<number>(0);
  const [submittingRating, setSubmittingRating] = useState(false);

  // ── Follow state ──
  const [followCount, setFollowCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);

  // ── Vibe review state (MockTailBar) ──
  const [vibeCounts, setVibeCounts] = useState({ drop: 0, bold: 0, great: 0, recommended: 0 });
  const [vibeTotal, setVibeTotal] = useState(0);
  const [userVibe, setUserVibe] = useState<string | null>(null);

  // ── Increment our view counter + fetch our ratings ──
  // Fires on mount AND when `user.username` changes (so a late-arriving
  // session still picks up the user's existing rating without a remount).
  // The view-counter POST also re-fires on login, but /api/manga/view is
  // idempotent enough (just increments) that the small over-count is
  // acceptable in exchange for correct rating display.
  useEffect(() => {
    if (!mangaId) return;

    // Increment view count (fire-and-forget)
    fetch(`/api/manga/view?mangaId=${encodeURIComponent(mangaId)}`, { method: "POST" })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.ourViews != null) setOurViews(data.ourViews);
      })
      .catch(() => {});

    // Fetch our own ratings (and the user's rating if logged in)
    const username = user?.username || "";
    const ratingsUrl = `/api/manga/ratings?mangaId=${encodeURIComponent(mangaId)}${username ? `&username=${encodeURIComponent(username)}` : ""}`;
    fetch(ratingsUrl)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        setOurViews(data.ourViews || 0);
        setOurRating(data.ourRating || 0);
        setOurRatingCount(data.ourRatingCount || 0);
        if (data.userRating != null) {
          setUserRating(data.userRating);
          setRatingInput(data.userRating);
        }
      })
      .catch(() => {});

    // Fetch follow count + isFollowing
    const followUrl = `/api/manga/follow?mangaId=${encodeURIComponent(mangaId)}${username ? `&username=${encodeURIComponent(username)}` : ""}`;
    fetch(followUrl)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        setFollowCount(data.follows || 0);
        setIsFollowing(data.isFollowing || false);
      })
      .catch(() => {});

    // Fetch vibe reviews (MockTailBar)
    const vibeUrl = `/api/manga/vibe-review?mangaId=${encodeURIComponent(mangaId)}${username ? `&username=${encodeURIComponent(username)}` : ""}`;
    fetch(vibeUrl)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        setVibeCounts(data.counts || { drop: 0, bold: 0, great: 0, recommended: 0 });
        setVibeTotal(data.total || 0);
        setUserVibe(data.userVibe || null);
      })
      .catch(() => {});
  }, [mangaId, user?.username]);

  // ── Toggle follow ──
  const toggleFollow = async () => {
    const username = user?.username;
    if (!username) { alert("Please sign in to follow manga."); return; }
    try {
      const res = await fetch("/api/manga/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mangaId, username }),
      });
      if (res.ok) {
        const data = await res.json();
        setFollowCount(data.follows);
        setIsFollowing(data.isFollowing);
      }
    } catch { /* ignore */ }
  };

  // ── Submit vibe review ──
  const submitVibe = async (vibe: string) => {
    const username = user?.username;
    if (!username) { alert("Please sign in to review."); return; }
    try {
      const res = await fetch("/api/manga/vibe-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mangaId, username, vibe }),
      });
      if (res.ok) {
        const data = await res.json();
        setVibeCounts(data.counts);
        setVibeTotal(data.total);
        setUserVibe(data.userVibe);
      }
    } catch { /* ignore */ }
  };

  // ── Submit a rating ──
  const submitRating = async (rating: number) => {
    if (!user || submittingRating) return;
    setSubmittingRating(true);
    try {
      const res = await fetch("/api/manga/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mangaId,
          username: user.username,
          rating,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setUserRating(data.rating);
        setOurRating(data.ourRating);
        setOurRatingCount(data.ourRatingCount);
        setRatingInput(data.rating);
      }
    } catch { /* ignore */ }
    setSubmittingRating(false);
  };

  // ── Combined stats (atsu.moe base + our own) ──
  // Only use OUR OWN views/ratings (not atsu.moe's).
  // Starts at 0, goes up as people view/rate on our site.
  const combinedViews = ourViews;
  const combinedRating = ourRating;

  // ── Load manga detail ──
  useEffect(() => {
    let fbTitle = "";
    let fbPoster = "";
    let data: MangaDetailData | null = null;

    async function load() {
      setLoading(true);
      try {
        // Get fallback title from sessionStorage (for cross-provider metadata merge)
        try {
          fbTitle = sessionStorage.getItem(`manga-title-${mangaId}`) || "";
          fbPoster = sessionStorage.getItem(`manga-poster-${mangaId}`) || "";
        } catch { /* ignore */ }

        // Pass title to the API for cross-provider fallback
        const titleParam = fbTitle ? `&title=${encodeURIComponent(fbTitle)}` : "";
        const res = await fetch(`/api/manga/detail?id=${encodeURIComponent(mangaId)}${titleParam}`);
        if (res.ok) {
          data = await res.json() as MangaDetailData;

          // Fallback poster/title from sessionStorage (for mangaball manga
          // where the info endpoint fails and returns empty poster)
          if (!data.poster || data.poster === "") {
            if (fbPoster) {
              data.poster = fbPoster;
              data.cover = fbPoster;
              data.banner = fbPoster;
            }
            if (fbTitle && (!data.title || data.title === "Unknown Title")) {
              data.title = fbTitle;
              data.englishTitle = fbTitle;
            }
          }

          setManga(data);

          // Fetch AniList banner if we have an anilistId
          const alId = data.anilistId ? parseInt(String(data.anilistId), 10) : null;
          if (alId && !isNaN(alId)) {
            try {
              const bRes = await fetch(`/api/manga/banners?ids=${alId}`);
              if (bRes.ok) {
                const bData = await bRes.json();
                const b = bData.banners?.[alId]?.banner;
                if (b) setBanner(b);
                const rels = bData.banners?.[alId]?.relations;
                if (Array.isArray(rels) && rels.length > 0) setRelations(rels);
                const chars = bData.banners?.[alId]?.characters;
                if (Array.isArray(chars) && chars.length > 0) setCharacters(chars);
                const recs = bData.banners?.[alId]?.recommendations;
                if (Array.isArray(recs) && recs.length > 0) setRecommendations(recs);
              }
            } catch { /* ignore */ }

            // High-quality backdrop from TMDB (searches by title against the
            // anime adaptation, if one exists) — much more reliable than
            // AniList's bannerImage, which is often missing for manga.
            const titleForTmdb = data.englishTitle || data.title || fbTitle;
            if (titleForTmdb) {
              try {
                const tRes = await fetch(`/api/anime/tmdb-images?anilistId=${alId}&title=${encodeURIComponent(titleForTmdb)}`);
                if (tRes.ok) {
                  const tData = await tRes.json();
                  if (tData.backdropUrl) setTmdbBackdrop(tData.backdropUrl);
                }
              } catch { /* ignore */ }
            }
          }
        }
      } catch { /* ignore */ }

      // Set loading=false — page renders immediately with mangaball data
      setLoading(false);

      // CLIENT-SIDE cross-provider merge (runs AFTER page renders):
      // - If atsumaru manga (at:): search mangaball, merge its chapters (all languages)
      // - If mangaball manga (mb:): search atsumaru, prepend its English chapters
      // - If comix manga (cx:): search atsumaru, merge atsumaru + mangaball chapters
      // Result for at:/mb:: ALL English scans from atsumaru + ALL mangaball chapters
      // Result for cx:: comix chapters + atsumaru English + mangaball multi-lang
      // CLIENT-SIDE cross-provider merge (FALLBACK only):
      // The server-side detail route now does the cross-provider merge
      // in parallel (atsumaru + mangaball). This client-side merge only
      // runs as a fallback if the server merge didn't produce multi-language
      // chapters (e.g., if the server-side mangaball fetch timed out).
      if (data?.chapters?.length) {
        // Check if the server already merged multi-language chapters
        const serverLangs = new Set(data.chapters.map((ch: any) => ch.lang || "en").filter(Boolean));
        const titleForSearch = fbTitle || data.englishTitle || data.title || "";
        if (titleForSearch && titleForSearch !== "Unknown Title" && serverLangs.size <= 1) {
          (async () => {
            try {
              if (mangaId.startsWith("mb:")) {
                // Mangaball manga → search atsumaru for English chapters
                const searchRes = await fetch(
                  `/api/manga/search?q=${encodeURIComponent(titleForSearch)}`
                );
                if (searchRes.ok) {
                  const searchData = await searchRes.json();
                  const results = searchData.results || [];
                  const match = results.find((r: any) => {
                    const rTitle = (r.englishTitle || r.title || "").toLowerCase();
                    const sTitle = titleForSearch.toLowerCase();
                    return rTitle.includes(sTitle) || sTitle.includes(rTitle) ||
                           rTitle.slice(0, 20) === sTitle.slice(0, 20);
                  }) || results[0];

                  if (match) {
                    const atsuMangaId = match.id.replace(/^at:/, "");
                    const atsuRes = await fetch(`/api/manga/detail?id=at:${atsuMangaId}`);
                    if (atsuRes.ok) {
                      const atsuData = await atsuRes.json();
                      if (atsuData.chapters?.length) {
                        // Preserve the real scanlator name from atsu.moe
                        // (e.g. "Gamma", "Alpha") so we can derive the
                        // "English 1/English 2" label from scanId.
                        const atsuEnChapters = atsuData.chapters.map((ch: any) => ({
                          ...ch,
                          id: `at:${atsuMangaId}:${ch.number}:${ch.id}`,
                          lang: "en",
                          scanGroup: ch.scanGroup,
                          scanId: ch.scanId,
                        }));
                        setManga(prev => prev ? {
                          ...prev,
                          chapters: [...atsuEnChapters, ...(prev.chapters || [])],
                          totalChapters: (prev.chapters?.length || 0) + atsuEnChapters.length,
                          scanlators: prev.scanlators?.length
                            ? prev.scanlators
                            : (atsuData.scanlators || []),
                        } : prev);
                      }
                    }
                  }
                }
              } else if (mangaId.startsWith("at:")) {
                // Atsumaru manga → search mangaball for ALL chapters (English + non-English)
                // Note: mangaball's English chapters are also appended (not just
                // non-English) so users get a wider selection of English scans.
                const searchRes = await fetch(
                  `/api/manga/search?q=${encodeURIComponent(titleForSearch)}`
                );
                if (searchRes.ok) {
                  const searchData = await searchRes.json();
                  const results = searchData.results || [];
                  // Find mangaball result (mb: prefix)
                  const mbMatch = results.find((r: any) => r.id?.startsWith("mb:"));

                  if (mbMatch) {
                    const mbRes = await fetch(`/api/manga/detail?id=${encodeURIComponent(mbMatch.id)}`);
                    if (mbRes.ok) {
                      const mbData = await mbRes.json();
                      if (mbData.chapters?.length) {
                        // Add ALL mangaball chapters (English + non-English)
                        setManga(prev => prev ? {
                          ...prev,
                          chapters: [...(prev.chapters || []), ...mbData.chapters],
                          totalChapters: (prev.chapters?.length || 0) + mbData.chapters.length,
                        } : prev);
                      }
                    }
                  }
                }
              } else if (mangaId.startsWith("cx:")) {
                // Comix manga → search BOTH atsumaru (English) + mangaball (multi-lang)
                // and append their chapters. Comix is English-only, so this gives
                // users access to other languages via the other providers.
                const searchRes = await fetch(
                  `/api/manga/search?q=${encodeURIComponent(titleForSearch)}`
                );
                if (searchRes.ok) {
                  const searchData = await searchRes.json();
                  const results = searchData.results || [];
                  const atMatch = results.find((r: any) => r.id?.startsWith("at:"));
                  const mbMatch = results.find((r: any) => r.id?.startsWith("mb:"));

                  const merges: any[] = [];
                  // Atsumaru English chapters
                  if (atMatch) {
                    try {
                      const atsuRes = await fetch(`/api/manga/detail?id=${encodeURIComponent(atMatch.id)}`);
                      if (atsuRes.ok) {
                        const atsuData = await atsuRes.json();
                        const atsuMangaId = atMatch.id.replace(/^at:/, "");
                        for (const ch of (atsuData.chapters || [])) {
                          merges.push({
                            ...ch,
                            id: `at:${atsuMangaId}:${ch.number}:${ch.id}`,
                            lang: "en",
                          });
                        }
                      }
                    } catch { /* ignore */ }
                  }
                  // Mangaball multi-language chapters
                  if (mbMatch) {
                    try {
                      const mbRes = await fetch(`/api/manga/detail?id=${encodeURIComponent(mbMatch.id)}`);
                      if (mbRes.ok) {
                        const mbData = await mbRes.json();
                        merges.push(...(mbData.chapters || []));
                      }
                    } catch { /* ignore */ }
                  }
                  if (merges.length > 0) {
                    setManga(prev => prev ? {
                      ...prev,
                      chapters: [...(prev.chapters || []), ...merges],
                      totalChapters: (prev.chapters?.length || 0) + merges.length,
                    } : prev);
                  }
                }
              }
            } catch { /* ignore merge errors */ }
          })();
        }
      }
    }
    load();
  }, [mangaId]);

  // ── Derived ──
  const displayTitle = manga?.englishTitle || manga?.title || "";
  const poster = manga?.poster || manga?.cover || "";
  const heroBanner = tmdbBackdrop || banner || manga?.banner || poster;
  const authors = manga
    ? (Array.isArray(manga.authors) ? manga.authors.join(", ") : (manga.authors || "Unknown"))
    : "";
  const cleanDesc = manga?.description ? manga.description.replace(/<[^>]*>/g, "") : "";
  const descTruncated = cleanDesc.length > 400 && !showFullDesc;
  const descDisplay = descTruncated ? cleanDesc.slice(0, 400) + "..." : cleanDesc;

  // Extract available languages from chapters (mangaball has en/fr/id)
  // ── Normalize a language code to its base language ──
  // e.g. "es-419" → "es", "pt-br" → "pt", "zh-hans" → "zh"
  // Used both to group chapters by language (so "es-419" and "es-la" don't
  // show up as two separate scanlations) and to build the language filter
  // dropdown, so it only lists languages that are actually distinct —
  // not every raw regional variant code present in the source data.
  const normalizeLang = (lang: string): string => {
    if (!lang) return "en";
    // Keep pt-br as-is (it's a common distinct code), but strip other regional variants
    if (lang === "pt-br" || lang === "pt-pt") return lang;
    return lang.split("-")[0];
  };

  const availableLangs = useMemo(() => {
    if (!manga?.chapters) return [];
    const langs = new Set<string>();
    for (const ch of manga.chapters) {
      langs.add(normalizeLang(ch.lang || "en"));
    }
    return Array.from(langs).sort();
  }, [manga]);

  // Language display names — full names, includes regional variants
  // (es-419 = Latin American Spanish, zh-hans = Simplified Chinese, etc.)
  const LANG_NAMES: Record<string, string> = {
    en: "English", fr: "French", "fr-ca": "French (Canada)", id: "Indonesian",
    ja: "Japanese", ko: "Korean",
    zh: "Chinese", "zh-hans": "Chinese (Simplified)", "zh-hant": "Chinese (Traditional)",
    es: "Spanish", "es-419": "Spanish", "es-es": "Spanish (Spain)",
    "pt-br": "Portuguese (Brazil)", "pt-pt": "Portuguese (Portugal)", pt: "Portuguese",
    de: "German", ru: "Russian",
    vi: "Vietnamese", it: "Italian", th: "Thai", pl: "Polish",
    ar: "Arabic", bg: "Bulgarian", bn: "Bengali", ca: "Catalan",
    cs: "Czech", da: "Danish", el: "Greek", he: "Hebrew",
    hi: "Hindi", hu: "Hungarian", ms: "Malay", nl: "Dutch",
    no: "Norwegian", ro: "Romanian", sk: "Slovak", sl: "Slovenian",
    sr: "Serbian", sv: "Swedish", tr: "Turkish", uk: "Ukrainian",
    ka: "Georgian",
  };

  const filteredChapters = useMemo(() => {
    if (!manga?.chapters) return [];
    return manga.chapters
      .filter(ch => {
        // Language filter — compares normalized codes so selecting "es"
        // also matches "es-419"/"es-la" scans, not just an exact "es" tag.
        if (selectedLang !== "all" && normalizeLang(ch.lang || "en") !== selectedLang) return false;
        // Search filter
        if (!chapterSearch) return true;
        const q = chapterSearch.toLowerCase();
        return ch.title.toLowerCase().includes(q) || String(ch.number).includes(q);
      })
      .sort((a, b) => sortOrder === "asc" ? a.number - b.number : b.number - a.number);
  }, [manga, chapterSearch, sortOrder, selectedLang]);

  // Group chapters by number — each group contains all scan/language variants
  const chapterGroups = useMemo(() => {
    const groups: { number: number; scans: MangaChapter[] }[] = [];
    const byNumber = new Map<number, MangaChapter[]>();
    for (const ch of filteredChapters) {
      const arr = byNumber.get(ch.number) || [];
      arr.push(ch);
      byNumber.set(ch.number, arr);
    }
    for (const [number, scans] of byNumber) {
      groups.push({ number, scans });
    }
    groups.sort((a, b) => sortOrder === "asc" ? a.number - b.number : b.number - a.number);
    return groups;
  }, [filteredChapters, sortOrder]);

  // ── Build a stable language-based label for each chapter row ──
  // Shows "English 1", "English 2", "Indonesian 1", etc. with the
  // scanlator name appended so users can identify which scanlation
  // each row is (e.g. "English 1 (Gamma)").
  //
  // We compute the index PER (chapter number, language) group, stable-sorted
  // by scanId so the same scanlation always gets the same number across
  // different chapter numbers.
  const chapterLabel = useCallback((ch: MangaChapter): string => {
    const lang = ch.lang || "en";
    const langName = LANG_NAMES[lang] || LANG_NAMES[normalizeLang(lang)] || lang.toUpperCase();
    const baseLang = normalizeLang(lang);
    // Find all scans of the SAME chapter number AND same base language
    const sameLangScans = (manga?.chapters || [])
      .filter(c => c.number === ch.number && normalizeLang(c.lang || "en") === baseLang)
      .sort((a, b) => (a.scanId || a.id || "").localeCompare(b.scanId || b.id || ""));
    // If only one scan for this language, no suffix needed
    if (sameLangScans.length <= 1) return langName;
    const idx = sameLangScans.findIndex(c => c.id === ch.id);
    return `${langName} ${idx + 1}`;
  }, [manga]);

  const navigateToChapter = useCallback((ch: MangaChapter) => {
    // Build the chapterId to pass to the reader. Three cases:
    //   1. Mangaball translation ID (24 hex chars) → pass as-is
    //   2. Atsumaru short chapter ID (e.g. "LMHqVf") → pass as-is
    //      (the reader's /api/manga/read route will detect it and build
    //       /static/pages/{chapterId}/{i}.webp URLs directly)
    //   3. Atsumaru cross-provider merge ID
    //      "at:{mangaId}:{number}:{chapterId}" → pass as-is
    //      (the reader will extract the real chapter ID from the last segment)
    //   4. Atsumaru chapter number only (legacy) → pass as string number
    let chapterId: string;
    if (ch.id && ch.id.length === 24) {
      // Mangaball translation ID
      chapterId = ch.id;
    } else if (ch.id && ch.id.startsWith("at:")) {
      // Cross-provider merge format — pass as-is
      chapterId = ch.id;
    } else if (ch.id && /^[A-Za-z0-9_-]{3,20}$/.test(ch.id) && !/^\d+$/.test(ch.id)) {
      // Short atsu.moe chapter ID
      chapterId = ch.id;
    } else {
      // Fallback: chapter number
      chapterId = String(ch.number);
    }
    navigate({
      page: "manga-read",
      id: mangaId,
      chapterId,
    } as any);
    // Store selected lang in sessionStorage for the reader to use
    try {
      sessionStorage.setItem(`manga-lang-${mangaId}`, selectedLang);
    } catch { /* ignore */ }
  }, [navigate, mangaId, selectedLang]);

  // ── UI helpers for atsu.moe-style redesign (pure functions, no data logic) ──
  const formatViews = (views: number | string | undefined | null): string => {
    if (views == null) return "0";
    const n = typeof views === "number"
      ? views
      : parseInt(String(views).replace(/[^0-9]/g, ""), 10) || 0;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  };

  const formatRelativeDate = (dateStr?: string): string => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "";
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      if (diffMs < 0) return "just now";
      const seconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      const weeks = Math.floor(days / 7);
      const months = Math.floor(days / 30);
      const years = Math.floor(days / 365);
      if (years > 0) return years === 1 ? "last year" : `${years} years ago`;
      if (months > 0) return months === 1 ? "last month" : `${months} months ago`;
      if (weeks > 0) return weeks === 1 ? "last week" : `${weeks} weeks ago`;
      if (days > 0) return days === 1 ? "yesterday" : `${days} days ago`;
      if (hours > 0) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
      if (minutes > 0) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
      return "just now";
    } catch { return ""; }
  };

  // Reset chapter pagination to page 1 whenever filters/search/sort change.
  useEffect(() => {
    setChapterPage(1);
  }, [chapterSearch, sortOrder, selectedLang, selectedScanlator]);

  // Scanlation-group filter — applied on top of existing chapterGroups.
  // Does NOT modify any existing useMemo / filter logic.
  const visibleChapterGroups = useMemo(() => {
    if (selectedScanlator === "all") return chapterGroups;
    return chapterGroups
      .map(g => ({ ...g, scans: g.scans.filter(s => s.scanId === selectedScanlator) }))
      .filter(g => g.scans.length > 0);
  }, [chapterGroups, selectedScanlator]);

  // ── atsu.moe design tokens ──
  // ── Color tokens — pure black base, blue accent for chapters/scanlators ──
  const COLOR_BG = "#000000";              // pure black background
  const COLOR_TEXT = "#b0b0b0";            // medium gray body text
  const COLOR_HEADING = "#ffffff";         // pure white headings
  const COLOR_ACCENT = "#1e88ff";          // blue — used for chapter names, scanlator names, rating star
  const COLOR_SLATE3 = "#1a1a1a";          // darkest panel (genre pills)
  const COLOR_SLATE2 = "#141414";          // darker panel (tag pills, hover bg)
  const COLOR_MUTED = "#666666";           // muted gray for labels
  const COLOR_BORDER = "#222222";          // subtle border
  const FONT_STACK = "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  const genrePillStyle = {
    background: COLOR_SLATE3,
    color: COLOR_HEADING,
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    display: "inline-block",
  } as const;

  const tagPillStyle = {
    background: COLOR_SLATE2,
    color: "rgba(249,248,246,0.8)",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    display: "inline-block",
  } as const;

  const metaLabelStyle = {
    color: COLOR_MUTED,
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    marginBottom: "4px",
  } as const;

  const metaValueStyle = {
    color: COLOR_HEADING,
    fontSize: "14px",
  } as const;

  const controlStyle = {
    background: COLOR_SLATE2,
    color: COLOR_HEADING,
    border: "1px solid #424144",
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "13px",
    outline: "none",
    cursor: "pointer",
    fontFamily: FONT_STACK,
  } as const;

  const linkButtonStyle = {
    background: "transparent",
    border: "none",
    color: COLOR_ACCENT,
    cursor: "pointer",
    padding: "4px 8px",
    fontSize: "12px",
    fontFamily: FONT_STACK,
  } as const;

  // ── Loading ──
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: COLOR_BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <style>{`@keyframes atsu-spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{
          width: "40px",
          height: "40px",
          border: "3px solid rgba(142,124,230,0.2)",
          borderTopColor: COLOR_ACCENT,
          borderRadius: "50%",
          animation: "atsu-spin 0.8s linear infinite",
        }} />
      </div>
    );
  }

  if (!manga) {
    return (
      <div style={{
        minHeight: "100vh",
        background: COLOR_BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: COLOR_MUTED,
        fontFamily: FONT_STACK,
        fontSize: "16px",
      }}>
        Manga not found.
      </div>
    );
  }


  const firstChapter = manga.chapters && manga.chapters.length > 0
    ? [...manga.chapters].sort((a, b) => a.number - b.number)[0]
    : null;
  const shareManga = () => {
    if (navigator.share) navigator.share({ title: displayTitle, url: window.location.href });
    else navigator.clipboard.writeText(window.location.href);
  };
  const openAddToList = () => {
    if (!anilistToken) { openConnectListModal(); return; }
    if (manga.anilistId) openEditListModal({ id: manga.anilistId, title: displayTitle, cover: poster });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ═══ BANNER — tall, poster overlaps its bottom edge ═══ */}
      <div className="relative w-full h-[78vh] min-h-[560px] overflow-hidden bg-black">
        {heroBanner && <img src={heroBanner} alt="" className="object-cover" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
      </div>

      {/* ═══ MOBILE HERO — centered stacked layout ═══ */}
      <div className="lg:hidden relative z-10 px-4 -mt-[300px] flex flex-col items-center text-center">
        {poster && (
          <div className="w-[160px] aspect-[2/3] rounded-lg overflow-hidden shrink-0 bg-white/10 shadow-2xl mb-4">
            <img src={poster} alt={displayTitle} className="w-full h-full object-cover" />
          </div>
        )}
        {manga.title && manga.title !== displayTitle && (
          <p className="text-white/50 text-base mb-1 line-clamp-1">{manga.title}</p>
        )}
        <h1
          className="font-karla text-2xl font-extrabold line-clamp-2 bg-clip-text text-transparent"
          style={{ backgroundImage: TEXT_GRADIENT }}
        >
          {displayTitle}
        </h1>
        <div className="flex items-center justify-center gap-2 flex-wrap mt-4">
          {manga.type && <span className="px-4 py-2 bg-[#ffffff] text-black rounded-sm font-semibold text-sm">{manga.type}</span>}
          {manga.status && <span className="px-4 py-2 bg-[#ffffff] text-black rounded-sm font-semibold text-sm">{manga.status}</span>}
          {manga.year ? <span className="px-4 py-2 bg-[#ffffff] text-black rounded-sm font-semibold text-sm">{manga.year}</span> : null}
        </div>
        {cleanDesc && (
          <p className="text-white/60 text-sm mt-4 max-w-sm line-clamp-3">{cleanDesc}</p>
        )}
        <div className="flex items-center justify-center gap-3 mt-5">
          {firstChapter && (
            <button
              onClick={() => navigateToChapter(firstChapter)}
              className="flex items-center gap-2 bg-white text-black font-bold rounded-full h-12 px-6 text-sm hover:bg-white/90 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="black"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" /></svg>
              Read First Chapter
            </button>
          )}
          <button onClick={openAddToList} title="Add to list" className="w-11 h-11 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center text-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button onClick={shareManga} title="Share" className="w-11 h-11 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center text-white transition-colors">
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
          </button>
        </div>
      </div>

      {/* ═══ DESKTOP HERO — poster + title/pills/description/actions, pulled up over the banner ═══ */}
      <div className="hidden lg:block relative z-10 px-3 xl:px-5 -mt-[330px] xl:-mt-[350px]">
        <div className="grid grid-cols-[190px_1fr] xl:grid-cols-[205px_1fr] 2xl:grid-cols-[220px_1fr] gap-x-5 xl:gap-x-7 gap-y-4">
          {poster && (
            <div className="w-[190px] xl:w-[205px] 2xl:w-[220px] aspect-[2/3] rounded-lg overflow-hidden shrink-0 bg-white/10 shadow-2xl" style={{ gridColumn: 1, gridRow: 1 }}>
              <img src={poster} alt={displayTitle} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex flex-col justify-end min-w-0 pt-[110px] xl:pt-[130px]" style={{ gridColumn: 2, gridRow: 1 }}>
            {manga.title && manga.title !== displayTitle && (
              <p className="text-white/50 text-lg pb-2 line-clamp-1 w-[70%]">{manga.title}</p>
            )}
            <h1
              className="font-karla text-2xl xl:text-3xl font-extrabold leading-tight pb-3 bg-clip-text text-transparent"
              style={{ backgroundImage: TEXT_GRADIENT }}
            >
              {displayTitle}
            </h1>
            <div className="flex items-center w-full gap-3 flex-wrap pb-5">
              {manga.type && <span className="px-3 py-1.5 bg-[#ffffff] text-black rounded-sm font-semibold text-sm">{manga.type}</span>}
              {manga.status && <span className="px-3 py-1.5 bg-[#ffffff] text-black rounded-sm font-semibold text-sm">{manga.status}</span>}
              {manga.year ? <span className="px-3 py-1.5 bg-[#ffffff] text-black rounded-sm font-semibold text-sm">{manga.year}</span> : null}
            </div>
            {cleanDesc && (
              <div className="relative w-full max-w-3xl group">
                {!showFullDesc && (
                  <div className="absolute z-30 flex items-end justify-center top-0 w-full h-full opacity-0 group-hover:opacity-100 bg-gradient-to-b from-transparent to-black to-95% transition-opacity duration-300">
                    <button type="button" onClick={() => setShowFullDesc(true)} className="text-center font-bold text-white py-1 w-full">
                      Read More
                    </button>
                  </div>
                )}
                <p className={`text-white/60 text-sm leading-relaxed ${showFullDesc ? "" : "line-clamp-2"}`}>
                  {cleanDesc}
                </p>
              </div>
            )}
          </div>

          {/* Action row — Read First Chapter, +, Share, AniList, MAL — starts at
              the poster's left edge (row 2, spanning both columns) instead of
              being pushed down by how tall the title/pills/description column is. */}
          <div className="flex flex-wrap items-center gap-3" style={{ gridColumn: "1 / -1", gridRow: 2 }}>
            {firstChapter && (
              <button
                onClick={() => navigateToChapter(firstChapter)}
                className="flex items-center gap-2 bg-white text-black font-bold rounded-full h-12 px-8 text-base hover:bg-white/90 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="black"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" /></svg>
                Read First Chapter
              </button>
            )}
            <button onClick={openAddToList} title="Add to list" className="w-12 h-12 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center text-white transition-colors">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <button onClick={shareManga} title="Share" className="w-12 h-12 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center text-white transition-colors">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
            </button>
            {manga.anilistId && (
              <a href={`https://anilist.co/manga/${manga.anilistId}`} target="_blank" rel="noopener noreferrer" title="AniList" className="w-12 h-12 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center transition-colors">
                <svg viewBox="0 0 512 512" width="20" height="20"><path d="M321.92 323.27V136.6c0-10.698-5.887-16.602-16.558-16.602h-36.433c-10.672 0-16.561 5.904-16.561 16.602v88.651c0 2.497 23.996 14.089 24.623 16.541 18.282 71.61 3.972 128.92-13.359 131.6 28.337 1.405 31.455 15.064 10.348 5.731 3.229-38.209 15.828-38.134 52.049-1.406.31.317 7.427 15.282 7.87 15.282h85.545c10.672 0 16.558-5.9 16.558-16.6v-36.524c0-10.698-5.886-16.602-16.558-16.602z" fill="#02a9ff" /><path d="M170.68 120 74.999 393h74.338l16.192-47.222h80.96L262.315 393h73.968l-95.314-273zm11.776 165.28 23.183-75.629 25.393 75.629z" fill="#fefefe" /></svg>
              </a>
            )}
            {manga.malId && (
              <a href={`https://myanimelist.net/manga/${manga.malId}`} target="_blank" rel="noopener noreferrer" title="MyAnimeList" className="w-12 h-12 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center transition-colors">
                <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#2e51a2" d="M8.273 7.247v8.423l-2.103-.003v-5.216l-2.03 2.404-1.989-2.458-.02 5.285H.001L0 7.247h2.203l1.865 2.545 2.015-2.546 2.19.001zm8.628 2.069l.025 6.335h-2.365l-.008-2.871h-2.8c.07.499.21 1.266.417 1.779.155.381.298.751.583 1.128l-1.705 1.125c-.349-.636-.622-1.337-.878-2.082a9.296 9.296 0 0 1-.507-2.179c-.085-.75-.097-1.471.107-2.212a3.908 3.908 0 0 1 1.161-1.866c.313-.293.749-.5 1.1-.687.351-.187.743-.264 1.107-.359a7.405 7.405 0 0 1 1.191-.183c.398-.034 1.107-.066 2.39-.028l.545 1.749H14.51c-.593.008-.878.001-1.341.209a2.236 2.236 0 0 0-1.278 1.92l2.663.033.038-1.81h2.309zm3.992-2.099v6.627l3.107.032-.43 1.775h-4.807V7.187l2.13.03z" /></svg>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ═══ RELATIONS — capped at 3 until "Show more" is clicked ═══ */}
      {relations.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-10 mt-16">
          <div className="flex items-center justify-between mb-4">
            <h2
              className="font-karla text-xl sm:text-2xl font-bold bg-clip-text text-transparent"
              style={{ backgroundImage: TEXT_GRADIENT }}
            >
              Relations
            </h2>
            {relations.length > 3 && (
              <button
                onClick={() => setShowAllRelations(v => !v)}
                className="text-sm font-semibold text-white/50 hover:text-white transition-colors"
              >
                {showAllRelations ? "Show less" : "Show more"}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(showAllRelations ? relations : relations.slice(0, 3)).map((r, i) => (
              <button
                key={`${r.id}-${i}`}
                onClick={() => {
                  if (r.type === "MANGA") navigate({ page: "manga-detail", id: `at:${r.id}` });
                  else navigate({ page: "anime", id: String(r.id) });
                }}
                className="flex items-stretch gap-0 bg-white/[0.04] hover:bg-white/[0.07] rounded-none overflow-hidden text-left transition-colors"
              >
                {r.cover && (
                  <div className="w-[90px] shrink-0 aspect-[2/3] bg-white/10">
                    <img src={r.cover} alt={r.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex flex-col justify-center gap-1.5 px-4 py-3 min-w-0">
                  <span className="text-white/40 text-xs font-bold uppercase tracking-wider">{r.relationType.replace(/_/g, " ")}</span>
                  <span className="text-white font-bold text-base line-clamp-2">{r.title}</span>
                  {r.format && <span className="text-white/40 text-xs font-semibold uppercase tracking-wider">{r.format}</span>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ═══ CHAPTERS + OTHER ═══ */}
      <section className="px-4 sm:px-6 lg:px-10 mt-16 mb-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
          {/* ── Chapters (main) ── */}
          <div>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h2
                className="font-karla text-xl sm:text-2xl font-bold bg-clip-text text-transparent"
                style={{ backgroundImage: TEXT_GRADIENT }}
              >
                Chapters <span className="text-white/30 text-base font-semibold">({visibleChapterGroups.length})</span>
              </h2>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap bg-white/[0.03] border border-white/[0.07] rounded-lg p-2 mb-4">
              <div className="relative flex-1 min-w-[160px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search chapters..."
                  value={chapterSearch}
                  onChange={e => setChapterSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-md text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/25 transition-colors"
                />
              </div>
              {manga.scanlators && manga.scanlators.length > 0 && (
                <select
                  value={selectedScanlator}
                  onChange={e => setSelectedScanlator(e.target.value)}
                  className="px-3 py-2 bg-black/40 border border-white/10 rounded-md text-sm text-white/80 focus:outline-none cursor-pointer hover:border-white/20 transition-colors"
                >
                  <option value="all">All Groups</option>
                  {manga.scanlators.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              {availableLangs.length > 0 && (
                <select
                  value={selectedLang}
                  onChange={e => setSelectedLang(e.target.value)}
                  className="px-3 py-2 bg-black/40 border border-white/10 rounded-md text-sm text-white/80 focus:outline-none cursor-pointer hover:border-white/20 transition-colors"
                >
                  <option value="all">All Languages</option>
                  {availableLangs.map(l => <option key={l} value={l}>{LANG_NAMES[l] || l.toUpperCase()}</option>)}
                </select>
              )}
              <button
                onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")}
                title={sortOrder === "asc" ? "Oldest first" : "Newest first"}
                className="flex items-center gap-1.5 px-3 py-2 shrink-0 bg-black/40 border border-white/10 rounded-md text-sm text-white/70 hover:text-white hover:border-white/20 transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  {sortOrder === "asc"
                    ? <path d="M3 6h13M3 12h9M3 18h6M18 8l3-3 3 3M21 5v14" />
                    : <path d="M3 6h13M3 12h9M3 18h6M18 16l3 3 3-3M21 19V5" />}
                </svg>
                {sortOrder === "asc" ? "Oldest" : "Newest"}
              </button>
            </div>

            {manga.chapters && manga.chapters.length > 0 ? (
              <>
                <div className="flex flex-col rounded-lg overflow-hidden border border-white/[0.06]">
                  {visibleChapterGroups
                    .slice((chapterPage - 1) * CHAPTERS_PER_PAGE, chapterPage * CHAPTERS_PER_PAGE)
                    .map((group, idx) => {
                      const primary = group.scans.find(s => (s.lang || "en") === "en") || group.scans[0];
                      const rowNum = (chapterPage - 1) * CHAPTERS_PER_PAGE + idx + 1;
                      // Multiple scans of the SAME language (e.g. 3 different
                      // English groups) need their own selectable entry — a
                      // same-colored dot per scan doesn't let you tell them
                      // apart or pick between them.
                      return (
                        <div
                          key={group.number}
                          onClick={() => navigateToChapter(primary)}
                          className={`group relative flex items-center gap-3 sm:gap-4 pl-4 pr-3 sm:pr-4 py-3.5 text-left transition-colors cursor-pointer ${idx % 2 === 0 ? "bg-white/[0.015]" : "bg-transparent"} hover:bg-white/[0.06]`}
                        >
                          <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#1e88ff] scale-y-0 group-hover:scale-y-100 transition-transform origin-center" />
                          <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-md bg-white/[0.06] text-white/50 text-xs font-bold group-hover:bg-[#1e88ff]/15 group-hover:text-[#1e88ff] transition-colors">
                            {rowNum}
                          </span>
                          <svg className="w-4 h-4 shrink-0 text-white/20 group-hover:text-white/40 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                          </svg>
                          <span className="flex-1 min-w-0 text-white/90 font-semibold text-sm sm:text-base truncate group-hover:text-white transition-colors">
                            {primary.title || `Chapter ${group.number}`}
                          </span>
                          {group.scans.length > 1 && (
                            <span className="hidden sm:flex items-center gap-1.5 shrink-0">
                              {group.scans.slice(0, 6).map(s => (
                                <button
                                  key={s.id}
                                  onClick={(e) => { e.stopPropagation(); navigateToChapter(s); }}
                                  title={`${chapterLabel(s)}${s.scanGroup ? ` · ${s.scanGroup}` : ""}`}
                                  className="w-2 h-2 rounded-full ring-1 ring-black/40 hover:scale-150 transition-transform"
                                  style={{ background: LANG_COLORS[s.lang || "en"] || LANG_COLORS[normalizeLang(s.lang || "en")] || "#888" }}
                                />
                              ))}
                              {group.scans.length > 6 && (
                                <span className="text-white/30 text-[10px] font-bold">+{group.scans.length - 6}</span>
                              )}
                            </span>
                          )}
                          {primary.date && (
                            <span className="text-white/30 text-xs shrink-0 w-16 text-right hidden xs:inline">{formatRelativeDate(primary.date)}</span>
                          )}
                          <svg className="w-4 h-4 shrink-0 text-white/0 group-hover:text-white/40 -translate-x-1 group-hover:translate-x-0 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </div>
                      );
                    })}
                  {visibleChapterGroups.length === 0 && (
                    <p className="text-white/40 text-sm text-center py-14">No chapters match the current filters.</p>
                  )}
                </div>

                {/* Pagination — true paged, with page numbers */}
                {visibleChapterGroups.length > 0 && (
                  <div className="flex items-center justify-between mt-5 flex-wrap gap-3">
                    <p className="text-white/40 text-xs sm:text-sm">
                      Showing <span className="text-white font-semibold">{(chapterPage - 1) * CHAPTERS_PER_PAGE + 1}</span>–
                      <span className="text-white font-semibold">{Math.min(chapterPage * CHAPTERS_PER_PAGE, visibleChapterGroups.length)}</span> of{" "}
                      <span className="text-white font-semibold">{visibleChapterGroups.length}</span>
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setChapterPage(p => Math.max(1, p - 1))}
                        disabled={chapterPage === 1}
                        className="w-9 h-9 flex items-center justify-center rounded-md bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                        title="Previous page"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                      </button>
                      {(() => {
                        const totalPages = Math.max(1, Math.ceil(visibleChapterGroups.length / CHAPTERS_PER_PAGE));
                        const pages: (number | "…")[] = [];
                        for (let p = 1; p <= totalPages; p++) {
                          if (p === 1 || p === totalPages || Math.abs(p - chapterPage) <= 1) pages.push(p);
                          else if (pages[pages.length - 1] !== "…") pages.push("…");
                        }
                        return pages.map((p, i) =>
                          p === "…" ? (
                            <span key={`e${i}`} className="w-9 h-9 flex items-center justify-center text-white/30 text-sm">…</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setChapterPage(p)}
                              className={`w-9 h-9 flex items-center justify-center rounded-md text-sm font-semibold transition-colors ${
                                p === chapterPage ? "bg-white text-black" : "bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              {p}
                            </button>
                          )
                        );
                      })()}
                      <button
                        onClick={() => setChapterPage(p => (p * CHAPTERS_PER_PAGE < visibleChapterGroups.length ? p + 1 : p))}
                        disabled={chapterPage * CHAPTERS_PER_PAGE >= visibleChapterGroups.length}
                        className="w-9 h-9 flex items-center justify-center rounded-md bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                        title="Next page"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                      </button>
                    </div>
                  </div>
                )}

                {/* Rating */}
                <div className="mt-8 bg-white/[0.03] border border-white/[0.07] rounded-lg p-4">
                  <p className="text-white/40 text-xs font-bold uppercase tracking-wider mb-3">Rate this manga</p>
                  {user ? (
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 10 }).map((_, i) => {
                          const val = i + 1;
                          const active = (ratingInput || userRating || 0) >= val;
                          return (
                            <button
                              key={val}
                              onClick={() => { setRatingInput(val); submitRating(val); }}
                              onMouseEnter={() => setRatingInput(val)}
                              title={`${val}/10`}
                              className="p-0.5"
                            >
                              <svg width="20" height="20" viewBox="0 0 20 20" fill={active ? "#1e88ff" : "none"} stroke={active ? "#1e88ff" : "rgba(255,255,255,0.25)"} strokeWidth={1.5}>
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            </button>
                          );
                        })}
                      </div>
                      {submittingRating && <span className="text-white/30 text-xs">Saving...</span>}
                      {userRating != null && !submittingRating && <span className="text-white/40 text-xs">You rated {userRating.toFixed(1)}/10</span>}
                    </div>
                  ) : (
                    <p className="text-white/40 text-sm">
                      <button onClick={() => openAuthModal("signin")} className="text-[#1e88ff] font-semibold hover:underline">Sign in</button> to rate this manga
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-white/40 text-sm text-center py-14">No chapters available.</p>
            )}
          </div>

          {/* ── Other (sidebar) ── */}
          <div className="flex flex-col gap-6">
            <h2
              className="font-karla text-xl sm:text-2xl font-bold bg-clip-text text-transparent"
              style={{ backgroundImage: TEXT_GRADIENT }}
            >
              Other
            </h2>

            {/* Stats */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <svg width="15" height="15" viewBox="0 0 20 20" fill="#1e88ff"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                <div>
                  <p className="text-white font-bold text-sm leading-none">{combinedRating > 0 ? combinedRating.toFixed(1) : "—"}</p>
                  <p className="text-white/30 text-[10px] mt-0.5">{ourRatingCount > 0 ? `${ourRatingCount} ratings` : "rating"}</p>
                </div>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="flex items-center gap-1.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                <div>
                  <p className="text-white font-bold text-sm leading-none">{formatViews(combinedViews)}</p>
                  <p className="text-white/30 text-[10px] mt-0.5">views</p>
                </div>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <button onClick={toggleFollow} className="flex flex-col items-center gap-0.5 group">
                <svg width="17" height="17" viewBox="0 0 24 24" fill={isFollowing ? "#1e88ff" : "none"} stroke={isFollowing ? "#1e88ff" : "rgba(255,255,255,0.5)"} strokeWidth={2} className="transition-colors">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <p className="text-white/30 text-[10px] group-hover:text-white/50 transition-colors">{followCount}</p>
              </button>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-5 flex flex-col gap-5">
              {manga.genres && manga.genres.length > 0 && (
                <div>
                  <p className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2.5">Genres</p>
                  <div className="flex flex-wrap gap-2">
                    {manga.genres.map(g => (
                      <span key={g} className="px-3 py-1.5 bg-white/[0.06] text-white/80 text-sm font-medium rounded-md hover:bg-white/10 hover:text-white transition-colors cursor-default">{g}</span>
                    ))}
                  </div>
                </div>
              )}
              {manga.altTitles && manga.altTitles.length > 0 && (
                <div>
                  <p className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2.5">Also Known As</p>
                  <div className="flex flex-wrap gap-2">
                    {(showAllAltTitles ? manga.altTitles : manga.altTitles.slice(0, 3)).map((alt, i) => (
                      <span key={i} className="px-3 py-1.5 bg-white/[0.06] text-white/80 text-sm font-medium rounded-md">{alt}</span>
                    ))}
                    {manga.altTitles.length > 3 && (
                      <button
                        onClick={() => setShowAllAltTitles(v => !v)}
                        className="px-3 py-1.5 bg-white/10 text-white text-sm font-semibold rounded-md hover:bg-white/15 transition-colors"
                      >
                        {showAllAltTitles ? "Show less" : `${manga.altTitles.length - 3} other`}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {manga.scanlators && manga.scanlators.length > 0 && (
                <div>
                  <p className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2.5">Groups</p>
                  <div className="flex flex-wrap gap-2">
                    {manga.scanlators.map(s => (
                      <span key={s.id} className="px-3 py-1.5 bg-white/[0.06] text-white/80 text-sm font-medium rounded-md">{s.name}</span>
                    ))}
                  </div>
                </div>
              )}
              {(manga.anilistId || manga.malId) && (
                <div>
                  <p className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2.5">Links</p>
                  <div className="flex flex-wrap gap-2">
                    {manga.anilistId && (
                      <a href={`https://anilist.co/manga/${manga.anilistId}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-white/[0.06] text-white/80 text-sm font-medium rounded-md hover:bg-white/10 hover:text-white transition-colors">AniList</a>
                    )}
                    {manga.malId && (
                      <a href={`https://myanimelist.net/manga/${manga.malId}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-white/[0.06] text-white/80 text-sm font-medium rounded-md hover:bg-white/10 hover:text-white transition-colors">MyAnimeList</a>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => document.getElementById("comments-section")?.scrollIntoView({ behavior: "smooth" })}
              className="flex items-center justify-between group"
            >
              <span
                className="font-karla text-xl sm:text-2xl font-bold bg-clip-text text-transparent flex items-center gap-1"
                style={{ backgroundImage: TEXT_GRADIENT }}
              >
                Discussions
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-white/60 -translate-x-0.5 group-hover:translate-x-0 transition-transform"><path d="M9 18l6-6-6-6" /></svg>
              </span>
              <span className="flex items-center gap-1 text-sm font-semibold text-white/60 group-hover:text-white transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                Create
              </span>
            </button>
            <button
              onClick={() => document.getElementById("comments-section")?.scrollIntoView({ behavior: "smooth" })}
              className="flex flex-col items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-lg py-10 text-center text-white/40 text-sm hover:bg-white/[0.05] hover:text-white/60 hover:border-white/10 transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              Start a new discussion
            </button>
          </div>
        </div>
      </section>

      {/* ═══ CHARACTERS — capped at 6 until "Show more" is clicked ═══ */}
      {characters.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-10 mb-16">
          <div className="flex items-center justify-between mb-4">
            <h2
              className="font-karla text-xl sm:text-2xl font-bold bg-clip-text text-transparent"
              style={{ backgroundImage: TEXT_GRADIENT }}
            >
              Characters
            </h2>
            {characters.length > 6 && (
              <button
                onClick={() => setShowAllCharacters(v => !v)}
                className="text-sm font-semibold text-white/50 hover:text-white transition-colors"
              >
                {showAllCharacters ? "Show less" : "Show more"}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(showAllCharacters ? characters : characters.slice(0, 6)).map((c, i) => (
              <a
                key={`${c.id}-${i}`}
                href={`https://anilist.co/character/${c.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-stretch gap-0 bg-white/[0.04] hover:bg-white/[0.07] rounded-none overflow-hidden text-left transition-colors"
              >
                {c.image && (
                  <div className="w-[90px] shrink-0 aspect-[2/3] bg-white/10">
                    <img src={c.image} alt={c.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex flex-col justify-center gap-1.5 px-4 py-3 min-w-0">
                  <span className="text-white font-bold text-base line-clamp-2">{c.name}</span>
                  <span className="text-white/40 text-xs font-semibold uppercase tracking-wider">
                    {c.role.charAt(0) + c.role.slice(1).toLowerCase()}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ═══ MORE LIKE THIS — horizontal scroll row ═══ */}
      {recommendations.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-10 mb-16">
          <h2 className="font-karla text-xl font-bold text-white mb-4">More like this.</h2>
          <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {recommendations.map(r => {
              const s = (r.status || "").toUpperCase();
              const statusInfo =
                s === "RELEASING" ? { label: "On-Going", className: "bg-emerald-500/15 text-emerald-400" } :
                s === "FINISHED" ? { label: "Finished", className: "bg-white/10 text-white/60" } :
                s === "HIATUS" ? { label: "Hiatus", className: "bg-white/10 text-white/60" } :
                s === "CANCELLED" ? { label: "Cancelled", className: "bg-white/10 text-white/60" } :
                s === "NOT_YET_RELEASED" ? { label: "Upcoming", className: "bg-white/10 text-white/60" } :
                null;
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    if (r.type === "ANIME") navigate({ page: "anime", id: String(r.id) });
                    else navigate({ page: "manga-detail", id: `at:${r.id}` });
                  }}
                  className="group shrink-0 w-[150px] sm:w-[170px] text-left"
                >
                  <div className="relative w-full aspect-[2/3] bg-white/5 overflow-hidden rounded-lg ring-1 ring-transparent group-hover:ring-white/20 transition-all duration-300">
                    {r.cover ? (
                      <img src={r.cover} alt={r.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/10 font-bold text-2xl">{r.title.charAt(0)}</div>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-bold text-white truncate group-hover:text-white/80 transition-colors">{r.title}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {statusInfo && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusInfo.className}`}>{statusInfo.label}</span>
                    )}
                    {typeof r.chapters === "number" && r.chapters > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-white/60">{r.chapters} ch</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ COMMENTS / DISCUSSIONS ═══ */}
      <section id="comments-section" className="px-4 sm:px-6 lg:px-10 mb-16">
        <h2
          className="font-karla text-xl font-bold bg-clip-text text-transparent mb-4"
          style={{ backgroundImage: TEXT_GRADIENT }}
        >
          Comments
        </h2>
        <AnimeComments animeId={mangaId} animeTitle={displayTitle} />
      </section>
    </div>
  );
}
