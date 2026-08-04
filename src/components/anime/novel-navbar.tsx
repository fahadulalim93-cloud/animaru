"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "./store";
import { Search, Menu, X, Home, TrendingUp, BookOpen, Sparkles } from "lucide-react";

/**
 * NovelNavbar — dedicated floating glassy navbar for the novel section
 * Matches the main LuffyTV navbar style (glassmorphism pill, floating)
 * Black + white theme
 */
export function NovelNavbar() {
  const navigate = useAppStore(s => s.navigate);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Listen for tab events from nav clicks
  useEffect(() => {
    const onTab = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      setActiveTab(detail);
      // Scroll to the section
      setTimeout(() => {
        const el = document.getElementById(`novel-section-${detail}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    };
    const onSearch = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      setSearchQuery(detail);
      // Scroll to top and trigger search
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("novel-tab", onTab);
    window.addEventListener("novel-search", onSearch);
    return () => {
      window.removeEventListener("novel-tab", onTab);
      window.removeEventListener("novel-search", onSearch);
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setMobileOpen(false);
    }
  };

  const navItems = [
    { label: "Home", icon: Home, tab: "home", action: () => navigate({ page: "home" }) },
    { label: "Popular", icon: TrendingUp, tab: "trending", action: () => { navigate({ page: "novel" }); setActiveTab("trending"); window.dispatchEvent(new CustomEvent("novel-tab", { detail: "trending" })); } },
    { label: "Browse", icon: BookOpen, tab: "browse", action: () => { navigate({ page: "novel" }); setActiveTab("browse"); window.dispatchEvent(new CustomEvent("novel-tab", { detail: "browse" })); } },
    { label: "Discover", icon: Sparkles, tab: "recent", action: () => { navigate({ page: "novel" }); setActiveTab("recent"); window.dispatchEvent(new CustomEvent("novel-tab", { detail: "recent" })); } },
  ];

  return (
    <>
      {/* ═══ LOGO (left) ═══ */}
      <button
        onClick={() => navigate({ page: "novel" })}
        className="ltv-nav-logo"
        style={{ position: "fixed", top: "14px", left: "40px", fontSize: "1.35rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px", fontStyle: "italic", whiteSpace: "nowrap", userSelect: "none", zIndex: 101, background: "transparent", border: "none", cursor: "pointer" }}
      >
        LUFFY <span style={{ color: "#D4A017" }}>TV</span>
      </button>

      {/* ═══ NAV PILL (center, glassmorphism) ═══ */}
      <nav
        style={{
          position: "fixed",
          top: "14px",
          left: "140px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "8px 16px",
          background: scrolled ? "rgba(15, 15, 20, 0.50)" : "rgba(15, 15, 20, 0.30)",
          backdropFilter: `blur(${scrolled ? 40 : 30}px) saturate(${scrolled ? 220 : 200}%)`,
          WebkitBackdropFilter: `blur(${scrolled ? 40 : 30}px) saturate(${scrolled ? 220 : 200}%)`,
          border: `1px solid rgba(255, 255, 255, ${scrolled ? 0.18 : 0.14})`,
          borderRadius: "999px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
          zIndex: 100,
          transition: "all 0.3s ease",
          maxWidth: "calc(100% - 180px)",
        }}
      >
        {/* Nav links */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="flex items-center gap-1.5 text-sm font-medium transition-all whitespace-nowrap border-none"
              style={{
                color: activeTab === item.tab ? "#111118" : "rgba(255, 255, 255, 0.75)",
                background: activeTab === item.tab ? "#ffffff" : "transparent",
                padding: "8px 18px",
                borderRadius: "999px",
                fontWeight: activeTab === item.tab ? 600 : 500,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== item.tab) {
                  e.currentTarget.style.color = "#fff";
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.14)";
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== item.tab) {
                  e.currentTarget.style.color = "rgba(255, 255, 255, 0.75)";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <span style={{ width: "1px", height: "20px", background: "rgba(255, 255, 255, 0.18)", margin: "0 4px", flexShrink: 0 }} />

        {/* Search input — dispatches to NovelPage on every keystroke */}
        <div className="hidden md:flex items-center gap-2">
          <Search className="w-4 h-4 text-white/50" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              const val = e.target.value;
              setSearchQuery(val);
              // Dispatch to NovelPage immediately (no need to press Enter)
              window.dispatchEvent(new CustomEvent("novel-search", { detail: val }));
            }}
            placeholder="Search novels..."
            className="bg-transparent border-none outline-none text-sm text-white placeholder-white/40 w-32 lg:w-48"
          />
        </div>
      </nav>

      {/* ═══ RIGHT ICONS PILL ═══ */}
      <div
        style={{
          position: "fixed",
          top: "14px",
          right: "24px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          background: scrolled ? "rgba(15, 15, 20, 0.50)" : "rgba(15, 15, 20, 0.30)",
          backdropFilter: `blur(${scrolled ? 40 : 30}px) saturate(${scrolled ? 220 : 200}%)`,
          WebkitBackdropFilter: `blur(${scrolled ? 40 : 30}px) saturate(${scrolled ? 220 : 200}%)`,
          border: `1px solid rgba(255, 255, 255, ${scrolled ? 0.18 : 0.14})`,
          borderRadius: "999px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
          padding: "6px 10px",
          zIndex: 100,
          transition: "all 0.3s ease",
        }}
      >
        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Back to Anime button (desktop) */}
        <button
          onClick={() => navigate({ page: "home" })}
          className="hidden md:flex items-center gap-1.5 text-sm font-medium text-white/75 hover:text-white px-3 py-1.5 rounded-full hover:bg-white/10 transition-all whitespace-nowrap"
        >
          <Home className="w-4 h-4" />
          Anime
        </button>
      </div>

      {/* ═══ MOBILE MENU ═══ */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div
            className="absolute top-16 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-white/10 p-4 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  window.dispatchEvent(new CustomEvent("novel-search", { detail: val }));
                }}
                placeholder="Search novels..."
                className="w-full pl-10 pr-4 py-2.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-sm text-white outline-none focus:border-white/30"
                autoFocus
              />
            </div>
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => { item.action(); setMobileOpen(false); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white/70 hover:bg-white/[0.08] hover:text-white w-full transition-all"
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
