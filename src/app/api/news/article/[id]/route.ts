import { NextResponse } from "next/server";

// ============================================================
// NEWS ARTICLE DETAIL API — Proxy WatchFooty single article
// https://api.watchfooty.st/api/v1/news/article/[id]
// Returns full article content + entity mentions
// ============================================================

export const runtime = "edge";

const TIMEOUT = 10000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Article ID required" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), TIMEOUT);

    const wfUrl = `https://api.watchfooty.st/api/v1/news/article/${encodeURIComponent(id)}`;

    const res = await fetch(wfUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `WatchFooty API returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Prepend WatchFooty base URL to relative URLs
    if (data.url && !data.url.startsWith("http")) {
      data.url = `https://api.watchfooty.st${data.url}`;
    }
    if (data.mentions && Array.isArray(data.mentions)) {
      for (const mention of data.mentions) {
        if (mention.url && !mention.url.startsWith("http")) {
          mention.url = `https://api.watchfooty.st${mention.url}`;
        }
      }
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch article", details: error.message },
      { status: 500 }
    );
  }
}
