// src/components/HeroBanner.tsx
"use client";
import { useState, useEffect } from "react";
import { Play, Info, Heart, ChevronLeft, ChevronRight, Calendar, Film } from "lucide-react";
import type { AnimeMedia } from "@/lib/anilist";

interface HeroBannerProps {
  anime: AnimeMedia[];
}

export default function HeroBanner({ anime }: HeroBannerProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || anime.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % anime.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [paused, anime.length]);

  if (!anime.length) return null;

  const current = anime[index];
  const title = current.title.english || current.title.romaji;
  const banner = current.bannerImage || current.coverImage.extraLarge;
  const description = (current.description || "").replace(/<[^>]+>/g, "").slice(0, 200);

  const next = () => setIndex((prev) => (prev + 1) % anime.length);
  const prev = () => setIndex((prev) => (prev - 1 + anime.length) % anime.length);

  return (
    <div
      className="relative h-[70vh] min-h-[500px] w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Background */}
      <div className="absolute inset-0">
        {anime.map((a, i) => (
          <div
            key={a.id}
            className="absolute inset-0 transition-opacity duration-1000"
            style={{
              backgroundImage: `url(${a.bannerImage || a.coverImage.extraLarge})`,
              backgroundSize: "cover",
              backgroundPosition: "center 25%",
              opacity: i === index ? 1 : 0,
            }}
          />
        ))}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />
      </div>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-8 py-5">
        {/* Search */}
        <div className="flex-1 max-w-md mx-auto">
          <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md rounded-full px-5 py-2.5 border border-white/10">
            <input
              type="text"
              placeholder="Search anime..."
              className="flex-1 bg-transparent text-white text-sm placeholder-gray-400 outline-none"
            />
            <SearchIcon size={18} className="text-gray-400" />
          </div>
        </div>
        {/* Sign In */}
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/20 text-white text-sm font-medium hover:bg-white/10 transition-all">
          Sign In
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-8 pb-10">
        <div className="max-w-2xl">
          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3 leading-tight">
            {title?.split(" ").slice(0, -1).join(" ")}{" "}
            <span className="text-blue-500">
              {title?.split(" ").slice(-1)}
            </span>
          </h1>

          {/* Metadata */}
          <div className="flex items-center gap-4 mb-3 text-sm">
            <span className="text-green-500 font-semibold uppercase tracking-wide">
              {current.status === "RELEASING" ? "Releasing" : current.status}
            </span>
            <span className="flex items-center gap-1.5 text-gray-300">
              <Calendar size={14} />
              {current.season ? `${current.season} ${current.seasonYear}` : current.seasonYear}
            </span>
            {current.episodes && (
              <span className="flex items-center gap-1.5 text-gray-300">
                <Film size={14} />
                {current.episodes} Episodes
              </span>
            )}
          </div>

          {/* Synopsis */}
          <p className="text-gray-300/80 text-sm md:text-base mb-5 line-clamp-2">
            {description}
          </p>

          {/* Buttons */}
          <div className="flex items-center gap-3 mb-4">
            <button className="flex items-center gap-2 px-6 py-2.5 bg-white text-black font-bold rounded-md hover:bg-white/90 transition-all text-sm">
              <Play size={18} fill="currentColor" />
              Watch Now
            </button>
            <button className="w-10 h-10 flex items-center justify-center bg-white/10 backdrop-blur-md rounded-md hover:bg-white/20 transition-all">
              <Info size={18} />
            </button>
            <button className="w-10 h-10 flex items-center justify-center bg-white/10 backdrop-blur-md rounded-md hover:bg-white/20 transition-all">
              <Heart size={18} />
            </button>
          </div>

          {/* Carousel indicators */}
          <div className="flex items-center gap-2">
            {anime.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`h-1 rounded-full transition-all ${
                  i === index ? "w-8 bg-white" : "w-4 bg-white/30"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Navigation arrows */}
      <button
        onClick={prev}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-all"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        onClick={next}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-all ml-12"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

function SearchIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
