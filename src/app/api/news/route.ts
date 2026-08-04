import { NextResponse } from "next/server";

// ============================================================
// NEWS API — Proxy WatchFooty News
// Base: https://api.watchfooty.st/api/v1/news
// Supports: sport filter, pagination, search, date range, sort
// ============================================================

export const runtime = "edge";

const TIMEOUT = 10000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function makeCtrl() {
  const c = new AbortController();
  setTimeout(() => c.abort(), TIMEOUT);
  return c;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sport = url.searchParams.get("sport") || "";
  const limit = url.searchParams.get("limit") || "12";
  const offset = url.searchParams.get("offset") || "0";
  const q = url.searchParams.get("q") || "";
  const dateRange = url.searchParams.get("dateRange") || "all";
  const sort = url.searchParams.get("sort") || "newest";

  try {
    // Build WatchFooty news URL
    let wfUrl = sport
      ? `https://api.watchfooty.st/api/v1/news/${encodeURIComponent(sport)}`
      : `https://api.watchfooty.st/api/v1/news`;

    // Add query params
    const params = new URLSearchParams();
    params.set("limit", limit);
    params.set("offset", offset);
    if (q) params.set("q", q);
    if (dateRange && dateRange !== "all") params.set("dateRange", dateRange);
    if (sort) params.set("sort", sort);

    wfUrl += `?${params.toString()}`;

    const res = await fetch(wfUrl, {
      signal: makeCtrl().signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `WatchFooty News API returned ${res.status}`, articles: [], pagination: null },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Prepend WatchFooty base URL to relative image URLs if needed
    if (data.articles && Array.isArray(data.articles)) {
      for (const article of data.articles) {
        if (article.url && !article.url.startsWith("http")) {
          article.url = `https://api.watchfooty.st${article.url}`;
        }
      }
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch news", details: error.message, articles: [], pagination: null },
      { status: 500 }
    );
  }
}
