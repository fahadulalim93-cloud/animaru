/**
 * Tamil Dubbed Anime Page — /tamil-dub
 * 
 * 🔑 THIS IS THE PAGE THAT RANKS FOR "anime in tamil" / "tamil dubbed anime"
 * 
 * When someone in Tamil Nadu searches "anime in tamil" or "tamil dubbed anime",
 * THIS is the page we want Google to show them.
 * 
 * SEO targets:
 * - "anime in tamil"
 * - "tamil dubbed anime"
 * - "watch anime tamil dub"
 * - "anime tamil dub online free"
 * - "tamil anime episodes"
 */

import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata, SITE_CONFIG } from "@/lib/seo/config";
import { getWebPageSchema, getBreadcrumbSchema, getItemListSchema } from "@/lib/seo/schemas";
import { TRENDING_ANIME } from "@/lib/seo/anime-data";
import { JsonLd } from "@/components/seo/json-ld";
import { SeoBreadcrumbs } from "@/components/seo/seo-breadcrumbs";
import { Play, Star, Globe, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = buildPageMetadata({
  title: "Watch Tamil Dubbed Anime Online Free in HD",
  description:
    "Watch Tamil dubbed anime online for free in HD on LuffyTV. Stream 1,000+ anime episodes in Tamil dub including Jujutsu Kaisen, Demon Slayer, One Piece, Solo Leveling and more. No signup, no ads, instant playback.",
  path: "/tamil-dub",
  keywords: [
    "anime in tamil",
    "tamil dubbed anime",
    "watch anime tamil dub",
    "anime tamil dub online free",
    "tamil anime episodes",
    "tamil dub anime streaming",
    "anime in tamil language",
    "tamil anime watch free",
    "LuffyTV tamil",
  ],
  hreflangPath: "/tamil-dub",
});

export default function TamilDubPage() {
  const webPageSchema = getWebPageSchema({
    title: "Tamil Dubbed Anime — Watch Online Free",
    description: "Watch Tamil dubbed anime online for free in HD on LuffyTV.",
    path: "/tamil-dub",
  });

  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Tamil Dub", path: "/tamil-dub" },
  ]);

  const itemListSchema = getItemListSchema(
    TRENDING_ANIME.map((a) => ({
      name: `${a.title} Tamil Dub`,
      url: `${SITE_CONFIG.primaryDomain}/anime/${a.slug}`,
      image: a.image,
    }))
  );

  return (
    <>
      <JsonLd data={[webPageSchema, breadcrumbSchema, itemListSchema]} />
      <SeoBreadcrumbs items={[{ name: "Tamil Dub", path: "/tamil-dub" }]} />

      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur">
          <nav className="container mx-auto flex h-14 items-center justify-between px-4" aria-label="Main navigation">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
              <Play className="h-6 w-6 text-rose-500" />
              <span>LuffyTV</span>
            </Link>
            <div className="flex items-center gap-2 overflow-x-auto">
              <Badge className="bg-rose-500 text-white shrink-0">தமிழ் Tamil</Badge>
              <Link href="/hindi-dub" className="text-xs text-muted-foreground hover:text-foreground shrink-0">Hindi</Link>
              <Link href="/telugu-dub" className="text-xs text-muted-foreground hover:text-foreground shrink-0">Telugu</Link>
              <Link href="/bengali-dub" className="text-xs text-muted-foreground hover:text-foreground shrink-0">Bengali</Link>
            </div>
          </nav>
        </header>

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Hero */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-5 w-5 text-rose-500" />
              <Badge variant="outline" className="text-xs">தமிழ் Tamil Dub</Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Watch Tamil Dubbed Anime Online Free
            </h1>
            <p className="mt-3 text-muted-foreground max-w-2xl">
              Stream 1,000+ anime episodes dubbed in Tamil on LuffyTV. Watch popular series like Jujutsu Kaisen, Demon Slayer, One Piece, Solo Leveling, Attack on Titan and more — all in Tamil dub, HD quality, no signup, no ads.
            </p>
            <div className="flex gap-3 mt-4">
              <Button className="bg-rose-500 hover:bg-rose-600 text-white">
                <Volume2 className="mr-2 h-4 w-4" />
                Browse Tamil Dub
              </Button>
              <Button asChild variant="outline">
                <Link href="/trending">All Anime</Link>
              </Button>
            </div>
          </div>

          {/* Tamil dubbed anime grid */}
          <section aria-labelledby="trending-tamil-heading">
            <h2 id="trending-tamil-heading" className="text-xl font-bold mb-4">
              Trending Tamil Dubbed Anime
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {TRENDING_ANIME.filter(a => a.subDub === "both").map((anime) => (
                <Link
                  key={anime.id}
                  href={`/anime/${anime.slug}`}
                  className="group"
                  title={`Watch ${anime.title} Tamil Dub online free`}
                >
                  <Card className="overflow-hidden border-0 shadow-none hover:shadow-md transition-all">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
                      <div className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-muted-foreground/20">
                        {anime.title.charAt(0)}
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      <Badge className="absolute top-2 left-2 text-[10px] bg-orange-500 text-white">TAMIL</Badge>
                      {anime.status === "Airing" && (
                        <Badge className="absolute top-2 right-2 text-[10px] bg-green-500 text-white">NEW</Badge>
                      )}
                      <div className="absolute bottom-2 left-2 right-2">
                        <p className="text-xs text-white/80 line-clamp-1">{anime.genre[0]}</p>
                      </div>
                    </div>
                    <CardContent className="p-2.5">
                      <h3 className="text-sm font-medium line-clamp-2 group-hover:text-rose-500 transition-colors">
                        {anime.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                          {anime.rating}
                        </span>
                        <span>Tamil Dub</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          <Separator className="my-10" />

          {/* SEO content — keyword rich, crawlable */}
          <section className="max-w-3xl" aria-labelledby="tamil-seo-heading">
            <h2 id="tamil-seo-heading" className="text-xl font-bold mb-4">
              Tamil Dubbed Anime on LuffyTV
            </h2>
            <div className="space-y-4 text-muted-foreground text-sm leading-relaxed">
              <p>
                Looking for anime in Tamil? LuffyTV is your go-to destination for Tamil dubbed anime online. We offer a massive collection of over 1,000 anime episodes dubbed in Tamil, available to stream for free in HD quality. From action-packed series like Jujutsu Kaisen and Demon Slayer to long-running favorites like One Piece and Naruto, our Tamil dub library has something for every anime fan in Tamil Nadu and beyond.
              </p>
              <p>
                Watching Tamil dubbed anime on LuffyTV is completely free — no signup required, no ads interrupting your episodes, and instant playback on any device. Whether you are on mobile, tablet, or desktop, our player is optimized for smooth streaming. We add new Tamil dub episodes daily, so you can always find the latest releases right here.
              </p>
              <p>
                LuffyTV supports multiple Indian language dubs including Tamil, Hindi, Telugu, and Bengali — so you can watch anime in your preferred language. Switch between Tamil dub and English sub on any episode with a single click. Start watching your favorite anime in Tamil right now, no account needed.
              </p>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="mt-auto border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} LuffyTV — Watch Anime Online Free in Tamil, Hindi, Telugu, Bengali & English
        </footer>
      </div>
    </>
  );
}
