"use client";

import { useEffect, useState, useSyncExternalStore, useMemo, Component, ReactNode } from "react";
import { useAppStore, parsePath, parseHash, getSectionNavLinks } from "@/components/anime/store";
import { extractAniListTokenFromHash, fetchAniListViewerAndList } from "@/lib/anilist-auth";
import { extractMalCodeFromSearch, consumeStoredVerifier, exchangeMalCode } from "@/lib/mal-auth";
import { checkAccountStatus } from "@/lib/auth-local";
import dynamic from "next/dynamic";

// ── PERFORMANCE: Lazy-load ALL page components ──
// Previously these were static imports, meaning EVERY page load downloaded
// the JS for ALL 30+ pages (bookmarks, manga, novels, scraper, etc.) even
// if the user only visited the homepage. This caused a 1.1MB JS bundle.
// Now each page is code-split and loaded on demand.

// ── Core components (always needed — keep static) ──
import { W2GModal } from "@/components/w2g/w2g-modal";
import SidebarNav from "@/components/anime/sidebar-nav";
import { trackPageview } from "@/lib/analytics";

// ── Page components (lazy loaded) ──
const SearchPage = dynamic(() => import("@/components/anime/search-page"));
const AnimeDetailPage = dynamic(() => import("@/components/anime/anime-detail"));
const WatchPage = dynamic(() => import("@/components/anime/watch-page"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  ),
});
const BookmarksPage = dynamic(() => import("@/components/anime/bookmarks-page"));
const WatchlistPage = dynamic(() => import("@/components/anime/watchlist-page"));
const HistoryPage = dynamic(() => import("@/components/anime/history-page"));
const AnimeSectionPage = dynamic(() => import("@/components/anime/anime-section-page"));
const DiscoverPage = dynamic(() => import("@/components/anime/discover-page"));
const MangaPage = dynamic(() => import("@/components/anime/manga-page"));
const MangaDetailPage = dynamic(() => import("@/components/anime/manga-detail"));
const MangaReader = dynamic(() => import("@/components/anime/manga-reader"), { ssr: false });
const ContactPage = dynamic(() => import("@/components/anime/contact-page"));
const DonatePage = dynamic(() => import("@/components/anime/donate-page"));
const UpdatesPage = dynamic(() => import("@/components/anime/updates-page"));
const CryptoDonatePage = dynamic(() => import("@/components/anime/crypto-donate-page"));
const GuidePage = dynamic(() => import("@/components/anime/guide-page"));
const NovelPage = dynamic(() => import("@/components/anime/novel-page"));
const NovelDetailPage = dynamic(() => import("@/components/anime/novel-detail-page"));
const NovelReaderPage = dynamic(() => import("@/components/anime/novel-reader-page"), { ssr: false });
const SignInPage = dynamic(() => import("@/components/anime/signin-page"));
const SignUpPage = dynamic(() => import("@/components/anime/signup-page"));
const AuthModal = dynamic(() => import("@/components/anime/auth-modal"));
const ConnectListModal = dynamic(() => import("@/components/anime/connect-list-modal"));
const EditListModal = dynamic(() => import("@/components/anime/edit-list-modal"));
const ProfilePage = dynamic(() => import("@/components/anime/profile-page"));
const LeaderboardPage = dynamic(() => import("@/components/anime/leaderboard-page"));
const ModPanel = dynamic(() => import("@/components/anime/mod-panel"));
const ScraperPage = dynamic(() => import("@/components/anime/scraper-page"));
const ScraperAnimePage = dynamic(() => import("@/components/anime/scraper-anime-page"));
const ScraperWatchPage = dynamic(() => import("@/components/anime/scraper-watch-page"));
const MusicPage = dynamic(() => import("@/components/anime/music-page"));
const TorrentPage = dynamic(() => import("@/components/anime/torrent-page"));
const DownloadPage = dynamic(() => import("@/components/anime/download-page"));
const LandingPage = dynamic(() => import("@/components/anime/landing-page"));
const HubPage = dynamic(() => import("@/components/anime/hub-page"));

// ── Lightweight loading placeholder for lazy pages ──
const PageLoading = () => (
  <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
    <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
  </div>
);

// ── Auth error toast ──
function AuthErrorToast() {
  const authError = useAppStore((s) => s.authError);
  const setAuthError = useAppStore((s) => s.setAuthError);
  useEffect(() => {
    if (!authError) return;
    const t = setTimeout(() => setAuthError(null), 10000);
    return () => clearTimeout(t);
  }, [authError, setAuthError]);
  if (!authError) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[300] max-w-sm rounded-xl border border-red-500/40 bg-[#0a0a0a] p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-red-400 mb-0.5">Sign-in failed</p>
          <p className="text-xs text-zinc-300 break-words leading-relaxed">{authError}</p>
        </div>
        <button
          onClick={() => setAuthError(null)}
          className="text-zinc-500 hover:text-white shrink-0"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Auth notice toast (info / success) ──
// Shows "Connecting to AniList..." (amber) while we fetch the user's
// profile after the OAuth redirect, then "Successfully connected!"
// (green) when the profile lands. Auto-dismisses after 4s for success,
// 6s for info. Renders a fixed toast at the bottom of the screen.
function AuthNoticeToast() {
  const authNotice = useAppStore((s) => s.authNotice);
  const setAuthNotice = useAppStore((s) => s.setAuthNotice);
  useEffect(() => {
    if (!authNotice) return;
    const t = setTimeout(() => setAuthNotice(null), authNotice.type === "success" ? 4000 : 6000);
    return () => clearTimeout(t);
  }, [authNotice, setAuthNotice]);
  if (!authNotice) return null;
  const isSuccess = authNotice.type === "success";
  // Statically-constructed Tailwind classes (Tailwind purges dynamic
  // template-string classes at build time, so we list them explicitly).
  const styles = isSuccess
    ? {
        border: "border-green-500/40",
        badge: "bg-green-500/15",
        text: "text-green-400",
        title: "Connected!",
      }
    : {
        border: "border-amber-500/40",
        badge: "bg-amber-500/15",
        text: "text-amber-400",
        title: "Connecting...",
      };
  return (
    <div className={`fixed bottom-4 right-4 z-[300] max-w-sm rounded-xl border ${styles.border} bg-[#0a0a0a] p-4 shadow-2xl`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full ${styles.badge} flex items-center justify-center shrink-0`}>
          {isSuccess ? (
            <svg className={`w-4 h-4 ${styles.text}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg className={`w-4 h-4 ${styles.text} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold ${styles.text} mb-0.5`}>{styles.title}</p>
          <p className="text-xs text-zinc-300 break-words leading-relaxed">{authNotice.message}</p>
        </div>
        <button
          onClick={() => setAuthNotice(null)}
          className="text-zinc-500 hover:text-white shrink-0"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── WatchPage with ssr: false ──
// The watch page has hydration mismatches (typeof window, localStorage,
// new Date, Math.random, etc.) that cause React error #418.
// This error ABORTS hydration → useEffect hooks don't run → HLS player
// never attaches → video stays black/Buffering forever.
// ssr: false ensures the watch page only renders on the client.
// (WatchPage is now defined at the top with the other dynamic imports)

// Features route renders the cinematic landing page (which contains the
// feature sections) — the legacy marketing HomePage is fully retired.

// Error Boundary — catches client-side crashes gracefully
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: "" };
  static getDerivedStateFromError(err: any) {
    return { hasError: true, error: err?.message || String(err) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[80vh] flex items-center justify-center bg-[#000000]">
          <div className="text-center space-y-4 max-w-md px-6">
            <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Something went wrong</h2>
            <p className="text-sm text-zinc-400">{this.state.error}</p>
            <button onClick={() => { this.setState({ hasError: false, error: "" }); window.location.reload(); }} className="pill-btn pill-btn-primary">Reload Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export default function MainPageClient() {
  const { route, navigate } = useAppStore();
  const mounted = useMounted();
  const sectionSubPage = useAppStore(s => s.sectionSubPage);  // for isBrowseFullBleed below

  // Path-based routing with popstate listener
  useEffect(() => {
    const handleRoute = () => {
      // MAL's OAuth redirects back here with "?code=...&state=..." in the
      // query string — exchange it for a token via our server route.
      const malCode = extractMalCodeFromSearch(window.location.search);
      if (malCode) {
        history.replaceState(null, "", window.location.pathname);
        const verifier = consumeStoredVerifier();
        if (verifier) {
          exchangeMalCode(malCode, verifier)
            .then(({ viewer, accessToken }) => useAppStore.getState().setMalAuth(accessToken, viewer))
            .catch((err) => {
              // err.message contains the server's error string, which now
              // includes MAL's actual error (e.g. "invalid_client: Client
              // authentication failed") plus a hint pointing to MAL_CLIENT_SECRET.
              const msg = err?.message || "MyAnimeList sign-in failed. Please try again.";
              useAppStore.getState().setAuthError(msg);
            });
        } else {
          useAppStore.getState().setAuthError("MyAnimeList sign-in failed — the login session expired. Please try again.");
        }
        return;
      }
      // AniList's OAuth implicit grant redirects back with "#access_token=..."
      const anilistToken = extractAniListTokenFromHash(window.location.hash);
      if (anilistToken) {
        history.replaceState(null, "", window.location.pathname);
        // Show "Connecting to AniList..." immediately so the user knows
        // something is happening — the profile fetch can take 1-3 seconds.
        useAppStore.getState().setAuthNotice({ type: "info", message: "Connecting to your AniList account..." });
        fetchAniListViewerAndList(anilistToken.token)
          .then(async ({ viewer, entries }) => {
            // Store the AniList token + entries for list sync (existing flow)
            useAppStore.getState().setAnilistAuth(anilistToken.token, viewer, entries);

            // ── NEW: also log the user into LuffyTV via the find-or-create
            // endpoint. This creates a real User row in the DB (matched by
            // anilistId) and sets a session cookie — so the user is fully
            // logged in, not just "connected". They can now comment, track
            // progress, use W2G with their username, etc.
            try {
              const loginRes = await fetch("/api/auth/anilist/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  anilistId: viewer.id,
                  name: viewer.name,
                  avatar: viewer.avatar,
                }),
              });
              const loginData = await loginRes.json();
              if (loginRes.ok && loginData.ok && loginData.user) {
                // setUser logs them into the LuffyTV store (replaces any
                // existing user — AniList OAuth wins over localStorage).
                useAppStore.getState().setUser(loginData.user);
                useAppStore.getState().setAuthNotice({
                  type: "success",
                  message: `Signed in as ${loginData.user.username} — welcome to LuffyTV!`,
                });
              } else {
                // Find-or-create failed — still consider the AniList connect
                // a success (they can sync their list), but show a softer
                // message.
                useAppStore.getState().setAuthNotice({
                  type: "success",
                  message: `Connected as ${viewer.name} — your AniList list is now synced.`,
                });
              }
            } catch {
              // Network error on the find-or-create call — AniList connect
              // still succeeded, just without a LuffyTV account.
              useAppStore.getState().setAuthNotice({
                type: "success",
                message: `Connected as ${viewer.name} — your AniList list is now synced.`,
              });
            }
          })
          .catch(() => {
            useAppStore.getState().setAuthError("AniList sign-in failed — the access token was rejected. Please try again.");
          });
        return;
      }
      // Parse the current pathname into route + subPage
      const { route: newRoute, subPage: newSubPage } = parsePath(window.location.pathname);
      const current = useAppStore.getState().route;
      const currentSub = useAppStore.getState().sectionSubPage;
      if (JSON.stringify(current) !== JSON.stringify(newRoute) || currentSub !== newSubPage) {
        useAppStore.setState({ route: newRoute, sectionSubPage: newSubPage });
      }
    };
    handleRoute();
    window.addEventListener("popstate", handleRoute);
    return () => window.removeEventListener("popstate", handleRoute);
  }, []);

  // Analytics — record a page view whenever the route changes.
  useEffect(() => {
    trackPageview(route.page);
  }, [route]);

  // ── Enforce admin ban/suspend actions mid-session ──
  // Sign-in already checks this once; this catches the case where an admin
  // bans/suspends someone who is already logged in elsewhere.
  useEffect(() => {
    const check = async () => {
      const current = useAppStore.getState().user;
      if (!current) return;
      const status = await checkAccountStatus(current.username);
      if (status.blocked) {
        useAppStore.getState().logout();
        useAppStore.getState().openAuthModal("signin", status.message);
        history.replaceState(null, "", "/");
        useAppStore.setState({ route: { page: "home" }, sectionSubPage: "home" });
      }
    };
    check();
    const id = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ── Auto-login on mount: if a server-side session cookie exists, fetch
  // the user from /api/users/me and populate the store. This is what makes
  // login persist across page refresh, incognito windows (after the user
  // logs in once on that browser), and different browsers on the same device.
  // Without this, only localStorage-based users were being loaded, which
  // didn't work in incognito or other browsers.
  useEffect(() => {
    // If localStorage already has a user (legacy auth-local flow), don't
    // override — let the user keep their existing session. Only fetch from
    // server if no user is loaded yet.
    if (useAppStore.getState().user) return;
    let cancelled = false;
    fetch("/api/users/me", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return;
        if (data?.ok && data.user) {
          useAppStore.getState().setUser(data.user);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── Hash-based #signin / #signup → redirect to home + open auth modal ──
  // Per user request: sign-in/sign-up should appear as a centered modal
  // overlay on top of the current anime page, NOT a separate page. So if
  // someone lands on #signin or #signup directly, bounce them back to home
  // and open the modal there.
  useEffect(() => {
    if (route.page === "signin" || route.page === "signup") {
      const mode = route.page as "signin" | "signup";
      useAppStore.getState().openAuthModal(mode);
      // Replace hash without triggering another hashchange event
      history.replaceState(null, "", "/");
      useAppStore.setState({ route: { page: "home" }, sectionSubPage: "home" });
    }
  }, [route]);

  // Ctrl+K is now handled by the Navbar component (opens search modal)

  // Bare black frame during the brief pre-hydration gate — no intro/splash
  // is shown anymore, the app just renders straight to content.
  if (!mounted) {
    return <div className="min-h-screen bg-[#000000]" />;
  }

  const isWatchPage = route.page === "watch" || route.page === "scraper-watch";
  const isMangaReader = route.page === "manga-read" || route.page === "novel-read";
  // Landing + Hub are standalone pages with their own header/chrome — never
  // wrapped in the app's Navbar/footer or content padding.
  const isStandalonePage = route.page === "landing" || route.page === "hub";
  // Auth pages fully own their own centered/glass layout — no outer padding.
  const isAuthPage = route.page === "signin" || route.page === "signup";
  const isFullWidth = route.page === "home" || route.page === "anime" || isStandalonePage || isAuthPage;
  // "home" is the single canonical anime section home — FULL BLEED (no padding,
  // no top offset). Root "home" renders the anime carousel so refresh never
  // flips between two different homes.
  const isAnimeSectionRoute = route.page === "home";
  // Guide/Contact/Features keep the floating Navbar/footer but own their own
  // cinematic hero spacing, so they render full-bleed (no extra top offset).
  const isCinematicOwnLayout = isStandalonePage || route.page === "guide" || route.page === "contact" || route.page === "features";
  const isHomeFullBleed = (isAnimeSectionRoute && sectionSubPage === "home") || isCinematicOwnLayout || isAuthPage || route.page === "manga" || route.page === "manga-detail" || route.page === "discover" || route.page === "music" || route.page === "profile" || route.page === "settings" || route.page === "anime";
  // Browse sub-page wants true full-screen (no main padding) — its own internal layout handles spacing
  const isBrowseFullBleed = isAnimeSectionRoute && (sectionSubPage === "browse" || sectionSubPage === "schedule" || sectionSubPage === "genres");

  // Whether footer & floating navbar are visible
  // Novel routes use the same sidebar + topbar as the rest of the app (the old
  // standalone NovelNavbar looked out of place against the dark novel pages).
  // Watch page now shows the navbar (user request) so users can navigate while watching
  const showNavAndFooter = !isMangaReader && !isStandalonePage && route.page !== "signin" && route.page !== "signup";
  // Sidebar + topbar replace the old floating navbar. Same visibility set as the
  // old navbar (all app pages incl. watch; excludes standalone/auth/novel/reader).
  const showSidebar = showNavAndFooter || isWatchPage;
  // Watch page shows the chrome but NOT the footer
  const showFooter = showNavAndFooter && !isWatchPage;
  const sectionLinks = getSectionNavLinks(route);
  const hasSubNav = sectionLinks.length > 0;

  const renderPage = () => {
    switch (route.page) {
      // Root route (empty hash) is the cinematic landing page; "home" renders
      // the anime section home (hero carousel with TMDB logos + descriptions).
      // The legacy marketing HomePage and duplicate "dub" home are retired.
      case "landing": return <LandingPage />;
      case "hub": return <HubPage />;
      case "home": return <AnimeSectionPage />;
      case "discover": return <DiscoverPage />;
      case "search": return <SearchPage initialQuery={route.query} />;
      case "anime": return <AnimeDetailPage animeId={route.id} />;
      case "watch": return <WatchPage animeId={route.id} episodeNum={route.episode} language={route.language} />;
      // Retired sections — old bookmarks / shared links for Movies, TV Shows,
      // Live, WatchNow, and the legacy per-genre page all land on the anime
      // section home. parseHash already redirected the hash to { page: "home" }.
      case "genre":
      case "movies":
      case "movie-detail":
      case "movie-watch":
      case "tv":
      case "tv-detail":
      case "tv-watch":
      case "watchnow":
      case "live":
      case "live-watch":
      case "live-tv-watch":
        return <AnimeSectionPage />;
      case "bookmarks": return <BookmarksPage />;
      case "watchlist": return <WatchlistPage />;
      case "history": return <HistoryPage />;
      case "manga": return <MangaPage />;
      case "manga-detail": return <MangaDetailPage mangaId={route.id} />;
      case "manga-read": return <MangaReader mangaId={route.id} chapterId={route.chapterId} />;
      case "contact": return <ContactPage />;
      case "donate": return <DonatePage />;
      case "updates": return <UpdatesPage />;
      case "donate-crypto": return <CryptoDonatePage />;
      case "guide": return <GuidePage />;
      case "novel": return <NovelPage />;
      case "novel-detail": return <NovelDetailPage novelId={route.novelId} novelTitle={route.novelTitle} novelCover={route.novelCover} novelAuthor={route.novelAuthor} novelSource={route.novelSource} />;
      case "novel-read": return <NovelReaderPage novelId={route.novelId} novelTitle={route.novelTitle} chapterId={route.chapterId} chapterNum={route.chapterNum} chapterTitle={route.chapterTitle} totalChapters={route.totalChapters} novelSource={route.novelSource} />;
      case "signin": return <SignInPage />;
      case "signup": return <SignUpPage />;
      case "profile": return <ProfilePage />;
      case "leaderboard": return <LeaderboardPage />;
      case "mod": return <ModPanel />;
      case "settings": return <ProfilePage />;
      case "music": return <MusicPage />;
      case "torrent": return <TorrentPage />;
      case "download": return <DownloadPage />;
      case "scraper": return <ScraperPage />;
      case "scraper-anime": return <ScraperAnimePage anilistId={route.id} />;
      case "scraper-watch": return <ScraperWatchPage anilistId={route.id} episodeId={route.episode} site={route.site} />;
      case "features":
        return <LandingPage />;
      default: return <AnimeSectionPage />;
    }
  };

  return (
    <>
      {/* Grain Overlay */}
      <div className="grain-overlay" />
      <AuthErrorToast />
      <AuthNoticeToast />

      {/* Shiroko-style left sidebar + floating transparent topbar — shown on all
          app pages (incl. watch); excludes standalone/auth/novel/manga-reader. */}
      {showSidebar && <SidebarNav />}

      {/* Main Content — offset right by the 64px sidebar on lg. Background stays
          pure black; the topbar floats transparently over the hero. */}
      <ErrorBoundary>
      <div className={`min-h-screen flex flex-col content-reveal bg-[#000000] ${showSidebar ? "lg:pl-[48px]" : ""}`}>
        <main className={`${isWatchPage ? 'w-full px-0 lg:px-0 pt-[44px] pb-16 lg:pb-0' : isMangaReader ? 'w-full' : isHomeFullBleed ? 'w-full' : isBrowseFullBleed ? 'w-full pt-[0px]' : showNavAndFooter ? 'w-full pt-[44px] px-4 lg:px-8' : isFullWidth ? 'w-full pt-4' : 'max-w-[1400px] mx-auto px-4 lg:px-8 pt-4'} ${isWatchPage || isMangaReader || isBrowseFullBleed || isStandalonePage || isAuthPage ? "" : "pb-28 lg:pb-12"} flex-1`}>
          {renderPage()}
        </main>
      </div>
      </ErrorBoundary>

      {/* Footer rendered OUTSIDE the content-reveal wrapper (that wrapper's
          page-load animation creates its own stacking context that traps
          z-index). Background is set via inline style so no global CSS rule
          or cascade order can ever repaint it gray. */}
      {showFooter && (
          <footer
            style={{ backgroundColor: "#000000" }}
            // MARGIN, not padding, for the sidebar offset: this footer sits at
            // z-[9999] (see above) which is far above the sidebar's z-[70], so
            // with padding its solid black background painted straight over the
            // bottom of the sidebar. A margin keeps the footer's box — and
            // therefore its background — clear of the rail entirely.
            className={`relative z-[9999] border-t border-white/[0.06] mt-10 ${showSidebar ? "lg:ml-[48px]" : ""}`}
          >
            <div className="max-w-[1200px] mx-auto px-6 py-8">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-8">
                {/* Logo + disclaimer */}
                <div className="max-w-md">
                  <button onClick={() => navigate({ page: "home" })} className="flex items-center gap-2">
                    <img src="/logo-sidebar.png" alt="LuffyTV" className="w-10 h-10 object-contain" draggable={false} />
                    <span className="text-base font-extrabold text-white" style={{ fontFamily: "var(--font-space-grotesk), 'Space Grotesk', sans-serif" }}>
                      LUFFY<span className="text-white/50">TV</span>
                    </span>
                  </button>
                  <p className="text-xs text-white/40 leading-relaxed mt-2.5">
                    Please note: Luffy TV does not host any files itself but instead only displays content from 3rd party providers. Legal issues should be taken up with them.
                  </p>
                </div>

                {/* Browse column */}
                <div>
                  <h3 className="text-xs font-bold text-white mb-2.5">Browse</h3>
                  <div className="flex flex-col gap-1.5">
                    <button onClick={() => { navigate({ page: "home" }); useAppStore.getState().setSectionSubPage("browse"); }} className="text-xs text-white/40 hover:text-white transition-colors text-left">This Season</button>
                    <button onClick={() => { navigate({ page: "home" }); useAppStore.getState().setSectionSubPage("schedule"); }} className="text-xs text-white/40 hover:text-white transition-colors text-left">Upcoming</button>
                    <button onClick={() => navigate({ page: "movies" } as any)} className="text-xs text-white/40 hover:text-white transition-colors text-left">Movies</button>
                    <button onClick={() => navigate({ page: "tv" } as any)} className="text-xs text-white/40 hover:text-white transition-colors text-left">TV Shows</button>
                  </div>
                </div>

                {/* Resources column */}
                <div>
                  <h3 className="text-xs font-bold text-white mb-2.5">Resources</h3>
                  <div className="flex flex-col gap-1.5">
                    <button onClick={() => navigate({ page: "guide" })} className="text-xs text-white/40 hover:text-white transition-colors text-left">FAQ</button>
                    <button onClick={() => navigate({ page: "contact" })} className="text-xs text-white/40 hover:text-white transition-colors text-left">Contact</button>
                    <span className="text-xs text-white/20 cursor-default">Terms of use</span>
                    <span className="text-xs text-white/20 cursor-default">Privacy policy</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06] mt-6 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-xs text-white/40">
                  &copy; {new Date().getFullYear()} <span className="font-bold text-white/70">LuffyTV&trade;</span> | Made by <span className="font-bold text-white/70">LuffyTV Team</span>
                </p>
                <div className="flex items-center gap-3">
                  {/* Language toggle — visual only, no i18n yet */}
                  <div className="flex items-center gap-1.5 cursor-default" title="Language switching coming soon">
                    <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-white/15">
                      <span className="inline-block h-3.5 w-3.5 translate-x-4 rounded-full bg-white" />
                    </span>
                    <span className="text-xs font-bold text-white/60">EN</span>
                  </div>
                  {/* Discord */}
                  <a href="https://discord.gg/SdFB3HxDH5" target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors" title="Join Discord">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" /></svg>
                  </a>
                  <span className="flex items-center gap-1.5 text-xs text-white/30 cursor-default">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 8l-3 6a4 4 0 008 0l-3-6h-2zm14 0l-3 6a4 4 0 008 0l-3-6h-2zM4 21h16" /></svg>
                    DMCA
                  </span>
                  <span className="text-xs text-white/30 cursor-default">Changelog</span>
                </div>
              </div>
            </div>
          </footer>
      )}

      {/* Scroll to top */}
      {showFooter && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-[4.5rem] right-4 lg:bottom-6 lg:right-6 z-[9999] w-10 h-10 lg:w-11 lg:h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white transition-colors"
          title="Back to top"
          aria-label="Scroll to top"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
        </button>
      )}

      {/* ── Auth Modal Overlay ──
          Renders ON TOP of whatever page is currently active (anime home,
          browse, watch, etc.) — does NOT navigate to a separate page.
          Triggered by openAuthModal('signin' | 'signup') from anywhere
          (navbar sign-in button, "sign in to bookmark" prompts, etc.). */}
      <AuthModal />
      <ConnectListModal />
      <EditListModal />
      <W2GModalGlobal />
    </>
  );
}

// ── W2G Modal wrapper — mounted at app root, listens for 'w2g:open' event ──
function W2GModalGlobal() {
  const [animeInfo, setAnimeInfo] = useState<{ animeId: number; episodeNum: number; animeTitle: string; animeImage: string | null } | null>(null);
  const [openKey, setOpenKey] = useState(0);

  useEffect(() => {
    const handler = () => {
      const pathParts = window.location.pathname.split("/");
      const watchIdx = pathParts.indexOf("watch");
      const animeId = watchIdx >= 0 ? parseInt(pathParts[watchIdx + 1] || "0") : 0;
      const episodeNum = watchIdx >= 0 ? parseInt(pathParts[watchIdx + 2] || "1") : 1;
      setAnimeInfo({
        animeId,
        episodeNum,
        animeTitle: document.title.split(" — ")[0] || `Anime ${animeId}`,
        animeImage: null,
      });
      setOpenKey(k => k + 1);
    };
    window.addEventListener("w2g:open", handler);
    return () => window.removeEventListener("w2g:open", handler);
  }, []);

  if (!animeInfo || openKey === 0) return null;
  return <W2GModal key={openKey} {...animeInfo} />;
}
