// src/components/AnimeRow.tsx
"use client";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import AnimeCard from "./AnimeCard";
import type { AnimeMedia } from "@/lib/anilist";

interface AnimeRowProps {
  title: string;
  anime: AnimeMedia[];
}

export default function AnimeRow({ title, anime }: AnimeRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = dir === "left" ? -600 : 600;
    scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  if (!anime.length) return null;

  return (
    <section className="mb-8 px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll("left")}
            className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-all"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => scroll("right")}
            className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-all"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Cards */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide pb-2"
      >
        {anime.map((a) => (
          <AnimeCard key={a.id} anime={a} />
        ))}
      </div>
    </section>
  );
}
