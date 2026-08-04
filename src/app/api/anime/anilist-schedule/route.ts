import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANILIST_API = "https://graphql.anilist.co";

async function anilistQuery(query: string, variables?: Record<string, unknown>) {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(ANILIST_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        next: { revalidate: 1800 },
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
      if (!res.ok) throw new Error(`AniList request failed: ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(`AniList GraphQL error: ${json.errors[0]?.message || "Unknown"}`);
      return json.data;
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("AniList request failed after retries");
}

/**
 * GET /api/anime/anilist-schedule
 * Fetches airing schedule for at least 7 days ahead from today.
 * Returns schedule grouped by day with anime details.
 * Always returns all 7 days even if some have no anime.
 */
export async function GET(request: NextRequest) {
  const dayParam = request.nextUrl.searchParams.get("day");
  const offsetParam = request.nextUrl.searchParams.get("offset");
  const offset = offsetParam ? parseInt(offsetParam) : 0;

  try {
    const now = Math.floor(Date.now() / 1000);
    // Start from beginning of today
    const todayStart = now - (now % 86400);
    // Cover 8 days to ensure a full week ahead (today + 7 more days)
    const startAt = todayStart + (offset * 86400);
    const endAt = startAt + (8 * 86400); // 8 days to ensure full week coverage

    // Fetch multiple pages to get comprehensive schedule
    const query = `
      query ($startAt: Int, $endAt: Int) {
        Page(page: 1, perPage: 200) {
          airingSchedules(
            airingAt_greater: $startAt
            airingAt_lesser: $endAt
            sort: TIME
          ) {
            id
            airingAt
            episode
            media {
              id
              title { romaji english native }
              coverImage { extraLarge large medium color }
              bannerImage
              type format status
              episodes duration
              genres
              averageScore
              popularity
              season seasonYear
              description(asHtml: false)
              nextAiringEpisode { episode airingAt }
              countryOfOrigin
              isAdult
            }
          }
        }
      }
    `;

    const [page1Data, page2Data] = await Promise.all([
      anilistQuery(query, { startAt, endAt }),
      anilistQuery(query.replace("page: 1", "page: 2"), { startAt, endAt }).catch(() => null),
    ]);

    const schedules = [
      ...(page1Data?.Page?.airingSchedules || []),
      ...(page2Data?.Page?.airingSchedules || []),
    ];

    // Group by day
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const grouped: Record<string, any[]> = {};

    // Initialize all 7 days from today onward with dates
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + i + offset);
      const dayName = dayNames[futureDate.getDay()];
      const dateStr = futureDate.toISOString().split("T")[0];
      if (!grouped[dayName + "|" + dateStr]) {
        grouped[dayName + "|" + dateStr] = [];
      }
    }

    // Populate with schedule data
    for (const entry of schedules) {
      const date = new Date(entry.airingAt * 1000);
      const dayName = dayNames[date.getDay()];
      const dateStr = date.toISOString().split("T")[0];
      const key = dayName + "|" + dateStr;

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({
        id: entry.id,
        airingAt: entry.airingAt,
        episode: entry.episode,
        airTime: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        dateStr,
        media: entry.media,
      });
    }

    // Build ordered days list (today through next 6 days)
    const orderedDays: string[] = [];
    const dayLabels: Record<string, string> = {};
    for (let i = 0; i < 7; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + i + offset);
      const dayName = dayNames[futureDate.getDay()];
      const dateStr = futureDate.toISOString().split("T")[0];
      const key = dayName + "|" + dateStr;
      orderedDays.push(key);
      dayLabels[key] = dayName;
    }

    // If specific day requested, return only that day
    if (dayParam !== null) {
      const dayIndex = parseInt(dayParam);
      const targetDayName = (dayIndex >= 0 && dayIndex < 7) ? dayNames[dayIndex] : dayNames[today.getDay()];
      // Find the matching key
      const matchingKey = orderedDays.find(k => k.startsWith(targetDayName + "|"));
      return NextResponse.json({
        day: targetDayName,
        schedule: matchingKey ? (grouped[matchingKey] || []) : [],
        allDays: orderedDays,
      });
    }

    return NextResponse.json({
      schedule: grouped,
      days: orderedDays,
      dayLabels,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[anilist-schedule] Error:", err);
    return NextResponse.json({ error: "Failed to fetch schedule" }, { status: 500 });
  }
}
