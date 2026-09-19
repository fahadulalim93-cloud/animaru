"use client";

import { useState, useEffect, useRef } from "react";
import { useAppStore } from "./store";
import { frameSrcOf } from "./avatar-frames";
import {
  Home, LayoutGrid, CalendarClock, Magnet, BookOpen, ScrollText, Heart, HandCoins, Sparkles,
  Bookmark, History, Settings, ChevronLeft, ChevronRight,
  Search, LogIn, Menu, BellRing, User, LogOut, MoreVertical,
  Tv, BookMarked, Library, Star, Clock, HeartHandshake, CircleDollarSign,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   Shiroko-style sidebar (desktop) + mobile bottom tab bar
   - Desktop: 52px sidebar icon rail (unchanged)
   - Mobile: bottom tab bar with Home/Anime/Manga/Novel + 3-dot menu
   ═══════════════════════════════════════════════════════════════ */

const SIDEBAR_BG = "#000000";
const SIDEBAR_WIDTH = "48px";
const TOPBAR_HEIGHT = "44px";
const SIDEBAR_DIVIDER = "w-6 h-px bg-white/[0.10] shrink-0";

const I = ({ Comp }: { Comp: React.ComponentType<any> }) => (
  <Comp size={18} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
);

interface NavItem {
  icon: React.ReactNode;
  label: string;
  action: () => void;
  active: boolean;
  accent?: boolean;
}

export default function SidebarNav() {
  const { route, navigate, sectionSubPage, setSectionSubPage } = useAppStore();
  const user = useAppStore((s) => s.user);
  const openAuthModal = useAppStore((s) => s.openAuthModal);
  const logout = useAppStore((s) => s.logout);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const page = route.page;
  const isAnimeSection = ["home", "anime", "watch", "bookmarks", "history", "search", "schedule"].includes(page);

  const navItems: NavItem[] = [
    { label: "Home", active: isAnimeSection && sectionSubPage === "home", action: () => { navigate({ page: "home" }); setSectionSubPage("home"); }, icon: <I Comp={Home} /> },
    { label: "Browse", active: isAnimeSection && (sectionSubPage === "browse" || sectionSubPage === "genres"), action: () => { navigate({ page: "home" }); setSectionSubPage("browse"); }, icon: <I Comp={LayoutGrid} /> },
    { label: "Schedule", active: isAnimeSection && sectionSubPage === "schedule", action: () => { navigate({ page: "home" }); setSectionSubPage("schedule"); }, icon: <I Comp={CalendarClock} /> },
    { label: "Manga", active: page === "manga", action: () => navigate({ page: "manga" }), icon: <I Comp={BookOpen} /> },
    { label: "Novel", active: page === "novel" || page === "novel-detail" || page === "novel-read", action: () => navigate({ page: "novel" }), icon: <I Comp={ScrollText} /> },
    { label: "Torrent", active: page === "torrent", action: () => navigate({ page: "torrent" }), icon: <I Comp={Magnet} /> },
    { label: "Watchlist", active: page === "watchlist", action: () => navigate({ page: "watchlist" }), icon: <I Comp={Heart} />, accent: true },
    { label: "Updates", active: page === "updates", action: () => navigate({ page: "updates" }), icon: <I Comp={Sparkles} /> },
    { label: "Support Us", active: page === "donate", action: () => navigate({ page: "donate" }), icon: <I Comp={HandCoins} /> },
  ];

  // ── Mobile bottom tab items (only the 4 primary tabs) ──
  const isAnimeActive = isAnimeSection; // Home/Browse/Schedule all fall under "Anime"
  const mobileTabs: Array<{ label: string; icon: React.ReactNode; active: boolean; action: () => void }> = [
    { label: "Home", icon: <Home size={22} strokeWidth={1.5} />, active: isAnimeSection && sectionSubPage === "home", action: () => { navigate({ page: "home" }); setSectionSubPage("home"); } },
    { label: "Browse", icon: <Tv size={22} strokeWidth={1.5} />, active: isAnimeActive && sectionSubPage !== "home", action: () => { navigate({ page: "home" }); setSectionSubPage("browse"); } },
    { label: "Manga", icon: <BookMarked size={22} strokeWidth={1.5} />, active: page === "manga" || page === "manga-detail" || page === "manga-read", action: () => navigate({ page: "manga" }) },
    { label: "Novel", icon: <Library size={22} strokeWidth={1.5} />, active: page === "novel" || page === "novel-detail" || page === "novel-read", action: () => navigate({ page: "novel" }) },
  ];

  // ── More menu items (everything not in the 4 primary tabs) ──
  const moreItems: Array<{ label: string; icon: React.ReactNode; action: () => void; active: boolean; accent?: boolean }> = [
    { label: "Schedule", icon: <Clock size={18} strokeWidth={1.5} />, action: () => { navigate({ page: "home" }); setSectionSubPage("schedule"); }, active: isAnimeSection && sectionSubPage === "schedule" },
    { label: "Watchlist", icon: <Heart size={18} strokeWidth={1.5} />, action: () => navigate({ page: "watchlist" }), active: page === "watchlist", accent: true },
    { label: "Torrent", icon: <Magnet size={18} strokeWidth={1.5} />, action: () => navigate({ page: "torrent" }), active: page === "torrent" },
    { label: "Updates", icon: <Star size={18} strokeWidth={1.5} />, action: () => navigate({ page: "updates" }), active: page === "updates" },
    { label: "Bookmarks", icon: <Bookmark size={18} strokeWidth={1.5} />, action: () => navigate({ page: "bookmarks" }), active: page === "bookmarks" },
    { label: "History", icon: <Clock size={18} strokeWidth={1.5} />, action: () => navigate({ page: "history" }), active: page === "history" },
    { label: "Support Us", icon: <CircleDollarSign size={18} strokeWidth={1.5} />, action: () => navigate({ page: "donate" }), active: page === "donate" },
    { label: "Settings", icon: <Settings size={18} strokeWidth={1.5} />, action: () => navigate({ page: "settings" }), active: page === "settings" },
  ];

  const doSearch = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}&page=1`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults((data?.results || data?.media || []).slice(0, 8));
      }
    } catch { /* ignore */ }
    finally { setSearchLoading(false); }
  };

  const onSearchChange = (val: string) => {
    setSearchQuery(val);
    setShowSearchResults(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => doSearch(val), 300);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); searchInputRef.current?.focus(); }
      if (e.key === 'Escape') { setShowSearchResults(false); searchInputRef.current?.blur(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [moreMenuOpen]);

  const goBack = () => window.history.back();
  const goForward = () => window.history.forward();
  const navFrame = frameSrcOf((user as any)?.avatarFrame);

  return (
    <>
      {/* ═══ DESKTOP SIDEBAR ═══ */}
      {/* Mobile overlay */}
      {mobileSidebarOpen && <div className="fixed inset-0 z-[60] bg-black/60 lg:hidden" onClick={() => setMobileSidebarOpen(false)} />}

      <aside
        className={`fixed left-0 top-0 bottom-0 z-[70] flex-col items-center transition-transform duration-300 lg:translate-x-0 lg:flex ${mobileSidebarOpen ? "translate-x-0 flex" : "-translate-x-full hidden"}`}
        style={{ width: SIDEBAR_WIDTH, background: SIDEBAR_BG }}
      >
        {/* Logo — smaller for compact Shiroko-style rail */}
        <button
          onClick={() => { navigate({ page: "home" }); setSectionSubPage("home"); setMobileSidebarOpen(false); }}
          className="w-8 h-8 flex items-center justify-center mt-2.5 mb-2 hover:opacity-80 transition-opacity shrink-0"
          title="LuffyTV"
          aria-label="LuffyTV home"
        >
          <img src="/logo-sidebar.png" alt="LuffyTV" className="w-5 h-5 object-contain" draggable={false} />
        </button>

        <div className={SIDEBAR_DIVIDER} />

        <nav className="flex flex-col gap-1 flex-1 items-center pt-2">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => { item.action(); setMobileSidebarOpen(false); }}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 group relative ${
                item.active
                  ? "bg-[#ededed] text-black shadow-sm"
                  : item.accent
                    ? "text-[#ec4899] hover:bg-[#ec4899]/12"
                    : "text-gray-400 hover:text-white hover:bg-white/[0.07]"
              }`}
              title={item.label}
            >
              {item.icon}
              <span className="absolute left-11 px-2 py-1 rounded-md text-[10px] font-medium bg-black/90 text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-white/[0.03]">
                {item.label}
              </span>
            </button>
          ))}
        </nav>

        <div className={SIDEBAR_DIVIDER} />

        {/* Bottom: Settings + Profile */}
        <div className="flex flex-col gap-1.5 items-center pt-2 pb-2.5">
          <button
            onClick={() => navigate({ page: "settings" })}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${page === "settings" ? "bg-[#ededed] text-black shadow-sm" : "text-gray-400 hover:text-white hover:bg-white/[0.07]"}`}
            title="Settings"
          >
            <I Comp={Settings} />
          </button>

          {user ? (
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
                title={user.name}
              >
                <div className="relative w-7 h-7">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%] h-[78%] z-[1]">
                    <div className="w-full h-full rounded-full flex items-center justify-center text-[9px] font-bold overflow-hidden transition-shadow" style={{ backgroundColor: (user.avatarColor || "#7c3aed") + "44", color: user.avatarColor || "#7c3aed" }}>
                      {user.avatarImage ? <img src={user.avatarImage} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : (user.avatar || user.username.charAt(0) || "?").toUpperCase()}
                    </div>
                  </div>
                  {navFrame && <img src={navFrame} alt="" loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 w-full h-full max-w-none select-none z-[2]" />}
                  {!navFrame && <div className="absolute inset-0 rounded-full border border-white/10 z-[1] pointer-events-none" />}
                </div>
              </button>

              {profileMenuOpen && (
                <div className="absolute left-11 bottom-0 w-44 py-1.5 rounded-lg bg-black border border-white/10 shadow-xl z-50">
                  <button onClick={() => { navigate({ page: "profile" }); setProfileMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors">
                    <User size={16} strokeWidth={1.5} /> Profile
                  </button>
                  <button onClick={() => { navigate({ page: "bookmarks" }); setProfileMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors">
                    <Bookmark size={16} strokeWidth={1.5} /> Bookmarks
                  </button>
                  <button onClick={() => { navigate({ page: "history" }); setProfileMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors">
                    <History size={16} strokeWidth={1.5} /> History
                  </button>
                  <div className="my-1.5 border-t border-white/10" />
                  <button onClick={() => { logout(); setProfileMenuOpen(false); navigate({ page: "home" }); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors">
                    <LogOut size={16} strokeWidth={1.5} /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => openAuthModal("signin")}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Sign in"
            >
              <LogIn size={18} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
            </button>
          )}
        </div>
      </aside>

      {/* ═══ TOPBAR — compact 44px strip with centered search + Sign In ═══ */}
      <header
        className="fixed top-0 right-0 z-[65] grid grid-cols-[auto_1fr_auto] items-center justify-between px-2 md:px-3 left-0 lg:left-[48px]"
        style={{ height: TOPBAR_HEIGHT, background: "transparent" }}
      >
        <div className="flex items-center">
          {/* Desktop: back/forward buttons. Mobile: hamburger is gone (bottom tab bar handles it) */}
          <div className="hidden lg:flex items-center gap-0.5">
            <button onClick={goBack} className="hover:bg-white/10 p-1 rounded text-gray-400 hover:text-white transition-colors" title="Back">
              <ChevronLeft size={18} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </button>
            <button onClick={goForward} className="hover:bg-white/10 p-1 rounded text-gray-400 hover:text-white transition-colors" title="Forward">
              <ChevronRight size={18} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </button>
          </div>
        </div>

        {/* Search — slimmer 28px pill */}
        <div className="flex items-center justify-center flex-1 size-full relative">
          <div className="group flex items-center justify-between relative w-full max-w-sm h-7 px-1.5 gap-1 min-w-0 rounded bg-[#000000] border border-[rgba(206,206,209,0.15)] shadow-xs transition-all duration-200 hover:border-[rgba(206,206,209,0.5)]">
            <div className="flex items-center gap-1.5 min-w-0 ml-0.5 flex-1">
              <Search size={11} strokeWidth={2} strokeLinecap="round" className="shrink-0 text-[#a1a1aa]" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onFocus={() => setShowSearchResults(true)}
                onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                placeholder="Find Anime, Manga, and More"
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[11px] text-[#fafafa] placeholder-[#a1a1aa]"
              />
            </div>
            <kbd className="bg-[#27272a] hidden lg:inline-flex h-4 select-none items-center gap-0.5 rounded border border-[rgba(255,255,255,0.03)] px-1 font-mono text-[9px] font-medium text-[#a1a1aa] shrink-0">⌘S</kbd>
          </div>

          {showSearchResults && searchQuery.trim() && (
            <div className="absolute top-full mt-2 left-0 right-0 rounded-xl border border-[rgba(255,255,255,0.03)] overflow-hidden shadow-2xl z-50" style={{ background: "rgba(18,18,18,0.96)", backdropFilter: "blur(20px)" }}>
              {searchLoading && <div className="px-4 py-3 text-xs text-[#a1a1aa]">Searching...</div>}
              {!searchLoading && searchResults.length === 0 && <div className="px-4 py-3 text-xs text-[#a1a1aa]">No results found</div>}
              {searchResults.map((item: any) => {
                const title = item.title?.english || item.title?.romaji || "Unknown";
                const cover = item.coverImage?.medium || item.coverImage?.large || "";
                return (
                  <button key={item.id} onClick={() => { navigate({ page: "anime", id: String(item.id) }); setShowSearchResults(false); setSearchQuery(""); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left">
                    {cover && <img src={cover} alt="" className="w-8 h-12 rounded object-cover shrink-0" loading="lazy" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-white/90 truncate">{title}</p>
                      <p className="text-[10px] text-[#a1a1aa]">{item.format} {item.seasonYear ? `· ${item.seasonYear}` : ""}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end items-center gap-1">
          {!user && (
            <button
              onClick={() => openAuthModal("signin")}
              className="flex items-center gap-1 h-7 px-3 rounded-full bg-white text-black text-[11px] font-semibold hover:bg-white/90 transition-colors"
            >
              <LogIn size={12} strokeWidth={2} className="hidden sm:block" />
              <span className="hidden sm:inline">Sign In</span>
              <span className="sm:hidden">Login</span>
            </button>
          )}
          <button
            onClick={() => navigate({ page: "settings" })}
            className="hover:bg-white/10 p-1 rounded text-gray-400 hover:text-white transition-colors relative group"
            title="Notifications"
          >
            <BellRing size={18} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </button>
        </div>
      </header>

      {/* ═══ MOBILE BOTTOM TAB BAR ═══ */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-[75] lg:hidden border-t border-white/[0.08]"
        style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(16px)" }}
      >
        <div className="flex items-center justify-around h-14 px-1">
          {mobileTabs.map((tab) => (
            <button
              key={tab.label}
              onClick={() => tab.action()}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[48px] py-1 transition-colors ${
                tab.active
                  ? "text-white"
                  : "text-white/40 active:text-white/70"
              }`}
            >
              <span className={tab.active ? "scale-110 transition-transform" : ""}>{tab.icon}</span>
              <span className={`text-[10px] font-medium leading-none ${tab.active ? "text-white" : "text-white/40"}`}>{tab.label}</span>
            </button>
          ))}

          {/* 3-dot More button */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setMoreMenuOpen((prev) => !prev)}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[48px] py-1 transition-colors ${
                moreMenuOpen || moreItems.some(i => i.active)
                  ? "text-white"
                  : "text-white/40 active:text-white/70"
              }`}
            >
              <MoreVertical size={22} strokeWidth={1.5} />
              <span className={`text-[10px] font-medium leading-none ${moreMenuOpen || moreItems.some(i => i.active) ? "text-white" : "text-white/40"}`}>More</span>
            </button>

            {/* More menu popup — slides up from the bottom bar */}
            {moreMenuOpen && (
              <div
                className="absolute bottom-16 right-0 w-48 py-2 rounded-xl border border-white/10 shadow-2xl z-[80]"
                style={{ background: "rgba(10,10,10,0.97)", backdropFilter: "blur(20px)" }}
              >
                {moreItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => { item.action(); setMoreMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      item.active
                        ? "text-white bg-white/[0.06]"
                        : item.accent
                          ? "text-[#ec4899] hover:bg-white/5"
                          : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white" />}
                  </button>
                ))}

                {/* User section in more menu */}
                <div className="mt-2 pt-2 border-t border-white/10">
                  {user ? (
                    <>
                      <button
                        onClick={() => { navigate({ page: "profile" }); setMoreMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <User size={18} strokeWidth={1.5} />
                        <span>Profile</span>
                      </button>
                      <button
                        onClick={() => { logout(); setMoreMenuOpen(false); navigate({ page: "home" }); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors"
                      >
                        <LogOut size={18} strokeWidth={1.5} />
                        <span>Sign out</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { openAuthModal("signin"); setMoreMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <LogIn size={18} strokeWidth={1.5} />
                      <span>Sign in</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
