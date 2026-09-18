"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "./store";
import { frameSrcOf } from "./avatar-frames";
import { Search, Menu, X } from "lucide-react";

interface QuickResult {
  id: number;
  title: string;
  image: string;
  format?: string;
  episodes?: number;
  seasonYear?: number;
  averageScore?: number;
  mediaType?: "movie" | "tv";
}

export default function Navbar() {
  const { route, navigate, sectionSubPage, setSectionSubPage } = useAppStore();
  const user = useAppStore((s) => s.user);
  const openAuthModal = useAppStore((s) => s.openAuthModal);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<QuickResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Manga section searches manga; everywhere else searches anime (AniList)
  const page = route.page;
  const isMangaSection = ["manga", "manga-detail", "manga-read"].includes(page);

  // Real-time search with debounce
  const doSearch = useCallback(async (q: string) => {
    try {
      if (isMangaSection) {
        // Search manga via atsumaru
        const res = await fetch(`/api/manga/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          const results = (data?.results || []).slice(0, 6).map((item: any) => ({
            id: item.id,
            title: item.englishTitle || item.title || "Unknown",
            image: item.poster || item.cover || "",
            format: item.type?.toUpperCase() || "MANGA",
            isManga: true,
          }));
          setSearchResults(results);
        }
        return;
      }
      const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}&page=1`);
      if (res.ok) {
        const data = await res.json();
        const results = (data?.results || data?.media || []).slice(0, 6).map((item: any) => ({
          id: item.id,
          title: item.title?.english || item.title?.romaji || "Unknown",
          image: item.coverImage?.medium || item.coverImage?.large || "",
          format: item.format,
          episodes: item.episodes,
          seasonYear: item.seasonYear,
          averageScore: item.averageScore,
        }));
        setSearchResults(results);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [isMangaSection]);

  const queryRef = useRef("");
  useEffect(() => {
    queryRef.current = searchQuery;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    setShowSearchResults(true);
    searchTimerRef.current = setTimeout(() => doSearch(q), 500);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, doSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      navigate({ page: "search", query: trimmed });
      setSearchQuery("");
      setShowSearchResults(false);
      setShowSearchModal(false);
      setMobileOpen(false);
    }
  };

  const handleResultClick = (id: number | string, mediaType?: "movie" | "tv") => {
    if (isMangaSection) {
      navigate({ page: "manga-detail", id: String(id) });
    } else {
      navigate({ page: "anime", id: String(id) });
    }
    setSearchQuery("");
    setShowSearchResults(false);
    setShowSearchModal(false);
    setMobileOpen(false);
  };

  // Keyboard shortcut: Ctrl+K or /
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "s")) {
        e.preventDefault();
        setShowSearchModal(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      // Slash key (when not typing in an input)
      if (e.key === "/" && !showSearchModal) {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          e.preventDefault();
          setShowSearchModal(true);
          setTimeout(() => searchInputRef.current?.focus(), 100);
        }
      }
      if (e.key === "Escape") {
        setShowSearchModal(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showSearchModal]);

  useEffect(() => {
    const handleResize = () => { if (window.innerWidth > 768) setMobileOpen(false); };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // The anime watch page ("watch" / "scraper-watch") now KEEPS the floating
  // navbar so viewers can navigate while watching. Only the retired
  // movie/TV watch routes and the manga/novel readers hide it.
  const hideNavbarPages = ["movie-watch", "tv-watch"];
  const isMangaReader = page === "manga-read" || page === "novel-read";
  if (hideNavbarPages.includes(page) || isMangaReader || page === "signin" || page === "signup") return null;

  // Section-aware nav links: the Manga section gets its OWN links instead
  // of the anime ones. (Movies / TV Shows / Live were removed — those routes
  // now redirect home, so they have no dedicated nav anymore.)
  const isAnimePage = ["home", "anime", "watch", "genre", "bookmarks", "history"].includes(page);

  const navItems = isMangaSection
    ? [
        { label: "Home", active: sectionSubPage === "home" },
        { label: "Popular", active: sectionSubPage === "popular" },
        { label: "Top Rated", active: sectionSubPage === "top-rated" },
        { label: "Recently Added", active: sectionSubPage === "recently-added" },
      ]
    : [
        { label: "Home", active: isAnimePage && sectionSubPage === "home" },
        { label: "Browse", active: isAnimePage && (sectionSubPage === "browse" || sectionSubPage === "genres") },
        { label: "Schedule", active: isAnimePage && sectionSubPage === "schedule" },
        { label: "Download", active: page === "download" },
        { label: "Torrent", active: page === "torrent" },
        { label: "Music", active: page === "music" },
      ];

  const handleNavClick = (label: string) => {
    if (isMangaSection) {
      // Manga-section links switch the manga sub-page
      navigate({ page: "manga" });
      if (label === "Home") setSectionSubPage("home");
      else if (label === "Popular") setSectionSubPage("popular");
      else if (label === "Top Rated") setSectionSubPage("top-rated");
      else if (label === "Recently Added") setSectionSubPage("recently-added");
    } else if (label === "Home") {
      navigate({ page: "home" });
      setSectionSubPage("home");
    } else if (label === "Browse") {
      navigate({ page: "home" });
      setSectionSubPage("browse");
    } else if (label === "Schedule") {
      navigate({ page: "home" });
      setSectionSubPage("schedule");
    } else if (label === "Download") {
      navigate({ page: "download" });
    } else if (label === "Torrent") {
      navigate({ page: "torrent" });
    } else if (label === "Music") {
      navigate({ page: "music" });
    }
    setMobileOpen(false);
  };

  return (
    <>
      {/* ═══ MOBILE-ONLY LOGO — the pill below (logo + links) hides on small
          screens, so this fixed standalone logo stands in for it there ═══ */}
      <button
        className="ltv-nav-logo-mobile"
        onClick={() => { navigate({ page: "home" }); setSectionSubPage("home"); }}
        aria-label="LuffyTV Home"
      >
        <img src="/logo.svg" alt="LuffyTV" />
      </button>

      {/* ═══ NAVBAR PILL — logo + nav links, all in one floating pill ═══ */}
      <nav className={`ltv-nav-pill${scrolled ? " scrolled" : ""}`}>
        <button
          className="ltv-nav-logo-inline"
          onClick={() => { navigate({ page: "home" }); setSectionSubPage("home"); }}
          aria-label="LuffyTV Home"
        >
          <img src="/logo.svg" alt="LuffyTV" className="ltv-nav-logo-img" />
        </button>

        {/* Nav Links */}
        <div className="ltv-nav-links">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`ltv-nav-link${item.active ? " active" : ""}`}
              onClick={() => handleNavClick(item.label)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ═══ RIGHT ICONS — Discord, Search, Notifications, Avatar ═══ */}
      <div className={`ltv-nav-right-icons${scrolled ? " scrolled" : ""}`}>
        {/* Discord — hidden on mobile (moved into the hamburger dropdown) */}
        <a
          href="https://discord.gg/SdFB3HxDH5"
          target="_blank"
          rel="noopener noreferrer"
          className="ltv-nav-icon-btn ltv-nav-discord ltv-nav-icon-hide-mobile"
          title="Discord"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
          </svg>
        </a>

        {/* Search */}
        <button
          className="ltv-nav-icon-btn"
          title="Search"
          aria-label="Search"
          onClick={() => { setShowSearchModal(true); setTimeout(() => searchInputRef.current?.focus(), 100); }}
        >
          <Search size={17} strokeWidth={2} />
        </button>

        {/* Notifications */}
        <div className="relative ltv-nav-icon-hide-mobile">
          <button
            className="ltv-nav-icon-btn"
            title="Notifications"
            aria-label="Notifications"
            onClick={() => setNotifOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
              <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden">
                <div className="p-4 text-center">
                  <p className="text-sm text-white/50">No notifications yet.</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Auth — Login button OR Profile avatar dropdown */}
        {user ? (() => {
          const navFrame = frameSrcOf((user as any).avatarFrame);
          return (
          <div className="relative">
            <button
              className="flex items-center justify-center rounded-full shrink-0 transition-transform hover:scale-105 focus:outline-none"
              onClick={() => setProfileMenuOpen((v) => !v)}
              aria-label="Profile menu"
              title={`${user.name} (@${user.username})`}
            >
              <div className="relative w-9 h-9 shrink-0">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%] h-[78%] z-[1]">
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center text-[10px] font-bold overflow-hidden transition-shadow"
                    style={{
                      backgroundColor: (user.avatarColor || "#7c3aed") + "44",
                      color: user.avatarColor || "#7c3aed",
                    }}
                  >
                    {user.avatarImage ? <img src={user.avatarImage} alt="" className="w-full h-full object-cover" loading="eager" /> : (user.avatar || user.username.charAt(0) || "?").toUpperCase()}
                  </div>
                </div>
                {navFrame && <img src={navFrame} alt="" loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 w-full h-full max-w-none select-none z-[2]" />}
                {!navFrame && <div className="absolute inset-0 rounded-full border border-white/15 z-[1] pointer-events-none" />}
              </div>
            </button>
            {profileMenuOpen && (
              <>
                {/* click-away overlay */}
                <div className="fixed inset-0 z-40" onClick={() => setProfileMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden">
                  {/* User info header */}
                  <div className="p-3 border-b border-white/[0.06] flex items-center gap-2.5">
                    <div className="relative w-12 h-12 shrink-0">
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%] h-[78%] z-[1]">
                        <div
                          className="w-full h-full rounded-full flex items-center justify-center text-xs font-bold overflow-hidden transition-shadow"
                          style={{
                            backgroundColor: (user.avatarColor || "#7c3aed") + "44",
                            color: user.avatarColor || "#7c3aed",
                          }}
                        >
                          {user.avatarImage ? <img src={user.avatarImage} alt="" className="w-full h-full object-cover" loading="eager" /> : (user.avatar || user.username.charAt(0) || "?").toUpperCase()}
                        </div>
                      </div>
                      {navFrame && <img src={navFrame} alt="" loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 w-full h-full max-w-none select-none z-[2]" />}
                      {!navFrame && <div className="absolute inset-0 rounded-full border border-white/15 z-[1] pointer-events-none" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{user.name}</p>
                      <p className="text-[10px] text-white/40 truncate font-mono">@{user.username}</p>
                    </div>
                  </div>
                  {/* Menu items */}
                  <div className="p-1.5">
                    <button
                      onClick={() => { setProfileMenuOpen(false); navigate({ page: "profile" }); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.06] text-sm text-white/80 hover:text-white transition-colors text-left"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      My Profile
                    </button>
                    <button
                      onClick={() => { setProfileMenuOpen(false); navigate({ page: "bookmarks" }); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.06] text-sm text-white/80 hover:text-white transition-colors text-left"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                      Bookmarks
                    </button>
                    <button
                      onClick={() => { setProfileMenuOpen(false); navigate({ page: "history" }); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.06] text-sm text-white/80 hover:text-white transition-colors text-left"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      History
                    </button>
                    <button
                      onClick={() => { setProfileMenuOpen(false); navigate({ page: "leaderboard" }); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.06] text-sm text-white/80 hover:text-white transition-colors text-left"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z" />
                      </svg>
                      Leaderboard
                    </button>
                  </div>
                  {/* Logout */}
                  <div className="p-1.5 border-t border-white/[0.06]">
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        useAppStore.getState().logout();
                        navigate({ page: "home" });
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-red-500/10 text-sm text-red-400 hover:text-red-300 transition-colors text-left"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Log out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        );
        })() : (
          <button
            className="ltv-nav-icon-btn"
            onClick={() => openAuthModal("signin")}
            aria-label="Sign in"
            title="Sign in"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          </button>
        )}

        {/* Mobile Toggle */}
        <button
          className="ltv-nav-icon-btn ltv-nav-mobile-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* ═══ SEARCH MODAL — opens on / or Ctrl+K ═══ */}
      {showSearchModal && (
        <div
          className="ltv-search-modal-overlay"
          onClick={() => setShowSearchModal(false)}
        >
          <div
            className="ltv-search-modal"
            onClick={(e) => e.stopPropagation()}
            ref={searchRef}
          >
            <form onSubmit={handleSearchSubmit} className="ltv-search-modal-input-row">
              <Search size={20} className="ltv-search-modal-icon" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={isMangaSection ? "Search manga..." : "Search anime..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if (searchQuery.trim().length >= 2) setShowSearchResults(true); }}
                className="ltv-search-modal-input"
                autoFocus
              />
              <kbd className="ltv-slash-badge">ESC</kbd>
            </form>

            {/* Search Dropdown */}
            {showSearchResults && (
              <div className="ltv-search-modal-results">
                {searchLoading ? (
                  <div className="ltv-search-modal-loading">
                    <div className="w-5 h-5 border-2 border-white/10 border-t-white rounded-full animate-spin" />
                    <span>Searching...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  <>
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        className="ltv-search-modal-result"
                        onClick={() => handleResultClick(item.id, item.mediaType)}
                      >
                        <img
                          src={item.image || ""}
                          alt={item.title}
                          className="ltv-search-modal-result-img"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <div className="ltv-search-modal-result-info">
                          <span className="ltv-search-modal-result-title">{item.title}</span>
                          <span className="ltv-search-modal-result-meta">
                            {item.format && item.format !== "TV_SHORT" ? item.format : "TV"}
                            {item.episodes ? ` • ${item.episodes} eps` : ""}
                            {item.seasonYear ? ` • ${item.seasonYear}` : ""}
                            {item.averageScore ? ` • ★ ${item.averageScore}%` : ""}
                          </span>
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="ltv-search-modal-view-all"
                      onClick={handleSearchSubmit as any}
                    >
                      View all results for &ldquo;{searchQuery}&rdquo;
                    </button>
                  </>
                ) : (
                  <div className="ltv-search-modal-no-results">No results found</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ MOBILE MENU — nav links + the icons that hide from the top bar on small screens ═══ */}
      {mobileOpen && (
        <>
        <div className="fixed inset-0 z-[98]" onClick={() => setMobileOpen(false)} />
        <div className="ltv-nav-menu-mobile">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`ltv-nav-link${item.active ? " active" : ""}`}
              onClick={() => { handleNavClick(item.label); setMobileOpen(false); }}
            >
              {item.label}
            </button>
          ))}
          <span className="ltv-nav-menu-mobile-divider" />
          <button className="ltv-nav-link" onClick={() => { setMobileOpen(false); navigate({ page: "bookmarks" }); }}>
            Bookmarks
          </button>
          <button className="ltv-nav-link" onClick={() => { setMobileOpen(false); navigate({ page: "history" }); }}>
            History
          </button>
          <a
            href="https://discord.gg/SdFB3HxDH5"
            target="_blank"
            rel="noopener noreferrer"
            className="ltv-nav-link"
            onClick={() => setMobileOpen(false)}
          >
            Discord
          </a>
        </div>
        </>
      )}
    </>
  );
}
