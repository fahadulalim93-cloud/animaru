import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Proxies KLIPY's search/trending API — keeps the API key server-side (it's
// embedded in the URL path per KLIPY's scheme) and trims the response down
// to just what the GIF picker needs.
//
// Verified response shape (KLIPY's docs block scraping, so this was
// confirmed by hitting the live API directly):
//   data.data[] = { id, title, file: { hd|md|sm|xs: { gif|webp|jpg|mp4|webm: { url, width, height } } } }
export async function GET(request: NextRequest) {
  const apiKey = process.env.KLIPY_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json({ error: "KLIPY is not configured on this server." }, { status: 501 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const page = request.nextUrl.searchParams.get("page") || "1";

  const endpoint = q
    ? `https://api.klipy.com/api/v1/${apiKey}/gifs/search`
    : `https://api.klipy.com/api/v1/${apiKey}/gifs/trending`;

  const params = new URLSearchParams({ page, per_page: "24", rating: "pg-13" });
  if (q) params.set("q", q);

  try {
    const res = await fetch(`${endpoint}?${params.toString()}`);
    if (!res.ok) return NextResponse.json({ error: "KLIPY request failed" }, { status: 502 });
    const json = await res.json();

    const items: any[] = json?.data?.data || [];
    const results = items
      .map((item) => {
        const url = item.file?.hd?.gif?.url || item.file?.md?.gif?.url;
        const preview = item.file?.xs?.gif?.url || item.file?.sm?.gif?.url || url;
        return url ? { id: String(item.id), url, preview, title: item.title || "GIF" } : null;
      })
      .filter((r): r is { id: string; url: string; preview: string; title: string } => !!r);

    const hasNext = !!json?.data?.has_next;
    return NextResponse.json({ results, next: hasNext ? String(Number(page) + 1) : "" });
  } catch {
    return NextResponse.json({ error: "KLIPY request failed" }, { status: 502 });
  }
}
