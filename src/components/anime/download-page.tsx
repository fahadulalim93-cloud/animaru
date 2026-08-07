"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "./store";

interface DownloadResult {
  id: string;
  title: string;
  episodeCount?: number;
  type?: string;
}

interface DownloadLink {
  text: string;
  url: string;
  decodedUrl: string;
}

interface CatalogAnime {
  id: string;
  titleEnglish?: string;
  titleRomaji?: string;
  coverImage?: any;
  episodeCount?: number;
}

/**
 * DownloadPage — our own download page that scrapes all download links from animex.one.
 *
 * Features:
 *   - Browse popular anime (via animex.one GraphQL catalog)
 *   - Search for anime with download links (via animex.one REST download API)
 *   - Click an anime → see all download links (Google Drive, Mega, etc.)
 *   - Links open in new tabs
 *
 * Per user request:
 *   "hey wat not cratte our own download page and scrape all things form animex"
 */
export default function DownloadPage() {
  const navigate = useAppStore((s) => s.navigate);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DownloadResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [catalog, setCatalog] = useState<CatalogAnime[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [selectedAnime, setSelectedAnime] = useState<DownloadResult | null>(null);
  const [downloadLinks, setDownloadLinks] = useState<DownloadLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);

  // Load popular catalog on mount (first 24 anime from animex.one)
  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const res = await fetch("https://graphql.animex.one/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `{catalogAnime(limit:24,offset:0){items{id titleEnglish titleRomaji coverImage episodeCount}totalCount}}`,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const items = data?.data?.catalogAnime?.items || [];
          setCatalog(items);
        }
      } catch {
        /* ignore */
      } finally {
        setLoadingCatalog(false);
      }
    };
    loadCatalog();
  }, []);

  // Search for download links
  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/anime/download?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch {
      /* ignore */
    } finally {
      setSearching(false);
    }
  }, []);

  // Get download links for a specific anime
  const handleSelectAnime = useCallback(async (anime: DownloadResult) => {
    setSelectedAnime(anime);
    setDownloadLinks([]);
    setLoadingLinks(true);
    try {
      const res = await fetch(`/api/anime/download?id=${encodeURIComponent(anime.id)}`);
      if (res.ok) {
        const data = await res.json();
        setDownloadLinks(data.links || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingLinks(false);
    }
  }, []);

  // Search for download links for a catalog anime (by title)
  const handleCatalogClick = useCallback(async (anime: CatalogAnime) => {
    const title = anime.titleEnglish || anime.titleRomaji || "";
    if (!title) return;
    setSelectedAnime({ id: anime.id, title });
    setDownloadLinks([]);
    setLoadingLinks(true);
    try {
      const res = await fetch(`/api/anime/download?title=${encodeURIComponent(title)}&auto=1`);
      if (res.ok) {
        const data = await res.json();
        setDownloadLinks(data.links || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingLinks(false);
    }
  }, []);

  const getCoverUrl = (coverImage: any) => {
    if (typeof coverImage === "string") return coverImage;
    if (coverImage?.large) return coverImage.large;
    if (coverImage?.medium) return coverImage.medium;
    return "";
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-20">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 pt-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-6 h-6 text-[#1E88FF]" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V5a3 3 0 0 0-6 0v4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 6v3h-2v-3H8l4-4 4 4h-3z" /></svg>
            <h1 className="text-2xl sm:text-3xl font-black text-white">Downloads</h1>
          </div>
          <p className="text-sm text-white/50">
            Search and download anime from external services (Google Drive, Mega, etc.)
          </p>
        </div>

        {/* Search bar */}
        <div className="relative mb-8 max-w-2xl">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              handleSearch(e.target.value);
            }}
            placeholder="Search for anime to download..."
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/30 outline-none focus:border-[#1E88FF]/50 transition-all"
          />
          {searching && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          )}
        </div>

        {/* Two-column layout: list + detail */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Search results or catalog */}
          <div>
            {query.trim() ? (
              // Search results
              <div>
                <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">
                  Search Results {searchResults.length > 0 && `(${searchResults.length})`}
                </h2>
                {searchResults.length === 0 && !searching && (
                  <p className="text-xs text-white/30 py-8 text-center">No results found</p>
                )}
                <div className="space-y-2">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleSelectAnime(result)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                        selectedAnime?.id === result.id
                          ? "bg-[#1E88FF]/10 border-[#1E88FF]/30"
                          : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/15"
                      }`}
                    >
                      <p className="text-sm font-medium text-white/90 truncate">{result.title}</p>
                      {result.episodeCount && (
                        <p className="text-[10px] text-white/30 mt-0.5">{result.episodeCount} episodes</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              // Catalog browse
              <div>
                <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">
                  Popular Anime
                </h2>
                {loadingCatalog ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="aspect-[2/3] rounded-xl bg-white/[0.03] animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {catalog.map((anime) => {
                      const cover = getCoverUrl(anime.coverImage);
                      return (
                        <button
                          key={anime.id}
                          onClick={() => handleCatalogClick(anime)}
                          className="group text-left"
                        >
                          <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.06] group-hover:border-white/20 transition-all">
                            {cover ? (
                              <img
                                src={cover}
                                alt={anime.titleEnglish || anime.titleRomaji || ""}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                                No cover
                              </div>
                            )}
                          </div>
                          <p className="text-[11px] font-medium text-white/70 truncate mt-1.5 group-hover:text-white transition-colors">
                            {anime.titleEnglish || anime.titleRomaji || "Unknown"}
                          </p>
                          {anime.episodeCount && (
                            <p className="text-[9px] text-white/30">{anime.episodeCount} eps</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Download links detail */}
          <div>
            {!selectedAnime ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <svg className="w-12 h-12 text-white/10 mb-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V5a3 3 0 0 0-6 0v4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 6v3h-2v-3H8l4-4 4 4h-3z" /></svg>
                <p className="text-sm text-white/30">Select an anime to see download links</p>
              </div>
            ) : (
              <div>
                {/* Selected anime header */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider">
                    Download Links
                  </h2>
                  <button
                    onClick={() => { setSelectedAnime(null); setDownloadLinks([]); }}
                    className="text-xs text-white/40 hover:text-white transition-colors"
                  >
                    ← Back
                  </button>
                </div>
                <p className="text-sm font-medium text-white mb-4">{selectedAnime.title}</p>

                {/* Loading */}
                {loadingLinks && (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span className="ml-3 text-xs text-white/50">Finding download links...</span>
                  </div>
                )}

                {/* Links */}
                {!loadingLinks && downloadLinks.length > 0 && (
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                    {downloadLinks.map((link, i) => {
                      // Extract the part after "|" for cleaner display
                      const parts = link.text.split("|");
                      const label = parts.length > 1 ? parts[parts.length - 1].trim() : link.text;
                      const source = parts.length > 1 ? parts[0].trim() : "";

                      return (
                        <a
                          key={i}
                          href={link.decodedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/15 transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-white/10 transition-colors">
                              <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V5a3 3 0 0 0-6 0v4H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-6 6v3h-2v-3H8l4-4 4 4h-3z" /></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-white/90 truncate">{label}</p>
                              {source && <p className="text-[10px] text-white/30 truncate">{source}</p>}
                              <p className="text-[9px] text-white/20 truncate">{link.decodedUrl}</p>
                            </div>
                            <svg className="w-3.5 h-3.5 text-white/30 group-hover:text-white/60 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* No links */}
                {!loadingLinks && downloadLinks.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-xs text-white/30 mb-3">No download links found</p>
                    <a
                      href="https://animex.one/community/download"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#1E88FF] hover:underline"
                    >
                      Search on AnimeX
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
