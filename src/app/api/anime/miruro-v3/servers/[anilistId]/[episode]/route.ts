import { NextRequest, NextResponse } from "next/server";
import { getMiruroV3Servers } from "@/lib/miruro-v3-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/miruro-v3/servers/[anilistId]/[episode]?sub=1&dub=1
 *
 * Miruro V3 SEPARATE route — NOT part of instant-servers.
 * This hits the NEW ap.luffytv.live backend directly.
 *
 * Returns servers in the same format as instant-servers for frontend compatibility,
 * but fetched exclusively from the Miruro V3 API providers.
 *
 * Sub/Dub handling:
 *   - sub and dub are fetched SEPARATELY from each provider
 *   - A provider may have sub but not dub (e.g., kiwi often only has sub)
 *   - Dub servers are tagged with "(Dub)" in the name
 *   - The ?sub=1&dub=1 query params control which types to fetch
 *
 * Proxy wrapping:
 *   - HLS m3u8 URLs → wrapM3u8UrlWithReferer (worker proxy with CDN referer)
 *   - Subtitle URLs → wrapStreamUrl (worker proxy)
 *   - Embed URLs → passed through as-is (loaded as iframe)
 *   - MP4 URLs → wrapStreamUrl (worker proxy)
 *
 * Cloudflare note:
 *   - The ap.luffytv.live has CF protection on the pipe endpoint
 *   - This server-side route bypasses browser CF checks
 *   - Do NOT deploy on Vercel — use VPS with residential IP
 */
export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);

  // Query params: sub (default true), dub (default true)
  const includeSub = req.nextUrl.searchParams.get("sub") !== "0";
  const includeDub = req.nextUrl.searchParams.get("dub") !== "0";

  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid anilistId" }, { status: 400 });
  }

  if (isNaN(epNum) || epNum <= 0) {
    return NextResponse.json({ error: "Invalid episode number" }, { status: 400 });
  }

  try {
    const servers = await getMiruroV3Servers(id, epNum, {
      sub: includeSub,
      dub: includeDub,
      timeoutMs: 7000,
      maxProviders: 6,
    });

    console.log(
      `[miruro-v3] AniList ${id} ep ${epNum}: ${servers.length} servers ` +
      `(sub=${servers.filter(s => s.type === "sub").length} ` +
      `dub=${servers.filter(s => s.type === "dub").length})`,
    );

    return NextResponse.json({ servers }, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (err) {
    console.error("[miruro-v3] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
