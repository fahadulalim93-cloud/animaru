"use client";

import { useState, useEffect } from "react";
import { useAppStore, getAnimeTitle, getAnimeImage } from "./store";
import AnimeCard from "./anime-card";
import type { MiruroAnimeResult } from "@/lib/miruro-api";

type DubLanguage = "english" | "spanish" | "portuguese" | "french" | "german" | "italian" | "russian" | "arabic" | "hindi" | "chinese" | "korean";

const LANGUAGES: { id: DubLanguage; label: string; flag: string }[] = [
  { id: "english", label: "English", flag: "EN" },
  { id: "spanish", label: "Spanish", flag: "ES" },
  { id: "portuguese", label: "Portuguese", flag: "PT" },
  { id: "french", label: "French", flag: "FR" },
  { id: "german", label: "German", flag: "DE" },
  { id: "italian", label: "Italian", flag: "IT" },
  { id: "russian", label: "Russian", flag: "RU" },
  { id: "arabic", label: "Arabic", flag: "AR" },
  { id: "hindi", label: "Hindi", flag: "HI" },
  { id: "chinese", label: "Chinese", flag: "ZH" },
  { id: "korean", label: "Korean", flag: "KO" },
];

export default function DubPage() {
  const [activeLang, setActiveLang] = useState<DubLanguage>("english");
  const [results, setResults] = useState<MiruroAnimeResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadDubbed() {
      setLoading(true);
      try {
        const res = await fetch(`/api/anime/home`);
        if (res.ok) {
          const data = await res.json();
          const all: MiruroAnimeResult[] = [
            ...(data.miruroPopular || []),
            ...(data.miruroTrending || []),
          ];
          const seen = new Set<number>();
          const unique = all.filter(a => {
            if (seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
          });
          setResults(unique);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    loadDubbed();
  }, []);

  const navigate = useAppStore(s => s.navigate);

  return (
    <div className="space-y-6 fade-in">
      {/* Header - Terminal Style */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border border-[#D4A017]/20 flex items-center justify-center bg-[#D4A017]/[0.04]" style={{ clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))" }}>
            <svg className="w-4 h-4 text-[#D4A017]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5.586v12.828a1 1 0 01-1.707.707L5.586 15z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-zinc-200 font-mono tracking-wide">DUBBED_ANIME</h1>
            <p className="text-[10px] text-zinc-600 font-mono">{"// watch in your language"}</p>
          </div>
        </div>

        {/* Language Filter - Terminal buttons */}
        <div className="scroll-container flex gap-1 overflow-x-auto pb-2">
          {LANGUAGES.map(lang => (
            <button
              key={`dub-lang-${lang.id}`}
              onClick={() => setActiveLang(lang.id)}
              className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-[9px] font-mono tracking-wider transition-all border ${
                activeLang === lang.id
                  ? "bg-[#D4A017]/[0.06] border-[#D4A017]/20 text-[#D4A017]"
                  : "bg-[#D4A017]/[0.01] border-[#D4A017]/[0.04] text-zinc-600 hover:text-zinc-400"
              }`}
            >
              <span className="text-[8px] opacity-60">{lang.flag}</span>
              {lang.label.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Results Grid */}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] skeleton" />
          ))}
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {results.map((anime, i) => (
            <AnimeCard key={`dub-${anime.id}`} anime={anime} index={i} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 border border-[#D4A017]/[0.04] p-8" style={{ clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))" }}>
          <p className="text-[#D4A017]/40 font-mono text-xs">&gt; NO_DUBBED_ANIME_FOUND</p>
        </div>
      )}
    </div>
  );
}
