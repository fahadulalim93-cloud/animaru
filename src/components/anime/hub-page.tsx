"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "./store";

const GROTESK = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

interface Channel {
  id: string;
  ch: string;
  title: string;
  tagline: string;
  desc: string;
  stats: string[];
  accent: string;
  live?: boolean;
  go: () => void;
}

export default function HubPage() {
  const navigate = useAppStore(s => s.navigate);
  const user = useAppStore(s => s.user);
  const openAuthModal = useAppStore(s => s.openAuthModal);
  const history = useAppStore(s => s.history);

  const channels: Channel[] = useMemo(() => [
    {
      id: "anime", ch: "01", title: "Anime", tagline: "The main event.",
      desc: "Thousands of series in sub, dub and hardsub — simulcasts land the same day they air in Japan. Trending banners, seasonal charts and a watch room built for binging.",
      stats: ["10,000+ episodes", "Sub · Dub", "Same-day simulcast"],
      accent: "#48A6FF",
      go: () => navigate({ page: "home" }),
    },
    {
      id: "manga", ch: "02", title: "Manga", tagline: "Read between the episodes.",
      desc: "Chapters in a clean, distraction-free reader. Follow the source material ahead of the anime.",
      stats: ["Clean reader", "Latest chapters", "Zero clutter"],
      accent: "#F472B6",
      go: () => navigate({ page: "manga" }),
    },
    {
      id: "novel", ch: "03", title: "Light Novels", tagline: "The story before the story.",
      desc: "Original light novels, chapter by chapter, typeset for long comfortable reading sessions.",
      stats: ["Chapter reader", "Comfort typeset", "Full volumes"],
      accent: "#A3B3CC",
      go: () => navigate({ page: "novel" }),
    },
  ], [navigate]);

  const [selected, setSelected] = useState(0);
  const sel = channels[selected];

  // Time-aware greeting + ticking clock (set in effect to avoid hydration mismatch)
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // First tick lands on the next macrotask so hydration finishes with the
    // server-rendered (clock-less) markup before the clock appears.
    const first = setTimeout(() => setNow(new Date()), 0);
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  const hour = now?.getHours() ?? 20;
  const greeting = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const clock = now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const dateStr = now ? now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) : "";

  // Keyboard: arrows tune channels, Enter opens
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => (s + 1) % channels.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => (s - 1 + channels.length) % channels.length); }
      else if (e.key === "Enter") channels[selected]?.go();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [channels, selected]);

  const resume = history.slice(0, 3);

  return (
    <div className="ltv-hub-root">
      {/* Top bar */}
      <header className="ltv-hub-top">
        <button className="ltv-hub-logo" onClick={() => navigate({ page: "home" })} style={{ fontFamily: GROTESK }}>
          Luffy<span>TV</span>
        </button>
        <div className="ltv-hub-top-right">
          {clock && <span className="ltv-hub-clock">{clock}</span>}
          {user ? (
            <span className="ltv-hub-user-chip">@{user.username}</span>
          ) : (
            <button className="ltv-hub-signin" onClick={() => openAuthModal("signin")}>Sign In</button>
          )}
        </div>
      </header>

      <main className="ltv-hub-main">
        {/* Greeting */}
        <div className="ltv-hub-greet">
          <span className="ltv-hub-eyebrow">{dateStr || "Tonight"} · Tonight&apos;s lineup</span>
          <h1 style={{ fontFamily: GROTESK }}>
            {greeting}{user ? `, ${user.name.split(" ")[0]}` : ""}.
            <br />
            <span className="ltv-hub-greet-dim">What are we tuning into?</span>
          </h1>
        </div>

        {/* Channel switcher: dial left, preview right */}
        <div className="ltv-hub-deck">
          <div className="ltv-hub-dial" role="listbox" aria-label="Sections">
            {channels.map((c, i) => (
              <button
                key={c.id}
                role="option"
                aria-selected={i === selected}
                className={`ltv-hub-row${i === selected ? " active" : ""}`}
                style={{ ["--ch-accent" as string]: c.accent }}
                onMouseEnter={() => setSelected(i)}
                onFocus={() => setSelected(i)}
                onClick={c.go}
              >
                <span className="ltv-hub-row-ch" style={{ fontFamily: GROTESK }}>CH {c.ch}</span>
                <span className="ltv-hub-row-title" style={{ fontFamily: GROTESK }}>
                  {c.title}
                  {c.live && <span className="ltv-hub-onair"><i />ON AIR</span>}
                </span>
                <span className="ltv-hub-row-arrow" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} width="16" height="16"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </span>
              </button>
            ))}
            <p className="ltv-hub-hint">Use ↑ ↓ to tune · Enter to watch</p>
          </div>

          {/* Preview panel — re-keyed so the tune-in sweep replays per channel */}
          <div className="ltv-hub-screen" key={sel.id} style={{ ["--ch-accent" as string]: sel.accent }}>
            <div className="ltv-hub-screen-sweep" aria-hidden />
            <span className="ltv-hub-screen-watermark" aria-hidden style={{ fontFamily: GROTESK }}>{sel.ch}</span>
            <div className="ltv-hub-screen-head">
              <span className="ltv-hub-signal"><i /><i /><i /> SIGNAL LOCKED</span>
              <span className="ltv-hub-screen-ch" style={{ fontFamily: GROTESK }}>CH {sel.ch}</span>
            </div>
            <div className="ltv-hub-screen-body">
              <h2 style={{ fontFamily: GROTESK }}>{sel.title}</h2>
              <p className="ltv-hub-screen-tag">{sel.tagline}</p>
              <p className="ltv-hub-screen-desc">{sel.desc}</p>
              <div className="ltv-hub-screen-stats">
                {sel.stats.map(s => <span key={s}>{s}</span>)}
              </div>
              <button className="ltv-hub-enter" onClick={sel.go} style={{ fontFamily: GROTESK }}>
                <span className="ltv-hub-enter-stub">ADMIT<br />ONE</span>
                <span className="ltv-hub-enter-label">
                  Enter {sel.title}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} width="15" height="15"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Jump back in */}
        {resume.length > 0 && (
          <section className="ltv-hub-resume">
            <span className="ltv-hub-eyebrow">Jump back in</span>
            <div className="ltv-hub-resume-row">
              {resume.map(h => (
                <button
                  key={h.id}
                  className="ltv-hub-resume-card"
                  onClick={() => navigate({ page: "anime", id: h.animeId })}
                >
                  {h.thumbnail ? (
                    <img src={h.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <span className="ltv-hub-resume-ph" aria-hidden />
                  )}
                  <span className="ltv-hub-resume-info">
                    <strong>{h.animeName}</strong>
                    <em>Episode {h.episodeNum}</em>
                    <i style={{ width: `${h.duration ? Math.min(100, Math.round((h.progress / h.duration) * 100)) : 0}%` }} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Quick links */}
        <footer className="ltv-hub-quick">
          <button onClick={() => navigate({ page: "guide" })}>Guide</button>
          <button onClick={() => navigate({ page: "contact" })}>Contact</button>
          <button onClick={() => navigate({ page: "bookmarks" })}>Bookmarks</button>
          <button onClick={() => navigate({ page: "history" })}>History</button>
          <a href="https://discord.gg/GEVes3uhtM" target="_blank" rel="noopener noreferrer">Discord</a>
        </footer>
      </main>
    </div>
  );
}
