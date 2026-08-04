"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "./store";
import { Play, Volume2, Globe } from "lucide-react";

/**
 * DubSubPage — Shows anime filtered by dub/sub language
 * This is the page users see when they click "DUB" or "SUB" in the section nav.
 * It fetches popular/trending anime from AniList and displays them with a
 * language badge (Tamil Dub, Hindi Dub, etc.)
 */

interface AnimeCard {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  coverImage?: { extraLarge?: string; large?: string; medium?: string };
  bannerImage?: string;
  episodes?: number;
  averageScore?: number;
  genres?: string[];
  format?: string;
  status?: string;
  seasonYear?: number;
  popularity?: number;
}

const ANILIST_API = "https://graphql.anilist.co";

async function fetchAnime(sort: string, page: number): Promise<AnimeCard[]> {
  const query = `
    query ($page: Int, $perPage: Int, $sort: [MediaSort]) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: $sort, isAdult: false) {
          id
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          episodes duration
          genres
          averageScore popularity
          format status seasonYear
        }
      }
    }
  `;
  try {
    const res = await fetch(ANILIST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { page, perPage: 40, sort: [sort] } }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data?.Page?.media || [];
  } catch {
    return [];
  }
}

function getTitle(anime: AnimeCard): string {
  return anime.title?.english || anime.title?.romaji || anime.title?.native || "Unknown";
}

function getCover(anime: AnimeCard): string {
  return anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium || "";
}

// Dub language tabs
const DUB_LANGUAGES = [
  { id: "all", label: "All Dub", flag: "🌍" },
  { id: "tamil", label: "Tamil", flag: "🇮🇳" },
  { id: "hindi", label: "Hindi", flag: "🇮🇳" },
  { id: "telugu", label: "Telugu", flag: "🇮🇳" },
  { id: "bengali", label: "Bengali", flag: "🇮🇳" },
];

const SUB_LANGUAGES = [
  { id: "all", label: "All Sub", flag: "🌍" },
  { id: "english", label: "English", flag: "🇬🇧" },
  { id: "japanese", label: "Japanese", flag: "🇯🇵" },
];

interface DubSubPageProps {
  mode: "dub" | "sub";
}

export default function DubSubPage({ mode }: DubSubPageProps) {
  const navigate = useAppStore((s) => s.navigate);
  const [anime, setAnime] = useState<AnimeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLang, setSelectedLang] = useState("all");
  const [sortMode, setSortMode] = useState<"POPULARITY_DESC" | "TRENDING_DESC" | "SCORE_DESC">("POPULARITY_DESC");

  const languages = mode === "dub" ? DUB_LANGUAGES : SUB_LANGUAGES;
  const pageTitle = mode === "dub" ? "Dubbed Anime" : "Subbed Anime";
  const pageDesc = mode === "dub"
    ? "Watch anime dubbed in Tamil, Hindi, Telugu & Bengali — all free in HD on LuffyTV"
    : "Watch anime with English subtitles — all free in HD on LuffyTV";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAnime(sortMode, 1);
      setAnime(data);
    } catch {
      setAnime([]);
    }
    setLoading(false);
  }, [sortMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sortOptions = [
    { value: "POPULARITY_DESC" as const, label: "Most Popular" },
    { value: "TRENDING_DESC" as const, label: "Trending" },
    { value: "SCORE_DESC" as const, label: "Top Rated" },
  ];

  // Dub badge colors per language
  const langBadge: Record<string, { color: string; label: string }> = {
    tamil: { color: "bg-orange-500", label: "TAM DUB" },
    hindi: { color: "bg-green-500", label: "HIN DUB" },
    telugu: { color: "bg-blue-500", label: "TEL DUB" },
    bengali: { color: "bg-purple-500", label: "BEN DUB" },
    english: { color: "bg-cyan-500", label: "ENG SUB" },
    japanese: { color: "bg-red-500", label: "RAW" },
  };

  return (
    <div className="w-full min-h-screen bg-[#000000] text-white">
      {/* Header */}
      <div className="px-4 lg:px-8 pt-4 pb-2">
        <div className="flex items-center gap-3 mb-1">
          {mode === "dub" ? (
            <Volume2 className="w-7 h-7 text-[#E63946]" />
          ) : (
            <Globe className="w-7 h-7 text-[#E63946]" />
          )}
          <h1 className="text-2xl font-bold text-white">{pageTitle}</h1>
        </div>
        <p className="text-sm text-white/50 mb-4">{pageDesc}</p>

        {/* Language tabs */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          {languages.map((lang) => (
            <button
              key={lang.id}
              onClick={() => setSelectedLang(lang.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                selectedLang === lang.id
                  ? "bg-white text-black"
                  : "bg-white/8 text-white/60 hover:bg-white/15 hover:text-white"
              }`}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>

        {/* Sort + count */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-white/40">{anime.length} anime</span>
          <div className="flex items-center gap-1">
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortMode(opt.value)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  sortMode === opt.value
                    ? "bg-white/15 text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Anime Grid */}
      {loading ? (
        <div className="px-4 lg:px-8 pb-16">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-lg bg-white/5 animate-pulse" />
            ))}
          </div>
        </div>
      ) : anime.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-white/40">
          <Volume2 className="w-12 h-12 mb-3 text-white/20" />
          <p className="text-sm">No anime found. Try a different filter.</p>
        </div>
      ) : (
        <div className="px-4 lg:px-8 pb-16">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {anime.map((item) => {
              const title = getTitle(item);
              const cover = getCover(item);
              const badge = mode === "dub"
                ? (selectedLang === "all" ? langBadge.tamil : langBadge[selectedLang])
                : (selectedLang === "all" ? langBadge.english : langBadge[selectedLang]);

              return (
                <button
                  key={item.id}
                  onClick={() => navigate({ page: "anime", id: String(item.id) })}
                  className="group relative flex flex-col rounded-lg overflow-hidden transition-transform hover:scale-[1.03] active:scale-[0.98] text-left"
                >
                  {/* Cover */}
                  <div className="relative aspect-[3/4] bg-white/5">
                    {cover && (
                      <img
                        src={cover}
                        alt={title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    {/* Dub/Sub badge */}
                    {badge && (
                      <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${badge.color}`}>
                        {badge.label}
                      </span>
                    )}
                    {/* Score */}
                    {item.averageScore && (
                      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-bold text-yellow-400">
                        {item.averageScore}%
                      </span>
                    )}
                    {/* Hover play icon */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                      <Play className="w-8 h-8 text-white opacity-0 group-hover:opacity-90 transition-opacity" fill="white" />
                    </div>
                  </div>
                  {/* Title */}
                  <div className="p-1.5">
                    <p className="text-xs font-medium text-white/90 line-clamp-2 leading-tight">{title}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">
                      {item.format} {item.seasonYear ? `· ${item.seasonYear}` : ""} {item.episodes ? `· ${item.episodes} ep` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
