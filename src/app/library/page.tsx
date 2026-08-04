/**
 * Library Page — /library
 * 
 * Targets: "anime library", "browse anime", "anime list",
 *          "all anime series", "anime catalog"
 */

import type { Metadata } from "next";
import Link from "next/link";
import { PAGE_SEO } from "@/lib/seo/page-seo";
import { getWebPageSchema } from "@/lib/seo/schemas";
import { TRENDING_ANIME } from "@/lib/seo/anime-data";
import { JsonLd } from "@/components/seo/json-ld";
import { SeoBreadcrumbs } from "@/components/seo/seo-breadcrumbs";
import { Library, Play, Search, Star, Grid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = PAGE_SEO.library;

export default function LibraryPage() {
  const webPageSchema = getWebPageSchema({
    title: "Anime Library",
    description: "Browse the complete LuffyTV anime library. Search and filter thousands of anime series and movies.",
    path: "/library",
  });

  // Collect all unique genres
  const allGenres = [...new Set(TRENDING_ANIME.flatMap((a) => a.genre))].sort();

  return (
    <>
      <JsonLd data={webPageSchema} />
      <SeoBreadcrumbs items={[{ name: "Library", path: "/library" }]} />

      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur">
          <nav className="container mx-auto flex h-14 items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
              <Play className="h-6 w-6 text-rose-500" />
              <span>LuffyTV</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/trending" className="text-sm font-medium text-muted-foreground hover:text-foreground">Trending</Link>
              <Link href="/library" className="text-sm font-medium text-rose-500">Library</Link>
              <Link href="/schedule" className="text-sm font-medium text-muted-foreground hover:text-foreground">Schedule</Link>
            </div>
          </nav>
        </header>

        <main className="container mx-auto px-4 py-8 flex-1">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Library className="h-8 w-8 text-rose-500" />
              Anime Library
            </h1>
            <p className="mt-2 text-muted-foreground">
              Browse our complete collection of anime series and movies. Search by title, filter by genre, and find your next favorite show.
            </p>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search anime by title..."
                className="pl-9"
                aria-label="Search anime by title"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" aria-label="Grid view">
                <Grid className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" aria-label="List view">
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Genre tags */}
          <div className="flex flex-wrap gap-2 mb-8" role="list" aria-label="Filter by genre">
            {allGenres.map((genre) => (
              <Badge
                key={genre}
                variant="outline"
                className="cursor-pointer hover:bg-rose-500 hover:text-white transition-colors"
                role="listitem"
              >
                {genre}
              </Badge>
            ))}
          </div>

          {/* Anime list */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {TRENDING_ANIME.map((anime) => (
              <Link
                key={anime.id}
                href={`/anime/${anime.slug}`}
                className="group"
                title={`Watch ${anime.title} online free`}
              >
                <Card className="overflow-hidden border-0 shadow-none hover:shadow-md transition-all">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
                    <div className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-muted-foreground/20">
                      {anime.title.charAt(0)}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="flex flex-wrap gap-1">
                        {anime.genre.slice(0, 2).map((g) => (
                          <Badge key={g} className="text-[9px] px-1 py-0" variant="secondary">
                            {g}
                          </Badge>
                        ))}
                      </div>
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
                      <span>{anime.year}</span>
                      <span>{anime.status}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </main>

        <footer className="mt-auto border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} LuffyTV — luffytv.to
        </footer>
      </div>
    </>
  );
}
