"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "./store";
import AnimeCard from "./anime-card";
import { GENRES } from "@/lib/anime-api";
import type { AnimeItem } from "./store";

interface GenrePageProps {
  genre: string;
}

export default function GenrePage({ genre }: GenrePageProps) {
  const navigate = useAppStore(s => s.navigate);
  const [results, setResults] = useState<AnimeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/anime/genre?genre=${encodeURIComponent(genre)}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [genre]);

  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">{genre} Anime</h1>
        <p className="text-sm text-zinc-500 mt-1">Browse {genre.toLowerCase()} anime</p>
      </div>

      {/* Genre pills */}
      <div className="scroll-container flex gap-2 overflow-x-auto pb-2">
        {GENRES.map(g => (
          <button
            key={g}
            onClick={() => navigate({ page: "genre", genre: g })}
            className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              g === genre
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "bg-white/[0.03] text-zinc-500 hover:text-zinc-300 border border-white/[0.04]"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] skeleton rounded-xl" />
          ))}
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {results.map((anime, i) => (
            <AnimeCard key={anime._id} anime={anime} index={i} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 rounded-2xl bg-[#111827] border border-white/[0.04] p-8">
          <p className="text-zinc-400 text-sm">No anime found for {genre}</p>
        </div>
      )}
    </div>
  );
}
