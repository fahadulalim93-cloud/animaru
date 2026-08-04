/**
 * Telugu Dubbed Anime Page — /telugu-dub
 */
import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata, SITE_CONFIG } from "@/lib/seo/config";
import { getWebPageSchema, getBreadcrumbSchema } from "@/lib/seo/schemas";
import { TRENDING_ANIME } from "@/lib/seo/anime-data";
import { JsonLd } from "@/components/seo/json-ld";
import { SeoBreadcrumbs } from "@/components/seo/seo-breadcrumbs";
import { Play, Star, Globe, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = buildPageMetadata({
  title: "Watch Telugu Dubbed Anime Online Free in HD",
  description: "Watch Telugu dubbed anime online for free in HD on LuffyTV. Stream anime episodes in Telugu dub including popular series. No signup, no ads, instant playback.",
  path: "/telugu-dub",
  keywords: ["telugu dubbed anime", "anime in telugu", "watch anime telugu dub", "telugu anime online free"],
  hreflangPath: "/telugu-dub",
});

export default function TeluguDubPage() {
  return (
    <>
      <JsonLd data={[getWebPageSchema({ title: "Telugu Dubbed Anime", description: "Watch Telugu dubbed anime online free on LuffyTV.", path: "/telugu-dub" }), getBreadcrumbSchema([{ name: "Home", path: "/" }, { name: "Telugu Dub", path: "/telugu-dub" }])]} />
      <SeoBreadcrumbs items={[{ name: "Telugu Dub", path: "/telugu-dub" }]} />
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur">
          <nav className="container mx-auto flex h-14 items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg"><Play className="h-6 w-6 text-rose-500" /><span>LuffyTV</span></Link>
            <div className="flex items-center gap-2 overflow-x-auto">
              <Link href="/tamil-dub" className="text-xs text-muted-foreground hover:text-foreground shrink-0">Tamil</Link>
              <Link href="/hindi-dub" className="text-xs text-muted-foreground hover:text-foreground shrink-0">Hindi</Link>
              <Badge className="bg-rose-500 text-white shrink-0">తెలుగు Telugu</Badge>
              <Link href="/bengali-dub" className="text-xs text-muted-foreground hover:text-foreground shrink-0">Bengali</Link>
            </div>
          </nav>
        </header>
        <main className="container mx-auto px-4 py-8 flex-1">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2"><Globe className="h-5 w-5 text-rose-500" /><Badge variant="outline" className="text-xs">తెలుగు Telugu Dub</Badge></div>
            <h1 className="text-3xl font-bold tracking-tight">Watch Telugu Dubbed Anime Online Free</h1>
            <p className="mt-3 text-muted-foreground max-w-2xl">Stream anime episodes dubbed in Telugu on LuffyTV. Watch popular series in Telugu dub — HD quality, no signup, no ads.</p>
            <div className="flex gap-3 mt-4"><Button className="bg-rose-500 hover:bg-rose-600 text-white"><Volume2 className="mr-2 h-4 w-4" />Browse Telugu Dub</Button><Button asChild variant="outline"><Link href="/trending">All Anime</Link></Button></div>
          </div>
          <section><h2 className="text-xl font-bold mb-4">Trending Telugu Dubbed Anime</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {TRENDING_ANIME.filter(a => a.subDub === "both").map((anime) => (
                <Link key={anime.id} href={`/anime/${anime.slug}`} className="group" title={`Watch ${anime.title} Telugu Dub`}>
                  <Card className="overflow-hidden border-0 shadow-none hover:shadow-md transition-all">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted"><div className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-muted-foreground/20">{anime.title.charAt(0)}</div><div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" /><Badge className="absolute top-2 left-2 text-[10px] bg-orange-500 text-white">TELUGU</Badge></div>
                    <CardContent className="p-2.5"><h3 className="text-sm font-medium line-clamp-2 group-hover:text-rose-500 transition-colors">{anime.title}</h3><div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground"><span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />{anime.rating}</span><span>Telugu Dub</span></div></CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
          <Separator className="my-10" />
          <section className="max-w-3xl"><h2 className="text-xl font-bold mb-4">Telugu Dubbed Anime on LuffyTV</h2><div className="space-y-4 text-muted-foreground text-sm leading-relaxed"><p>Watch Telugu dubbed anime on LuffyTV for free in HD quality. We offer a growing collection of anime episodes dubbed in Telugu, including popular action, adventure, and fantasy series. No signup required, no ads, and instant playback on any device.</p><p>LuffyTV supports Telugu dub along with Tamil, Hindi, and Bengali dubs. Switch between languages on any episode with one click. New Telugu dubbed episodes are added regularly.</p></div></section>
        </main>
        <footer className="mt-auto border-t border-border/40 py-6 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} LuffyTV</footer>
      </div>
    </>
  );
}
