/**
 * Trending Page — /trending
 * 
 * Targets: "trending anime", "popular anime", "top anime",
 *          "most watched anime", "anime rankings"
 */

import type { Metadata } from "next";
import Link from "next/link";
import { PAGE_SEO } from "@/lib/seo/page-seo";
import { getWebPageSchema, getBreadcrumbSchema, getItemListSchema } from "@/lib/seo/schemas";
import { TRENDING_ANIME } from "@/lib/seo/anime-data";
import { SITE_CONFIG } from "@/lib/seo/config";
import { JsonLd } from "@/components/seo/json-ld";
import { SeoBreadcrumbs } from "@/components/seo/seo-breadcrumbs";
import { Star, Play, TrendingUp, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const metadata: Metadata = PAGE_SEO.trending;

export default function TrendingPage() {
  const webPageSchema = getWebPageSchema({
    title: "Trending Anime",
    description: "Discover the most popular and trending anime right now on LuffyTV.",
    path: "/trending",
  });

  const itemListSchema = getItemListSchema(
    TRENDING_ANIME.map((a) => ({
      name: a.title,
      url: `${SITE_CONFIG.primaryDomain}/anime/${a.slug}`,
      image: a.image,
    }))
  );

  return (
    <>
      <JsonLd data={[webPageSchema, itemListSchema]} />
      <SeoBreadcrumbs items={[{ name: "Trending", path: "/trending" }]} />

      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur">
          <nav className="container mx-auto flex h-14 items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
              <Play className="h-6 w-6 text-rose-500" />
              <span>LuffyTV</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/trending" className="text-sm font-medium text-rose-500">Trending</Link>
              <Link href="/library" className="text-sm font-medium text-muted-foreground hover:text-foreground">Library</Link>
              <Link href="/schedule" className="text-sm font-medium text-muted-foreground hover:text-foreground">Schedule</Link>
            </div>
          </nav>
        </header>

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <TrendingUp className="h-8 w-8 text-rose-500" />
              Trending Anime
            </h1>
            <p className="mt-2 text-muted-foreground">
              The most popular anime right now, updated daily. See what everyone is watching.
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-6">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select defaultValue="all">
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Genre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genres</SelectItem>
                <SelectItem value="action">Action</SelectItem>
                <SelectItem value="adventure">Adventure</SelectItem>
                <SelectItem value="comedy">Comedy</SelectItem>
                <SelectItem value="fantasy">Fantasy</SelectItem>
                <SelectItem value="drama">Drama</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="trending">
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trending">Trending</SelectItem>
                <SelectItem value="rating">Top Rated</SelectItem>
                <SelectItem value="recent">Recently Updated</SelectItem>
                <SelectItem value="az">A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Anime grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {TRENDING_ANIME.map((anime, index) => (
              <Link
                key={anime.id}
                href={`/anime/${anime.slug}`}
                className="group"
                title={`Watch ${anime.title} online free on LuffyTV`}
              >
                <Card className="overflow-hidden border-0 shadow-none hover:shadow-md transition-all">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
                    <div className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-muted-foreground/20">
                      {anime.title.charAt(0)}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <Badge className="absolute top-2 right-2 text-[10px]" variant="secondary">
                      #{index + 1}
                    </Badge>
                    {anime.status === "Airing" && (
                      <Badge className="absolute top-2 left-2 text-[10px] bg-green-500 text-white">AIRING</Badge>
                    )}
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="text-xs text-white/80 line-clamp-1">{anime.genre.slice(0, 2).join(" · ")}</p>
                    </div>
                  </div>
                  <CardContent className="p-2.5">
                    <h2 className="text-sm font-medium line-clamp-2 group-hover:text-rose-500 transition-colors">
                      {anime.title}
                    </h2>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                        {anime.rating}
                      </span>
                      <span>EP {anime.currentEpisode}</span>
                      {anime.subDub === "both" && <span>Sub/Dub</span>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-auto border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} LuffyTV — luffytv.live
        </footer>
      </div>
    </>
  );
}
