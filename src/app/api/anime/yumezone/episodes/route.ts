import { NextRequest, NextResponse } from "next/server";
import {
  miruroEpisodes,
  type MiruroProviderEpisodes,
} from "@/lib/miruro-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/anime/yumezone/episodes?anilistId=1535
 *
 * Fetches episodes from Miruro API with full provider mapping.
 * Returns structured data matching YumeZone's provider_map format
 * so the watch page can properly select providers and resolve episodes.
 */
export async function GET(req: NextRequest) {
  const anilistIdStr = req.nextUrl.searchParams.get("anilistId");
  if (!anilistIdStr) {
    return NextResponse.json({ error: "anilistId required" }, { status: 400 });
  }

  const anilistId = parseInt(anilistIdStr);
  if (isNaN(anilistId)) {
    return NextResponse.json({ error: "Invalid anilistId" }, { status: 400 });
  }

  try {
    const epData = await miruroEpisodes(anilistId);

    // Build providers_map in YumeZone format: { providerName: { episodes: { sub: [...], dub: [...] } } }
    const providersMap: Record<string, {
      meta: { title: string };
      episodes: {
        sub: Array<{ id: string; number: number; title: string; filler: boolean }>;
        dub: Array<{ id: string; number: number; title: string; filler: boolean }>;
      };
    }> = {};

    const providers = epData.providersMap || {};
    for (const [providerName, providerData] of Object.entries(providers)) {
      if (!providerData?.episodes) continue;

      const subEps = (providerData.episodes.sub || []).map(ep => ({
        id: ep.id || ep.slug || `watch/${providerName}/${anilistId}/sub/${ep.slug || ep.number}`,
        number: ep.number,
        title: ep.title || `Episode ${ep.number}`,
        filler: ep.isFiller || ep.filler || false,
      }));

      const dubEps = (providerData.episodes.dub || []).map(ep => ({
        id: ep.id || ep.slug || `watch/${providerName}/${anilistId}/dub/${ep.slug || ep.number}`,
        number: ep.number,
        title: ep.title || `Episode ${ep.number}`,
        filler: ep.isFiller || ep.filler || false,
      }));

      providersMap[providerName] = {
        meta: { title: providerData.meta?.title || "" },
        episodes: { sub: subEps, dub: dubEps },
      };
    }

    // Also add Zoro/Megaplay provider using AniList ID direct mapping
    // YumeZone does: megaplay.buzz/stream/ani/{anilistId}/{ep}/{lang}
    const miruroSubEps = epData.sub || [];
    if (miruroSubEps.length > 0) {
      const zoroSubEps = miruroSubEps.map(ep => ({
        id: `watch/zoro/${anilistId}/sub/zoro-${ep.number}`,
        number: ep.number,
        title: ep.title || `Episode ${ep.number}`,
        filler: ep.isFiller || ep.filler || false,
      }));

      const miruroDubEps = epData.dub || [];
      const zoroDubEps = miruroDubEps.map(ep => ({
        id: `watch/zoro/${anilistId}/dub/zoro-${ep.number}`,
        number: ep.number,
        title: ep.title || `Episode ${ep.number}`,
        filler: ep.isFiller || ep.filler || false,
      }));

      if (!providersMap["zoro"]) {
        providersMap["zoro"] = {
          meta: { title: "" },
          episodes: { sub: zoroSubEps, dub: zoroDubEps },
        };
      }
    }

    // Provider priority order (matching YumeZone)
    const providerPriority = [
      "zenith", "kiwi", "ax-mimi", "ax-wave", "ax-shiro", "ax-yuki", "ax-zen", "ax-beep",
      "bee", "miku", "zoro", "arc", "jet",
    ];

    // Determine default provider
    let defaultProvider = epData.defaultProvider || "kiwi";
    for (const pName of providerPriority) {
      if (providersMap[pName]) {
        const pData = providersMap[pName];
        if ((pData.episodes.sub?.length || 0) > 0 || (pData.episodes.dub?.length || 0) > 0) {
          defaultProvider = pName;
          break;
        }
      }
    }

    // Build unified episode list from best provider
    const episodes = epData.sub.map(ep => ({
      episodeId: ep.id || ep.slug || String(ep.number),
      number: ep.number,
      title: ep.title || `Episode ${ep.number}`,
      isFiller: ep.isFiller || ep.filler || false,
    }));

    // Check dub availability
    const dubAvailable = Object.values(providersMap).some(
      p => (p.episodes.dub?.length || 0) > 0
    );

    return NextResponse.json({
      success: true,
      anilistId,
      episodes,
      totalEpisodes: episodes.length,
      providersMap,
      defaultProvider,
      dubAvailable,
      allProviders: Object.keys(providersMap),
      sortedProviders: providerPriority.filter(p => providersMap[p]),
    });
  } catch (err) {
    console.error("[YumeZone Episodes] Error:", err);
    return NextResponse.json({
      success: false,
      error: "Failed to fetch episodes",
      episodes: [],
      providersMap: {},
      defaultProvider: "",
    }, { status: 500 });
  }
}
