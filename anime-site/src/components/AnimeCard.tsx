// src/components/AnimeCard.tsx
import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import type { AnimeMedia } from "@/lib/anilist";

export default function AnimeCard({ anime }: { anime: AnimeMedia }) {
  const title = anime.title.english || anime.title.romaji || anime.title.userPreferred;
  const cover = anime.coverImage.extraLarge || anime.coverImage.large;
  const score = anime.averageScore ? (anime.averageScore / 10).toFixed(1) : null;

  return (
    <Link href={`/anime/${anime.id}`} className="group relative w-[160px] sm:w-[180px] shrink-0">
      {/* Poster */}
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-white/5 transition-all group-hover:scale-[1.03] group-hover:shadow-xl">
        {cover && (
          <Image
            src={cover}
            alt={title}
            fill
            sizes="180px"
            className="object-cover"
          />
        )}
        {/* Score badge */}
        {score && (
          <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded-md text-xs font-bold text-yellow-400 flex items-center gap-1">
            <Star size={10} fill="currentColor" />
            {score}
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {/* Play button on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      {/* Title */}
      <div className="mt-2">
        <h3 className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
          {title}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {anime.seasonYear} • {anime.episodes ? `${anime.episodes} eps` : anime.format}
        </p>
      </div>
    </Link>
  );
}
