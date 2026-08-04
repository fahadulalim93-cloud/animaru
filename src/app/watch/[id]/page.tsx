/**
 * Watch/Episode Page — /watch/[id]
 * 
 * This page has VideoObject schema markup for video rich results.
 * Targets: "watch [anime] episode [N] online free"
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWatchPageSEO } from "@/lib/seo/page-seo";
import { getVideoObjectSchema, getWebPageSchema, getBreadcrumbSchema } from "@/lib/seo/schemas";
import { canonicalUrl, SITE_CONFIG } from "@/lib/seo/config";
import { TRENDING_ANIME } from "@/lib/seo/anime-data";
import { JsonLd } from "@/components/seo/json-ld";
import { SeoBreadcrumbs } from "@/components/seo/seo-breadcrumbs";
import { Play, ChevronLeft, ChevronRight, Volume2, Maximize, Settings, SkipForward, SkipBack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ─── Dynamic Metadata ───────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  
  // Parse episode ID: "one-piece-episode-1" → { slug: "one-piece", ep: 1 }
  const match = id.match(/^(.+)-episode-(\d+)$/);
  if (!match) return {};

  const slug = match[1];
  const episodeNumber = parseInt(match[2], 10);
  const anime = TRENDING_ANIME.find((a) => a.slug === slug);
  if (!anime) return {};

  return getWatchPageSEO({
    animeTitle: anime.title,
    episodeNumber,
    slug: anime.slug,
    episodeId: id,
  });
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const match = id.match(/^(.+)-episode-(\d+)$/);
  if (!match) notFound();

  const slug = match[1];
  const episodeNumber = parseInt(match[2], 10);
  const anime = TRENDING_ANIME.find((a) => a.slug === slug);
  if (!anime) notFound();

  const episodeTitle = `Episode ${episodeNumber}`;
  const fullTitle = `${anime.title} ${episodeTitle}`;

  // VideoObject schema
  const videoSchema = getVideoObjectSchema({
    title: fullTitle,
    description: `Watch ${fullTitle} of ${anime.title} online for free in HD on LuffyTV.`,
    slug: anime.slug,
    episodeId: id,
    image: anime.image,
    duration: "PT24M",
    seriesName: anime.title,
    episodeNumber,
  });

  const webPageSchema = getWebPageSchema({
    title: `Watch ${fullTitle} Online Free`,
    description: `Watch ${fullTitle} of ${anime.title} online for free in HD on LuffyTV.`,
    path: `/watch/${id}`,
    type: "ItemPage",
  });

  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: anime.title, path: `/anime/${anime.slug}` },
    { name: episodeTitle, path: `/watch/${id}` },
  ]);

  const prevEpId = episodeNumber > 1 ? `${slug}-episode-${episodeNumber - 1}` : null;
  const nextEpId = episodeNumber < anime.currentEpisode ? `${slug}-episode-${episodeNumber + 1}` : null;

  return (
    <>
      <JsonLd data={[webPageSchema, videoSchema, breadcrumbSchema]} />
      <SeoBreadcrumbs items={[
        { name: anime.title, path: `/anime/${anime.slug}` },
        { name: episodeTitle, path: `/watch/${id}` },
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

        <main className="container mx-auto px-4 py-6 flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Video player area */}
            <div className="lg:col-span-3">
              {/* Player */}
              <div className="relative aspect-video rounded-lg bg-black flex items-center justify-center overflow-hidden">
                <div className="text-center text-white/40">
                  <Play className="h-16 w-16 mx-auto mb-2" />
                  <p className="text-sm">{fullTitle}</p>
                  <p className="text-xs mt-1">Click to play</p>
                </div>

                {/* Player controls */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <div className="flex items-center justify-between text-white/80">
                    <div className="flex items-center gap-2">
                      {prevEpId && (
                        <Link href={`/watch/${prevEpId}`} title="Previous episode">
                          <SkipBack className="h-4 w-4 hover:text-white transition-colors" />
                        </Link>
                      )}
                      <Play className="h-5 w-5" />
                      {nextEpId && (
                        <Link href={`/watch/${nextEpId}`} title="Next episode">
                          <SkipForward className="h-4 w-4 hover:text-white transition-colors" />
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Volume2 className="h-4 w-4" />
                      <Settings className="h-4 w-4" />
                      <Maximize className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Episode info */}
              <div className="mt-4">
                <h1 className="text-xl font-bold">{fullTitle}</h1>
                <div className="flex items-center gap-3 mt-2">
                  <Link href={`/anime/${anime.slug}`} className="text-sm text-rose-500 hover:text-rose-600">
                    {anime.title}
                  </Link>
                  <Badge variant="outline" className="text-xs">Sub</Badge>
                  {anime.subDub === "both" && <Badge variant="outline" className="text-xs">Dub</Badge>}
                  <Badge variant="outline" className="text-xs">HD</Badge>
                </div>
              </div>

              {/* Episode navigation */}
              <div className="flex items-center justify-between mt-4">
                {prevEpId ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/watch/${prevEpId}`}>
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Ep {episodeNumber - 1}
                    </Link>
                  </Button>
                ) : <div />}
                {nextEpId ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/watch/${nextEpId}`}>
                      Ep {episodeNumber + 1}
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                ) : <div />}
              </div>
            </div>

            {/* Episode list sidebar */}
            <div>
              <h2 className="font-semibold mb-3">Episodes</h2>
              <div className="max-h-[70vh] overflow-y-auto space-y-1 pr-2">
                {Array.from({ length: Math.min(anime.currentEpisode, 50) }, (_, i) => {
                  const epNum = i + 1;
                  const isActive = epNum === episodeNumber;
                  const epId = `${slug}-episode-${epNum}`;
                  return (
                    <Link
                      key={epNum}
                      href={`/watch/${epId}`}
                      className={`flex items-center gap-3 p-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? "bg-rose-500/10 text-rose-500 font-medium"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                      title={`Watch ${anime.title} Episode ${epNum}`}
                    >
                      <span className="w-6 text-right text-xs">{epNum}</span>
                      {isActive && <Play className="h-3 w-3" />}
                    </Link>
                  );
                })}
              </div>
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
