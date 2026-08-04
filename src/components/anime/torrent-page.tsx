"use client";

import { useState, useEffect } from "react";
import { Search, Download, Check, ExternalLink, AlertTriangle, Database, Magnet, Flame, ArrowUpRight, Activity } from "lucide-react";
import { useAppStore } from "./store";

// ============================================================
// TORRENT PAGE — Anime torrent search via feed.animetosho.org
// Redesigned v5: cool azure/emerald accent palette, "signal"
// health bars, monospace numerics, denser more terminal-like.
// ============================================================

const POPULAR_SEARCHES = [
  "One Piece", "Naruto", "Demon Slayer", "Jujutsu Kaisen",
  "Bleach", "Chainsaw Man", "Attack on Titan", "My Hero Academia"
];

function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

interface TorrentResult {
  title: string;
  size: string;
  seeders: number;
  leechers: number;
  magnet: string;
  torrent: string;
  link: string;
}

// ── Health rating from seeder count ──
function getHealth(seeders: number): { label: string; color: string; pct: number; ring: string } {
  if (seeders >= 100) return { label: "Excellent", color: "#10B981", pct: 100, ring: "rgba(16,185,129,0.5)" };
  if (seeders >= 30) return { label: "Healthy", color: "#34d399", pct: 75, ring: "rgba(52,211,153,0.4)" };
  if (seeders >= 10) return { label: "Stable", color: "#FBBF24", pct: 50, ring: "rgba(251,191,36,0.4)" };
  if (seeders >= 2) return { label: "Low", color: "#FB923C", pct: 28, ring: "rgba(251,146,60,0.4)" };
  if (seeders > 0) return { label: "Dying", color: "#F87171", pct: 14, ring: "rgba(248,113,113,0.4)" };
  return { label: "Dead", color: "#6b7280", pct: 0, ring: "rgba(107,114,128,0.3)" };
}

export default function TorrentPage() {
  const { navigate } = useAppStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("One Piece");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TorrentResult[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchTorrents = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const url = `https://feed.animetosho.org/json?qx=1&q=${encodeURIComponent(trimmed)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch torrents (Status: ${res.status})`);
      const data = await res.json();
      const rawResults: TorrentResult[] = (data || []).map((item: any) => ({
        title: item.title,
        size: formatBytes(item.total_size),
        seeders: item.seeders || 0,
        leechers: item.leechers || 0,
        magnet: item.magnet_uri,
        torrent: item.torrent_url,
        link: item.link
      }));
      const sortedResults = [...rawResults].sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
      setResults(sortedResults);
    } catch (err) {
      console.error("Torrent search error:", err);
      setError("Failed to fetch torrent search results. Please check your network or try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTorrents(activeQuery); }, [activeQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) setActiveQuery(searchQuery.trim());
  };

  const handleChipClick = (query: string) => {
    setSearchQuery(query);
    setActiveQuery(query);
  };

  const handleCopyMagnet = async (magnet: string, id: string) => {
    if (!magnet) return;
    try {
      await navigator.clipboard.writeText(magnet);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy magnet link:", err);
    }
  };

  // Aggregate stats
  const totalSeeders = results.reduce((sum, r) => sum + (r.seeders || 0), 0);
  const totalLeechers = results.reduce((sum, r) => sum + (r.leechers || 0), 0);
  const avgSeeders = results.length > 0 ? Math.round(totalSeeders / results.length) : 0;

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      {/* Ambient background — cool azure/emerald wash */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute -top-40 right-0 w-[700px] h-[500px] rounded-full opacity-[0.10] blur-[140px]"
          style={{ background: "radial-gradient(circle, #4A90E2 0%, transparent 70%)" }}
        />
        <div
          className="absolute top-1/2 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.08] blur-[120px]"
          style={{ background: "radial-gradient(circle, #10B981 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative max-w-[1240px] mx-auto px-4 lg:px-6" style={{ paddingTop: "100px" }}>

        {/* ── HERO ── */}
        <header className="mb-8">
          <div className="flex flex-col items-center text-center gap-5">
            {/* Icon badge */}
            <div className="relative">
              <div
                className="absolute inset-0 rounded-2xl blur-md opacity-60"
                style={{ background: "linear-gradient(135deg, #ffffff 0%, #a3a3a3 100%)" }}
                aria-hidden
              />
              <div
                className="relative w-16 h-16 rounded-2xl flex items-center justify-center border border-white/20"
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(163,163,163,0.10) 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <Database size={26} className="text-white" />
              </div>
            </div>

            {/* Title row with pulse dot */}
            <div className="flex items-center gap-3">
              <h1
                className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-none"
                style={{
                  background: "linear-gradient(180deg, #ffffff 0%, #a3a3a3 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Torrent Index
              </h1>
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
              </span>
            </div>

            <p className="text-white/45 text-sm max-w-[560px] leading-relaxed">
              Search high-quality anime releases indexed directly from the AnimeTosho feed.
              Sorted by seeder health for the fastest downloads.
            </p>
          </div>
        </header>

        {/* ── SEARCH PANEL ── */}
        <div
          className="rounded-2xl border border-white/[0.06] p-5 mb-6"
          style={{
            background: "linear-gradient(180deg, rgba(74,144,226,0.05) 0%, rgba(0,0,0,0) 60%), #0c0c0e",
          }}
        >
          <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-4">
            <div className="relative flex-1 group">
              <div
                className="absolute -inset-px rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity blur-md"
                style={{ background: "linear-gradient(135deg, rgba(74,144,226,0.4), rgba(16,185,129,0.2))" }}
                aria-hidden
              />
              <div className="relative">
                <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-sky-300/60 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search anime releases — Naruto, Demon Slayer, etc..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-[52px] pl-12 pr-4 text-sm text-white placeholder:text-white/30 bg-white/[0.03] border border-white/[0.08] rounded-full outline-none focus:border-sky-300/40 focus:bg-white/[0.05] transition-all"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="h-[52px] px-7 rounded-full text-sm font-bold text-black flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-100 disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, #60a5fa 0%, #4A90E2 100%)",
                boxShadow: "0 6px 20px -4px rgba(74,144,226,0.45)",
              }}
            >
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
              ) : (
                <Search size={15} />
              )}
              Search
            </button>
          </form>

          {/* Popular chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-white/35 uppercase tracking-[0.2em] font-bold mr-1">
              Popular
            </span>
            {POPULAR_SEARCHES.map((query) => {
              const isActive = activeQuery === query;
              return (
                <button
                  key={query}
                  type="button"
                  onClick={() => handleChipClick(query)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                    isActive
                      ? "bg-sky-400/15 border-sky-300/40 text-sky-200"
                      : "bg-white/[0.03] border-white/[0.06] text-white/55 hover:text-white/90 hover:border-white/15"
                  }`}
                >
                  {query}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── RESULTS ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
            <p className="text-white/45 text-sm">
              Searching indexes for <span className="text-sky-300 font-bold">"{activeQuery}"</span>...
            </p>
          </div>
        ) : error ? (
          <div
            className="rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3"
            style={{ background: "rgba(230,57,70,0.05)", borderColor: "rgba(230,57,70,0.25)", border: "1px solid" }}
          >
            <AlertTriangle size={32} className="text-rose-400" />
            <div>
              <h3 className="text-base font-bold mb-1">Search Failed</h3>
              <p className="text-white/50 text-sm">{error}</p>
            </div>
            <button
              onClick={() => fetchTorrents(activeQuery)}
              className="px-5 py-2 text-xs font-bold rounded-full bg-white/[0.06] text-white hover:bg-white/[0.1] border border-white/[0.1] transition-all"
            >
              Retry
            </button>
          </div>
        ) : results.length > 0 ? (
          <div>
            {/* ── STATS STRIP ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">
                  <Database size={11} /> Found
                </div>
                <div className="text-xl font-bold tabular-nums">
                  {results.length}
                  <span className="text-xs text-white/40 ml-1 font-normal">torrents</span>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.03] p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-300/70 font-bold mb-1">
                  <Flame size={11} /> Seeders
                </div>
                <div className="text-xl font-bold tabular-nums text-emerald-300">
                  {totalSeeders.toLocaleString()}
                  <span className="text-xs text-white/40 ml-1 font-normal">total</span>
                </div>
              </div>
              <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.03] p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-sky-300/70 font-bold mb-1">
                  <Activity size={11} /> Leechers
                </div>
                <div className="text-xl font-bold tabular-nums text-sky-300">
                  {totalLeechers.toLocaleString()}
                  <span className="text-xs text-white/40 ml-1 font-normal">total</span>
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">
                  <ArrowUpRight size={11} /> Avg Seed
                </div>
                <div className="text-xl font-bold tabular-nums">
                  {avgSeeders}
                  <span className="text-xs text-white/40 ml-1 font-normal">per torrent</span>
                </div>
              </div>
            </div>

            {/* Section header */}
            <div className="flex justify-between items-baseline mb-3 px-1">
              <span className="text-sm text-white/55">
                Results for <strong className="text-white">"{activeQuery}"</strong>
              </span>
              <span className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold">
                Sorted by Seeders
              </span>
            </div>

            {/* ── RESULTS LIST ── */}
            <div className="flex flex-col gap-2">
              {results.map((torrent, index) => {
                const uniqueId = `${torrent.magnet || index}-${index}`;
                const isCopied = copiedId === uniqueId;
                const health = getHealth(torrent.seeders ?? 0);
                const rank = index + 1;
                return (
                  <div
                    key={uniqueId}
                    className="group relative rounded-2xl border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all overflow-hidden"
                  >
                    {/* Left health bar */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1"
                      style={{ background: health.color }}
                      aria-hidden
                    />

                    <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto_auto_auto] gap-3 md:gap-4 items-center p-4 pl-5">
                      {/* Rank */}
                      <div className="hidden md:flex items-center justify-center w-8">
                        <span className="text-sm font-mono font-bold text-white/25 tabular-nums">
                          {String(rank).padStart(2, "0")}
                        </span>
                      </div>

                      {/* Title + health pill */}
                      <div className="min-w-0 flex flex-col gap-1.5">
                        <p
                          className="text-sm font-medium text-white leading-snug line-clamp-2 group-hover:text-sky-100 transition-colors"
                          title={torrent.title}
                        >
                          {torrent.title}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Health bar */}
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${health.pct}%`, background: health.color }}
                              />
                            </div>
                            <span
                              className="text-[10px] font-bold uppercase tracking-wider"
                              style={{ color: health.color }}
                            >
                              {health.label}
                            </span>
                          </div>
                          {/* Size */}
                          <span className="text-[11px] font-mono text-white/45">
                            {torrent.size || "N/A"}
                          </span>
                        </div>
                      </div>

                      {/* Seeders */}
                      <div className="flex items-center gap-2 min-w-[70px]">
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] text-white/40 uppercase tracking-wider font-bold leading-none">Seed</span>
                          <span className="text-sm font-bold text-emerald-300 tabular-nums leading-tight mt-0.5">
                            {torrent.seeders ?? 0}
                          </span>
                        </div>
                        <Flame size={13} className="text-emerald-400/60" />
                      </div>

                      {/* Leechers */}
                      <div className="flex items-center gap-2 min-w-[70px]">
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] text-white/40 uppercase tracking-wider font-bold leading-none">Leech</span>
                          <span className="text-sm font-bold text-sky-300 tabular-nums leading-tight mt-0.5">
                            {torrent.leechers ?? 0}
                          </span>
                        </div>
                        <Activity size={13} className="text-sky-400/60" />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5 justify-center items-center">
                        <button
                          type="button"
                          onClick={() => handleCopyMagnet(torrent.magnet, uniqueId)}
                          title={isCopied ? "Copied!" : "Copy Magnet Link"}
                          className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${
                            isCopied
                              ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
                              : "border-white/[0.08] bg-transparent text-white/55 hover:bg-emerald-400/10 hover:text-emerald-300 hover:border-emerald-400/30"
                          }`}
                        >
                          {isCopied ? <Check size={15} /> : <Magnet size={15} />}
                        </button>
                        {torrent.torrent && (
                          <a
                            href={torrent.torrent}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Download .torrent"
                            className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/[0.08] bg-transparent text-white/55 hover:bg-sky-400/10 hover:text-sky-300 hover:border-sky-400/30 transition-all"
                          >
                            <Download size={15} />
                          </a>
                        )}
                        {torrent.link && (
                          <a
                            href={torrent.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View on AnimeTosho"
                            className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/[0.08] bg-transparent text-white/40 hover:bg-white/[0.06] hover:text-white transition-all"
                          >
                            <ExternalLink size={15} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06]">
              <Database size={24} className="text-white/30" />
            </div>
            <div className="text-base font-bold text-white/70">No Torrents Found</div>
            <div className="text-sm text-white/40 max-w-md">
              We couldn&apos;t find any active torrent releases for <span className="text-white/70">"{activeQuery}"</span>.
              <span className="block mt-1 text-xs text-white/30">
                Tip: Try a simplified anime title or English name.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
