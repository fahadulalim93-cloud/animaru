"use client";

import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from "react";
import { useAppStore } from "./store";

/* ═══════════════════════════════════════════════════════════════════════
   MANGA READER v4 — LuffyTV Complete Redesign

   Layout:
   ┌──────────────────────────────────────────────────┐
   │                                                    │
   │           MANGA (50% width, centered)              │
   │                                                    │
   │                              ┌──────────────────┐ │
   │                              │ Chapter 1 of 68  │ │ ← top right
   │                              │ [◀] [▶]          │ │
   │                              └──────────────────┘ │
   │                                                    │
   │                              ┌──────────────────┐ │
   │                              │ [🏠] [📖] [💬]   │ │ ← bottom right
   │                              │ [📋] [⛶] [⚙] [?]│ │   floating navbar
   │                              └──────────────────┘ │
   └──────────────────────────────────────────────────┘

   Panels (slide-in from right):
   - Comments panel (per-chapter, best/newest/oldest, like)
   - Chapter list panel (groups, search, pagination)
   - Settings panel (direction, margin, scroll, preload, scale, dim)
   ═══════════════════════════════════════════════════════════════════════ */

interface ChapterPage {
  index: number;
  url: string;
  proxiedUrl?: string;
  width?: number;
  height?: number;
}

interface MangaReaderProps {
  mangaId: string;
  chapterId: string;
}

type ReadingMode = "vertical" | "single" | "double";
type ImageFit = "width" | "height" | "original";
type ReadingDirection = "ltr" | "rtl";
type PanelType = "none" | "comments" | "chapters" | "settings" | "help";

// ═══════════════════════════════════════════════════════════════════════
//  CHAPTER ID HELPERS (kept from v3)
// ═══════════════════════════════════════════════════════════════════════

function isMangaballTranslationId(id: string | undefined | null): id is string {
  return !!id && /^[0-9a-f]{24}$/i.test(id);
}
function isCrossProviderMergeId(id: string | undefined | null): id is string {
  return !!id && id.startsWith("at:");
}
function isAtsuShortId(id: string | undefined | null): id is string {
  return !!id &&
    !isMangaballTranslationId(id) &&
    !isCrossProviderMergeId(id) &&
    /^[A-Za-z0-9_-]{3,20}$/.test(id) &&
    !/^\d+$/.test(id);
}
function buildNavChapterId(ch: { id?: string; number?: number | string }): string {
  if (ch.id && (isMangaballTranslationId(ch.id) || isCrossProviderMergeId(ch.id) || isAtsuShortId(ch.id))) {
    return ch.id;
  }
  return String(ch.number ?? "");
}
function chapterMatches(ch: any, chapterId: string): boolean {
  if (!ch) return false;
  if (ch.id === chapterId) return true;
  if (String(ch.number) === chapterId) return true;
  if (isCrossProviderMergeId(chapterId) && ch.id === chapterId.split(":").pop()) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
//  LOCALSTORAGE HELPERS
// ═══════════════════════════════════════════════════════════════════════

const LS_KEY_READING_MODE = "manga-reader-mode";
const LS_KEY_IMAGE_FIT = "manga-reader-fit";
const LS_KEY_READING_DIR = "manga-reader-dir";
const LS_KEY_STRIPE_MARGIN = "manga-reader-margin";
const LS_KEY_SMOOTH_SCROLL = "manga-reader-smooth";
const LS_KEY_PRELOAD = "manga-reader-preload";
const LS_KEY_SCALE = "manga-reader-scale";
const LS_KEY_DIM = "manga-reader-dim";

function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key: string, value: any) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/* ── Desktop detection (matches the app's `lg` breakpoint) ──────────────
   Chrome auto-hide is a small-screen behaviour: on a phone the toolbars eat
   a real share of the page, on desktop there's room to spare and a mouse
   that expects the controls to stay put. Defined at module scope so the
   subscribe/snapshot identities are stable across renders. */
const DESKTOP_MQ = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(DESKTOP_MQ);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function getDesktopSnapshot() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_MQ).matches;
}
// Server render assumes mobile; the client corrects on hydration.
function getDesktopServerSnapshot() {
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export default function MangaReader({ mangaId, chapterId }: MangaReaderProps) {
  const navigate = useAppStore(s => s.navigate);
  const user = useAppStore((s: any) => s.user);
  const recordMediaProgress = useAppStore(s => s.recordMediaProgress);

  // ── Data State ──
  const [pages, setPages] = useState<ChapterPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mangaTitle, setMangaTitle] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [allChapters, setAllChapters] = useState<any[]>([]);

  // ── UI State ──
  const [currentPage, setCurrentPage] = useState(0);
  const [readingMode, setReadingMode] = useState<ReadingMode>(() => lsGet(LS_KEY_READING_MODE, "vertical"));
  const [imageFit, setImageFit] = useState<ImageFit>(() => lsGet(LS_KEY_IMAGE_FIT, "width"));
  const [readingDir, setReadingDir] = useState<ReadingDirection>(() => lsGet(LS_KEY_READING_DIR, "ltr"));
  const [activePanel, setActivePanel] = useState<PanelType>("none");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredPageIndex, setHoveredPageIndex] = useState<number | null>(null);
  // Reader chrome (top bar, side rail, zoom bar) fades out while reading down
  // — mobile only; see showChrome below.
  const [chromeVisible, setChromeVisible] = useState(true);
  const lastScrollRef = useRef(0);
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getDesktopServerSnapshot);

  // ── Settings State ──
  const [stripeMargin, setStripeMargin] = useState<boolean>(() => lsGet(LS_KEY_STRIPE_MARGIN, false));
  const [smoothScroll, setSmoothScroll] = useState<boolean>(() => lsGet(LS_KEY_SMOOTH_SCROLL, true));
  const [preload, setPreload] = useState<boolean>(() => lsGet(LS_KEY_PRELOAD, true));
  const [scalePages, setScalePages] = useState<boolean>(() => lsGet(LS_KEY_SCALE, true));
  const [dimPages, setDimPages] = useState<boolean>(() => lsGet(LS_KEY_DIM, false));

  // ── Zoom state (50% default, 25%-150% range) ──
  const [zoom, setZoom] = useState<number>(50);
  const ZOOM_MIN = 25;
  const ZOOM_MAX = 150;
  const ZOOM_STEP = 10;
  // Chrome auto-hide tuning: stay put for the first screenful, then require a
  // deliberate scroll (not trackpad jitter) before toggling.
  const SCROLL_HIDE_AFTER = 260;
  const SCROLL_HIDE_DELTA = 8;

  // ── Persist settings ──
  useEffect(() => { lsSet(LS_KEY_READING_MODE, readingMode); }, [readingMode]);
  useEffect(() => { lsSet(LS_KEY_IMAGE_FIT, imageFit); }, [imageFit]);
  useEffect(() => { lsSet(LS_KEY_READING_DIR, readingDir); }, [readingDir]);
  useEffect(() => { lsSet(LS_KEY_STRIPE_MARGIN, stripeMargin); }, [stripeMargin]);
  useEffect(() => { lsSet(LS_KEY_SMOOTH_SCROLL, smoothScroll); }, [smoothScroll]);
  useEffect(() => { lsSet(LS_KEY_PRELOAD, preload); }, [preload]);
  useEffect(() => { lsSet(LS_KEY_SCALE, scalePages); }, [scalePages]);
  useEffect(() => { lsSet(LS_KEY_DIM, dimPages); }, [dimPages]);

  // ── Refs ──
  const containerRef = useRef<HTMLDivElement>(null);
  const readerRootRef = useRef<HTMLDivElement>(null);

  // ── Load chapter pages ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setCurrentPage(0);
      try {
        const [pagesRes, detailRes] = await Promise.all([
          fetch(`/api/manga/read?mangaId=${encodeURIComponent(mangaId)}&chapterId=${encodeURIComponent(chapterId)}`),
          fetch(`/api/manga/detail?id=${encodeURIComponent(mangaId)}`),
        ]);
        if (cancelled) return;
        let loadedPages: ChapterPage[] = [];
        if (pagesRes.ok) {
          const data = await pagesRes.json();
          if (data.pages?.length > 0) {
            loadedPages = data.pages;
            setPages(data.pages);
          } else {
            setError("No pages available for this chapter.");
          }
        } else {
          setError("Failed to load chapter pages.");
        }
        if (detailRes.ok) {
          const detail = await detailRes.json();
          if (cancelled) return;
          setMangaTitle(detail.englishTitle || detail.title || "");
          const chs = detail.chapters || [];
          setAllChapters(chs);
          const ch = chs.find((c: any) => chapterMatches(c, chapterId));
          setChapterTitle(ch?.title || `Chapter ${ch?.number || chapterId}`);
          try {
            await fetch("/api/history", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                animeId: mangaId,
                animeName: detail.englishTitle || detail.title || "Unknown Manga",
                thumbnail: detail.poster || detail.cover || "",
                episodeNum: typeof ch?.number === "number" ? ch.number : parseFloat(String(ch?.number ?? chapterId)) || 0,
                episodeTitle: ch?.title || `Chapter ${ch?.number || chapterId}`,
                progress: 0,
                duration: loadedPages.length,
              }),
            });
          } catch { /* history is best-effort */ }

          // ── Sync: record reading progress for the profile "Continue" + XP ──
          try {
            const cover = detail.poster || detail.cover || "";
            const num = ch?.number;
            const idx = chs.findIndex((c: any) => c === ch);
            const percent = chs.length > 0 && idx >= 0
              ? Math.round(((idx + 1) / chs.length) * 100)
              : 0;
            recordMediaProgress({
              kind: "manga",
              mediaId: mangaId,
              title: detail.englishTitle || detail.title || mangaTitle || "Manga",
              cover,
              unitLabel: num != null ? `Ch. ${num}` : "Reading",
              percent,
              resume: { page: "manga-read", id: mangaId, chapterId },
            }, 5);
          } catch { /* ignore */ }
        }
      } catch (err) {
        console.error("[manga-reader] load error:", err);
        setError("Failed to load chapter.");
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [mangaId, chapterId]);

  // ── Find prev/next chapters ──
  const readerLang = useMemo(() => {
    try { return sessionStorage.getItem(`manga-lang-${mangaId}`) || "all"; } catch { return "all"; }
  }, [mangaId]);

  const langFilteredChapters = useMemo(() => {
    if (readerLang === "all") return allChapters;
    return allChapters.filter((c: any) => c.lang === readerLang || !c.lang);
  }, [allChapters, readerLang]);

  const currentChapterIdx = langFilteredChapters.findIndex((c: any) => chapterMatches(c, chapterId));
  const prevChapter = currentChapterIdx > 0 ? langFilteredChapters[currentChapterIdx - 1] : null;
  const nextChapter = currentChapterIdx >= 0 && currentChapterIdx < langFilteredChapters.length - 1 ? langFilteredChapters[currentChapterIdx + 1] : null;
  const currentChapterNum = currentChapterIdx >= 0 ? langFilteredChapters[currentChapterIdx]?.number : 0;

  // Count UNIQUE chapter numbers (not all variants — e.g., Berserk has ~364 chapters,
  // not 4565 which includes all language/scan-group variants)
  const uniqueChapterCount = useMemo(() => {
    const seen = new Set<number>();
    for (const ch of allChapters) {
      const num = Math.round((ch.number || 0) * 100) / 100;
      seen.add(num);
    }
    return seen.size;
  }, [allChapters]);

  const switchEpisode = useCallback((epNum: number) => {
    navigate({ page: "manga-read", id: mangaId, chapterId: String(epNum) } as any);
  }, [navigate, mangaId]);

  const goToChapter = useCallback((ch: any) => {
    navigate({ page: "manga-read", id: mangaId, chapterId: buildNavChapterId(ch) } as any);
    setActivePanel("none");
  }, [navigate, mangaId]);

  // ── Progress ──
  const progress = pages.length > 0 ? ((currentPage + 1) / pages.length) * 100 : 0;

  // ── Fullscreen ──
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await readerRootRef.current?.requestFullscreen?.().catch(() => {});
      // On mobile, lock to landscape so the reader fills the screen
      try {
        if (screen.orientation && typeof (screen.orientation as any).lock === 'function') {
          await (screen.orientation as any).lock('landscape');
        }
      } catch {}
    } else {
      await document.exitFullscreen?.().catch(() => {});
      try { await (screen.orientation as any)?.unlock(); } catch {}
    }
  }, []);

  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (activePanel !== "none") { setActivePanel("none"); return; }
        navigate({ page: "manga-detail", id: mangaId } as any);
        return;
      }
      if (e.key === "ArrowLeft") {
        if (readingDir === "rtl") { setCurrentPage(prev => Math.min(prev + 1, pages.length - 1)); }
        else { setCurrentPage(prev => Math.max(prev - 1, 0)); }
      }
      if (e.key === "ArrowRight") {
        if (readingDir === "rtl") { setCurrentPage(prev => Math.max(prev - 1, 0)); }
        else { setCurrentPage(prev => Math.min(prev + 1, pages.length - 1)); }
      }
      if (e.key === "c" || e.key === "C") setActivePanel(p => p === "comments" ? "none" : "comments");
      if (e.key === "l" || e.key === "L") setActivePanel(p => p === "chapters" ? "none" : "chapters");
      if (e.key === "s" || e.key === "S") setActivePanel(p => p === "settings" ? "none" : "settings");
      if (e.key === "f" || e.key === "F") toggleFullscreen();
      if (e.key === "?" || e.key === "/") setActivePanel(p => p === "help" ? "none" : "help");
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pages.length, mangaId, readingDir, navigate, activePanel, toggleFullscreen]);

  // ── Scroll tracking for vertical mode ──
  // Also drives chrome auto-hide: reading downward gets the UI out of the way,
  // any upward scroll brings it straight back. Only vertical mode hides — the
  // paged modes need their controls permanently.
  useEffect(() => {
    if (readingMode !== "vertical") return;
    const container = containerRef.current;
    if (!container) return;
    function onScroll() {
      const el = containerRef.current;
      if (!el) return;
      const scrollTop = el.scrollTop;
      const pageElements = el.querySelectorAll("[data-page-index]");
      let closest = 0;
      let closestDist = Infinity;
      pageElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top - 80);
        if (dist < closestDist) {
          closestDist = dist;
          closest = parseInt(el.getAttribute("data-page-index") || "0", 10);
        }
      });
      setCurrentPage(closest);

      // Desktop keeps its chrome pinned, so don't churn state on every scroll.
      if (isDesktop) return;
      const delta = scrollTop - lastScrollRef.current;
      // Ignore sub-pixel jitter and momentum noise.
      if (Math.abs(delta) < SCROLL_HIDE_DELTA) return;
      const nearTop = scrollTop < SCROLL_HIDE_AFTER;
      const nearBottom = scrollTop + el.clientHeight >= el.scrollHeight - 240;
      // Near the top there's nothing to gain by hiding, and near the bottom the
      // end-of-chapter controls should be reachable without scrolling back up.
      setChromeVisible(nearTop || nearBottom ? true : delta < 0);
      lastScrollRef.current = scrollTop;
    }
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [readingMode, pages.length, isDesktop]);

  // Derived rather than synced via an effect, so there's no round-trip and the
  // two states can't disagree on a frame. Chrome is pinned open on desktop,
  // whenever a panel is open, and in the paged modes (no scroll to hide on).
  const showChrome = isDesktop || chromeVisible || activePanel !== "none" || readingMode !== "vertical";

  // ═══════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div ref={readerRootRef} className="mr-root" style={{
      position: "fixed", inset: 0, background: "#0a0a0a", zIndex: 9999,
      display: "flex", flexDirection: "column", overflow: "hidden",
      fontFamily: "var(--font-inter), Inter, sans-serif",
    }}>

      {/* ══ TOP BAR ══ */}
      <div className="mr-top-bar" style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px",
        background: "linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)",
        pointerEvents: "none",
        opacity: showChrome ? 1 : 0,
        transform: showChrome ? "translateY(0)" : "translateY(-110%)",
        transition: "opacity 0.25s ease, transform 0.25s ease",
      }}>
        {/* Left: Back button + title */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", pointerEvents: "auto" }}>
          <button onClick={() => navigate({ page: "manga-detail", id: mangaId } as any)}
            className="mr-icon-btn" title="Back to detail (Esc)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div style={{ color: "#fff", minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "300px" }}>
              {mangaTitle}
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
              {chapterTitle}
            </div>
          </div>
        </div>

        {/* Right: Chapter selector — "1 of 68" + prev/next */}
        <div style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            background: "rgba(255,255,255,0.08)", borderRadius: "8px",
            padding: "6px 14px", color: "#fff", fontSize: "13px", fontWeight: 600,
            border: "1px solid rgba(255,255,255,0.1)",
          }}>
            Chapter {currentChapterNum || "?"} of {uniqueChapterCount || "?"}
          </div>
          {prevChapter && (
            <button onClick={() => goToChapter(prevChapter)} className="mr-icon-btn" title="Previous chapter (←)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
          {nextChapter && (
            <button onClick={() => goToChapter(nextChapter)} className="mr-icon-btn" title="Next chapter (→)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* ══ PROGRESS BAR ══ */}
      {pages.length > 0 && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "3px",
          background: "rgba(255,255,255,0.1)", zIndex: 51,
        }}>
          <div style={{
            width: `${progress}%`, height: "100%",
            background: "#1e88ff", transition: "width 0.2s",
          }} />
        </div>
      )}

      {/* ══ READER AREA — manga centered at 50% width ══ */}
      <div ref={containerRef} style={{
        flex: 1, overflow: readingMode === "vertical" ? "auto" : "hidden",
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "60px 0 80px",
        scrollBehavior: smoothScroll ? "smooth" : "auto",
      }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <div style={{ width: "40px", height: "40px", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#1e88ff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        )}

        {error && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", color: "#fff" }}>
            <p style={{ color: "#f87171", fontSize: "14px" }}>{error}</p>
            <button onClick={() => navigate({ page: "manga-detail", id: mangaId } as any)}
              style={{ padding: "8px 16px", background: "#1e88ff", borderRadius: "8px", color: "#fff", fontSize: "13px", fontWeight: 600, border: "none", cursor: "pointer" }}>
              Back to detail
            </button>
          </div>
        )}

        {!loading && !error && pages.length > 0 && (
          <>
            {readingMode === "vertical" && (
              <>
                {pages.map((page, i) => (
                  <img
                    key={i}
                    src={preload ? page.proxiedUrl || page.url : (i <= currentPage + 2 ? page.proxiedUrl || page.url : "")}
                    data-page-index={i}
                    alt={`Page ${i + 1}`}
                    loading={i <= currentPage + 2 ? "eager" : "lazy"}
                    onError={(e) => { if (page.url !== (e.target as HTMLImageElement).src) (e.target as HTMLImageElement).src = page.url; }}
                    style={{
                      width: scalePages ? `${zoom}%` : "auto",
                      maxWidth: "100%",
                      minWidth: "200px",
                      height: "auto",
                      marginBottom: stripeMargin ? "0" : "4px",
                      borderBottom: stripeMargin ? "2px solid #1a1a1a" : "none",
                      filter: dimPages ? "brightness(0.85)" : "none",
                      objectFit: imageFit === "height" ? "contain" : "fill",
                      display: "block",
                    }}
                    onMouseEnter={() => setHoveredPageIndex(i)}
                    onMouseLeave={() => setHoveredPageIndex(null)}
                  />
                ))}
                {/* Page number markers on hover */}
                {hoveredPageIndex !== null && (
                  <div style={{
                    position: "fixed", right: "20px", top: "50%",
                    background: "rgba(0,0,0,0.8)", color: "#fff",
                    padding: "4px 10px", borderRadius: "6px", fontSize: "12px",
                    pointerEvents: "none", zIndex: 40,
                  }}>
                    Page {hoveredPageIndex + 1} / {pages.length}
                  </div>
                )}

                {/* ══ END OF CHAPTER — info, prev/next, share, comments ══ */}
                <ChapterEndBlock
                  mangaId={mangaId}
                  chapterId={chapterId}
                  mangaTitle={mangaTitle}
                  chapterNum={currentChapterNum}
                  scanGroup={langFilteredChapters[currentChapterIdx]?.scanGroup}
                  username={user?.username}
                  prevChapter={prevChapter}
                  nextChapter={nextChapter}
                  goToChapter={goToChapter}
                  onHome={() => navigate({ page: "manga-detail", id: mangaId } as any)}
                />
              </>
            )}

            {readingMode === "single" && (
              <div style={{
                width: "100%", height: "100%", display: "flex",
                justifyContent: "center", alignItems: "center",
                overflow: "hidden",
              }} onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const x = e.clientX - rect.left;
                const isLeft = x < rect.width / 2;
                if (readingDir === "rtl") {
                  if (isLeft) setCurrentPage(p => Math.min(p + 1, pages.length - 1));
                  else setCurrentPage(p => Math.max(p - 1, 0));
                } else {
                  if (isLeft) setCurrentPage(p => Math.max(p - 1, 0));
                  else setCurrentPage(p => Math.min(p + 1, pages.length - 1));
                }
              }}>
                <img
                  src={pages[currentPage]?.proxiedUrl || pages[currentPage]?.url}
                  alt={`Page ${currentPage + 1}`}
                  onError={(e) => { const p = pages[currentPage]; if (p && p.url !== (e.target as HTMLImageElement).src) (e.target as HTMLImageElement).src = p.url; }}
                  style={{
                    maxWidth: `${zoom}%`, maxHeight: "100vh",
                    objectFit: "contain",
                    filter: dimPages ? "brightness(0.85)" : "none",
                  }}
                />
              </div>
            )}

            {readingMode === "double" && (
              <div style={{
                width: "100%", height: "100%", display: "flex",
                justifyContent: "center", alignItems: "center", gap: "2px",
                overflow: "hidden",
              }}>
                {readingDir === "rtl"
                  ? [pages[currentPage + 1], pages[currentPage]].filter(Boolean).map((p, i) => (
                      <img key={i} src={p?.proxiedUrl || p?.url} alt="" style={{ maxWidth: "25%", maxHeight: "100vh", objectFit: "contain", filter: dimPages ? "brightness(0.85)" : "none" }} />
                    ))
                  : [pages[currentPage], pages[currentPage + 1]].filter(Boolean).map((p, i) => (
                      <img key={i} src={p?.proxiedUrl || p?.url} alt="" style={{ maxWidth: "25%", maxHeight: "100vh", objectFit: "contain", filter: dimPages ? "brightness(0.85)" : "none" }} />
                    ))
                }
              </div>
            )}
          </>
        )}
      </div>

      {/* ══ FLOATING NAVBAR — bottom right ══ */}
      <div style={{
        position: "absolute", bottom: "20px", right: "20px", zIndex: 50,
        display: "flex", flexDirection: "column", gap: "4px",
        background: "rgba(20,20,20,0.9)", backdropFilter: "blur(12px)",
        borderRadius: "14px", padding: "8px",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        opacity: showChrome ? 1 : 0,
        transform: showChrome ? "translateX(0)" : "translateX(130%)",
        pointerEvents: showChrome ? "auto" : "none",
        transition: "opacity 0.25s ease, transform 0.25s ease",
      }}>
        {/* Home */}
        <button className="mr-nav-btn" onClick={() => navigate({ page: "home" } as any)} title="Home">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
        </button>
        {/* Detail page */}
        <button className="mr-nav-btn" onClick={() => navigate({ page: "manga-detail", id: mangaId } as any)} title="Manga detail">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
        </button>
        {/* Comments */}
        <button className={`mr-nav-btn ${activePanel === "comments" ? "mr-nav-btn-active" : ""}`} onClick={() => setActivePanel(p => p === "comments" ? "none" : "comments")} title="Comments (C)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        </button>
        {/* Chapter list */}
        <button className={`mr-nav-btn ${activePanel === "chapters" ? "mr-nav-btn-active" : ""}`} onClick={() => setActivePanel(p => p === "chapters" ? "none" : "chapters")} title="Chapter list (L)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
        </button>
        {/* Fullscreen */}
        <button className="mr-nav-btn" onClick={toggleFullscreen} title="Fullscreen (F)">
          {isFullscreen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7V3h4m14 4V3h-4M3 17v4h4m14-4v4h-4" /></svg>
          )}
        </button>
        {/* Settings */}
        <button className={`mr-nav-btn ${activePanel === "settings" ? "mr-nav-btn-active" : ""}`} onClick={() => setActivePanel(p => p === "settings" ? "none" : "settings")} title="Settings (S)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </button>
        {/* Help */}
        <button className={`mr-nav-btn ${activePanel === "help" ? "mr-nav-btn-active" : ""}`} onClick={() => setActivePanel(p => p === "help" ? "none" : "help")} title="Help (?)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
        </button>
      </div>

      {/* ══ ZOOM CONTROLS — bottom left corner ══ */}
      <div style={{
        position: "absolute", bottom: "20px", left: "20px", zIndex: 50,
        display: "flex", alignItems: "center", gap: "2px",
        background: "rgba(20,20,20,0.9)", backdropFilter: "blur(12px)",
        borderRadius: "10px", padding: "4px",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        opacity: showChrome ? 1 : 0,
        transform: showChrome ? "translateX(0)" : "translateX(-130%)",
        pointerEvents: showChrome ? "auto" : "none",
        transition: "opacity 0.25s ease, transform 0.25s ease",
      }}>
        {/* Previous page (left arrow) */}
        <button className="mr-nav-btn" onClick={() => setCurrentPage(p => Math.max(p - 1, 0))} disabled={currentPage === 0} title="Previous page">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7" /></svg>
        </button>
        {/* Next page (right arrow) */}
        <button className="mr-nav-btn" onClick={() => setCurrentPage(p => Math.min(p + 1, pages.length - 1))} disabled={currentPage >= pages.length - 1} title="Next page">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
        </button>
        <div style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }} />
        {/* Zoom out */}
        <button className="mr-nav-btn" onClick={() => setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_STEP))} disabled={zoom <= ZOOM_MIN} title="Zoom out">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
        </button>
        {/* Zoom percentage */}
        <span style={{ color: "#fff", fontSize: "12px", fontWeight: 600, minWidth: "40px", textAlign: "center" }}>
          {zoom}%
        </span>
        {/* Zoom in */}
        <button className="mr-nav-btn" onClick={() => setZoom(z => Math.min(ZOOM_MAX, z + ZOOM_STEP))} disabled={zoom >= ZOOM_MAX} title="Zoom in">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
        </button>
      </div>

      {/* ══ BOTTOM PAGE COUNTER (for single/double mode) ══ */}
      {readingMode !== "vertical" && pages.length > 0 && (
        <div style={{
          position: "absolute", bottom: "20px", left: "50%",
          transform: "translateX(-50%)", zIndex: 50,
          display: "flex", alignItems: "center", gap: "12px",
          background: "rgba(20,20,20,0.9)", backdropFilter: "blur(12px)",
          borderRadius: "10px", padding: "8px 16px",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <button className="mr-icon-btn-sm" onClick={() => setCurrentPage(p => Math.max(p - 1, 0))} disabled={currentPage === 0}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span style={{ color: "#fff", fontSize: "13px", fontWeight: 600, minWidth: "60px", textAlign: "center" }}>
            {currentPage + 1} / {pages.length}
          </span>
          <button className="mr-icon-btn-sm" onClick={() => setCurrentPage(p => Math.min(p + 1, pages.length - 1))} disabled={currentPage >= pages.length - 1}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}

      {/* ══ PANELS (slide-in from right) ══ */}
      {activePanel !== "none" && (
        <div style={{
          position: "absolute", top: 0, right: 0, bottom: 0,
          width: "380px", maxWidth: "90vw", zIndex: 60,
          background: "rgba(15,15,15,0.97)", backdropFilter: "blur(20px)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          display: "flex", flexDirection: "column",
          animation: "mr-slide-in 0.2s ease-out",
        }}>
          {/* Panel header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}>
            <h3 style={{ color: "#fff", fontSize: "16px", fontWeight: 700, margin: 0 }}>
              {activePanel === "comments" && "Chapter Comments"}
              {activePanel === "chapters" && "Chapter List"}
              {activePanel === "settings" && "Reader Settings"}
              {activePanel === "help" && "Keyboard Shortcuts"}
            </h3>
            <button className="mr-icon-btn" onClick={() => setActivePanel("none")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {activePanel === "comments" && (
              <CommentsPanel
                mangaId={mangaId}
                chapterId={chapterId}
                chapterNum={currentChapterNum || 0}
                username={user?.username}
                mangaTitle={mangaTitle}
                scanGroup={langFilteredChapters[currentChapterIdx]?.scanGroup}
                onClose={() => setActivePanel("none")}
              />
            )}
            {activePanel === "chapters" && (
              <ChapterListPanel chapters={allChapters} currentChapterId={chapterId} onSelect={goToChapter} readerLang={readerLang} />
            )}
            {activePanel === "settings" && (
              <SettingsPanel
                readingMode={readingMode} setReadingMode={setReadingMode}
                imageFit={imageFit} setImageFit={setImageFit}
                readingDir={readingDir} setReadingDir={setReadingDir}
                stripeMargin={stripeMargin} setStripeMargin={setStripeMargin}
                smoothScroll={smoothScroll} setSmoothScroll={setSmoothScroll}
                preload={preload} setPreload={setPreload}
                scalePages={scalePages} setScalePages={setScalePages}
                dimPages={dimPages} setDimPages={setDimPages}
              />
            )}
            {activePanel === "help" && <HelpPanel />}
          </div>
        </div>
      )}

      {/* ══ CSS ══ */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes mr-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .mr-root * { box-sizing: border-box; }
        .mr-icon-btn {
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          color: #fff; cursor: pointer; transition: all 0.15s;
        }
        .mr-icon-btn:hover { background: rgba(255,255,255,0.15); }
        .mr-icon-btn-sm {
          background: transparent; border: none; width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          color: #fff; cursor: pointer; border-radius: 4px;
        }
        .mr-icon-btn-sm:hover { background: rgba(255,255,255,0.1); }
        .mr-icon-btn-sm:disabled { opacity: 0.3; cursor: not-allowed; }
        .mr-nav-btn {
          background: transparent; border: none; width: 40px; height: 40px;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.6); cursor: pointer; border-radius: 8px;
          transition: all 0.15s;
        }
        .mr-nav-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .mr-nav-btn-active { background: rgba(30,136,255,0.2); color: #1e88ff; }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  COMMENTS PANEL — per-chapter comments
// ═══════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════════════════════════
   END OF CHAPTER — the block that follows the last page in vertical mode:
   chapter info, prev/next jump, share row, then the chapter's comments.
   ═══════════════════════════════════════════════════════════════════════ */

function ChapterEndBlock({
  mangaId, chapterId, mangaTitle, chapterNum, scanGroup, username,
  prevChapter, nextChapter, goToChapter, onHome,
}: {
  mangaId: string; chapterId: string; mangaTitle: string;
  chapterNum: number | string; scanGroup?: string; username?: string;
  prevChapter: any; nextChapter: any;
  goToChapter: (ch: any) => void; onHome: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `${mangaTitle} — Chapter ${chapterNum}`;

  const shareTargets = [
    { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, path: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" },
    { id: "x", label: "X", href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, path: "M4 4l16 16M20 4L4 20" },
    { id: "reddit", label: "Reddit", href: `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`, path: "M12 8c3.9 0 7 2.2 7 5s-3.1 5-7 5-7-2.2-7-5 3.1-5 7-5zm0 0l1-5 4 1" },
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`, path: "M21 11.5a8.5 8.5 0 0 1-12.8 7.3L3 20l1.3-4.9A8.5 8.5 0 1 1 21 11.5z" },
    { id: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, path: "M22 2L11 13M22 2l-7 20-4-9-9-4z" },
  ];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — ignore */ }
  };

  const navBtn: React.CSSProperties = {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
    padding: "16px 20px", background: "#1f1f23", border: "1px solid #2e2e35",
    borderRadius: "10px", color: "#e4e4e7", fontSize: "15px", fontWeight: 700,
    cursor: "pointer", transition: "background 0.15s, border-color 0.15s",
  };

  return (
    <div style={{
      width: "min(900px, 92%)", margin: "40px auto 0", paddingBottom: "60px",
      display: "flex", flexDirection: "column", gap: "16px",
    }}>
      {/* ── Chapter info card ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "16px",
        background: "#1f1f23", border: "1px solid #2e2e35",
        borderRadius: "10px", padding: "16px 20px",
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: "#fff", fontSize: "18px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {mangaTitle}
          </div>
          <div style={{ color: "#8b8b93", fontSize: "13px", marginTop: "2px", fontFamily: "monospace" }}>
            Ch. {chapterNum}{scanGroup ? ` · Translated by ${scanGroup}` : ""}
          </div>
        </div>
        <button onClick={onHome} title="Back to series"
          style={{
            width: "44px", height: "44px", flexShrink: 0, background: "#27272d",
            border: "1px solid #34343c", borderRadius: "8px", color: "#d4d4d8",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
        </button>
      </div>

      {/* ── Prev / Next chapter ── */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {prevChapter ? (
          <button onClick={() => goToChapter(prevChapter)} style={navBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e88ff" strokeWidth="2.5"><path d="M15 19l-7-7 7-7" /></svg>
            Prev · Ch. {prevChapter.number}
          </button>
        ) : (
          <div style={{ ...navBtn, opacity: 0.35, cursor: "default" }}>No previous chapter</div>
        )}
        {nextChapter ? (
          <button onClick={() => goToChapter(nextChapter)} style={navBtn}>
            Next · Ch. {nextChapter.number}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e88ff" strokeWidth="2.5"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        ) : (
          <div style={{ ...navBtn, opacity: 0.35, cursor: "default" }}>You&apos;re all caught up</div>
        )}
      </div>

      {/* ── Share row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "4px 2px" }}>
        <span style={{ color: "#8b8b93", fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em" }}>SHARE</span>
        {shareTargets.map(t => (
          <a key={t.id} href={t.href} target="_blank" rel="noopener noreferrer" title={t.label} aria-label={`Share on ${t.label}`}
            style={{
              width: "40px", height: "40px", background: "#1f1f23", border: "1px solid #2e2e35",
              borderRadius: "8px", color: "#d4d4d8", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.path} /></svg>
          </a>
        ))}
        <button onClick={copyLink} title="Copy link" aria-label="Copy link"
          style={{
            width: "40px", height: "40px", background: copied ? "#1e88ff" : "#1f1f23",
            border: `1px solid ${copied ? "#1e88ff" : "#2e2e35"}`, borderRadius: "8px",
            color: copied ? "#fff" : "#d4d4d8", display: "flex",
            alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
          {copied ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          )}
        </button>
      </div>

      {/* ── Chapter comments ── */}
      <CommentsPanel
        mangaId={mangaId}
        chapterId={chapterId}
        chapterNum={Number(chapterNum) || 0}
        username={username}
        mangaTitle={mangaTitle}
        scanGroup={scanGroup}
        onClose={() => {}}
        embedded
      />
    </div>
  );
}

/** `embedded` renders the panel inline (end-of-chapter block) instead of as the
 *  full-height slide-in drawer: it grows with its content and drops the close
 *  button, since there's no drawer to close. */
function CommentsPanel({ mangaId, chapterId, chapterNum, username, mangaTitle, scanGroup, onClose, embedded = false }: {
  mangaId: string; chapterId: string; chapterNum: number; username?: string;
  mangaTitle: string; scanGroup?: string; onClose: () => void; embedded?: boolean;
}) {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"best" | "newest" | "oldest">("best");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [chapterLikes, setChapterLikes] = useState(0);
  const [hasLikedChapter, setHasLikedChapter] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/manga/chapter-comments?mangaId=${encodeURIComponent(mangaId)}&chapterId=${encodeURIComponent(chapterId)}&sort=${sort}&username=${encodeURIComponent(username || "")}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [mangaId, chapterId, sort, username]);

  useEffect(() => { loadComments(); }, [loadComments]);

  useEffect(() => {
    const totalLikes = comments.reduce((sum, c) => sum + (c.likes || 0), 0);
    setChapterLikes(totalLikes);
  }, [comments]);

  useEffect(() => {
    if (username) {
      fetch(`/api/manga/follow?mangaId=${encodeURIComponent(mangaId)}&username=${encodeURIComponent(username)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setIsFollowing(d.isFollowing); })
        .catch(() => {});
    }
  }, [mangaId, username]);

  const handleSubmit = async () => {
    if (!username) { alert("Please sign in to comment."); return; }
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/manga/chapter-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mangaId, chapterId, chapterNum, username, text: text.trim() }),
      });
      if (res.ok) {
        setText("");
        loadComments();
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  const handleLike = async (commentId: string) => {
    if (!username) { alert("Please sign in to like."); return; }
    try {
      const res = await fetch("/api/manga/chapter-comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, username }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments(prev => prev.map(c => c.id === commentId ? { ...c, likes: data.likes, hasLiked: data.hasLiked } : c));
      }
    } catch { /* ignore */ }
  };

  const toggleFollow = async () => {
    if (!username) { alert("Please sign in to follow."); return; }
    try {
      const res = await fetch("/api/manga/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mangaId, username }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.isFollowing);
      }
    } catch { /* ignore */ }
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days > 30) return `${Math.floor(days / 30)}mo ago`;
    if (days > 0) return `${days}d ago`;
    const hours = Math.floor(diff / 3600000);
    if (hours > 0) return `${hours}h ago`;
    const mins = Math.floor(diff / 60000);
    if (mins > 0) return `${mins}m ago`;
    return "just now";
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: embedded ? "auto" : "100%",
      background: "#18181b",
      borderRadius: embedded ? "12px" : 0,
      overflow: embedded ? "hidden" : undefined,
      border: embedded ? "1px solid #27272a" : undefined,
    }}>
      {/* HEADER: Like | Translated by | Follow | Close */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", background: "#27272a", borderBottom: "1px solid #3f3f46",
      }}>
        <button onClick={() => username ? setHasLikedChapter(!hasLikedChapter) : alert("Sign in to like")}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "4px",
            color: hasLikedChapter ? "#1e88ff" : "#d4d4d8", fontSize: "13px", fontWeight: 600,
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={hasLikedChapter ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
          </svg>
          {chapterLikes}
        </button>
        <span style={{ color: "#a1a1aa", fontSize: "12px", flex: 1, textAlign: "center" }}>
          {scanGroup ? `Translated by ${scanGroup}` : mangaTitle}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button onClick={toggleFollow}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: "4px",
              color: isFollowing ? "#1e88ff" : "#d4d4d8", fontSize: "13px", fontWeight: 600,
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={isFollowing ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            {isFollowing ? "Following" : "Follow"}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
          </button>
          {!embedded && (
            <button onClick={onClose}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "#a1a1aa", padding: "2px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* SORT BAR: "N comments" | Best / Newest / Oldest */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", background: "#1f1f23", borderBottom: "1px solid #3f3f46",
      }}>
        <span style={{ color: "#d4d4d8", fontSize: "13px", fontWeight: 500 }}>
          {comments.length} {comments.length === 1 ? "comment" : "comments"}
        </span>
        <div style={{ display: "flex", gap: "4px" }}>
          {(["best", "newest", "oldest"] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              style={{
                padding: "4px 10px", borderRadius: "4px", border: "none", cursor: "pointer",
                fontSize: "12px", fontWeight: 600, textTransform: "capitalize",
                background: sort === s ? "#3f3f46" : "transparent",
                color: sort === s ? "#fff" : "#71717a",
              }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* COMMENTS LIST */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 12px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#71717a", fontSize: "13px" }}>Loading comments...</div>
        ) : comments.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#52525b", fontSize: "13px" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ marginBottom: "12px", opacity: 0.3 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <div>No comments yet</div>
            <div style={{ fontSize: "11px", marginTop: "4px" }}>Be the first to share your thoughts!</div>
          </div>
        ) : (
          comments.map(c => (
            <div key={c.id} style={{ padding: "12px 0", borderBottom: "1px solid #27272a" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <div style={{
                  width: "36px", height: "36px", borderRadius: "50%",
                  background: "linear-gradient(135deg, #1e88ff, #7c3aed)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: "14px", fontWeight: 700, flexShrink: 0,
                }}>
                  {c.username?.charAt(0).toUpperCase() || "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>{c.username}</span>
                    <span style={{ color: "#52525b", fontSize: "11px" }}>{formatTimeAgo(c.createdAt)}</span>
                  </div>
                  <p style={{ color: "#d4d4d8", fontSize: "13px", lineHeight: 1.5, margin: "4px 0 6px" }}>{c.text}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <button onClick={() => handleLike(c.id)}
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: c.hasLiked ? "#1e88ff" : "#71717a", fontSize: "12px", fontWeight: 500, display: "flex", alignItems: "center", gap: "4px", padding: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={c.hasLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                      </svg>
                      {c.likes}
                    </button>
                    <button style={{ background: "transparent", border: "none", cursor: "pointer", color: "#71717a", fontSize: "12px", fontWeight: 500, display: "flex", alignItems: "center", gap: "4px", padding: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                      </svg>
                      0
                    </button>
                  </div>
                </div>
                <button style={{ background: "transparent", border: "none", cursor: "pointer", color: "#52525b", padding: "4px", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* COMMENT INPUT */}
      <div style={{ padding: "10px 12px", background: "#1f1f23", borderTop: "1px solid #3f3f46" }}>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && text.trim()) handleSubmit(); }}
          placeholder={username ? "Share your thoughts about this series..." : "Sign in to comment"}
          disabled={!username}
          maxLength={1000}
          style={{ width: "100%", padding: "10px 14px", background: "#27272a", border: "1px solid #3f3f46", borderRadius: "8px", color: "#fff", fontSize: "13px", outline: "none" }}
        />
        {text.trim() && (
          <button onClick={handleSubmit} disabled={submitting}
            style={{ marginTop: "6px", padding: "6px 16px", borderRadius: "6px", border: "none", cursor: "pointer", background: "#1e88ff", color: "#fff", fontSize: "12px", fontWeight: 600 }}>
            {submitting ? "Posting..." : "Post"}
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  CHAPTER LIST PANEL — groups, search, pagination
// ═══════════════════════════════════════════════════════════════════════

function ChapterListPanel({ chapters, currentChapterId, onSelect, readerLang }: {
  chapters: any[]; currentChapterId: string; onSelect: (ch: any) => void; readerLang: string;
}) {
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);

  // Group by scanlation group
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    const filtered = chapters.filter(ch => {
      if (!search) return true;
      const num = String(ch.number || "");
      const title = (ch.title || "").toLowerCase();
      return num.includes(search) || title.includes(search.toLowerCase());
    });
    for (const ch of filtered) {
      const group = ch.scanGroup || ch.lang || "Unknown";
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(ch);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [chapters, search]);

  // Flatten for display (sorted by chapter number, desc)
  const sortedChapters = useMemo(() => {
    return [...chapters]
      .filter(ch => {
        if (!search) return true;
        const num = String(ch.number || "");
        const title = (ch.title || "").toLowerCase();
        return num.includes(search) || title.includes(search.toLowerCase());
      })
      .sort((a, b) => (b.number || 0) - (a.number || 0));
  }, [chapters, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search */}
      <div style={{ padding: "12px 16px" }}>
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setVisibleCount(50); }}
          placeholder="Search chapters..."
          style={{
            width: "100%", padding: "8px 12px",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px", color: "#fff", fontSize: "13px", outline: "none",
          }}
        />
      </div>

      {/* Stats */}
      <div style={{ padding: "0 16px 8px", color: "rgba(255,255,255,0.4)", fontSize: "12px" }}>
        {chapters.length} chapters · {groups.length} groups
      </div>

      {/* Chapter list */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 8px" }}>
        {sortedChapters.slice(0, visibleCount).map((ch, i) => {
          const isActive = chapterMatches(ch, currentChapterId);
          const group = ch.scanGroup || ch.lang || "Unknown";
          return (
            <button
              key={`${ch.id}-${i}`}
              onClick={() => onSelect(ch)}
              style={{
                width: "100%", padding: "10px 12px", marginBottom: "2px",
                background: isActive ? "rgba(30,136,255,0.15)" : "transparent",
                border: "1px solid rgba(255,255,255,0.04)", borderRadius: "8px",
                cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  color: isActive ? "#1e88ff" : "#fff", fontSize: "13px", fontWeight: 600,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  Ch. {ch.number} {ch.title && ch.title !== `Chapter ${ch.number}` ? `— ${ch.title}` : ""}
                </div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>
                  {group} · {ch.lang || "?"}
                </div>
              </div>
              {ch.pages && (
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", marginLeft: "8px" }}>
                  {ch.pages}p
                </span>
              )}
            </button>
          );
        })}
        {visibleCount < sortedChapters.length && (
          <button
            onClick={() => setVisibleCount(c => c + 50)}
            style={{
              width: "100%", padding: "10px", margin: "8px 0",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px", color: "rgba(255,255,255,0.6)", fontSize: "12px",
              fontWeight: 600, cursor: "pointer",
            }}
          >
            Load more ({sortedChapters.length - visibleCount} remaining)
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  SETTINGS PANEL
// ═══════════════════════════════════════════════════════════════════════

function SettingsPanel(props: {
  readingMode: ReadingMode; setReadingMode: (m: ReadingMode) => void;
  imageFit: ImageFit; setImageFit: (f: ImageFit) => void;
  readingDir: ReadingDirection; setReadingDir: (d: ReadingDirection) => void;
  stripeMargin: boolean; setStripeMargin: (v: boolean) => void;
  smoothScroll: boolean; setSmoothScroll: (v: boolean) => void;
  preload: boolean; setPreload: (v: boolean) => void;
  scalePages: boolean; setScalePages: (v: boolean) => void;
  dimPages: boolean; setDimPages: (v: boolean) => void;
}) {
  const { readingMode, setReadingMode, imageFit, setImageFit, readingDir, setReadingDir,
    stripeMargin, setStripeMargin, smoothScroll, setSmoothScroll,
    preload, setPreload, scalePages, setScalePages, dimPages, setDimPages } = props;

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Reading direction */}
      <SettingRow label="Reading Direction">
        <div style={{ display: "flex", gap: "4px" }}>
          {(["ltr", "rtl"] as const).map(d => (
            <button key={d} onClick={() => setReadingDir(d)}
              style={settingBtnStyle(readingDir === d)}>
              {d === "ltr" ? "← LTR" : "RTL →"}
            </button>
          ))}
        </div>
      </SettingRow>

      {/* Reading mode */}
      <SettingRow label="Reading Mode">
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {(["vertical", "single", "double"] as const).map(m => (
            <button key={m} onClick={() => setReadingMode(m)}
              style={settingBtnStyle(readingMode === m)}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </SettingRow>

      {/* Image fit */}
      <SettingRow label="Image Fit">
        <div style={{ display: "flex", gap: "4px" }}>
          {(["width", "height", "original"] as const).map(f => (
            <button key={f} onClick={() => setImageFit(f)}
              style={settingBtnStyle(imageFit === f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </SettingRow>

      {/* Toggles */}
      <SettingToggle label="Stripe Margin" desc="Add a dark bar between pages" value={stripeMargin} onChange={setStripeMargin} />
      <SettingToggle label="Smooth Scrolling" desc="Smooth scroll behavior" value={smoothScroll} onChange={setSmoothScroll} />
      <SettingToggle label="Preload Pages" desc="Load all pages at once" value={preload} onChange={setPreload} />
      <SettingToggle label="Scale Pages (50%)" desc="Scale manga to 50% width" value={scalePages} onChange={setScalePages} />
      <SettingToggle label="Dim Pages" desc="Reduce brightness slightly" value={dimPages} onChange={setDimPages} />
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function SettingToggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ color: "#fff", fontSize: "13px", fontWeight: 500 }}>{label}</div>
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>{desc}</div>
      </div>
      <button onClick={() => onChange(!value)}
        style={{
          width: "40px", height: "22px", borderRadius: "11px", border: "none", cursor: "pointer",
          background: value ? "#1e88ff" : "rgba(255,255,255,0.1)", position: "relative",
          transition: "background 0.2s",
        }}>
        <div style={{
          position: "absolute", top: "2px", left: value ? "20px" : "2px",
          width: "18px", height: "18px", borderRadius: "50%", background: "#fff",
          transition: "left 0.2s",
        }} />
      </button>
    </div>
  );
}

function settingBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px", borderRadius: "6px", border: "none", cursor: "pointer",
    fontSize: "12px", fontWeight: 600,
    background: active ? "rgba(30,136,255,0.2)" : "rgba(255,255,255,0.05)",
    color: active ? "#1e88ff" : "rgba(255,255,255,0.5)",
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  HELP PANEL
// ═══════════════════════════════════════════════════════════════════════

function HelpPanel() {
  const shortcuts = [
    { key: "← / →", desc: "Previous / Next page" },
    { key: "C", desc: "Toggle comments" },
    { key: "L", desc: "Toggle chapter list" },
    { key: "S", desc: "Toggle settings" },
    { key: "F", desc: "Toggle fullscreen" },
    { key: "?", desc: "Toggle this help" },
    { key: "Esc", desc: "Back to manga detail" },
  ];
  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {shortcuts.map(s => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px" }}>{s.desc}</span>
            <kbd style={{
              padding: "3px 8px", borderRadius: "4px",
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff", fontSize: "11px", fontFamily: "monospace", fontWeight: 700,
            }}>
              {s.key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
