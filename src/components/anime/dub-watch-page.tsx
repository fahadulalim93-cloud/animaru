"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "./store";
import {
  ChevronLeft, Play, SkipBack, SkipForward, Loader2, AlertCircle,
  Tv, Film, Globe, RefreshCw, List, Star, Headphones
} from "lucide-react";

interface DubAnimeInfo {
  title: string;
  anime_id: string;
  poster?: string;
  overview?: string;
  language?: string;
  quality?: string;
  runningTime?: string;
  genres?: string[];
  year?: string;
  seasons?: string;
  episodes?: string;
  rating?: string;
}

interface DubEpisodeItem {
  title: string;
  season: string;
  episode: string;
  image?: string;
}

interface DubStreamServer {
  server: string;
  embed: string;
}

interface DubMovieStream {
  iframe: string;
}

export default function DubWatchPage({
  animeId,
  contentType = "series",
}: {
  animeId: string;
  contentType?: "series" | "movie";
}) {
  const { navigate } = useAppStore();
  const isMiruro = animeId.startsWith("miruro_");
  const isToonStream = animeId.startsWith("toonstream-");
  const toonStreamSlug = isToonStream ? animeId.replace(/^toonstream-(?:series|movie)-/, "") : "";
  const toonStreamType = isToonStream ? (animeId.includes("-movie-") ? "movie" : "series") : contentType;
  const [info, setInfo] = useState<DubAnimeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMovie, setIsMovie] = useState(contentType === "movie");

  // Episode data
  const [episodes, setEpisodes] = useState<DubEpisodeItem[]>([]);
  const [totalSeasons, setTotalSeasons] = useState("1");
  const [seasonList, setSeasonList] = useState<{ season: string; text: string }[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [showEpList, setShowEpList] = useState(true);

  // Stream data
  const [servers, setServers] = useState<DubStreamServer[]>([]);
  const [movieStreams, setMovieStreams] = useState<DubMovieStream[]>([]);
  const [selectedServer, setSelectedServer] = useState(0);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState("");

  // Redirect Miruro anime to the main watch page (better streaming support)
  useEffect(() => {
    if (isMiruro) {
      navigate({ page: "anime", id: animeId });
    }
  }, [isMiruro, animeId, navigate]);

  // CRITICAL: ALL hooks MUST be before any early return (React Rules of Hooks)
  // The isMiruro check was previously here causing React error #310

  // Fetch anime info
  useEffect(() => {
    async function fetchInfo() {
      setLoading(true);
      try {
        if (isToonStream) {
          // Fetch from TatakaiAPI (ToonStream)
          const endpoint = toonStreamType === "movie"
            ? `/api/tatakai?action=toonstream-movie-info&slug=${encodeURIComponent(toonStreamSlug)}`
            : `/api/tatakai?action=toonstream-series-info&slug=${encodeURIComponent(toonStreamSlug)}`;
          const res = await fetch(endpoint);
          const data = await res.json();
          if (data.success && data.data) {
            const tsInfo = data.data;
            setInfo({
              title: tsInfo.title || toonStreamSlug,
              anime_id: animeId,
              poster: tsInfo.poster || tsInfo.cover,
              overview: tsInfo.description,
              language: tsInfo.language || "Hindi",
              quality: tsInfo.quality,
              genres: tsInfo.genres || [],
              rating: tsInfo.rating,
              seasons: tsInfo.seasons ? String(tsInfo.seasons.length) : "1",
              episodes: tsInfo.seasons?.[0]?.episodes ? String(tsInfo.seasons[0].episodes.length) : "1",
            });
            if (toonStreamType === "movie") setIsMovie(true);
            // Set episodes from ToonStream series info
            if (tsInfo.seasons && tsInfo.seasons.length > 0) {
              const allEps: DubEpisodeItem[] = [];
              tsInfo.seasons.forEach((season: any) => {
                if (season.episodes) {
                  season.episodes.forEach((ep: any) => {
                    allEps.push({
                      title: ep.title || `Episode ${ep.episode || ep.slug}`,
                      season: season.season || "1",
                      episode: ep.episode || String(allEps.length + 1),
                      image: ep.image,
                    });
                  });
                }
              });
              setEpisodes(allEps);
              setTotalSeasons(String(tsInfo.seasons.length));
              setSeasonList(tsInfo.seasons.map((s: any, i: number) => ({ season: String(i + 1), text: s.season || `Season ${i + 1}` })));
            }
          }
        } else {
          // Fetch from standard dub API
          const res = await fetch(`/api/dub/info?id=${encodeURIComponent(animeId)}`);
          const data = await res.json();
          if (data.success && data.data) {
            const infoData = data.data;
            setInfo(infoData);
            if (infoData.seasons && parseInt(infoData.seasons) <= 1 && infoData.episodes && parseInt(infoData.episodes) <= 1) {
              setIsMovie(true);
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch dub info:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchInfo();
  }, [animeId, isToonStream, toonStreamSlug, toonStreamType]);

  // Fetch episodes (for series) - skip for ToonStream (handled in info fetch)
  useEffect(() => {
    if (isMovie || !animeId || isToonStream) return;
    async function fetchEpisodes() {
      try {
        const res = await fetch(`/api/dub/episodes?id=${encodeURIComponent(animeId)}&season=${selectedSeason}`);
        const data = await res.json();
        if (data.success) {
          setEpisodes(data.episodes || []);
          setTotalSeasons(data.totalSeasons || "1");
          setSeasonList(data.seasons || []);
        }
      } catch (err) {
        console.error("Failed to fetch episodes:", err);
      }
    }
    fetchEpisodes();
  }, [animeId, selectedSeason, isMovie]);

  // Auto-load stream
  useEffect(() => {
    if (!animeId) return;
    if (isToonStream) {
      loadToonStreamStream();
    } else if (isMovie) {
      loadMovieStream();
    } else {
      loadEpisodeStream();
    }
  }, [animeId, selectedEpisode, selectedSeason, isMovie, isToonStream]);

  const loadEpisodeStream = useCallback(async () => {
    if (!animeId) return;
    setStreamLoading(true);
    setStreamError("");
    setServers([]);
    setSelectedServer(0);

    try {
      const res = await fetch(
        `/api/dub/stream?id=${encodeURIComponent(animeId)}&season=${selectedSeason}&ep=${selectedEpisode}`
      );
      const data = await res.json();
      if (data.success && data.results && data.results.length > 0) {
        setServers(data.results);
      } else {
        setStreamError("No stream servers found for this episode.");
      }
    } catch (err) {
      console.error("Stream fetch failed:", err);
      setStreamError("Failed to load stream servers.");
    } finally {
      setStreamLoading(false);
    }
  }, [animeId, selectedSeason, selectedEpisode]);

  const loadMovieStream = useCallback(async () => {
    if (!animeId) return;
    setStreamLoading(true);
    setStreamError("");
    setMovieStreams([]);
    setSelectedServer(0);

    try {
      const res = await fetch(`/api/dub/info?id=${encodeURIComponent(animeId)}`);
      await res.json();
      const movieRes = await fetch(`/api/dub/stream?id=${encodeURIComponent(animeId)}&season=1&ep=1`);
      const movieData = await movieRes.json();

      if (movieData.success && movieData.results && movieData.results.length > 0) {
        setServers(movieData.results);
      } else {
        setStreamError("No stream servers found for this movie. Try a different server.");
      }
    } catch (err) {
      console.error("Movie stream failed:", err);
      setStreamError("Failed to load movie stream.");
    } finally {
      setStreamLoading(false);
    }
  }, [animeId]);

  const loadToonStreamStream = useCallback(async () => {
    if (!toonStreamSlug) return;
    setStreamLoading(true);
    setStreamError("");
    setServers([]);
    setSelectedServer(0);

    try {
      // Get the episode slug from episodes list
      let epSlug = toonStreamSlug;
      if (!isMovie && episodes.length > 0) {
        const ep = episodes.find((e) => parseInt(e.episode) === selectedEpisode);
        if (ep) {
          // Use the slug from the episode data if available
          epSlug = (ep as any).slug || toonStreamSlug;
        }
      }

      const endpoint = isMovie
        ? `/api/tatakai?action=toonstream-movie-sources&slug=${encodeURIComponent(toonStreamSlug)}`
        : `/api/tatakai?action=toonstream-episode-sources&slug=${encodeURIComponent(epSlug)}`;
      
      const res = await fetch(endpoint);
      const data = await res.json();

      if (data.success && data.data && data.data.length > 0) {
        // Convert TatakaiAPI sources to DubStreamServer format
        const tatakaiSources: DubStreamServer[] = data.data.map((src: any, idx: number) => {
          let embedUrl = src.url || "";
          // For HLS streams, use our embed player
          if (src.type === "hls" || embedUrl.includes(".m3u8")) {
            embedUrl = `/embed?url=${encodeURIComponent(embedUrl)}&type=hls&title=${encodeURIComponent(info?.title || "Luffy TV")}`;
          } else if (src.type === "mp4") {
            embedUrl = `/embed?url=${encodeURIComponent(embedUrl)}&type=mp4&title=${encodeURIComponent(info?.title || "Luffy TV")}`;
          }
          // If there's a proxied URL, prefer that
          if (src.proxiedUrl) {
            if (src.type === "hls" || src.proxiedUrl.includes(".m3u8")) {
              embedUrl = `/embed?url=${encodeURIComponent(src.proxiedUrl)}&type=hls&title=${encodeURIComponent(info?.title || "Luffy TV")}`;
            } else {
              embedUrl = `/embed?url=${encodeURIComponent(src.proxiedUrl)}&type=mp4&title=${encodeURIComponent(info?.title || "Luffy TV")}`;
            }
          }
          return {
            server: src.label || `Server ${idx + 1}`,
            embed: embedUrl,
          };
        });
        setServers(tatakaiSources);
      } else {
        setStreamError("No Hindi stream available for this content. Try a different anime.");
      }
    } catch (err) {
      console.error("ToonStream stream failed:", err);
      setStreamError("Failed to load ToonStream.");
    } finally {
      setStreamLoading(false);
    }
  }, [toonStreamSlug, isMovie, selectedEpisode, episodes, info?.title]);

  const currentStreamUrl = servers.length > 0 ? servers[selectedServer]?.embed : movieStreams[selectedServer]?.iframe || "";

  // isMiruro redirect — MUST be after all hooks (React Rules of Hooks)
  if (isMiruro) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-[#06b6d4] animate-spin" />
        <span className="ml-3 text-zinc-400 text-sm">Redirecting to player...</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 fade-in">
        <div className="aspect-video rounded-2xl shimmer" />
        <div className="h-8 w-1/3 shimmer rounded" />
        <div className="h-4 w-2/3 shimmer rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Back button */}
      <button
        onClick={() => navigate({ page: "home" })}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-[#06b6d4] transition-colors font-medium"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Back to Dubbed Anime
      </button>

      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1 space-y-4">
          {/* Video Player */}
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-[#0b0b0f] shadow-2xl shadow-black/50 border border-white/[0.04]">
            {streamLoading ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-[#0b0b0f]">
                <div className="w-14 h-14 rounded-2xl bg-[#06b6d4]/10 flex items-center justify-center mb-4">
                  <Loader2 className="w-7 h-7 text-[#06b6d4] animate-spin" />
                </div>
                <p className="text-zinc-500 text-xs">Loading stream...</p>
              </div>
            ) : currentStreamUrl ? (
              <iframe
                key={`stream-${selectedServer}-${selectedEpisode}`}
                src={currentStreamUrl}
                className="w-full h-full border-0"
                allowFullScreen
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture; screen-wake-lock; clipboard-write"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-[#0b0b0f] p-6">
                <AlertCircle className="w-12 h-12 text-[#f59e0b]/30 mb-4" />
                <p className="text-zinc-400 text-xs text-center max-w-md mb-5">
                  {streamError || "No stream available for this content."}
                </p>
                <button
                  onClick={() => isMovie ? loadMovieStream() : loadEpisodeStream()}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#06b6d4]/10 text-[#06b6d4] text-xs hover:bg-[#06b6d4]/20 border border-[#06b6d4]/10 transition-all font-medium"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            )}
          </div>

          {/* Video Info */}
          <div className="space-y-4">
            <h1 className="text-lg font-bold text-white tracking-tight">
              {info?.title || animeId}
              {!isMovie && ` — S${selectedSeason} E${selectedEpisode}`}
            </h1>

            {/* Info badges */}
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 flex-wrap">
              {info?.language && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#06b6d4]/10 text-[#06b6d4] border border-[#06b6d4]/10 font-medium">
                  <Globe className="w-2.5 h-2.5" /> {info.language}
                </span>
              )}
              {info?.quality && (
                <span className="px-2.5 py-1 rounded-lg bg-[#ffffff]/10 text-[#ffffff] border border-[#ffffff]/10 font-medium">
                  {info.quality}
                </span>
              )}
              {info?.rating && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/10 font-medium">
                  <Star className="w-2.5 h-2.5" fill="currentColor" /> {info.rating}
                </span>
              )}
              {info?.runningTime && <span>{info.runningTime}</span>}
              {info?.year && <span>{info.year}</span>}
              {servers.length > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/10 font-medium">
                  {servers.length} server{servers.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Overview */}
            {info?.overview && (
              <p className="text-sm text-zinc-400 leading-relaxed line-clamp-3">
                {info.overview}
              </p>
            )}

            {/* Genres */}
            {info?.genres && info.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {info.genres.map((genre, gi) => (
                  <span
                    key={`genre-${gi}-${genre}`}
                    className="px-2.5 py-0.5 rounded-lg bg-white/[0.03] text-zinc-500 text-[10px] border border-white/[0.04]"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* Season Selector */}
            {!isMovie && seasonList.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">Season</span>
                {seasonList.map((s) => (
                  <button
                    key={s.season}
                    onClick={() => {
                      setSelectedSeason(parseInt(s.season));
                      setSelectedEpisode(1);
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedSeason === parseInt(s.season)
                        ? "bg-[#06b6d4] text-white"
                        : "bg-[#0f0f15] text-zinc-400 hover:text-white border border-white/[0.04]"
                    }`}
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            )}

            {/* Episode Navigation */}
            {!isMovie && episodes.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                {selectedEpisode > 1 && (
                  <button
                    onClick={() => setSelectedEpisode(Math.max(1, selectedEpisode - 1))}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] text-zinc-400 hover:text-white text-xs transition-all border border-white/[0.04] font-medium"
                  >
                    <SkipBack className="w-3.5 h-3.5" /> Previous
                  </button>
                )}
                {selectedEpisode < episodes.length && (
                  <button
                    onClick={() => setSelectedEpisode(Math.min(episodes.length, selectedEpisode + 1))}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#06b6d4]/10 hover:bg-[#06b6d4]/20 text-[#06b6d4] text-xs transition-all border border-[#06b6d4]/10 font-medium"
                  >
                    Next <SkipForward className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Server Selection */}
            {servers.length > 0 && (
              <div className="p-4 rounded-xl bg-[#0f0f15] border border-white/[0.04] space-y-3">
                <h4 className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Stream Servers</h4>
                <div className="flex flex-wrap items-center gap-2">
                  {servers.map((server, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedServer(idx)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedServer === idx
                          ? "bg-[#06b6d4] text-white shadow-lg shadow-[#06b6d4]/25"
                          : "bg-[#15151d] text-zinc-400 hover:text-white"
                      }`}
                    >
                      {server.server.includes("1") || idx === 0 ? (
                        <Tv className="w-3 h-3" />
                      ) : (
                        <Film className="w-3 h-3" />
                      )}
                      {server.server}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Retry */}
            <div className="flex gap-3">
              <button
                onClick={() => isMovie ? loadMovieStream() : loadEpisodeStream()}
                disabled={streamLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0f0f15] hover:bg-[#06b6d4]/10 text-zinc-400 hover:text-[#06b6d4] text-xs transition-all disabled:opacity-50 border border-white/[0.04] font-medium"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${streamLoading ? "animate-spin" : ""}`} /> Reload Stream
              </button>
            </div>
          </div>
        </div>

        {/* Episode List Sidebar */}
        {!isMovie && showEpList && episodes.length > 0 && (
          <div className="lg:w-80 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
                <List className="w-4 h-4" /> Episodes ({episodes.length})
              </h3>
              <button
                onClick={() => setShowEpList(false)}
                className="text-zinc-500 hover:text-white text-xs lg:hidden"
              >
                Hide
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto rounded-xl bg-[#0f0f15] border border-white/[0.04]">
              {episodes.map((ep) => {
                const isActive = parseInt(ep.episode) === selectedEpisode;
                return (
                  <button
                    key={`ep-${ep.season}-${ep.episode}`}
                    onClick={() => setSelectedEpisode(parseInt(ep.episode))}
                    className={`episode-item w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-all border-l-2 ${
                      isActive
                        ? "active bg-[#06b6d4]/10 text-[#06b6d4] border-l-[#06b6d4]"
                        : "text-zinc-500 hover:bg-white/[0.03] hover:text-white border-l-transparent"
                    }`}
                  >
                    <span className="text-[10px] font-bold w-8 text-right flex-shrink-0">
                      {ep.episode}
                    </span>
                    <span className="text-[10px] truncate flex-1">{ep.title}</span>
                    {isActive && <Play className="w-2.5 h-2.5 ml-auto flex-shrink-0 text-[#06b6d4]" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
