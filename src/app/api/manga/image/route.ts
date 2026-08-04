import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    // Determine the Referer based on the URL source
    let referer = "https://mangadex.org/";
    if (url.includes("atsu.moe")) {
      referer = "https://atsu.moe/";
    } else if (url.includes("mangadex.org") || url.includes("uploads.mangadex.org")) {
      referer = "https://mangadex.org/";
    } else if (url.includes("comix.to")) {
      referer = "https://comix.to/";
    } else if (url.includes("poke-black-and-white.net")) {
      // Mangaball CDN (jigglypuff, bulbasaur, etc.)
      referer = "https://mangaball.net/";
    }

    const imgRes = await fetch(url, {
      headers: {
        Referer: referer,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    if (!imgRes.ok) {
      return NextResponse.json({ error: "Image fetch failed" }, { status: imgRes.status });
    }

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const buffer = await imgRes.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to proxy image" }, { status: 500 });
  }
}
