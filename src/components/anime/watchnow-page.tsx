"use client";

import { useState, useCallback } from "react";
import { useAppStore } from "./store";

/* ─── Category data ─── */
const categories = [
  {
    num: "01",
    abbr: "ANI",
    title: "Anime",
    desc: "Watch the latest episodes and classic series in HD.",
    color: "#ffffff",
    glowColor: "rgba(124,106,240,0.6)",
    iconBg: "rgba(124,106,240,0.15)",
    iconBorder: "rgba(124,106,240,0.25)",
    page: "home" as const,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="#ffffff" strokeWidth="1.5" />
        <path d="M10 8.5l6 3.5-6 3.5V8.5z" fill="#ffffff" />
      </svg>
    ),
  },
  {
    num: "02",
    abbr: "MNG",
    title: "Manga",
    desc: "Read your favorite manga chapters online.",
    color: "#f5a623",
    glowColor: "rgba(245,166,35,0.6)",
    iconBg: "rgba(245,166,35,0.12)",
    iconBorder: "rgba(245,166,35,0.25)",
    page: "manga" as const,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="12" height="16" rx="1.5" stroke="#f5a623" strokeWidth="1.5" />
        <path d="M8 7h6M8 10h6M8 13h4" stroke="#f5a623" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M16 7h3l-1.5 2 1.5 2h-3" stroke="#f5a623" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    num: "03",
    abbr: "NVL",
    title: "Novels",
    desc: "Dive into light novels and web novels.",
    color: "#1fc8a8",
    glowColor: "rgba(31,200,168,0.6)",
    iconBg: "rgba(31,200,168,0.12)",
    iconBorder: "rgba(31,200,168,0.25)",
    page: "novel" as const,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="13" height="17" rx="1.5" stroke="#1fc8a8" strokeWidth="1.5" />
        <path d="M8 8h6M8 11h6M8 14h3" stroke="#1fc8a8" strokeWidth="1.2" strokeLinecap="round" />
        <rect x="15" y="14" width="4" height="6" rx="0.5" stroke="#1fc8a8" strokeWidth="1" />
      </svg>
    ),
  },
  {
    num: "04",
    abbr: "MOV",
    title: "Movies",
    desc: "Stream the latest blockbusters and timeless classics.",
    color: "#ef4444",
    glowColor: "rgba(239,68,68,0.6)",
    iconBg: "rgba(239,68,68,0.12)",
    iconBorder: "rgba(239,68,68,0.25)",
    page: "movies" as const,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" stroke="#ef4444" strokeWidth="1.4" />
        <line x1="7" y1="2" x2="7" y2="22" stroke="#ef4444" strokeWidth="1.2" />
        <line x1="17" y1="2" x2="17" y2="22" stroke="#ef4444" strokeWidth="1.2" />
        <line x1="2" y1="12" x2="22" y2="12" stroke="#ef4444" strokeWidth="1.2" />
        <line x1="2" y1="7" x2="7" y2="7" stroke="#ef4444" strokeWidth="1.2" />
        <line x1="2" y1="17" x2="7" y2="17" stroke="#ef4444" strokeWidth="1.2" />
        <line x1="17" y1="7" x2="22" y2="7" stroke="#ef4444" strokeWidth="1.2" />
        <line x1="17" y1="17" x2="22" y2="17" stroke="#ef4444" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    num: "05",
    abbr: "TVS",
    title: "TV Shows",
    desc: "Binge-watch popular series from around the world.",
    color: "#e05c9c",
    glowColor: "rgba(224,92,156,0.6)",
    iconBg: "rgba(224,92,156,0.12)",
    iconBorder: "rgba(224,92,156,0.25)",
    page: "tv" as const,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="7" width="20" height="15" rx="2" stroke="#e05c9c" strokeWidth="1.4" />
        <polyline points="17 2 12 7 7 2" stroke="#e05c9c" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    num: "06",
    abbr: "LIV",
    title: "Live TV",
    desc: "Watch live sports and TV channels in real-time.",
    color: "#22c55e",
    glowColor: "rgba(34,197,94,0.6)",
    iconBg: "rgba(34,197,94,0.12)",
    iconBorder: "rgba(34,197,94,0.25)",
    page: "live" as const,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="12" cy="12" r="2" stroke="#22c55e" strokeWidth="1.4" />
        <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    num: "07",
    abbr: "CRW",
    title: "Crews",
    desc: "Join forces with other adventurers and fans.",
    color: "#e63946",
    glowColor: "rgba(230,57,70,0.6)",
    iconBg: "rgba(230,57,70,0.12)",
    iconBorder: "rgba(230,57,70,0.25)",
    page: "home" as const,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 4l2 4h5l-4 3 1.5 4.5L12 13l-4.5 2.5L9 11 5 8h5z"
          stroke="#e63946"
          strokeWidth="1.4"
          strokeLinejoin="round"
          fill="rgba(230,57,70,0.15)"
        />
      </svg>
    ),
  },
  {
    num: "08",
    abbr: "COM",
    title: "Community",
    desc: "Connect with fellow fans and creators.",
    color: "#3b82f6",
    glowColor: "rgba(59,130,246,0.6)",
    iconBg: "rgba(59,130,246,0.12)",
    iconBorder: "rgba(59,130,246,0.25)",
    page: "home" as const,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3" stroke="#3b82f6" strokeWidth="1.4" />
        <circle cx="17" cy="8" r="2.5" stroke="#3b82f6" strokeWidth="1.4" />
        <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#3b82f6" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M17 13c2.2 0 4 1.8 4 4" stroke="#3b82f6" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    num: "09",
    abbr: "DSC",
    title: "Discord",
    desc: "Join our Discord community server.",
    color: "#ffffff",
    glowColor: "rgba(88,101,242,0.6)",
    iconBg: "rgba(88,101,242,0.15)",
    iconBorder: "rgba(88,101,242,0.3)",
    page: "home" as const,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M9 10a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM15 10a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"
          fill="#ffffff"
        />
        <path
          d="M18.6 5.5C17.3 4.9 15.9 4.4 14.4 4.1l-.2.4c-1.5-.3-3-.3-4.5 0L9.5 4C8 4.4 6.7 4.9 5.4 5.5 2.9 9.2 2.1 12.8 2.5 16.3c1.6 1.2 3.2 1.9 4.8 2.4l.9-1.3c-.6-.2-1.1-.5-1.7-.8l.4-.4c3.2 1.5 6.7 1.5 9.9 0l.4.4c-.5.3-1.1.6-1.7.8l.9 1.3c1.6-.5 3.2-1.2 4.8-2.4.4-4-1.1-7.5-3.6-10.8z"
          fill="#ffffff"
        />
      </svg>
    ),
  },
];

const mono = "'Space Mono', 'Courier New', monospace";
const serif = "Georgia, 'Times New Roman', serif";

export default function WatchNowPage() {
  const navigate = useAppStore((s) => s.navigate);
  const [enabledCats, setEnabledCats] = useState<Set<string>>(() => new Set(categories.map(c => c.abbr)));
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [touchedCard, setTouchedCard] = useState<string | null>(null);

  const toggleCat = useCallback((abbr: string) => {
    setEnabledCats(prev => {
      const next = new Set(prev);
      if (next.has(abbr)) next.delete(abbr);
      else next.add(abbr);
      return next;
    });
  }, []);

  const visibleCategories = categories.filter(c => enabledCats.has(c.abbr));
  const isCardActive = (abbr: string) => hoveredCard === abbr || touchedCard === abbr;

  return (
    <div className="lu-page">
      {/* ─── NAV ─── */}
      <nav className="lu-nav">
        <div className="flex items-center gap-2" style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)" }}>
          <div className="lu-nav-dot" />
          SYSTEM / <span className="text-white font-bold">LUFFY</span>
        </div>
        <div className="flex items-center gap-5" style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,255,255,0.45)" }}>
          <span
            className="text-white font-bold cursor-pointer"
            onClick={() => navigate({ page: "watchnow" })}
          >
            MODERN
          </span>
          <span style={{ color: "rgba(255,255,255,0.15)" }}>/</span>
          <span
            className="cursor-pointer hover:text-white transition-colors"
            onClick={() => navigate({ page: "home" })}
          >
            LEGACY
          </span>
          <span style={{ marginLeft: 12, color: "rgba(255,255,255,0.15)" }}>INDEX 01</span>
        </div>
      </nav>

      {/* ─── HERO (Black half) ─── */}
      <section className="lu-hero">
        {/* Left */}
        <div className="pt-5" style={{ animation: "luFadeUp 0.7s ease both" }}>
          {/* Label */}
          <div className="flex items-center gap-3 mb-8" style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.15em", color: "rgba(255,255,255,0.45)" }}>
            <div style={{ width: 40, height: 1, background: "#D4A017" }} />
            WELCOME / CHOOSE YOUR PATH
          </div>

          {/* Title */}
          <h1 style={{ fontFamily: serif, fontSize: "clamp(48px, 8vw, 110px)", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.02em" }}>
            <span className="block text-white">Luffy</span>
            <span className="block" style={{ color: "#D4A017", fontStyle: "italic", marginTop: 4 }}>universe.</span>
          </h1>

          {/* Description */}
          <p style={{ fontFamily: mono, marginTop: 28, fontSize: 12, lineHeight: 1.8, color: "rgba(255,255,255,0.45)", maxWidth: 380, letterSpacing: "0.02em" }}>
            Choose where you want to go today. Sail between anime, manga, novels, movies, TV shows, and live sports.
          </p>
        </div>

        {/* Right — Sign In Card */}
        <div className="lu-hero-right pt-5" style={{ animation: "luFadeUp 0.7s 0.15s ease both" }}>
          <div className="lu-signin-card">
            {/* Card label */}
            <div className="flex items-center justify-between mb-5" style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.15em", color: "rgba(255,255,255,0.45)" }}>
              <span>SESSION / GUEST</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.4 }}>
                <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="white" strokeWidth="1.3" />
                <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="white" strokeWidth="1.3" />
              </svg>
            </div>

            {/* Card title */}
            <h2 style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, lineHeight: 1.3, marginBottom: 10, color: "#fff" }}>
              Sign in to <em style={{ color: "#D4A017", fontStyle: "italic" }}>unlock</em>
              <br />
              your realm.
            </h2>

            {/* Card desc */}
            <p style={{ fontFamily: mono, fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, letterSpacing: "0.03em", marginBottom: 24 }}>
              Authenticate to see your username, level, XP and berry coins.
            </p>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-2.5 mb-5">
              {/* Level */}
              <div style={{ background: "#111116", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, background: "#0a0a0c", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1l1.5 4.5H14l-4 2.5 1.5 4.5L7 10l-4.5 2.5L4 8 0 5.5h5.5z" fill="white" />
                  </svg>
                </div>
                <div>
                  <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)", display: "block", marginBottom: 4 }}>LEVEL</span>
                  <div className="flex gap-1 items-center">
                    <div style={{ width: 20, height: 2, background: "rgba(255,255,255,0.15)", borderRadius: 1 }} />
                    <div style={{ width: 20, height: 2, background: "rgba(255,255,255,0.15)", borderRadius: 1 }} />
                  </div>
                </div>
              </div>
              {/* Berry Coins */}
              <div style={{ background: "#111116", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, background: "#0a0a0c", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke="white" strokeWidth="1.2" />
                    <path d="M7 4v3l2 2" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)", display: "block", marginBottom: 4 }}>BERRY COINS</span>
                  <div className="flex gap-1 items-center">
                    <div style={{ width: 20, height: 2, background: "rgba(255,255,255,0.15)", borderRadius: 1 }} />
                    <div style={{ width: 20, height: 2, background: "rgba(255,255,255,0.15)", borderRadius: 1 }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Sign in button */}
            <button
              onClick={() => { navigate({ page: "signin" }); }}
              className="w-full flex items-center justify-between transition-all duration-200"
              style={{
                background: "#1e1e2e",
                border: "1px solid rgba(212,160,23,0.3)",
                borderRadius: 3,
                padding: "14px 20px",
                color: "#fff",
                fontFamily: mono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.1em",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#252540";
                e.currentTarget.style.borderColor = "#D4A017";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#1e1e2e";
                e.currentTarget.style.borderColor = "rgba(212,160,23,0.3)";
              }}
            >
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h2M9 10l3-3-3-3M12 7H5" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                SIGN IN
              </div>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 10L10 2M10 2H4M10 2v6" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>

            {/* Sign Up button */}
            <button
              onClick={() => { navigate({ page: "signup" }); }}
              className="w-full flex items-center justify-between transition-all duration-200"
              style={{
                background: "rgba(212,160,23,0.08)",
                border: "1px solid rgba(212,160,23,0.3)",
                borderRadius: 3,
                padding: "14px 20px",
                color: "#D4A017",
                fontFamily: mono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.1em",
                cursor: "pointer",
                marginTop: 8,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(212,160,23,0.15)";
                e.currentTarget.style.borderColor = "#D4A017";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(212,160,23,0.08)";
                e.currentTarget.style.borderColor = "rgba(212,160,23,0.3)";
              }}
            >
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1v12M1 7h12" stroke="#D4A017" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                SIGN UP
              </div>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 10L10 2M10 2H4M10 2v6" stroke="#D4A017" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* ─── GOLD DIVIDER ─── */}
      <div style={{
        height: 1,
        background: "linear-gradient(90deg, transparent, rgba(212,160,23,0.3), rgba(212,160,23,0.15), transparent)",
        margin: "0 80px",
      }} />

      {/* ─── GRID SECTION (Gold half) ─── */}
      <section
        className="lu-grid-section"
        style={{
          background: "linear-gradient(180deg, #0a0806 0%, #0d0a04 15%, #110d06 30%, #0f0b05 60%, #0a0806 100%)",
          position: "relative",
        }}
      >
        {/* Subtle gold ambient glow */}
        <div style={{
          position: "absolute",
          top: -80,
          left: "50%",
          transform: "translateX(-50%)",
          width: "60%",
          height: 300,
          background: "radial-gradient(ellipse, rgba(212,160,23,0.03) 0%, rgba(212,160,23,0.01) 40%, transparent 70%)",
          filter: "blur(50px)",
          pointerEvents: "none",
        }} />

        {/* Section header */}
        <div className="flex items-center justify-between mb-5" style={{ position: "relative", zIndex: 1 }}>
          <div className="flex items-center gap-3" style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.15em", color: "rgba(212,160,23,0.6)" }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#D4A017", boxShadow: "0 0 6px rgba(212,160,23,0.4)" }} />
            CONTENT GRID / {visibleCategories.length} CATEGORIES
          </div>
        </div>

        {/* ─── SIMPLE FILTER BAR ─── */}
        <div
          className="flex flex-wrap items-center gap-2 mb-8"
          style={{ position: "relative", zIndex: 1 }}
        >
          {categories.map((cat) => {
            const enabled = enabledCats.has(cat.abbr);
            return (
              <button
                key={cat.abbr}
                onClick={() => toggleCat(cat.abbr)}
                className="flex items-center gap-1.5 transition-all duration-150"
                style={{
                  fontFamily: mono,
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "6px 14px",
                  borderRadius: 4,
                  background: enabled ? "#0a0a0a" : "transparent",
                  border: `1px solid ${enabled ? "rgba(212,160,23,0.35)" : "rgba(255,255,255,0.08)"}`,
                  color: enabled ? "#D4A017" : "rgba(255,255,255,0.3)",
                  opacity: enabled ? 1 : 0.5,
                }}
              >
                <span style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: 2,
                  background: enabled ? cat.color : "rgba(255,255,255,0.15)",
                  transition: "background 0.15s",
                }} />
                {cat.title.toUpperCase()}
              </button>
            );
          })}
        </div>

        <div className="lu-category-grid" style={{ position: "relative", zIndex: 1 }}>
          {visibleCategories.map((cat) => {
            const active = isCardActive(cat.abbr);
            return (
              <div
                key={cat.num}
                className="lu-grid-card group"
                onClick={() => navigate({ page: cat.page })}
                role="button"
                tabIndex={0}
                style={{ "--card-glow-color": `${cat.color}30`, "--icon-glow-color": `${cat.color}50`, "--card-accent": cat.color } as React.CSSProperties}
                onMouseEnter={() => setHoveredCard(cat.abbr)}
                onMouseLeave={() => setHoveredCard(null)}
                onTouchStart={() => setTouchedCard(cat.abbr)}
                onTouchEnd={() => setTimeout(() => setTouchedCard(null), 600)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") navigate({ page: cat.page });
                }}
              >
                {/* ── GLOW: Top area gradient ── */}
                <div
                  className="absolute top-0 left-0 right-0 h-36 pointer-events-none transition-opacity duration-500"
                  style={{
                    opacity: active ? 0.8 : 0.08,
                    background: `linear-gradient(180deg, ${cat.color}20 0%, ${cat.color}08 40%, transparent 100%)`,
                  }}
                />

                {/* ── GLOW: Large radial orb at top ── */}
                <div
                  className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-20 rounded-full pointer-events-none transition-all duration-500"
                  style={{
                    opacity: active ? 0.7 : 0.05,
                    background: `radial-gradient(ellipse, ${cat.color}50 0%, ${cat.color}20 35%, transparent 70%)`,
                    filter: "blur(30px)",
                  }}
                />

                {/* ── GLOW: Side spill left ── */}
                <div
                  className="absolute top-8 -left-6 w-16 h-32 rounded-full pointer-events-none transition-all duration-500"
                  style={{
                    opacity: active ? 0.4 : 0,
                    background: `radial-gradient(ellipse, ${cat.color}25 0%, transparent 70%)`,
                    filter: "blur(35px)",
                  }}
                />

                {/* ── GLOW: Side spill right ── */}
                <div
                  className="absolute top-8 -right-6 w-16 h-32 rounded-full pointer-events-none transition-all duration-500"
                  style={{
                    opacity: active ? 0.4 : 0,
                    background: `radial-gradient(ellipse, ${cat.color}25 0%, transparent 70%)`,
                    filter: "blur(35px)",
                  }}
                />

                {/* ── GLOW: Bottom reflection ── */}
                <div
                  className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-36 h-16 rounded-full pointer-events-none transition-all duration-500"
                  style={{
                    opacity: active ? 0.3 : 0,
                    background: `radial-gradient(ellipse, ${cat.color}20 0%, transparent 70%)`,
                    filter: "blur(35px)",
                  }}
                />

                {/* ── Card border glow on hover/touch ── */}
                <div
                  className="absolute inset-0 pointer-events-none transition-opacity duration-500"
                  style={{
                    opacity: active ? 1 : 0,
                    boxShadow: `inset 0 0 30px ${cat.color}06, inset 0 1px 0 ${cat.color}20, inset 0 -1px 0 ${cat.color}10`,
                    borderRadius: 0,
                  }}
                />

                {/* ── Animated shine sweep on hover/touch ── */}
                <div
                  className="absolute inset-0 pointer-events-none overflow-hidden"
                  style={{
                    opacity: active ? 1 : 0,
                    transition: "opacity 0.4s",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "-20%",
                      left: "-100%",
                      width: "50%",
                      height: "140%",
                      background: `linear-gradient(105deg, transparent 30%, ${cat.color}05 45%, ${cat.color}0c 50%, ${cat.color}05 55%, transparent 70%)`,
                      animation: active ? "luCardShine 0.8s ease forwards" : "none",
                    }}
                  />
                </div>

                {/* Tag */}
                <div
                  className="absolute top-5 left-8 flex items-center gap-2"
                  style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.15em" }}
                >
                  <span style={{ color: cat.color, fontWeight: 700 }}>{cat.abbr}</span>
                  <span style={{ color: "rgba(255,255,255,0.15)" }}>— {cat.num}</span>
                </div>

                {/* Arrow */}
                <div
                  className="absolute top-[18px] right-7 transition-all duration-200 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  style={{ fontSize: 14, color: "rgba(255,255,255,0.15)" }}
                >
                  ↗
                </div>

                {/* Big number */}
                <div className="lu-big-num">{cat.num}</div>

                {/* Icon with enhanced glow */}
                <div className="relative">
                  <div
                    className="lu-card-icon-wrap"
                    style={{
                      background: active ? `${cat.color}22` : cat.iconBg,
                      border: `1px solid ${active ? `${cat.color}50` : cat.iconBorder}`,
                      boxShadow: active
                        ? `0 0 18px ${cat.color}35, 0 0 35px ${cat.color}12, 0 0 55px ${cat.color}05`
                        : "none",
                      transition: "all 0.4s ease",
                      transform: active ? "scale(1.1)" : "scale(1)",
                    }}
                  >
                    {cat.icon}
                  </div>
                </div>

                {/* Name */}
                <div style={{
                  fontFamily: serif,
                  fontSize: 22,
                  fontWeight: 700,
                  marginBottom: 8,
                  letterSpacing: "-0.01em",
                  color: "#fff",
                  textShadow: active ? `0 0 14px ${cat.color}20` : "none",
                  transition: "text-shadow 0.4s ease",
                }}>
                  {cat.title}
                </div>

                {/* Description */}
                <div style={{
                  fontFamily: mono,
                  fontSize: 10,
                  color: active ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.4)",
                  lineHeight: 1.7,
                  letterSpacing: "0.02em",
                  transition: "color 0.4s ease",
                }}>
                  {cat.desc}
                </div>

                {/* Corner */}
                <div className="absolute bottom-3.5 right-3.5" style={{ fontSize: 9, color: active ? cat.color : "rgba(255,255,255,0.15)", transition: "color 0.3s" }}>
                  ⌞
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
