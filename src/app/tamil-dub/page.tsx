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
import { getWebPageSchema, getBreadcrumbSchema, getItemListSchema, getFAQSchema } from "@/lib/seo/schemas";
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

  const faqSchema = getFAQSchema([
    {
      question: "Where can I watch anime in Tamil dub for free?",
      answer: "You can watch Tamil dubbed anime for free on LuffyTV (luffytv.live). LuffyTV offers 1,000+ anime episodes dubbed in Tamil with HD quality, no signup, and no ads.",
    },
    {
      question: "Which anime are available in Tamil dub on LuffyTV?",
      answer: "LuffyTV has Tamil dubs for popular anime including Jujutsu Kaisen, Demon Slayer (Kimetsu no Yaiba), One Piece, Solo Leveling, Attack on Titan, Dragon Ball Super, Naruto Shippuden, Chainsaw Man, My Hero Academia, and many more.",
    },
    {
      question: "Is LuffyTV free for watching Tamil dubbed anime?",
      answer: "Yes, LuffyTV is completely free. No signup, no ads, and no payment required. Just visit luffytv.live/tamil-dub and start watching Tamil dubbed anime instantly.",
    },
    {
      question: "How do I switch between Tamil dub and English sub?",
      answer: "On any episode page, use the audio/subtitle toggle to switch between Tamil dub and English sub. LuffyTV supports multiple audio tracks and subtitle languages.",
    },
    {
      question: "Are new Tamil dub episodes added regularly?",
      answer: "Yes, LuffyTV adds new Tamil dubbed episodes daily. Check the schedule page to see when new episodes are airing, or visit the Tamil dub page for the latest additions.",
    },
  ]);

  return (
    <>
      <JsonLd data={[webPageSchema, breadcrumbSchema, itemListSchema, faqSchema]} />
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

          {/* FAQ Section — targets rich results for "anime in tamil" queries */}
          <section className="max-w-3xl mt-10" aria-labelledby="tamil-faq-heading">
            <h2 id="tamil-faq-heading" className="text-xl font-bold mb-4">
              Frequently Asked Questions — Tamil Dubbed Anime
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-sm">Where can I watch anime in Tamil dub for free?</h3>
                <p className="text-muted-foreground text-sm mt-1">You can watch Tamil dubbed anime for free on LuffyTV (luffytv.live). LuffyTV offers 1,000+ anime episodes dubbed in Tamil with HD quality, no signup, and no ads.</p>
              </div>
              <div>
                <h3 className="font-semibold text-sm">Which anime are available in Tamil dub on LuffyTV?</h3>
                <p className="text-muted-foreground text-sm mt-1">LuffyTV has Tamil dubs for popular anime including Jujutsu Kaisen, Demon Slayer, One Piece, Solo Leveling, Attack on Titan, Dragon Ball Super, Naruto Shippuden, Chainsaw Man, My Hero Academia, and many more.</p>
              </div>
              <div>
                <h3 className="font-semibold text-sm">Is LuffyTV free for watching Tamil dubbed anime?</h3>
                <p className="text-muted-foreground text-sm mt-1">Yes, LuffyTV is completely free. No signup, no ads, and no payment required. Just visit luffytv.live/tamil-dub and start watching Tamil dubbed anime instantly.</p>
              </div>
              <div>
                <h3 className="font-semibold text-sm">How do I switch between Tamil dub and English sub?</h3>
                <p className="text-muted-foreground text-sm mt-1">On any episode page, use the audio/subtitle toggle to switch between Tamil dub and English sub. LuffyTV supports multiple audio tracks and subtitle languages.</p>
              </div>
              <div>
                <h3 className="font-semibold text-sm">Are new Tamil dub episodes added regularly?</h3>
                <p className="text-muted-foreground text-sm mt-1">Yes, LuffyTV adds new Tamil dubbed episodes daily. Check the schedule page to see when new episodes are airing.</p>
              </div>
            </div>
          </section>

          {/* Tamil-language content block — signals to Google this page is about Tamil */}
          <section className="max-w-3xl mt-10 border-t border-border/40 pt-8" aria-labelledby="tamil-lang-heading">
            <h2 id="tamil-lang-heading" className="text-xl font-bold mb-4">
              தமிழில் அனிமே பார்க்க — Anime in Tamil
            </h2>
            <div className="space-y-4 text-muted-foreground text-sm leading-relaxed">
              <p>
                தமிழ் டப்பில் அனிமே பார்க்க விரும்புகிறீர்களா? LuffyTV-ல் 1,000-க்கும் மேற்பட்ட அனிமே எபிசோடுகளை தமிழ் டப்பில் இலவசமாக HD தரத்தில் ஸ்ட்ரீம் செய்யலாம். ஜுஜுத்சு கைசென், டெமன் ஸ்லேயர், ஒன் பீஸ், சோலோ லெவலிங் போன்ற பிரபலமான அனிமேக்கள் அனைத்தும் தமிழில் கிடைக்கின்றன. பதிவு செய்ய வேண்டாம், விளம்பரங்கள் இல்லை, உடனடியாக பார்க்கலாம்.
              </p>
              <p>
                LuffyTV என்பது இந்தியாவின் #1 இலவச அனிமே ஸ்ட்ரீமிங் தளம். தமிழ், ஹிந்தி, தெலுங்கு, வங்காளம் மற்றும் ஆங்கிலம் உட்பட பல மொழிகளில் அனிமே பார்க்கலாம். தினமும் புதிய தமிழ் டப் எபிசோடுகள் சேர்க்கப்படுகின்றன. luffytv.live/tamil-dub பக்கத்திற்கு செல்லுங்கள்.
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
