import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * GET /api/manga/banners?ids=30002,30013,16498
 *
 * Takes a comma-separated list of AniList manga IDs and returns a
 * map of { anilistId: { banner, cover, title, score, genres } }.
 * Used by the manga page to fetch real banner images for the hero
 * carousel + featured section (atsumaru only returns posters).
 *
 * AniList GraphQL is public — no auth needed.
 */

const cache = new Map<number, any>();

export async function GET(request: NextRequest) {
  const idsParam = request.nextUrl.searchParams.get("ids") || "";
  if (!idsParam) {
    return NextResponse.json({ error: "ids required (comma-separated)" }, { status: 400 });
  }

  const ids = idsParam
    .split(",")
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n > 0);

  if (ids.length === 0) {
    return NextResponse.json({ banners: {} });
  }

  // Only fetch IDs we don't already have cached
  const toFetch = ids.filter(id => !cache.has(id));

  if (toFetch.length > 0) {
    try {
      // AniList GraphQL — query multiple manga at once
      const query = `
        query($ids: [Int]) {
          Page(perPage: 50) {
            media(id_in: $ids, type: MANGA) {
              id
              title { english romaji native }
              bannerImage
              coverImage { extraLarge large medium }
              averageScore
              genres
              description
              status
              format
              relations {
                edges {
                  relationType
                  node {
                    id
                    title { english romaji native }
                    coverImage { extraLarge large medium }
                    type
                    format
                    status
                  }
                }
              }
              characters(sort: [ROLE, RELEVANCE], perPage: 15) {
                edges {
                  role
                  node {
                    id
                    name { full native }
                    image { large medium }
                  }
                }
              }
              recommendations(sort: RATING_DESC, perPage: 12) {
                nodes {
                  mediaRecommendation {
                    id
                    title { english romaji native }
                    coverImage { extraLarge large medium }
                    status
                    chapters
                    format
                    type
                  }
                }
              }
            }
          }
        }
      `;
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { ids: toFetch } }),
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        const media = json?.data?.Page?.media || [];
        for (const m of media) {
          cache.set(m.id, {
            id: m.id,
            title: m.title?.english || m.title?.romaji || m.title?.native || "Unknown",
            banner: m.bannerImage || "",
            cover: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || "",
            score: m.averageScore || 0,
            genres: m.genres || [],
            description: m.description || "",
            status: m.status || "",
            format: m.format || "",
            relations: (m.relations?.edges || []).map((e: any) => ({
              relationType: e.relationType,
              id: e.node?.id,
              title: e.node?.title?.english || e.node?.title?.romaji || e.node?.title?.native || "Unknown",
              cover: e.node?.coverImage?.extraLarge || e.node?.coverImage?.large || e.node?.coverImage?.medium || "",
              type: e.node?.type,
              format: e.node?.format,
              status: e.node?.status,
            })).filter((r: any) => r.id),
            characters: (m.characters?.edges || []).map((e: any) => ({
              role: e.role,
              id: e.node?.id,
              name: e.node?.name?.full || e.node?.name?.native || "Unknown",
              image: e.node?.image?.large || e.node?.image?.medium || "",
            })).filter((c: any) => c.id),
            recommendations: (m.recommendations?.nodes || [])
              .map((n: any) => n.mediaRecommendation)
              .filter(Boolean)
              .map((r: any) => ({
                id: r.id,
                title: r.title?.english || r.title?.romaji || r.title?.native || "Unknown",
                cover: r.coverImage?.extraLarge || r.coverImage?.large || r.coverImage?.medium || "",
                status: r.status || "",
                chapters: r.chapters || null,
                format: r.format || "",
                type: r.type,
              })),
          });
        }
      }
    } catch (err: any) {
      console.error("[manga/banners] Error:", err?.message || err);
    }
  }

  const banners: Record<number, any> = {};
  for (const id of ids) {
    if (cache.has(id)) banners[id] = cache.get(id);
  }

  // AniList metadata for a fixed set of ids is effectively static, so let the
  // CDN serve repeat hits for this exact ?ids= combination.
  return NextResponse.json(
    { banners },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
