/**
 * Homepage — The most important page for SEO
 * 
 * This page targets: "watch anime online free", "anime streaming",
 * "trending anime", "latest anime episodes"
 * 
 * SEO features:
 * - H1 with primary keyword
 * - Structured data: ItemList for trending anime
 * - Internal links to all major sections
 * - Semantic HTML with proper heading hierarchy
 */

import type { Metadata } from "next";
import Link from "next/link";
import { SITE_CONFIG } from "@/lib/seo/config";
import { PAGE_SEO } from "@/lib/seo/page-seo";
import { getWebPageSchema, getItemListSchema } from "@/lib/seo/schemas";
import { TRENDING_ANIME } from "@/lib/seo/anime-data";
import { JsonLd } from "@/components/seo/json-ld";
import {
  Play,
  TrendingUp,
  Library,
  Calendar,
  Search,
  Star,
  Users,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Page Metadata ──────────────────────────────────────────────
export const metadata: Metadata = PAGE_SEO.home;

export default function HomePage() {
  // ItemList schema for trending section
  const trendingListSchema = getItemListSchema(
    TRENDING_ANIME.slice(0, 10).map((anime) => ({
      name: anime.title,
      url: `${SITE_CONFIG.primaryDomain}/anime/${anime.slug}`,
      image: anime.image,
    }))
  );

  // WebPage schema
  const webPageSchema = getWebPageSchema({
    title: "LuffyTV — Watch Anime Online Free",
    description: SITE_CONFIG.description,
    path: "/",
  });

  return (
    <>
      {/* Structured Data */}
      <JsonLd data={[webPageSchema, trendingListSchema]} />

      <div className="min-h-screen flex flex-col">
        {/* ─── Header / Navigation ──────────────────────────── */}
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <nav className="container mx-auto flex h-14 items-center justify-between px-4" aria-label="Main navigation">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg" aria-label="LuffyTV Home">
              <Play className="h-6 w-6 text-rose-500" aria-hidden="true" />
              <span>LuffyTV</span>
            </Link>

            <div className="flex items-center gap-4">
              <Link href="/trending" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Trending
              </Link>
              <Link href="/library" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Library
              </Link>
              <Link href="/schedule" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Schedule
              </Link>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" aria-label="Search anime">
                <Search className="h-4 w-4" />
              </Button>
              <Button size="sm" className="bg-rose-500 hover:bg-rose-600 text-white">
                Sign In
              </Button>
            </div>
          </nav>
        </header>

        {/* ─── Hero Section ─────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-border/40" aria-labelledby="hero-heading">
          <div className="absolute inset-0 bg-gradient-to-b from-rose-500/10 via-transparent to-transparent" aria-hidden="true" />
          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="max-w-3xl">
              <h1 id="hero-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
                Watch Anime Online{" "}
                <span className="text-rose-500">Free</span>
              </h1>
              <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
                Stream thousands of anime series and movies in HD. Browse trending shows, track new episodes with our daily schedule, and never miss a release. Subbed and dubbed options available.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" className="bg-rose-500 hover:bg-rose-600 text-white">
                  <Link href="/trending">
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Browse Trending
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/library">
                    <Library className="mr-2 h-4 w-4" />
                    Full Library
                  </Link>
                </Button>
              </div>

              {/* Social proof */}
              <div className="mt-6 flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                  <strong className="text-foreground">5/5</strong> ({SITE_CONFIG.rating.reviewCount} reviews)
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <strong className="text-foreground">{SITE_CONFIG.socialProof.followers}</strong> followers
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Trending Anime Section ───────────────────────── */}
        <section className="container mx-auto px-4 py-12" aria-labelledby="trending-heading">
          <div className="flex items-center justify-between mb-6">
            <h2 id="trending-heading" className="text-2xl font-bold tracking-tight">
              Trending Now
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/trending" className="text-rose-500 hover:text-rose-600">
                View All →
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {TRENDING_ANIME.slice(0, 12).map((anime) => (
              <Link
                key={anime.id}
                href={`/anime/${anime.slug}`}
                className="group"
                title={`Watch ${anime.title} online free`}
              >
                <Card className="overflow-hidden border-0 shadow-none hover:shadow-md transition-shadow">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
                    {/* Placeholder anime image with proper alt text */}
                    <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-muted-foreground/30">
                      {anime.title.charAt(0)}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    {/* Episode badge */}
                    <Badge className="absolute top-2 right-2 text-[10px] px-1.5 py-0" variant="secondary">
                      EP {anime.currentEpisode}
                    </Badge>
                    {anime.status === "Airing" && (
                      <Badge className="absolute top-2 left-2 text-[10px] px-1.5 py-0 bg-green-500 text-white">
                        NEW
                      </Badge>
                    )}
                  </div>
                  <CardContent className="p-2">
                    <h3 className="text-sm font-medium line-clamp-2 group-hover:text-rose-500 transition-colors">
                      {anime.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <Star className="inline h-3 w-3 fill-yellow-500 text-yellow-500 mr-0.5" />
                      {anime.rating}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* ─── Quick Links Section ──────────────────────────── */}
        <section className="container mx-auto px-4 py-8" aria-labelledby="quick-links-heading">
          <h2 id="quick-links-heading" className="sr-only">Quick Navigation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-5 w-5 text-rose-500" />
                  Trending Anime
                </CardTitle>
                <CardDescription>
                  Discover the most popular anime right now. Updated daily with top-rated series and fan favorites.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/trending">Browse Trending</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Library className="h-5 w-5 text-rose-500" />
                  Anime Library
                </CardTitle>
                <CardDescription>
                  Browse thousands of anime series and movies. Filter by genre, year, status, and more.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/library">Open Library</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="h-5 w-5 text-rose-500" />
                  Anime Schedule
                </CardTitle>
                <CardDescription>
                  Track upcoming episodes with our weekly calendar. Never miss a new release again.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/schedule">View Schedule</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ─── Indian Language Dubs Section ────────────────── */}
        <section className="container mx-auto px-4 py-8" aria-labelledby="dub-heading">
          <h2 id="dub-heading" className="text-2xl font-bold tracking-tight flex items-center gap-2 mb-2">
            <Globe className="h-6 w-6 text-rose-500" />
            Watch Anime in Your Language
          </h2>
          <p className="text-muted-foreground mb-6">
            Stream anime dubbed in Tamil, Hindi, Telugu, and Bengali — all free in HD.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Link href="/tamil-dub" className="group">
              <Card className="hover:shadow-md transition-all hover:border-rose-500/50">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl mb-1">🇮🇳</div>
                  <h3 className="font-semibold text-base group-hover:text-rose-500 transition-colors">தமிழ் Tamil</h3>
                  <p className="text-xs text-muted-foreground mt-1">1,000+ episodes in Tamil dub</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/hindi-dub" className="group">
              <Card className="hover:shadow-md transition-all hover:border-rose-500/50">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl mb-1">🇮🇳</div>
                  <h3 className="font-semibold text-base group-hover:text-rose-500 transition-colors">हिन्दी Hindi</h3>
                  <p className="text-xs text-muted-foreground mt-1">1,500+ episodes in Hindi dub</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/telugu-dub" className="group">
              <Card className="hover:shadow-md transition-all hover:border-rose-500/50">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl mb-1">🇮🇳</div>
                  <h3 className="font-semibold text-base group-hover:text-rose-500 transition-colors">తెలుగు Telugu</h3>
                  <p className="text-xs text-muted-foreground mt-1">Anime in Telugu dub</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/bengali-dub" className="group">
              <Card className="hover:shadow-md transition-all hover:border-rose-500/50">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl mb-1">🇮🇳</div>
                  <h3 className="font-semibold text-base group-hover:text-rose-500 transition-colors">বাংলা Bengali</h3>
                  <p className="text-xs text-muted-foreground mt-1">Anime in Bengali dub</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        {/* ─── SEO Content Section (keyword-rich, crawlable) ── */}
        <section className="container mx-auto px-4 py-12 border-t border-border/40" aria-labelledby="about-heading">
          <div className="max-w-3xl">
            <h2 id="about-heading" className="text-xl font-bold mb-4">
              About LuffyTV — Your Free Anime Streaming Destination
            </h2>
            <div className="space-y-4 text-muted-foreground text-sm leading-relaxed">
              <p>
                LuffyTV is the ultimate platform to watch anime online for free. With a massive library spanning 10,000+ anime series, movies, manga and light novels, LuffyTV offers high-definition streaming with English subtitles and Indian language dubs including Tamil, Hindi, Telugu, and Bengali. Whether you are looking for the latest trending anime, classic favorites like One Piece and Attack on Titan, or hidden gems, our platform has everything an anime fan could want.
              </p>
              <p>
                Our trending section updates daily with the most popular anime right now, so you always know what everyone is watching. The full anime library lets you browse and filter by genre, year, airing status, and rating. Each anime page includes detailed information, episode listings, and community ratings to help you find your next binge-worthy series.
              </p>
              <p>
                Never miss a new episode with the LuffyTV anime schedule. Our weekly release calendar shows exactly what is airing each day. Login to save your favorite anime, track your watch progress, and get notifications when new episodes drop. Watch anime on any device — desktop, tablet, or mobile — with a responsive interface optimized for every screen size.
              </p>
              <p>
                For Indian anime fans, LuffyTV offers dedicated dubbed anime pages: watch anime in Tamil dub, Hindi dub, Telugu dub, and Bengali dub. All dubbed episodes are available in HD quality with no signup and no ads. Switch between dub and sub on any episode with a single click.
              </p>
            </div>
          </div>
        </section>

        {/* ─── Footer ───────────────────────────────────────── */}
        <footer className="mt-auto border-t border-border/40 bg-muted/30">
          <div className="container mx-auto px-4 py-8">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-8">
              <div>
                <Link href="/" className="flex items-center gap-2 font-bold text-lg" aria-label="LuffyTV Home">
                  <Play className="h-5 w-5 text-rose-500" aria-hidden="true" />
                  <span>LuffyTV</span>
                </Link>
                <p className="mt-2 text-sm text-muted-foreground">
                  Watch anime online free. HD streaming, subbed & dubbed.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-3">Browse</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><Link href="/trending" className="hover:text-foreground transition-colors">Trending Anime</Link></li>
                  <li><Link href="/library" className="hover:text-foreground transition-colors">Anime Library</Link></li>
                  <li><Link href="/schedule" className="hover:text-foreground transition-colors">Anime Schedule</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-3">Watch in Your Language</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><Link href="/tamil-dub" className="hover:text-foreground transition-colors">Tamil Dubbed Anime</Link></li>
                  <li><Link href="/hindi-dub" className="hover:text-foreground transition-colors">Hindi Dubbed Anime</Link></li>
                  <li><Link href="/telugu-dub" className="hover:text-foreground transition-colors">Telugu Dubbed Anime</Link></li>
                  <li><Link href="/bengali-dub" className="hover:text-foreground transition-colors">Bengali Dubbed Anime</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-3">Community</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><a href={SITE_CONFIG.social.discord} className="hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">Discord</a></li>
                  <li><a href={SITE_CONFIG.social.twitter} className="hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">Twitter</a></li>
                  <li><a href={SITE_CONFIG.social.twitch} className="hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">Twitch</a></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-3">Legal</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><Link href="/dmca" className="hover:text-foreground transition-colors">DMCA</Link></li>
                  <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
                </ul>
              </div>
            </div>
            <div className="mt-8 pt-4 border-t border-border/40 text-center text-xs text-muted-foreground">
              © {new Date().getFullYear()} LuffyTV. All rights reserved. luffytv.to
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
