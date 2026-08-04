import { NextResponse } from "next/server";

// Foxtrot Stream Provider — StreamedPK API (direct embedUrls)
// GET /api/stream/foxtrot/[id]
export const runtime = "edge";

const TIMEOUT = 12000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = "foxtrot";

  try {
    const res = await fetch(`https://streamed.pk/api/stream/${source}/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { "User-Agent": UA, Accept: "application/json" },
    });

    const data = res.ok ? await res.json() : [];
    // Handle both array and single-object responses from the API
    const streams = Array.isArray(data) ? data : (data && typeof data === 'object' ? [data] : []);

    const sourceLabel = source.charAt(0).toUpperCase() + source.slice(1);
    const results = streams
      .filter((s: any) => s.embedUrl)
      .map((s: any, i: number) => ({
        id: `sp-${source}-${s.id || i}`,
        streamNo: s.streamNo || i + 1,
        language: s.language || "English",
        hd: s.hd !== false,
        m3u8Url: "",
        quality: s.hd ? "HD" : "SD",
        source: `StreamPK ${sourceLabel} S${s.streamNo || i + 1}`,
        viewers: s.viewers || 0,
        provider: "streamed",
        corsEnabled: false,
        referer: "https://streamed.pk/",
        embedUrl: s.embedUrl,
        streamType: "embed" as const,
      }));

    return NextResponse.json({ streams: results, total: results.length, source });
  } catch (err: any) {
    return NextResponse.json({ streams: [], total: 0, error: err.message, source }, { status: 500 });
  }
}
