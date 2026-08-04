"use client";

import { useState } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   UPDATES / CHANGELOG

   A vertical timeline of releases. Everything is driven by RELEASES below —
   add a new object at the top of the array to publish a new entry; nothing
   else needs touching.
   ═══════════════════════════════════════════════════════════════════════ */

const FONT = "var(--font-karla), Karla, sans-serif";

/** new = added, improved = existing thing made better, fixed = was broken. */
type ChangeKind = "new" | "improved" | "fixed";

type Change = { kind: ChangeKind; title: string; desc: string };
type Release = {
  version: string;
  date: string;
  /** Headline label shown next to the version. */
  label: string;
  /** Areas touched — rendered as small chips. */
  tags: string[];
  changes: Change[];
};

const KIND_META: Record<ChangeKind, { label: string; color: string; icon: React.ReactNode }> = {
  new: {
    label: "New",
    color: "#22c55e",
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
  },
  improved: {
    label: "Improved",
    color: "#f59e0b",
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M22 12h-4M6 12H2M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8M18.4 18.4l-2.8-2.8M8.4 8.4 5.6 5.6" /></svg>,
  },
  fixed: {
    label: "Fixed",
    color: "#60a5fa",
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.8 2.8 0 0 1-4-4z" /></svg>,
  },
};

/** ── RELEASE LOG — newest first ───────────────────────────────────── */
const RELEASES: Release[] = [
  {
    version: "v1.0.3",
    date: "July 27, 2026",
    label: "Support & Supporters",
    tags: ["Website", "Design"],
    changes: [
      { kind: "new", title: "Support page", desc: "A dedicated page explaining one-time, voluntary donations — what they cover, and exactly what they do and don't get you." },
      { kind: "new", title: "Supporter perks", desc: "Supporters receive a profile badge, an exclusive avatar frame, VIP highlighting and a matching Discord role." },
      { kind: "new", title: "Cost transparency", desc: "A breakdown of what it actually costs to keep the site online, shown so you can see where anything sent would go." },
      { kind: "new", title: "Support card in settings", desc: "A compact support card now sits above the settings navigation." },
    ],
  },
  {
    version: "v1.0.2",
    date: "July 27, 2026",
    label: "Profile & Settings rebuild",
    tags: ["Website", "Design", "Player"],
    changes: [
      { kind: "new", title: "Subtitle settings", desc: "Font, size, background opacity, position and sync delay — with a live preview. Previously only reachable from inside the player." },
      { kind: "new", title: "Keyboard shortcuts", desc: "Every player and site shortcut listed in one place instead of being hidden behind the player overlay." },
      { kind: "improved", title: "Settings redesign", desc: "Icon tiles on every row, clearer section headings, and a white-filled active state in the navigation." },
      { kind: "improved", title: "Profile header", desc: "Rebuilt level and stat display, monochrome styling, and pill-style tabs that are easier to read at a glance." },
      { kind: "fixed", title: "Page alignment", desc: "Removed the dead gap between the sidebar and page content caused by a centred layout container." },
    ],
  },
  {
    version: "v1.0.1",
    date: "July 26, 2026",
    label: "Playback & providers",
    tags: ["Player", "Providers"],
    changes: [
      { kind: "fixed", title: "Hindi dub restored", desc: "Hindi sources were trapped behind a request that took up to 105s and was being cancelled before it returned, so they never reached the player. They now load in about 2 seconds on their own route." },
      { kind: "fixed", title: "Correct season matching", desc: "Season detection counted specials, OVAs and movies as seasons, so some titles resolved to the wrong season. It now counts broadcast seasons only, and verifies the result." },
      { kind: "improved", title: "Faster server list", desc: "Sources are split into fast and slow groups fetched in parallel, so quick providers appear immediately instead of waiting on the slowest one." },
      { kind: "fixed", title: "Duplicate servers", desc: "Some providers returned the same server twice, which could drop entries from the list. Duplicates are now filtered on both ends." },
      { kind: "improved", title: "Dead providers removed", desc: "Retired two sources that were returning nothing, freeing capacity for the ones that work." },
    ],
  },
  {
    version: "v1.0.0",
    date: "July 26, 2026",
    label: "Manga, novels & discovery",
    tags: ["Website", "Design"],
    changes: [
      { kind: "new", title: "Novel section", desc: "Novels now have their own entry in the sidebar and use the same navigation as the rest of the site." },
      { kind: "new", title: "Genre spotlight", desc: "A wide banner rail on the anime home page featuring a different genre each day, using each show's own key art and logo." },
      { kind: "new", title: "End of chapter", desc: "Finishing a chapter now shows chapter info, previous/next navigation, sharing and comments without leaving the reader." },
      { kind: "new", title: "Save from anywhere", desc: "Manga cards have a save button that adds straight to your list, and a proper hover state." },
      { kind: "improved", title: "Distraction-free reading", desc: "Reader controls fade out as you scroll down and return when you scroll up. Desktop keeps them pinned." },
      { kind: "improved", title: "Faster manga pages", desc: "Home, metadata and banner requests are now cached, and the hero no longer waits on extra round trips before appearing." },
      { kind: "fixed", title: "Correct manga artwork", desc: "The manga hero was pulling artwork from the anime adaptation. It now uses the manga's own art." },
    ],
  },
];

const ALL_TAGS = Array.from(new Set(RELEASES.flatMap((r) => r.tags)));

export default function UpdatesPage() {
  const [filter, setFilter] = useState<string>("All");

  const shown = filter === "All" ? RELEASES : RELEASES.filter((r) => r.tags.includes(filter));
  const totalChanges = RELEASES.reduce((n, r) => n + r.changes.length, 0);

  return (
    <div className="w-full px-3 sm:px-4 lg:px-4 pb-16">

      {/* ── Hero ── */}
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.07] mt-3 px-5 sm:px-8 py-9 sm:py-12">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 80% 0%, rgba(255,255,255,0.10), transparent 55%)" }}
        />
        <div className="relative max-w-3xl">
          <h1 className="font-black text-3xl sm:text-5xl leading-[1.05]" style={{ fontFamily: FONT }}>Updates</h1>
          <p className="text-white/55 text-sm sm:text-base leading-relaxed mt-4">
            Everything new, improved and fixed on LuffyTV. Newest changes first.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-4 text-[13px] text-white/35">
            <span><strong className="text-white/70">{RELEASES.length}</strong> releases</span>
            <span><strong className="text-white/70">{totalChanges}</strong> changes</span>
            <span>Latest <strong className="text-white/70">{RELEASES[0].version}</strong></span>
          </div>
        </div>
      </section>

      {/* ── Filter ── */}
      <div className="flex items-center gap-1 mt-3 p-1 rounded-2xl border border-white/[0.07] bg-black/30 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {["All", ...ALL_TAGS].map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3.5 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors shrink-0 ${
              filter === t ? "bg-white text-[#08080c]" : "text-white/45 hover:text-white hover:bg-white/[0.06]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Timeline: vertical rail with a node per release. Date and version on
           one row, then change rows as [icon] [feature name] - [description],
           matching the reference layout. */}
      <div className="relative mt-8">
        {/* The rail. Hidden on mobile where entries stack without it. */}
        <div aria-hidden className="hidden md:block absolute left-[6px] top-3 bottom-3 w-px bg-white/[0.12]" />

        <div className="space-y-12">
          {shown.map((r, idx) => (
            <article key={r.version} className="relative md:pl-10">
              {/* Node on the rail */}
              <span
                aria-hidden
                className="hidden md:block absolute left-0 top-[7px] w-[13px] h-[13px] rounded-full bg-white ring-4 ring-[#08080c]"
              />

              {/* Date, version, label */}
              <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <time className="text-white/45 text-[15px] font-bold md:w-44 md:shrink-0">{r.date}</time>
                <span className="font-black text-xl tracking-tight tabular-nums" style={{ fontFamily: FONT }}>
                  {r.version}
                </span>
                <span className="rounded-lg bg-white/[0.07] border border-white/[0.08] px-2.5 py-1 text-[11px] font-bold text-white/70">
                  {r.label}
                </span>
                {idx === 0 && filter === "All" && (
                  <span className="rounded-lg bg-white text-[#08080c] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider">
                    Latest
                  </span>
                )}
              </header>

              {/* Area chips, indented to line up with the change list */}
              <div className="flex flex-wrap gap-1.5 mt-3 md:ml-48">
                {r.tags.map((t) => (
                  <span key={t} className="rounded-md bg-white/[0.06] border border-white/[0.08] px-2.5 py-1 text-[11px] font-bold text-white/55">
                    {t}
                  </span>
                ))}
              </div>

              {/* Change rows */}
              <div className="mt-5 md:ml-48 space-y-4">
                {r.changes.map((c) => {
                  const meta = KIND_META[c.kind];
                  return (
                    <div key={c.title} className="flex items-start gap-3">
                      <span className="shrink-0 mt-[3px]" style={{ color: meta.color }} title={meta.label}>
                        {meta.icon}
                      </span>
                      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start sm:gap-3">
                        <p className="font-bold text-[15px] leading-snug sm:w-44 sm:shrink-0">{c.title}</p>
                        <span aria-hidden className="hidden sm:block text-white/20 mt-[2px] shrink-0">&mdash;</span>
                        <p className="text-white/50 text-[15px] leading-relaxed mt-1 sm:mt-0 max-w-2xl">{c.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>

        {shown.length === 0 && (
          <p className="text-center text-white/35 text-sm py-12">No releases tagged “{filter}”.</p>
        )}
      </div>
    </div>
  );
}
