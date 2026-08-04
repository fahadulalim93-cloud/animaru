/**
 * Schedule Page — /schedule
 * 
 * Targets: "anime schedule", "anime release calendar",
 *          "new anime episodes", "weekly anime releases"
 */

import type { Metadata } from "next";
import Link from "next/link";
import { PAGE_SEO } from "@/lib/seo/page-seo";
import { getWebPageSchema } from "@/lib/seo/schemas";
import { WEEKLY_SCHEDULE, TRENDING_ANIME } from "@/lib/seo/anime-data";
import { JsonLd } from "@/components/seo/json-ld";
import { SeoBreadcrumbs } from "@/components/seo/seo-breadcrumbs";
import { Calendar, Play, Clock, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata: Metadata = PAGE_SEO.schedule;

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export default function SchedulePage() {
  const webPageSchema = getWebPageSchema({
    title: "Anime Schedule",
    description: "Track upcoming anime episodes with the LuffyTV weekly schedule.",
    path: "/schedule",
  });

  return (
    <>
      <JsonLd data={webPageSchema} />
      <SeoBreadcrumbs items={[{ name: "Schedule", path: "/schedule" }]} />

      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur">
          <nav className="container mx-auto flex h-14 items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
              <Play className="h-6 w-6 text-rose-500" />
              <span>LuffyTV</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/trending" className="text-sm font-medium text-muted-foreground hover:text-foreground">Trending</Link>
              <Link href="/library" className="text-sm font-medium text-muted-foreground hover:text-foreground">Library</Link>
              <Link href="/schedule" className="text-sm font-medium text-rose-500">Schedule</Link>
            </div>
          </nav>
        </header>

        <main className="container mx-auto px-4 py-8 flex-1">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Calendar className="h-8 w-8 text-rose-500" />
              Anime Schedule
            </h1>
            <p className="mt-2 text-muted-foreground">
              Weekly anime release calendar. See what episodes are airing each day and never miss a new release.
            </p>
          </div>

          <Tabs defaultValue="Sunday" className="w-full">
            <TabsList className="w-full flex overflow-x-auto">
              {DAYS.map((day) => (
                <TabsTrigger key={day} value={day} className="flex-1 min-w-[80px]">
                  {day.slice(0, 3)}
                </TabsTrigger>
              ))}
            </TabsList>

            {DAYS.map((day) => (
              <TabsContent key={day} value={day} className="mt-6">
                <h2 className="text-xl font-semibold mb-4">{day} Airing Schedule</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(WEEKLY_SCHEDULE[day] || []).length > 0 ? (
                    (WEEKLY_SCHEDULE[day] || []).map((anime) => (
                      <Link
                        key={anime.id}
                        href={`/anime/${anime.slug}`}
                        className="group"
                        title={`Watch ${anime.title} on LuffyTV`}
                      >
                        <Card className="hover:shadow-md transition-all">
                          <CardContent className="p-4 flex gap-4">
                            <div className="w-16 h-20 rounded-md bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground/30 shrink-0">
                              {anime.title.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-sm group-hover:text-rose-500 transition-colors line-clamp-1">
                                {anime.title}
                              </h3>
                              <p className="text-xs text-muted-foreground mt-1">
                                Episode {anime.currentEpisode + 1}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-[10px]">{anime.status}</Badge>
                                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                  {anime.rating}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm col-span-full">
                      No anime scheduled for {day}. Check back later!
                    </p>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>

          {/* Currently Airing section */}
          <section className="mt-12" aria-labelledby="airing-heading">
            <h2 id="airing-heading" className="text-xl font-bold mb-4">Currently Airing</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {TRENDING_ANIME.filter((a) => a.status === "Airing").map((anime) => (
                <Link key={anime.id} href={`/anime/${anime.slug}`} className="group" title={`Watch ${anime.title}`}>
                  <Card className="overflow-hidden border-0 shadow-none hover:shadow-md transition-all">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
                      <div className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-muted-foreground/20">
                        {anime.title.charAt(0)}
                      </div>
                      <Badge className="absolute top-2 left-2 text-[10px] bg-green-500 text-white">AIRING</Badge>
                    </div>
                    <CardContent className="p-2.5">
                      <h3 className="text-sm font-medium line-clamp-1 group-hover:text-rose-500 transition-colors">{anime.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">EP {anime.currentEpisode}/{anime.episodes}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        </main>

        <footer className="mt-auto border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} LuffyTV — luffytv.to
        </footer>
      </div>
    </>
  );
}
