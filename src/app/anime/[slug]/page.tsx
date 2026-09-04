/**
 * Anime Detail Page — /anime/[slug]
 * 
 * This is a DYNAMIC page with:
 * - TVSeries schema markup
 * - BreadcrumbList schema
 * - Dynamic metadata (title, description, og:image)
 * - Proper canonical URL
 * 
 * In production, this would fetch data from an API/database.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAnimePageSEO } from "@/lib/seo/page-seo";
import { getAnimeSeriesSchema, getWebPageSchema, getBreadcrumbSchema } from "@/lib/seo/schemas";
import { canonicalUrl } from "@/lib/seo/config";
import { getAnimeBySlug, getAllAnimeSlugs, TRENDING_ANIME } from "@/lib/seo/anime-data";
import { JsonLd } from "@/components/seo/json-ld";
import { SeoBreadcrumbs } from "@/components/seo/seo-breadcrumbs";
import { Play, Star, Calendar, Clock, Film, Users, Bookmark, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ─── Static params for SSG ──────────────────────────────────────
export async function generateStaticParams() {
  return getAllAnimeSlugs().map((slug) => ({ slug }));
}

// ─── Dynamic Metadata ───────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const anime = getAnimeBySlug(slug);
  if (!anime) return {};

  return getAnimePageSEO({
    title: anime.title,
    description: anime.description,
    slug: anime.slug,
    genre: anime.genre,
  });
}

export default async function AnimeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const anime = getAnimeBySlug(slug);
  if (!anime) notFound();

  // Schemas
  const seriesSchema = getAnimeSeriesSchema({
    title: anime.title,
    description: anime.description,
    slug: anime.slug,
    image: anime.image,
    rating: { value: anime.rating, count: anime.ratingCount },
    genre: anime.genre,
    episodes: anime.episodes,
    status: anime.status === "Airing" ? "Airing" : anime.status === "Completed" ? "Completed" : "Upcoming",
    startDate: anime.startDate,
    endDate: anime.endDate,
  });

  const webPageSchema = getWebPageSchema({
    title: `${anime.title} — Watch Online Free`,
    description: anime.description,
    path: `/anime/${anime.slug}`,
    type: "ItemPage",
  });

  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Library", path: "/library" },
    { name: anime.title, path: `/anime/${anime.slug}` },
  ]);

  return (
    <>
      <JsonLd data={[webPageSchema, seriesSchema, breadcrumbSchema]} />
      <SeoBreadcrumbs items={[
        { name: "Library", path: "/library" },
        { name: anime.title, path: `/anime/${anime.slug}` },
      ]} />

      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur">
          <nav className="container mx-auto flex h-14 items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
              <Play className="h-6 w-6 text-rose-500" />
              <span>LuffyTV</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/trending" className="text-sm font-medium text-muted-foreground hover:text-foreground">Trending</Link>
              <Link href="/library" className="text-sm font-medium text-muted-foreground hover:text-foreground">Library</Link>
              <Link href="/schedule" className="text-sm font-medium text-muted-foreground hover:text-foreground">Schedule</Link>
            </div>
          </nav>
        </header>

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Anime banner & info */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main info */}
            <div className="lg:col-span-2">
              <div className="flex gap-6">
                {/* Poster */}
                <div className="w-40 sm:w-48 shrink-0">
                  <div className="aspect-[3/4] rounded-lg bg-muted flex items-center justify-center text-5xl font-bold text-muted-foreground/20">
                    {anime.title.charAt(0)}
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1">
                  <h1 className="text-2xl sm:text-3xl font-bold">{anime.title}</h1>
                  {anime.titleJp && (
                    <p className="text-sm text-muted-foreground mt-1">{anime.titleJp}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Badge className="bg-rose-500 text-white">{anime.status}</Badge>
                    <Badge variant="outline">{anime.year}</Badge>
                    <Badge variant="outline">{anime.season}</Badge>
                    {anime.subDub === "both" && <Badge variant="outline">Sub & Dub</Badge>}
                    {anime.subDub === "sub" && <Badge variant="outline">Subbed</Badge>}
                  </div>

                  <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                      <strong className="text-foreground">{anime.rating}</strong>/10
                    </span>
                    <span className="flex items-center gap-1">
                      <Film className="h-4 w-4" />
                      {anime.episodes} episodes
                    </span>
                    {anime.studio && (
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {anime.studio}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    {anime.genre.map((g) => (
                      <Badge key={g} variant="secondary" className="text-xs">
                        {g}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex gap-2 mt-6">
                    <Button className="bg-rose-500 hover:bg-rose-600 text-white">
                      <Play className="mr-2 h-4 w-4" />
                      Watch Now
                    </Button>
                    <Button variant="outline">
                      <Bookmark className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button variant="outline" size="icon">
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Synopsis */}
              <div className="mt-8">
                <h2 className="text-lg font-semibold mb-3">Synopsis</h2>
                <p className="text-muted-foreground leading-relaxed">{anime.description}</p>
              </div>

              <Separator className="my-8" />

              {/* Episode list */}
              <div>
                <h2 className="text-lg font-semibold mb-4">Episodes</h2>
                <div className="space-y-2">
                  {Array.from({ length: Math.min(anime.currentEpisode, 24) }, (_, i) => {
                    const epNum = i + 1;
                    return (
                      <Link
                        key={epNum}
                        href={`/watch/${anime.slug}-episode-${epNum}`}
                        className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted transition-colors group"
                        title={`Watch ${anime.title} Episode ${epNum}`}
                      >
                        <span className="text-sm font-mono text-muted-foreground w-8 text-right">
                          {epNum}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium group-hover:text-rose-500 transition-colors">
                            Episode {epNum}
                          </p>
                        </div>
                        <Play className="h-4 w-4 text-muted-foreground group-hover:text-rose-500 transition-colors" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Anime Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium">{anime.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Episodes</span>
                    <span className="font-medium">{anime.episodes}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Year</span>
                    <span className="font-medium">{anime.year}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Season</span>
                    <span className="font-medium">{anime.season}</span>
                  </div>
                  {anime.studio && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Studio</span>
                      <span className="font-medium">{anime.studio}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rating</span>
                    <span className="font-medium flex items-center gap-1">
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                      {anime.rating}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>

        <footer className="mt-auto border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} LuffyTV — luffytv.live
        </footer>
      </div>
    </>
  );
}
