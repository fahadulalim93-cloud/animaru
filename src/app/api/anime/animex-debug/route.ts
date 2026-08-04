/**
 * GET /api/anime/animex-debug
 * Debug endpoint to test animex-api.ts functions on production.
 */
import { NextRequest, NextResponse } from "next/server";
import { animexGetAnime, animexServers, animexSources } from "@/lib/animex-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get("id") || "21", 10);
  const provider = req.nextUrl.searchParams.get("provider") || "beep";
  const type = (req.nextUrl.searchParams.get("type") || "sub") as "sub" | "dub";

  const results: any = { id, provider, type, steps: [] };

  // Step 1: animexGetAnime
  try {
    const anime = await animexGetAnime(id);
    results.steps.push({ step: "animexGetAnime", success: !!anime, slug: anime?.slug, title: anime?.titleEnglish });
    if (!anime) {
      return NextResponse.json(results);
    }

    // Step 2: animexServers
    const servers = await animexServers(anime.slug, 1);
    results.steps.push({
      step: "animexServers",
      success: !!servers,
      subCount: servers.subProviders?.length,
      dubCount: servers.dubProviders?.length,
      subProviders: servers.subProviders?.map(p => p.id),
      dubProviders: servers.dubProviders?.map(p => p.id),
    });

    // Step 3: animexSources
    const sources = await animexSources(anime.slug, 1, type, provider);
    results.steps.push({
      step: "animexSources",
      success: !!sources,
      sourcesCount: sources?.sources?.length,
      sources: sources?.sources?.map(s => ({ url: s.url?.slice(0, 80), quality: s.quality, type: s.type })),
    });
  } catch (e: any) {
    results.steps.push({ step: "error", message: e?.message || String(e), stack: e?.stack });
  }

  return NextResponse.json(results);
}
