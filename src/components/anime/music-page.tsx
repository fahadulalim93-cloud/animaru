"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "./store";
import { Search, Play, Music as MusicIcon, ChevronLeft, Calendar, Disc, User, Loader2, AlertCircle, Headphones, Radio } from "lucide-react";
import BrowseTabs from "./browse-tabs";

// ============================================================
// ANIME MUSIC PAGE — Opening & Ending themes (redesigned v5)
// Uses api.animethemes.moe (public API, no auth needed)
// Visual identity: soft lavender/violet accent, vinyl-record motif,
// animated equalizer bars, big now-playing surface.
// ============================================================

export default function MusicPage() {
  const { navigate } = useAppStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [featuredAnime, setFeaturedAnime] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [selectedAnime, setSelectedAnime] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [themes, setThemes] = useState<any[]>([]);
  const [currentTheme, setCurrentTheme] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"OP" | "ED">("OP");
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const fetchFeatured = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("https://api.animethemes.moe/anime?page[size]=12&include=images");
        if (!res.ok) throw new Error("Failed to fetch featured themes.");
        const json = await res.json();
        setFeaturedAnime(json.anime || []);
      } catch (err) {
        console.error("Featured themes fetch error:", err);
        setError("Failed to load initial themes list. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchFeatured();
  }, []);

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setHasSearched(false);
      setSearchResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    setSelectedAnime(null);
    try {
      const res = await fetch(`https://api.animethemes.moe/search?q=${encodeURIComponent(query)}&fields[search]=anime&include[anime]=images`);
      if (!res.ok) throw new Error("Search failed.");
      const json = await res.json();
      const searchAnimeList = json.search?.anime || [];
      setSearchResults(searchAnimeList);
      setHasSearched(true);
    } catch (err) {
      console.error("Search error:", err);
      setError("Failed to search anime themes. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAnime = async (anime: any) => {
    setDetailsLoading(true);
    setError(null);
    setSelectedAnime(anime);
    setCurrentTheme(null);
    setIsPlaying(false);
    try {
      const res = await fetch(`https://api.animethemes.moe/anime/${anime.slug}?include=animethemes.song.artists,animethemes.animethemeentries.videos,images`);
      if (!res.ok) throw new Error("Failed to load anime theme details.");
      const json = await res.json();
      const animeDetails = json.anime;
      if (animeDetails) {
        setSelectedAnime(animeDetails);
        const animethemes = animeDetails.animethemes || [];
        setThemes(animethemes);
        const ops = animethemes.filter((t: any) => String(t?.type).startsWith("OP"));
        const eds = animethemes.filter((t: any) => String(t?.type).startsWith("ED"));
        if (ops.length > 0) { setActiveTab("OP"); setCurrentTheme(ops[0]); }
        else if (eds.length > 0) { setActiveTab("ED"); setCurrentTheme(eds[0]); }
        else if (animethemes.length > 0) { setActiveTab("OP"); setCurrentTheme(animethemes[0]); }
      }
    } catch (err) {
      console.error("Details fetch error:", err);
      setError("Could not load themes for this anime. Please try again.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const handlePlayTheme = (theme: any) => {
    setCurrentTheme(theme);
    setIsPlaying(true);
  };
  const handleBackToList = () => {
    setSelectedAnime(null);
    setThemes([]);
    setCurrentTheme(null);
    setIsPlaying(false);
  };

  const getCoverImage = (animeItem: any) => {
    if (!animeItem) return "";
    const images = animeItem.images || [];
    const large = images.find((img: any) => img.facet === "Large Cover");
    if (large) return large.link;
    const small = images.find((img: any) => img.facet === "Small Cover");
    if (small) return small.link;
    return "";
  };

  const filteredThemes = themes.filter((t) => activeTab === "OP" ? String(t?.type).startsWith("OP") : String(t?.type).startsWith("ED"));
  const currentVideoUrl = currentTheme?.animethemeentries?.[0]?.videos?.[0]?.link || "";
  const currentCover = getCoverImage(selectedAnime);

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <BrowseTabs active="music" />
      {/* Ambient background gradient — soft lavender wash */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full opacity-[0.12] blur-[140px]"
          style={{ background: "radial-gradient(circle, #a78bfa 0%, #7c3aed 40%, transparent 70%)" }}
        />
        <div
          className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.08] blur-[120px]"
          style={{ background: "radial-gradient(circle, #d8b4fe 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative max-w-[1240px] mx-auto px-4 lg:px-6" style={{ paddingTop: "24px" }}>

        {/* ── HERO ── */}
        <header className="mb-12">
          <div className="flex flex-col items-center text-center gap-5">
            {/* Floating icon badge with pulsing ring */}
            <div className="relative">
              <div
                className="absolute inset-0 rounded-2xl blur-md opacity-60"
                style={{ background: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)" }}
                aria-hidden
              />
              <div
                className="relative w-16 h-16 rounded-2xl flex items-center justify-center border border-violet-300/30"
                style={{
                  background: "linear-gradient(135deg, rgba(167,139,250,0.18) 0%, rgba(124,58,237,0.12) 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <Headphones size={28} className="text-violet-300" />
              </div>
            </div>

            {/* Title + animated equalizer bars */}
            <div className="flex items-center gap-4">
              <h1
                className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-none"
                style={{
                  background: "linear-gradient(180deg, #fff 0%, rgba(196,181,253,0.85) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Anime Themes
              </h1>
              {/* Animated equalizer */}
              <div className="flex items-end gap-[3px] h-7" aria-hidden>
                {[0, 1, 2, 3, 4].map(i => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-gradient-to-t from-violet-500 to-violet-300"
                    style={{
                      height: "100%",
                      animation: `eq 1.2s ease-in-out ${i * 0.15}s infinite`,
                      transformOrigin: "bottom",
                    }}
                  />
                ))}
              </div>
            </div>

            <p className="text-white/45 text-sm max-w-[560px] leading-relaxed">
              Stream clean Opening & Ending credits in full quality — pulled live from the animethemes archive.
            </p>
          </div>
        </header>

        {/* ── SEARCH ── */}
        {!selectedAnime && (
          <form onSubmit={handleSearchSubmit} className="flex gap-2 max-w-[760px] mx-auto mb-12">
            <div className="relative flex-1 group">
              {/* Glow ring */}
              <div
                className="absolute -inset-px rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity blur-md"
                style={{ background: "linear-gradient(135deg, rgba(167,139,250,0.4), rgba(124,58,237,0.2))" }}
                aria-hidden
              />
              <div className="relative">
                <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-violet-300/60 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search anime themes — Naruto, Bleach, Attack on Titan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-[52px] pl-12 pr-28 text-sm text-white placeholder:text-white/30 bg-white/[0.03] border border-white/[0.08] rounded-full outline-none focus:border-violet-300/40 focus:bg-white/[0.05] transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(""); setSearchResults([]); setHasSearched(false); }}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-white/40 hover:text-white/80 uppercase tracking-wider"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <button
              type="submit"
              className="h-[52px] px-7 rounded-full text-sm font-bold text-black flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-100"
              style={{
                background: "linear-gradient(135deg, #c4b5fd 0%, #a78bfa 100%)",
                boxShadow: "0 6px 20px -4px rgba(167,139,250,0.45)",
              }}
            >
              Search
            </button>
          </form>
        )}

        {/* ── ERROR ── */}
        {error && (
          <div
            className="flex items-center gap-3 p-4 mb-6 rounded-2xl max-w-[760px] mx-auto"
            style={{ background: "rgba(230,57,70,0.08)", border: "1px solid rgba(230,57,70,0.25)" }}
          >
            <AlertCircle size={18} className="text-rose-400 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="flex items-end gap-[3px] h-10">
              {[0, 1, 2, 3, 4, 5, 6].map(i => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-gradient-to-t from-violet-600 to-violet-300"
                  style={{
                    height: "100%",
                    animation: `eq 1s ease-in-out ${i * 0.1}s infinite`,
                    transformOrigin: "bottom",
                  }}
                />
              ))}
            </div>
            <span className="text-white/45 text-sm tracking-wide">Fetching themes...</span>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            PLAYER VIEW
            ═══════════════════════════════════════════════════════════ */}
        {selectedAnime && (
          <div className="flex flex-col gap-5">
            {/* Back button */}
            <button
              onClick={handleBackToList}
              className="self-start flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-bold text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.15] transition-all"
            >
              <ChevronLeft size={14} /> Back to Library
            </button>

            {detailsLoading ? (
              <div className="flex flex-col items-center gap-4 py-20">
                <div className="flex items-end gap-[3px] h-10">
                  {[0, 1, 2, 3, 4, 5, 6].map(i => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full bg-gradient-to-t from-violet-600 to-violet-300"
                      style={{
                        height: "100%",
                        animation: `eq 1s ease-in-out ${i * 0.1}s infinite`,
                        transformOrigin: "bottom",
                      }}
                    />
                  ))}
                </div>
                <span className="text-white/45 text-sm">Loading theme videos...</span>
              </div>
            ) : (
              <div
                className="grid lg:grid-cols-[1fr_360px] gap-0 overflow-hidden rounded-3xl border border-white/[0.06]"
                style={{
                  background: "linear-gradient(180deg, rgba(167,139,250,0.05) 0%, rgba(0,0,0,0) 60%), #0c0c0e",
                  boxShadow: "0 24px 80px -24px rgba(0,0,0,0.8)",
                }}
              >
                {/* LEFT — Video + Now Playing */}
                <div className="p-6 flex flex-col gap-5">
                  {currentVideoUrl ? (
                    <div className="aspect-video bg-black rounded-2xl overflow-hidden border border-white/[0.05] relative">
                      <video
                        src={currentVideoUrl}
                        controls
                        autoPlay
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-black rounded-2xl flex flex-col items-center justify-center text-white/30 gap-2 border border-white/[0.05]">
                      <AlertCircle size={32} />
                      <span className="text-sm">No video file available for this theme.</span>
                    </div>
                  )}

                  {/* Now playing surface */}
                  {currentTheme && (
                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                      {/* Spinning vinyl / cover */}
                      <div className="relative shrink-0 w-16 h-16">
                        {currentCover ? (
                          <img
                            src={currentCover}
                            alt=""
                            className={`w-full h-full rounded-full object-cover border-2 border-violet-300/30 ${isPlaying ? "animate-spin-slow" : ""}`}
                            style={{ animationDuration: "8s" }}
                          />
                        ) : (
                          <div className="w-full h-full rounded-full bg-gradient-to-br from-violet-500/40 to-violet-900/40 border-2 border-violet-300/30 flex items-center justify-center">
                            <Disc size={20} className="text-violet-300/60" />
                          </div>
                        )}
                        {/* Center hole */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-black border border-violet-300/40" />
                      </div>

                      {/* Track info */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[10px] font-extrabold px-2 py-0.5 rounded-md text-black"
                            style={{ background: "linear-gradient(135deg, #c4b5fd 0%, #a78bfa 100%)" }}
                          >
                            {currentTheme.type}
                          </span>
                          <h2 className="text-lg font-bold text-white truncate leading-tight">
                            {currentTheme.song?.title || "Unknown Song"}
                          </h2>
                        </div>
                        {currentTheme.song?.artists?.length > 0 && (
                          <div className="flex items-center gap-1.5 text-violet-300/80 text-xs font-medium">
                            <User size={12} />
                            <span className="truncate">{currentTheme.song.artists.map((a: any) => a.name).join(", ")}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-white/35 text-[11px] mt-0.5">
                          <span className="flex items-center gap-1.5"><Disc size={11} /> {selectedAnime.name}</span>
                          {selectedAnime.year && (
                            <span className="flex items-center gap-1.5"><Calendar size={11} /> {selectedAnime.year}</span>
                          )}
                        </div>
                      </div>

                      {/* Equalizer indicator */}
                      {isPlaying && (
                        <div className="hidden sm:flex items-end gap-[2px] h-5 shrink-0" aria-hidden>
                          {[0, 1, 2, 3].map(i => (
                            <span
                              key={i}
                              className="w-[2px] rounded-full bg-violet-300"
                              style={{
                                height: "100%",
                                animation: `eq 0.9s ease-in-out ${i * 0.12}s infinite`,
                                transformOrigin: "bottom",
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* RIGHT — Playlist */}
                <div className="flex flex-col bg-black/40 border-t lg:border-t-0 lg:border-l border-white/[0.06] max-h-[560px]">
                  {/* Tab header */}
                  <div className="flex border-b border-white/[0.06]">
                    {(["OP", "ED"] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 h-14 text-xs font-bold transition-colors relative ${
                          activeTab === tab ? "text-white" : "text-white/40 hover:text-white/70"
                        }`}
                      >
                        {tab === "OP" ? "Openings" : "Endings"}
                        <span className="ml-1.5 text-[10px] text-white/30 font-medium">
                          ({themes.filter(t => String(t?.type).startsWith(tab)).length})
                        </span>
                        {activeTab === tab && (
                          <span
                            className="absolute bottom-0 left-6 right-6 h-[2px] rounded-full"
                            style={{ background: "linear-gradient(90deg, transparent, #a78bfa, transparent)" }}
                          />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Playlist items */}
                  <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5 ltv-scroll">
                    {filteredThemes.length > 0 ? filteredThemes.map((t, i) => {
                      const isCurrent = currentTheme?.id === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => handlePlayTheme(t)}
                          className={`group flex items-center gap-3 p-3 rounded-xl text-left w-full transition-all ${
                            isCurrent
                              ? "bg-violet-300/[0.08] border border-violet-300/25"
                              : "bg-transparent border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06]"
                          }`}
                        >
                          {/* Track number / playing indicator */}
                          <div className="shrink-0 w-8 flex items-center justify-center">
                            {isCurrent ? (
                              <div className="flex items-end gap-[2px] h-3.5" aria-hidden>
                                {[0, 1, 2].map(j => (
                                  <span
                                    key={j}
                                    className="w-[2px] rounded-full bg-violet-300"
                                    style={{
                                      height: "100%",
                                      animation: `eq 0.9s ease-in-out ${j * 0.15}s infinite`,
                                      transformOrigin: "bottom",
                                    }}
                                  />
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11px] font-mono text-white/30 group-hover:text-violet-300/70 transition-colors">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                            )}
                          </div>

                          {/* Type badge */}
                          <span
                            className={`shrink-0 text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                              isCurrent
                                ? "bg-violet-300 text-black"
                                : "bg-white/[0.06] text-white/55 group-hover:bg-violet-300/20 group-hover:text-violet-300"
                            }`}
                          >
                            {t.type}
                          </span>

                          {/* Title + artist */}
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className={`text-sm font-semibold truncate ${isCurrent ? "text-violet-100" : "text-white/90"}`}>
                              {t.song?.title || "Unknown Song"}
                            </span>
                            {t.song?.artists?.length > 0 && (
                              <span className="text-[11px] text-white/40 truncate">
                                {t.song.artists.map((a: any) => a.name).join(", ")}
                              </span>
                            )}
                          </div>

                          {/* Play icon on hover */}
                          <Play
                            size={12}
                            className={`shrink-0 transition-all ${isCurrent ? "text-violet-300" : "text-white/0 group-hover:text-white/40"}`}
                            fill="currentColor"
                          />
                        </button>
                      );
                    }) : (
                      <div className="flex flex-col items-center justify-center h-32 gap-2 text-white/30">
                        <Radio size={24} className="opacity-50" />
                        <span className="text-xs">No {activeTab === "OP" ? "openings" : "endings"} found.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            ANIME GRID — vinyl-styled cards
            ═══════════════════════════════════════════════════════════ */}
        {!selectedAnime && !loading && (
          <div>
            {/* Section header */}
            <div className="flex items-center gap-3 mb-6">
              <span className="w-1 h-6 rounded-full" style={{ background: "linear-gradient(180deg, #c4b5fd, #a78bfa)" }} />
              <h2 className="text-xl font-bold tracking-tight">
                {hasSearched ? `Search Results` : `Featured Themes`}
              </h2>
              <span className="text-xs text-white/40">
                {hasSearched ? `${searchResults.length} match${searchResults.length !== 1 ? "es" : ""}` : `${featuredAnime.length} titles`}
              </span>
            </div>

            {(hasSearched ? searchResults : featuredAnime).length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {(hasSearched ? searchResults : featuredAnime).map((anime) => {
                  const cover = getCoverImage(anime);
                  const title = anime.name;
                  const year = anime.year;
                  const type = anime.media_format;
                  return (
                    <button
                      key={anime.id}
                      onClick={() => handleSelectAnime(anime)}
                      className="group text-left"
                    >
                      <div className="relative">
                        {/* Vinyl record peeking from behind on hover */}
                        <div
                          className="absolute top-0 left-1/2 -translate-x-1/2 w-[85%] aspect-[2/3] rounded-full bg-gradient-to-br from-zinc-900 to-black border border-white/[0.05] opacity-0 group-hover:opacity-100 transition-all duration-500 -z-10"
                          style={{
                            transform: "translate(-50%, -8px) translateX(18%)",
                            boxShadow: "0 8px 24px -6px rgba(0,0,0,0.6)",
                          }}
                          aria-hidden
                        >
                          <div className="absolute inset-[18%] rounded-full border border-white/[0.04]" />
                          <div className="absolute inset-[36%] rounded-full border border-white/[0.04]" />
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-violet-300/30" />
                        </div>

                        {/* Cover */}
                        <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-[#14141a] border border-white/[0.06] group-hover:border-violet-300/30 transition-all duration-300">
                          {cover ? (
                            <img
                              src={cover}
                              alt={title}
                              loading="lazy"
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/15">
                              <MusicIcon size={32} />
                            </div>
                          )}
                          {/* Gradient overlay */}
                          <div
                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            style={{
                              background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.7) 100%)",
                            }}
                          />
                          {/* Play button on hover */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                            <div
                              className="w-12 h-12 rounded-full flex items-center justify-center scale-50 group-hover:scale-100 transition-transform duration-300"
                              style={{
                                background: "linear-gradient(135deg, #c4b5fd 0%, #a78bfa 100%)",
                                boxShadow: "0 6px 20px -4px rgba(167,139,250,0.6)",
                              }}
                            >
                              <Play size={18} fill="#000" className="text-black ml-0.5" />
                            </div>
                          </div>
                          {/* Type chip */}
                          {type && (
                            <span className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-white/80 border border-white/10 uppercase tracking-wider">
                              {type}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title + year */}
                      <div className="mt-2.5 px-0.5">
                        <h3 className="text-sm font-semibold text-white truncate group-hover:text-violet-300 transition-colors">
                          {title}
                        </h3>
                        <div className="text-[11px] text-white/40 mt-0.5">
                          {year && <span>{year}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06]">
                  <MusicIcon size={24} className="text-white/30" />
                </div>
                <div className="text-base font-bold text-white/70">No anime found</div>
                <div className="text-sm text-white/40 max-w-sm">
                  Try searching for a different anime name to discover its themes.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Equalizer keyframes + slow spin */}
      <style jsx global>{`
        @keyframes eq {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
      `}</style>
    </div>
  );
}
