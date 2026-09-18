import { NextRequest, NextResponse } from "next/server";
import { getSchedule } from "@/lib/cdn/cdn-db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const now = Math.floor(Date.now() / 1000);
  const from = parseInt(req.nextUrl.searchParams.get("from") || String(now), 10);
  const to = parseInt(req.nextUrl.searchParams.get("to") || String(now + 7 * 86400), 10);
  const animeList = getSchedule(from, to);
  const schedule = animeList
    .filter((a) => a?.next_airing_episode?.airingAt)
    .map((a) => ({
      id: a.anilist_id,
      airingAt: a.next_airing_episode.airingAt,
      episode: a.next_airing_episode.episode,
      media: {
        id: a.anilist_id, title: a.title,
        cover_image: a.cover_image, banner_image: a.banner_image,
        format: a.format, status: a.status, is_adult: a.is_adult, genres: a.genres,
      },
    }));
  return NextResponse.json({ from, to, total: schedule.length, schedule }, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" },
  });
}
