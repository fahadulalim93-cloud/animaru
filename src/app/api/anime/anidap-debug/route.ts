/**
 * GET /api/anime/anidap-debug?anilistId=21
 * Debug endpoint for AniDap resolver — returns each step's result.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const anilistId = parseInt(req.nextUrl.searchParams.get("anilistId") || "21", 10);
  const steps: any = { anilistId, log: [] };

  // Step 1: Get title from AniList
  try {
    steps.log.push("Step 1: AniList GraphQL");
    const alRes = await fetch("https://graphql.anilist.co/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($id: Int!) { Media(id: $id, type: ANIME) { title { romaji english } } }`,
        variables: { id: anilistId },
      }),
      signal: AbortSignal.timeout(8000),
    });
    steps.anilistStatus = alRes.status;
    if (alRes.ok) {
      const alData = await alRes.json();
      const title = alData?.data?.Media?.title;
      steps.searchQuery = title?.english || title?.romaji || null;
    }
  } catch (e: any) {
    steps.anilistError = e?.message || String(e);
  }

  if (!steps.searchQuery) {
    return NextResponse.json({ ...steps, result: "FAIL: no search query" });
  }

  // Step 2: Search AnimeX GraphQL
  try {
    steps.log.push("Step 2: AnimeX GraphQL");
    const gqlRes = await fetch("https://graphql.animex.one/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://animex.one",
        Referer: "https://animex.one/",
      },
      body: JSON.stringify({
        query: `query($q: String!) { searchAnime(query: $q, limit: 10) { items { id anilistId } } }`,
        variables: { q: steps.searchQuery },
      }),
      signal: AbortSignal.timeout(8000),
    });
    steps.animexStatus = gqlRes.status;
    if (gqlRes.ok) {
      const gqlData = await gqlRes.json();
      const items = gqlData?.data?.searchAnime?.items || [];
      steps.animexResults = items.slice(0, 5);
      const match = items.find((item: any) => item.anilistId === anilistId);
      steps.anidapId = match?.id || null;
    }
  } catch (e: any) {
    steps.animexError = e?.message || String(e);
  }

  if (!steps.anidapId) {
    return NextResponse.json({ ...steps, result: "FAIL: no anidapId" });
  }

  // Step 3: Fetch servers from chad.anidap.lol
  try {
    steps.log.push("Step 3: chad.anidap.lol servers");
    const url = `https://chad.anidap.lol/rest/api/servers?id=${encodeURIComponent(steps.anidapId)}&epNum=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
        Origin: "https://anidap.lol",
        Referer: "https://anidap.lol/",
      },
      signal: AbortSignal.timeout(8000),
    });
    steps.serversStatus = res.status;
    if (res.ok) {
      const data = await res.json();
      steps.subProviders = data.subProviders?.map((p: any) => p.id);
      steps.dubProviders = data.dubProviders?.map((p: any) => p.id);
    }
  } catch (e: any) {
    steps.serversError = e?.message || String(e);
  }

  // Step 4: Fetch sources from mimi
  try {
    steps.log.push("Step 4: chad.anidap.lol sources (mimi sub)");
    const url = `https://chad.anidap.lol/rest/api/sources?id=${encodeURIComponent(steps.anidapId)}&epNum=1&type=sub&providerId=mimi`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
        Origin: "https://anidap.lol",
        Referer: "https://anidap.lol/",
      },
      signal: AbortSignal.timeout(8000),
    });
    steps.sourcesStatus = res.status;
    if (res.ok) {
      const data = await res.json();
      steps.sources = data.sources?.map((s: any) => ({ quality: s.quality, type: s.type, url: s.url.substring(0, 60) }));
    }
  } catch (e: any) {
    steps.sourcesError = e?.message || String(e);
  }

  return NextResponse.json(steps);
}
