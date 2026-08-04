/**
 * GET /api/anime/scraper/providers
 * Returns the list of supported streaming sites with sub/dub/hardsub/harddub capability flags.
 */
import { NextResponse } from "next/server";
import { SITES } from "@/lib/unified-scraper";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    sites: SITES,
    total: SITES.length,
    variants: ["sub", "dub", "hardsub", "harddub"],
  });
}
