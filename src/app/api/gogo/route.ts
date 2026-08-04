import { NextRequest, NextResponse } from "next/server";
import {
  gogoSearch, gogoAnimeInfo, gogoStreamSources,
  gogoRecent, gogoPopular, gogoSearchSubDub,
} from "@/lib/gogoanime-api";

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "search";
  
  try {
    switch (action) {
      case "search": {
        const q = req.nextUrl.searchParams.get("q") || "";
        const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
        if (!q) return NextResponse.json({ success: false, error: "Missing q parameter" }, { status: 400 });
        const results = await gogoSearch(q, page);
        return NextResponse.json({ success: true, results });
      }
      
      case "search-subdub": {
        const q = req.nextUrl.searchParams.get("q") || "";
        if (!q) return NextResponse.json({ success: false, error: "Missing q parameter" }, { status: 400 });
        const results = await gogoSearchSubDub(q);
        return NextResponse.json({ success: true, ...results });
      }
      
      case "info": {
        const id = req.nextUrl.searchParams.get("id") || "";
        if (!id) return NextResponse.json({ success: false, error: "Missing id parameter" }, { status: 400 });
        const info = await gogoAnimeInfo(id);
        if (!info) return NextResponse.json({ success: false, error: "Anime not found" }, { status: 404 });
        return NextResponse.json({ success: true, data: info });
      }
      
      case "stream": {
        const episodeId = req.nextUrl.searchParams.get("episodeId") || "";
        if (!episodeId) return NextResponse.json({ success: false, error: "Missing episodeId parameter" }, { status: 400 });
        const sources = await gogoStreamSources(episodeId);
        if (sources.length === 0) return NextResponse.json({ success: false, error: "No streams found" }, { status: 404 });
        return NextResponse.json({ success: true, sources });
      }
      
      case "recent": {
        const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
        const type = (req.nextUrl.searchParams.get("type") || "sub") as "sub" | "dub" | "raw";
        const results = await gogoRecent(page, type);
        return NextResponse.json({ success: true, results });
      }
      
      case "popular": {
        const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
        const results = await gogoPopular(page);
        return NextResponse.json({ success: true, results });
      }
      
      default:
        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[GogoAPI Route] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
