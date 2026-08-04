"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "./store";
import CinematicBackdrop from "./cinematic-backdrop";

const FONT = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

/* ─── Scroll-triggered reveal ─── */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function SectionHeading({ eyebrow, title, sub, center }: { eyebrow: string; title: string; sub?: string; center?: boolean }) {
  return (
    <Reveal className={`flex flex-col gap-3 mb-10 ${center ? "items-center text-center mx-auto" : ""} max-w-2xl`}>
      <span className="ltv-cine-eyebrow text-xs font-bold uppercase">{eyebrow}</span>
      <h2 className="text-3xl sm:text-4xl font-black text-white leading-[1.1]" style={{ fontFamily: FONT }}>{title}</h2>
      {sub && <p className="text-[#a1a7b3] text-base leading-relaxed">{sub}</p>}
    </Reveal>
  );
}

/* ─── Content data ─── */
const quickSteps = [
  { step: 1, title: "Browse", desc: "Explore thousands of anime, movies, and TV shows across our entire catalog.", icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg> },
  { step: 2, title: "Select", desc: "Pick any title, check episodes, ratings, and synopsis — or resume right where you left off.", icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg> },
  { step: 3, title: "Watch", desc: "Stream in HD with sub, dub, or hardsub — zero ads, zero interruptions, totally free.", icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg> },
];

const howToWatch = [
  { title: "Search or browse", desc: "Hit / anywhere to open search, or browse by genre, trending, or schedule from the navbar.", icon: "🔍" },
  { title: "Pick sub, dub, or hardsub", desc: "Every episode shows which audio tracks are available before you press play.", icon: "🎧" },
  { title: "Choose a server", desc: "If one source is slow or down, switch servers instantly from the dropdown — no reload needed.", icon: "⚡" },
  { title: "Auto-next & auto-skip", desc: "Turn on Auto Next to binge hands-free, and Auto Skip to jump straight past intros.", icon: "⏭️" },
];

const accountFeatures = [
  { title: "Bookmarks", desc: "Save any title with one tap and build your personal watchlist.", icon: "🔖" },
  { title: "Watch history", desc: "Every episode you start is logged automatically, with progress.", icon: "🕓" },
  { title: "Custom profile", desc: "Pick a username, avatar color, and short bio.", icon: "🎭" },
  { title: "Comments", desc: "Discuss episodes with the community directly on each title's page.", icon: "💬" },
];

const shortcuts = [
  { key: "/", desc: "Open search" },
  { key: "N", desc: "Next episode" },
  { key: "P", desc: "Previous episode" },
  { key: "Space / K", desc: "Play / pause" },
  { key: "F", desc: "Fullscreen" },
  { key: "M", desc: "Mute / unmute" },
  { key: "?", desc: "Show shortcuts (on watch page)" },
  { key: "Esc", desc: "Close any modal" },
];

const tips = [
  "Turn Lights Off in the player for a cinema-dark viewing mode.",
  "Filter long-running shows (like One Piece) by episode range in the sidebar instead of scrolling.",
  "Spoiler-blur is on by default for episode thumbnails — click the eye icon to reveal them.",
  "Your history and bookmarks live in this browser — signing in from another device starts a separate list.",
  "If a stream 404s, hit Retry once before switching servers — most failures are momentary.",
];

const faqs = [
  { q: "Is Luffy TV really free?", a: "Yes — 100% free, no hidden fees, no credit card, no premium tier. Every feature on the platform is available to everyone.", category: "Getting Started" },
  { q: "Do I need an account to watch?", a: "No. Browsing and watching require nothing. Creating a free account just adds bookmarks, history, and comments.", category: "Getting Started" },
  { q: "What video quality is available?", a: "Streams go up to 1080p/4K depending on the source. The player can auto-adjust or you can pick quality manually.", category: "Playback" },
  { q: "Can I watch subbed and dubbed?", a: "Most titles offer both, plus hardsub where available. Switch anytime from the Audio dropdown on the watch page.", category: "Playback" },
  { q: "How do bookmarks work?", a: "Click the bookmark icon on any title to save it. Your list is stored in this browser and available under Bookmarks in the navbar.", category: "Features" },
  { q: "Does my history sync between devices?", a: "Not yet — history and bookmarks are saved per-browser (localStorage), so a different device or browser starts fresh.", category: "Features" },
  { q: "A server isn't working — what do I do?", a: "Hit Retry once, then try a different server from the dropdown. If every server fails, use the Report button to let us know.", category: "Support" },
];

/* ─── FAQ accordion (blue system) ─── */
function FaqItem({ q, a, isOpen, onClick }: { q: string; a: string; isOpen: boolean; onClick: () => void }) {
  return (
    <div className={`ltv-cine-surface rounded-xl overflow-hidden transition-colors ${isOpen ? "border-[#1E88FF]/40" : ""}`}>
      <button onClick={onClick} className="w-full flex items-center gap-4 px-5 py-4 text-left">
        <span className="text-[15px] font-semibold text-white flex-1">{q}</span>
        <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 ${isOpen ? "bg-[#1E88FF]/25 rotate-180" : "bg-white/[0.05]"}`}>
          <svg className={`w-3.5 h-3.5 ${isOpen ? "text-[#48A6FF]" : "text-white/40"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 9l-7 7-7-7" /></svg>
        </span>
      </button>
      <div className={`overflow-hidden transition-all duration-400 ease-in-out ${isOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="px-5 pb-4">
          <div className="ltv-cine-divider mb-3" />
          <p className="text-sm text-[#a1a7b3] leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function GuidePage() {
  const navigate = useAppStore(s => s.navigate);
  const openAuthModal = useAppStore(s => s.openAuthModal);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="ltv-cine-root w-full text-white overflow-x-hidden" style={{ fontFamily: "var(--font-inter), Inter, sans-serif" }}>
      <CinematicBackdrop particleCount={22} />

      {/* ═══ HERO ═══ */}
      <section className="relative z-10 pt-28 pb-16 px-6 lg:px-10 text-center">
        <motion.span
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="ltv-cine-eyebrow inline-block text-xs font-bold uppercase px-3 py-1.5 rounded-full border border-[#1E88FF]/25 bg-[#1E88FF]/[0.06] mb-6"
        >
          Guide
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="ltv-cine-gradient-text text-4xl sm:text-6xl font-black leading-[1.05] max-w-3xl mx-auto"
          style={{ fontFamily: FONT }}
        >
          Everything you need to know
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.25 }}
          className="text-[#c4c9d2] text-base sm:text-lg max-w-xl mx-auto mt-5 leading-relaxed"
        >
          From your first episode to keyboard shortcuts you didn't know existed —
          this is the complete walkthrough of Luffy TV.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.4 }}
          className="flex items-center gap-2 flex-wrap justify-center mt-8"
        >
          {["Getting Started", "How to Watch", "Shortcuts", "FAQ"].map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/\s+/g, "-")}`} className="ltv-cine-btn-secondary px-4 py-2 rounded-full text-xs font-bold">
              {l}
            </a>
          ))}
        </motion.div>
      </section>

      {/* ═══ GETTING STARTED — timeline ═══ */}
      <section id="getting-started" className="relative z-10 py-14 px-6 lg:px-10">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow="Getting Started" title="Three steps. That's it." center />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 relative">
            <div className="ltv-cine-divider absolute left-0 right-0 top-[38px] hidden sm:block" />
            {quickSteps.map((s, i) => (
              <Reveal key={s.step} delay={i * 0.12}>
                <div className="ltv-cine-surface rounded-2xl p-6 h-full relative">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0" style={{ background: "linear-gradient(135deg,#1E88FF,#48A6FF)", color: "#fff" }}>{s.step}</span>
                    <span style={{ color: "#48A6FF" }}>{s.icon}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1.5">{s.title}</h3>
                  <p className="text-sm text-[#a1a7b3] leading-relaxed">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.3} className="text-center mt-9">
            <button onClick={() => navigate({ page: "hub" })} className="ltv-cine-btn-primary inline-flex items-center gap-2 px-8 py-3.5 rounded-full font-bold text-sm">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              Start Watching Now
            </button>
          </Reveal>
        </div>
      </section>

      {/* ═══ HOW TO WATCH ═══ */}
      <section id="how-to-watch" className="relative z-10 py-14 px-6 lg:px-10">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow="How to Watch" title="From search to sub/dub to full screen" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {howToWatch.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.08}>
                <div className="ltv-cine-surface rounded-2xl p-6 h-full flex gap-4">
                  <span className="text-2xl shrink-0">{f.icon}</span>
                  <div>
                    <h3 className="font-bold text-white mb-1">{f.title}</h3>
                    <p className="text-sm text-[#a1a7b3] leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SEARCH + CONTINUE WATCHING GUIDES ═══ */}
      <section className="relative z-10 py-14 px-6 lg:px-10">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5">
          <Reveal>
            <div className="ltv-cine-surface rounded-2xl p-7 h-full">
              <span className="ltv-cine-eyebrow text-xs font-bold uppercase">Search Guide</span>
              <h3 className="text-xl font-black text-white mt-2 mb-3">Find anything in seconds</h3>
              <p className="text-sm text-[#a1a7b3] leading-relaxed mb-4">
                Press <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/10 text-white font-mono text-xs">/</kbd> from
                anywhere in the app, or click Search in the navbar. Results update as you type — titles, genres, and
                studios all match.
              </p>
              <button onClick={() => navigate({ page: "search" })} className="ltv-cine-btn-secondary px-5 py-2.5 rounded-full text-xs font-bold">
                Try Search
              </button>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="ltv-cine-surface rounded-2xl p-7 h-full">
              <span className="ltv-cine-eyebrow text-xs font-bold uppercase">Continue Watching</span>
              <h3 className="text-xl font-black text-white mt-2 mb-3">Pick up instantly</h3>
              <p className="text-sm text-[#a1a7b3] leading-relaxed mb-4">
                Every episode you start gets logged to History automatically, with your last position. Bookmark a
                title to keep it pinned even before you've started it.
              </p>
              <button onClick={() => navigate({ page: "history" })} className="ltv-cine-btn-secondary px-5 py-2.5 rounded-full text-xs font-bold">
                View History
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ KEYBOARD SHORTCUTS ═══ */}
      <section id="shortcuts" className="relative z-10 py-14 px-6 lg:px-10">
        <div className="max-w-4xl mx-auto">
          <SectionHeading eyebrow="Move Faster" title="Keyboard shortcuts" center />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {shortcuts.map((s, i) => (
              <Reveal key={s.key} delay={i * 0.05}>
                <div className="ltv-cine-surface rounded-xl px-4 py-4 flex flex-col items-center gap-2 text-center h-full">
                  <kbd className="px-2.5 py-1 rounded-md bg-white/10 border border-[#1E88FF]/25 text-white font-mono text-xs font-bold">{s.key}</kbd>
                  <span className="text-[11px] text-[#a1a7b3] leading-snug">{s.desc}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ACCOUNT FEATURES ═══ */}
      <section className="relative z-10 py-14 px-6 lg:px-10">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow="Free Account" title="A free account unlocks a bit more" sub="Your progress is saved in this browser either way — an account just makes it visible and gives you a profile." />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {accountFeatures.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.08}>
                <div className="ltv-cine-surface rounded-2xl p-5 h-full text-center flex flex-col items-center gap-2">
                  <span className="text-2xl">{f.icon}</span>
                  <h3 className="font-bold text-white text-sm">{f.title}</h3>
                  <p className="text-[11px] text-[#a1a7b3] leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.3} className="text-center mt-8">
            <button onClick={() => openAuthModal("signup")} className="ltv-cine-btn-primary inline-flex items-center gap-2 px-7 py-3 rounded-full font-bold text-sm">
              Create Free Account
            </button>
          </Reveal>
        </div>
      </section>

      {/* ═══ TIPS & TRICKS ═══ */}
      <section className="relative z-10 py-14 px-6 lg:px-10">
        <div className="max-w-3xl mx-auto">
          <SectionHeading eyebrow="Pro Tips" title="Tips & tricks" />
          <div className="flex flex-col gap-3">
            {tips.map((t, i) => (
              <Reveal key={t} delay={i * 0.06}>
                <div className="flex items-start gap-3 ltv-cine-surface rounded-xl px-5 py-4">
                  <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black mt-0.5" style={{ background: "rgba(30,136,255,0.15)", color: "#48A6FF" }}>{i + 1}</span>
                  <p className="text-sm text-[#e8eaee] leading-relaxed">{t}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="relative z-10 py-14 px-6 lg:px-10">
        <div className="max-w-3xl mx-auto">
          <SectionHeading eyebrow="Still Curious" title="Frequently asked questions" />
          <div className="flex flex-col gap-3">
            {faqs.map((f, i) => (
              <FaqItem key={f.q} q={f.q} a={f.a} isOpen={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ STILL NEED HELP ═══ */}
      <section className="relative z-10 py-16 px-6 lg:px-10">
        <Reveal className="max-w-3xl mx-auto">
          <div className="ltv-cine-surface rounded-3xl p-10 text-center flex flex-col items-center gap-4 relative overflow-hidden">
            <div className="ltv-cine-glow-orb w-[260px] h-[260px] left-1/2 -translate-x-1/2 -top-20" style={{ background: "rgba(30,136,255,0.12)" }} />
            <h2 className="text-2xl sm:text-3xl font-black relative" style={{ fontFamily: FONT }}>Still need help?</h2>
            <p className="text-[#a1a7b3] max-w-sm relative">Can't find what you're looking for? Reach out and we'll get back to you.</p>
            <div className="flex items-center gap-3 flex-wrap justify-center relative">
              <button onClick={() => navigate({ page: "contact" })} className="ltv-cine-btn-primary px-6 py-3 rounded-full font-bold text-sm">Contact Us</button>
              <button onClick={() => navigate({ page: "home" })} className="ltv-cine-btn-secondary px-6 py-3 rounded-full font-bold text-sm">Back to Browsing</button>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
