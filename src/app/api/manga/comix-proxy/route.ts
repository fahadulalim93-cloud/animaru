import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

/**
 * GET /api/manga/comix-proxy?url={comixUrl}
 *
 * Fetches a comix.to page using the z-ai-web-dev-sdk page_reader function,
 * which can bypass Cloudflare challenges. Returns the raw HTML.
 *
 * Used by comix-api.ts to fetch title detail pages and chapter reading pages.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  // Only allow comix.to URLs
  if (!url.includes("comix.to")) {
    return NextResponse.json({ error: "Only comix.to URLs allowed" }, { status: 403 });
  }

  try {
    const zai = await ZAI.create();
    const result = await zai.functions.invoke("page_reader", { url });
    return NextResponse.json({
      html: result?.data?.html || "",
      title: result?.data?.title || "",
    });
  } catch (err: any) {
    console.error("[comix-proxy] Error:", err?.message || err);
    return NextResponse.json({
      html: "",
      error: err?.message || "Failed to fetch page",
    });
  }
}
