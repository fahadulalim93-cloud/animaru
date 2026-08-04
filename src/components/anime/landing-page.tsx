"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { useAppStore } from "./store";
import { proxifyMangaImage } from "@/lib/proxy";
import { useCountUp } from "@/hooks/use-count-up";
import { getAniListAuthUrl, isAniListConfigured } from "@/lib/anilist-auth";

/**
 * LandingPage — "The Zoetrope"
 *
 * You land inside a slowly rotating 3D ring of real covers — a carousel
 * you're standing in the middle of — with the headline floating at its
 * center. Below, three tall "doors" (one per world) swing open in 3D on
 * hover, an inline stat line counts up, and a final CTA stops the spin.
 * The ring pauses when hovered, like reaching out and touching it.
 */

const FONT = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const ANIME = "#48A6FF";
const MANGA = "#F472B6";
const NOVEL = "#34D399";

interface AnimeItem {
  id: number;
  title: { english?: string; romaji?: string };
  coverImage?: { extraLarge?: string; large?: string };
  bannerImage?: string;
}
interface MangaItem {
  id: string;
  title: string;
  poster?: string;
  posterMedium?: string;
  posterSmall?: string;
  cover?: string;
}
const aCover = (a: AnimeItem) => a.coverImage?.extraLarge || a.coverImage?.large || "";
const mCover = (m: MangaItem) => proxifyMangaImage(m.posterMedium || m.poster || m.posterSmall || m.cover || "");

const RING_SIZE = 14;

function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

function Planet({ value, suffix, label, color, moonDur }: { value: number; suffix: string; label: string; color: string; moonDur: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const n = useCountUp(value, 1700, inView);
  return (
    <div ref={ref} className="relative flex flex-col items-center">
      <div
        className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full flex items-center justify-center"
        style={{
          background: `radial-gradient(circle at 34% 28%, ${color}3d, #070a12 72%)`,
          boxShadow: `0 0 50px ${color}26, inset 0 0 34px ${color}1f`,
          border: `1px solid ${color}55`,
        }}
      >
        <span className="font-black text-2xl sm:text-4xl tabular-nums" style={{ fontFamily: FONT, color }}>{n.toLocaleString()}{suffix}</span>
        {/* orbiting moon */}
        <span className="ltv-orbit absolute inset-0 rounded-full" style={{ ["--odur" as string]: moonDur }} aria-hidden>
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        </span>
      </div>
      <span className="text-white/45 text-[10px] sm:text-xs uppercase tracking-[0.25em] mt-4">{label}</span>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useAppStore(s => s.navigate);
  const openAuthModal = useAppStore(s => s.openAuthModal);
  const [ringCovers, setRingCovers] = useState<string[]>([]);
  const [animeCovers, setAnimeCovers] = useState<string[]>([]);
  const [mangaCovers, setMangaCovers] = useState<string[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const anilistUser = useAppStore(s => s.anilistUser);
  const anilistEntries = useAppStore(s => s.anilistEntries);
  const clearAnilistAuth = useAppStore(s => s.clearAnilistAuth);
  const anilistReady = isAniListConfigured();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const anime: string[] = [];
      const manga: string[] = [];
      try {
        const res = await fetch("/api/anime/anilist-trending?section=trending");
        if (res.ok) {
          const data = await res.json();
          const list: AnimeItem[] = (data.trending || data.all || data.media || []).filter((a: AnimeItem) => a?.id);
          for (const a of list) { const c = aCover(a); if (c) anime.push(c); }
        }
      } catch { /* ring renders with what loaded */ }
      try {
        const res = await fetch("/api/manga/home");
        if (res.ok) {
          const data = await res.json();
          const sections: { items?: MangaItem[] }[] = data.sections || [];
          for (const s of sections) for (const it of s.items || []) { const c = it?.id ? mCover(it) : ""; if (c) manga.push(c); }
        }
      } catch { /* ring renders with what loaded */ }
      if (cancelled) return;
      const mixed: string[] = [];
      for (let i = 0; i < RING_SIZE; i++) {
        const src = i % 2 === 0 ? anime[Math.floor(i / 2)] : manga[Math.floor(i / 2)];
        mixed.push(src || anime[i] || manga[i] || "");
      }
      setRingCovers(mixed);
      setAnimeCovers(anime.slice(0, 3));
      setMangaCovers(manga.slice(0, 3));
    })();
    return () => { cancelled = true; };
  }, []);

  const navLinks = [
    { label: "Anime", onClick: () => navigate({ page: "home" }) },
    { label: "Manga", onClick: () => navigate({ page: "manga" }) },
    { label: "Novels", onClick: () => navigate({ page: "novel" }) },
    { label: "Contact", onClick: () => navigate({ page: "contact" }) },
  ];

  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setPortalReady(true), 0); return () => clearTimeout(t); }, []);

  const chrome = (
    <>
      <button className="ltv-nav-logo" onClick={() => navigate({ page: "landing" })} aria-label="LuffyTV">
        <img src="/logo.svg" alt="LuffyTV" className="ltv-nav-logo-img" />
      </button>
      <nav className="ltv-nav-pill">
        <div className="ltv-nav-links">
          {navLinks.map(l => <button key={l.label} className="ltv-nav-link" onClick={l.onClick}>{l.label}</button>)}
        </div>
      </nav>
      <div className="ltv-nav-right-icons">
        <button className="ltv-nav-icon-btn" onClick={() => openAuthModal("signin")} aria-label="Sign in" title="Sign in">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <path d="M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
          </svg>
        </button>
        <button onClick={() => navigate({ page: "hub" })} className="ltv-cine-btn-primary h-[38px] px-4 rounded-full text-xs font-bold whitespace-nowrap">Enter</button>
      </div>
    </>
  );

  const novelSpines = ["#0c3d2c", "#14664a", "#0a2e22"];
  const doors = [
    { title: "Anime", color: ANIME, desc: "12,000+ series in HD. Subbed, dubbed, airing now.", meta: "New episodes daily", page: "home" as const, covers: animeCovers },
    { title: "Manga", color: MANGA, desc: "70,000+ titles. New chapters every single day.", meta: "Fresh chapters hourly", page: "manga" as const, covers: mangaCovers },
    { title: "Novels", color: NOVEL, desc: "The source material, in a reader made for it.", meta: "Built for long nights", page: "novel" as const, covers: [] as string[] },
  ];

  // Cursor-tracked 3D tilt for the door cards.
  const tiltMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${(px * 9).toFixed(2)}deg) rotateX(${(-py * 7).toFixed(2)}deg) translateZ(6px)`;
  };
  const tiltReset = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = ""; };

  const ICONS = {
    library: "M4 19V6a1 1 0 0 1 1-1h3v15H5a1 1 0 0 1-1-1zM10 5h4v15h-4zM16 6.5l3.2-1 3 14-3.2 1z",
    layers: "M12 3 2 8l10 5 10-5-10-5zM2 16l10 5 10-5M2 12l10 5 10-5",
    device: "M5 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM19 8h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1M8 19h3",
    palette: "M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-.9.7-1.5 1.5-1.5H16a4 4 0 0 0 4-4c0-4.4-3.6-8-8-8zM7 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM9 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM14 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    sync: "M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0 0 14.9 3M19.5 9A8 8 0 0 0 4.6 6",
    chat: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H12l-5 2 1-4.5A8.5 8.5 0 1 1 21 11.5z",
    plus: "M12 5v14M5 12h14",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
    bookmark: "M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z",
    history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l4 2",
    compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 9l-2 6-6 2 2-6 6-2z",
    userPlus: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
    play2: "M8 5v14l11-7L8 5z",
    mail: "M4 4h16v16H4V4zM22 6l-10 7L2 6",
  };

  const features = [
    { icon: ICONS.library, title: "One library, three formats", desc: "Anime, manga and novels live in the same account — no juggling separate sites or apps." },
    { icon: ICONS.layers, title: "Pick up anywhere", desc: "Your last episode, chapter and page are saved automatically and follow you across devices." },
    { icon: ICONS.device, title: "Every screen", desc: "Phone, tablet or desktop — the player and reader adapt without losing your place." },
    { icon: ICONS.palette, title: "A profile that's yours", desc: "Custom accent color, banner and tagline, plus a favorites shelf for what you're into." },
    { icon: ICONS.sync, title: "Real AniList linking", desc: "Connect your AniList account and see what you're currently watching, live, on your profile." },
    { icon: ICONS.chat, title: "Comment as you watch", desc: "Episode discussion sits right where you're already looking — no tab switching." },
  ];

  const steps = [
    { n: "01", title: "Search or browse", desc: "Look up a title, or explore anime, manga and novels by genre and trend.", icon: ICONS.search },
    { n: "02", title: "Press play or read", desc: "No sign-up wall — start watching or reading immediately as a guest.", icon: ICONS.play2 },
    { n: "03", title: "Come back anytime", desc: "Make an account to save progress, link AniList, and build a profile.", icon: ICONS.userPlus },
  ];

  const resources = [
    { label: "Anime Home", icon: ICONS.play2, color: ANIME, page: "home" as const },
    { label: "Manga Library", icon: ICONS.library, color: MANGA, page: "manga" as const },
    { label: "Novels", icon: ICONS.layers, color: NOVEL, page: "novel" as const },
    { label: "Search", icon: ICONS.search, color: ANIME, page: "search" as const },
    { label: "Bookmarks", icon: ICONS.bookmark, color: MANGA, page: "bookmarks" as const },
    { label: "Watch History", icon: ICONS.history, color: NOVEL, page: "history" as const },
    { label: "Guide", icon: ICONS.compass, color: ANIME, page: "guide" as const },
    { label: "Contact Us", icon: ICONS.mail, color: MANGA, page: "contact" as const },
  ];

  const faqs = [
    { q: "Is LuffyTV really free?", a: "Yes — every episode, chapter and novel is free with no subscription, no paywalled chapters, and no premium tier." },
    { q: "Do I need an account to start?", a: "No. Browsing, watching and reading all work as a guest. Creating an account just adds saved progress and a customizable profile." },
    { q: "Can I connect my AniList account?", a: "Yes — link your AniList account from your profile and LuffyTV pulls in what you're currently watching. MyAnimeList linking isn't available yet." },
    { q: "Does LuffyTV host the video or manga files?", a: "No. Content is sourced from third-party providers — LuffyTV is a player and reader shell, not a host." },
    { q: "How often is new content added?", a: "Anime episodes and manga chapters are pulled in as they release; novels update as new chapters go up on their sources." },
    { q: "Can I read manga and novels on mobile?", a: "Yes — the reader and player are both fully responsive and work the same way on phone, tablet or desktop." },
    { q: "What happens to my watch history if I don't have an account?", a: "It stays saved locally in your browser. Creating an account lets that history follow you across devices instead." },
  ];

  return (
    <div className="w-full text-white bg-[#04060c] overflow-x-clip" style={{ fontFamily: "var(--font-inter), Inter, sans-serif" }}>
      {portalReady ? createPortal(chrome, document.body) : chrome}

      {/* ═══ HERO — inside the zoetrope ═══ */}
      <section className="relative w-full min-h-[100svh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(55% 50% at 50% 45%, rgba(72,166,255,0.08), transparent 65%), #04060c" }} />

        {/* Rotating ring */}
        <div className="ltv-ring-stage absolute inset-0 flex items-center justify-center scale-[0.52] sm:scale-75 lg:scale-100" aria-hidden>
          <div className="ltv-ring relative w-0 h-0">
            {Array.from({ length: RING_SIZE }, (_, i) => {
              const src = ringCovers[i] || "";
              return (
                <div
                  key={i}
                  className="absolute rounded-xl overflow-hidden bg-white/[0.04]"
                  style={{
                    width: 190,
                    height: 285,
                    left: -95,
                    top: -142,
                    transform: `rotateY(${(360 / RING_SIZE) * i}deg) translateZ(520px)`,
                    backfaceVisibility: "hidden",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
                  }}
                >
                  {src && <img src={src} alt="" className="w-full h-full object-cover" style={{ filter: "brightness(0.62)" }} loading={i < 6 ? "eager" : "lazy"} />}
                  <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 55%, rgba(4,6,12,0.75))" }} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Depth fog so far side of the ring recedes */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(62% 58% at 50% 46%, rgba(4,6,12,0.88) 0%, rgba(4,6,12,0.35) 46%, transparent 72%)" }} aria-hidden />
        <div className="absolute inset-x-0 top-0 h-32 pointer-events-none" style={{ background: "linear-gradient(180deg, #04060c, transparent)" }} aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-40 pointer-events-none" style={{ background: "linear-gradient(0deg, #04060c, transparent)" }} aria-hidden />

        {/* Center copy */}
        <div className="relative z-10 text-center px-6 max-w-3xl">
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.8 }} className="text-[11px] font-bold uppercase tracking-[0.45em] text-white/50 mb-6">
            Luffy TV
          </motion.p>
          <div className="overflow-hidden">
            <motion.h1 initial={{ y: "105%" }} animate={{ y: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} className="font-black leading-[0.96] text-5xl sm:text-7xl" style={{ fontFamily: FONT }}>
              12,000 WORLDS
            </motion.h1>
          </div>
          <div className="overflow-hidden">
            <motion.h1 initial={{ y: "105%" }} animate={{ y: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.3 }} className="font-black leading-[0.96] text-5xl sm:text-7xl" style={{ fontFamily: FONT, color: ANIME, textShadow: `0 0 50px ${ANIME}55` }}>
              ORBIT HERE.
            </motion.h1>
          </div>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.7 }} className="text-white/55 text-sm sm:text-lg mt-6 max-w-md mx-auto">
            Anime, manga and novels circling one free library. Reach out and stop one.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.7 }} className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-9">
            <button onClick={() => navigate({ page: "hub" })} className="ltv-cine-btn-primary px-8 py-3.5 rounded-full font-bold text-sm w-full sm:w-auto">
              Step inside
            </button>
            <button onClick={() => navigate({ page: "search" })} className="px-8 py-3.5 rounded-full font-bold text-sm w-full sm:w-auto border border-white/15 hover:border-white/35 hover:bg-white/5 transition-colors">
              Search a title
            </button>
          </motion.div>
        </div>
      </section>

      {/* ═══ DOORS — fanned cover stacks with cursor tilt ═══ */}
      <section className="relative px-6 lg:px-16 py-20 sm:py-28">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-16">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 mb-4">Pick a door</p>
            <h2 className="font-black leading-[1.05] text-3xl sm:text-5xl" style={{ fontFamily: FONT }}>Three ways in.</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {doors.map((d, i) => (
              <motion.div key={d.title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.65, delay: i * 0.1 }}>
                <button
                  onClick={() => navigate({ page: d.page })}
                  onMouseMove={tiltMove}
                  onMouseLeave={tiltReset}
                  className="group relative block w-full rounded-2xl overflow-hidden border border-white/[0.08] text-left bg-white/[0.015] hover:border-white/[0.18]"
                  style={{ transition: "transform 0.18s ease-out, border-color 0.4s ease" }}
                >
                  {/* ambient wash */}
                  <div className="absolute inset-0 opacity-60 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(85% 60% at 50% 0%, ${d.color}1f, transparent 65%)` }} aria-hidden />

                  {/* fanned cover stack */}
                  <div className="relative h-60 sm:h-64 flex items-end justify-center pb-2 pointer-events-none">
                    {(d.covers.length ? d.covers : novelSpines).slice(0, 3).map((c, ci) => {
                      const mid = ci === 1;
                      const left = ci === 0;
                      return (
                        <div
                          key={ci}
                          className={`absolute bottom-4 w-[124px] sm:w-[136px] aspect-[2/3] rounded-lg overflow-hidden transition-transform duration-500 ${
                            mid
                              ? "z-20 group-hover:-translate-y-3"
                              : left
                                ? "z-10 -rotate-[11deg] -translate-x-[74px] translate-y-3 group-hover:-rotate-[15deg] group-hover:-translate-x-[92px]"
                                : "z-10 rotate-[11deg] translate-x-[74px] translate-y-3 group-hover:rotate-[15deg] group-hover:translate-x-[92px]"
                          }`}
                          style={{ boxShadow: "0 18px 40px rgba(0,0,0,0.55)" }}
                        >
                          {d.covers.length ? (
                            <img src={c} alt="" className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-end p-3" style={{ background: `linear-gradient(160deg, ${c}, #04060c 130%)` }}>
                              <span className="text-white/25 font-black text-lg leading-none" style={{ fontFamily: FONT }}>{["VOL.1", "VOL.2", "VOL.3"][ci]}</span>
                            </div>
                          )}
                          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 60%, rgba(4,6,12,0.55))" }} />
                        </div>
                      );
                    })}
                  </div>

                  <div className="relative z-10 px-7 pb-7 pt-2 text-center">
                    <span className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: d.color }}>{`0${i + 1} — ${d.meta}`}</span>
                    <h3 className="font-black text-3xl mt-2 mb-2" style={{ fontFamily: FONT }}>{d.title}</h3>
                    <p className="text-white/55 text-sm leading-relaxed">{d.desc}</p>
                    <span className="inline-flex items-center gap-2 text-xs font-bold mt-5 opacity-60 group-hover:opacity-100 transition-opacity" style={{ color: d.color }}>
                      Open the door
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </span>
                  </div>

                  {/* bottom glow line */}
                  <div className="absolute bottom-0 inset-x-8 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `linear-gradient(90deg, transparent, ${d.color}, transparent)`, boxShadow: `0 0 18px 1px ${d.color}` }} aria-hidden />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ STAYS CONNECTED — real progress/profile system, honestly described ═══ */}
      <section className="relative border-t border-white/[0.06] px-6 lg:px-16 py-20 sm:py-24">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 mb-4">Everything stays connected</p>
          <h2 className="font-black leading-[1.1] text-3xl sm:text-5xl max-w-lg" style={{ fontFamily: FONT }}>
            One place for every <span style={{ color: ANIME }}>kind of story.</span>
          </h2>
          <p className="text-white/50 text-sm sm:text-base mt-4 max-w-lg">
            Jump between a weekly episode, a manga chapter, or a novel arc — without rebuilding your library each time.
          </p>

          <div className="grid lg:grid-cols-[1fr_1fr] gap-5 mt-10">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 flex flex-col justify-between">
              <div>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4" style={{ background: `${ANIME}1A`, color: ANIME }}><Icon path={ICONS.sync} size={17} /></div>
                <h3 className="font-bold text-base mb-1.5">Connect AniList</h3>
                <p className="text-white/45 text-xs leading-relaxed">Link your real AniList account to pull in what you&apos;re currently watching — right here on your profile.</p>
              </div>
              {anilistUser ? (
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-4 mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      {anilistUser.avatar ? (
                        <img src={anilistUser.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full" style={{ background: `${ANIME}33` }} />
                      )}
                      <span className="text-xs font-bold">{anilistUser.name}</span>
                    </div>
                    <span className="text-[11px] flex items-center gap-1" style={{ color: NOVEL }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: NOVEL }} /> Connected</span>
                  </div>
                  {anilistEntries.length > 0 ? (
                    <ul className="space-y-1.5">
                      {anilistEntries.slice(0, 3).map(e => (
                        <li key={e.mediaId} className="flex items-center justify-between text-[11px] text-white/55">
                          <span className="truncate pr-3">{e.title}</span>
                          <span className="shrink-0 text-white/35">Ep {e.progress}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-white/40">No titles currently watching on AniList.</p>
                  )}
                  <button onClick={clearAnilistAuth} className="text-[11px] font-bold text-white/40 hover:text-white/70 transition-colors mt-3">Disconnect</button>
                </div>
              ) : anilistReady ? (
                <a href={getAniListAuthUrl()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-black/30 hover:bg-black/45 transition-colors p-4 mt-6 text-xs font-bold" style={{ color: ANIME }}>
                  <Icon path={ICONS.sync} size={15} /> Connect your AniList account
                </a>
              ) : (
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-4 mt-6">
                  <p className="text-[11px] text-white/40">AniList connection coming soon.</p>
                </div>
              )}
            </div>

            <div className="grid grid-rows-2 gap-5">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${MANGA}1A`, color: MANGA }}><Icon path={ICONS.chat} size={18} /></div>
                <div>
                  <h3 className="font-bold text-sm mb-1">Episode Discussion</h3>
                  <p className="text-white/45 text-xs leading-relaxed">Comment on episodes right next to what you&apos;re watching.</p>
                </div>
              </div>
              <div className="rounded-2xl border border-white/[0.08] p-6 flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${ANIME}14, ${MANGA}14)` }}>
                <div className="w-10 h-10 rounded-full shrink-0" style={{ background: `linear-gradient(135deg, ${ANIME}, ${MANGA}, ${NOVEL})` }} />
                <div>
                  <h3 className="font-bold text-sm mb-1">A Profile With Character</h3>
                  <p className="text-white/45 text-xs leading-relaxed">Pick an accent color, banner and tagline, plus a favorites shelf.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES — what you actually get ═══ */}
      <section className="relative border-t border-white/[0.06] px-6 lg:px-16 py-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 mb-4">What you get</p>
          <h2 className="font-black leading-[1.1] text-3xl sm:text-5xl max-w-lg mb-12" style={{ fontFamily: FONT }}>
            Built to remove <span style={{ color: MANGA }}>friction.</span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: i * 0.07 }} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4" style={{ background: `${ANIME}1A`, color: ANIME }}>
                  <Icon path={f.icon} size={17} />
                </div>
                <h3 className="font-bold text-sm mb-1.5">{f.title}</h3>
                <p className="text-white/45 text-xs leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="relative border-t border-white/[0.06] px-6 lg:px-16 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 mb-4">How it works</p>
            <h2 className="font-black leading-[1.1] text-3xl sm:text-5xl" style={{ fontFamily: FONT }}>Three steps. That&apos;s it.</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-10">
            {steps.map((s, i) => (
              <motion.div key={s.n} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, delay: i * 0.12 }} className="text-center sm:text-left">
                <div className="flex items-center gap-3 justify-center sm:justify-start mb-4">
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${ANIME}1A`, color: ANIME }}><Icon path={s.icon} size={17} /></span>
                  <span className="text-4xl font-black text-white/10" style={{ fontFamily: FONT }}>{s.n}</span>
                </div>
                <h3 className="font-black text-lg mb-2" style={{ fontFamily: FONT }}>{s.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ RESOURCES — quick links to every real destination on the site ═══ */}
      <section className="relative border-t border-white/[0.06] px-6 lg:px-16 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-12">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 mb-4">Jump straight in</p>
            <h2 className="font-black leading-[1.1] text-3xl sm:text-5xl" style={{ fontFamily: FONT }}>Everything, one click away.</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {resources.map((r, i) => (
              <motion.button
                key={r.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.05 }}
                onClick={() => navigate({ page: r.page })}
                className="group flex flex-col items-center text-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:border-white/[0.18] hover:bg-white/[0.04] transition-colors p-5"
              >
                <span className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110" style={{ background: `${r.color}1A`, color: r.color }}>
                  <Icon path={r.icon} size={18} />
                </span>
                <span className="text-xs font-bold">{r.label}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="relative border-t border-white/[0.06] px-6 py-20">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 mb-4">Before you settle in</p>
          <h2 className="font-black leading-[1.1] text-3xl sm:text-4xl" style={{ fontFamily: FONT }}>A few useful answers.</h2>
        </div>
        <div className="max-w-2xl mx-auto space-y-3">
          {faqs.map((f, i) => (
            <div key={f.q} className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <span className="font-bold text-sm">{f.q}</span>
                <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 ml-4" style={{ background: `${ANIME}22`, color: ANIME, transform: openFaq === i ? "rotate(45deg)" : "none", transition: "transform 0.25s" }}>
                  <Icon path={ICONS.plus} size={13} />
                </span>
              </button>
              <AnimatePresence initial={false}>
                {openFaq === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                    <p className="text-white/50 text-xs leading-relaxed px-5 pb-4">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ ORBIT STATS — planets on a trajectory ═══ */}
      <section className="relative px-6 py-20 sm:py-24 overflow-hidden">
        <div className="text-center mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/40">The system at a glance</p>
        </div>
        <div className="relative max-w-4xl mx-auto">
          {/* orbit line */}
          <div className="absolute left-0 right-0 top-14 sm:top-[4.5rem] h-px -rotate-2" style={{ background: `linear-gradient(90deg, transparent, ${ANIME}55 20%, ${MANGA}55 50%, ${NOVEL}55 80%, transparent)` }} aria-hidden />
          <div className="relative flex flex-wrap items-start justify-center sm:justify-between gap-x-10 gap-y-12">
            <Planet value={12} suffix="k+" label="Anime series" color={ANIME} moonDur="9s" />
            <Planet value={70} suffix="k+" label="Manga titles" color={MANGA} moonDur="12s" />
            <Planet value={0} suffix="" label="Ads, ever" color={NOVEL} moonDur="15s" />
          </div>
        </div>
      </section>

      {/* ═══ CLOSING — satellites orbit the button ═══ */}
      <section className="relative text-center px-6 py-28 sm:py-36 overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(50% 55% at 50% 50%, rgba(72,166,255,0.10), transparent 70%)" }} aria-hidden />
        <div className="relative z-10 max-w-2xl mx-auto">
          <h2 className="font-black leading-[1.02] text-4xl sm:text-6xl" style={{ fontFamily: FONT }}>
            Stop the spin.<br /><span style={{ color: ANIME }}>Pick a world.</span>
          </h2>
          <p className="text-white/50 text-sm sm:text-base mt-5">Free forever. No ads. No account needed to press play.</p>
          <div className="relative inline-block mt-20">
            {/* orbit rings + satellites */}
            <span className="absolute -inset-9 rounded-full border border-white/[0.07]" aria-hidden />
            <span className="ltv-orbit absolute -inset-9 rounded-full" style={{ ["--odur" as string]: "10s" }} aria-hidden>
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full" style={{ background: ANIME, boxShadow: `0 0 10px ${ANIME}` }} />
            </span>
            <span className="absolute -inset-14 rounded-full border border-white/[0.05]" aria-hidden />
            <span className="ltv-orbit absolute -inset-14 rounded-full" style={{ ["--odur" as string]: "17s", animationDirection: "reverse" }} aria-hidden>
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full" style={{ background: MANGA, boxShadow: `0 0 8px ${MANGA}` }} />
            </span>
            <button onClick={() => navigate({ page: "hub" })} className="ltv-cine-btn-primary relative inline-flex items-center gap-2 px-9 py-4 rounded-full font-bold text-sm">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              Enter LuffyTV
            </button>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="relative border-t border-white/[0.06] px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <p className="text-white/40 text-xs">&copy; {new Date().getFullYear()} Luffy TV — fan-made, not affiliated with any studio.</p>
          <div className="flex items-center gap-6 text-xs text-white/45">
            <button onClick={() => navigate({ page: "home" })} className="hover:text-white transition-colors">Anime</button>
            <button onClick={() => navigate({ page: "manga" })} className="hover:text-white transition-colors">Manga</button>
            <button onClick={() => navigate({ page: "novel" })} className="hover:text-white transition-colors">Novels</button>
            <button onClick={() => navigate({ page: "contact" })} className="hover:text-white transition-colors">Contact</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
