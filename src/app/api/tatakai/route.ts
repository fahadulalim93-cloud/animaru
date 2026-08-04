import { NextResponse } from "next/server";
import {
  tatakaiToonStreamSearch,
  tatakaiToonStreamSeriesInfo,
  tatakaiToonStreamMovieInfo,
  tatakaiToonStreamEpisodeSources,
  tatakaiToonStreamMovieSources,
  tatakaiToonStreamHome,
  tatakaiToonStreamSeries,
  tatakaiToonStreamMovies,
  tatakaiHindiDubbedHome,
  tatakaiHindiDubbedSearch,
  tatakaiHindiDubbedInfo,
  tatakaiHindiDubbedStream,
  tatakaiAnimeLokLanguages,
  tatakaiAnimeLokByLanguage,
  tatakaiHiAnimeSearch,
  tatakaiHiAnimeStream,
  tatakaiHealthCheck,
} from "@/lib/tatakai-api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "home";

    switch (action) {
      // ---- ToonStream (Hindi dubbed) ----
      case "toonstream-home": {
        const data = await tatakaiToonStreamHome();
        return NextResponse.json({ success: true, data });
      }

      case "toonstream-search": {
        const q = searchParams.get("q") || "";
        const page = parseInt(searchParams.get("page") || "1");
        if (!q.trim()) {
          return NextResponse.json({ success: true, data: [] });
        }
        const results = await tatakaiToonStreamSearch(q, page);
        return NextResponse.json({ success: true, data: results });
      }

      case "toonstream-series-info": {
        const slug = searchParams.get("slug") || "";
        if (!slug) {
          return NextResponse.json(
            { success: false, error: "Missing slug parameter" },
            { status: 400 }
          );
        }
        const info = await tatakaiToonStreamSeriesInfo(slug);
        return NextResponse.json({ success: true, data: info });
      }

      case "toonstream-movie-info": {
        const slug = searchParams.get("slug") || "";
        if (!slug) {
          return NextResponse.json(
            { success: false, error: "Missing slug parameter" },
            { status: 400 }
          );
        }
        const info = await tatakaiToonStreamMovieInfo(slug);
        return NextResponse.json({ success: true, data: info });
      }

      case "toonstream-episode-sources": {
        const slug = searchParams.get("slug") || "";
        if (!slug) {
          return NextResponse.json(
            { success: false, error: "Missing slug parameter" },
            { status: 400 }
          );
        }
        const sources = await tatakaiToonStreamEpisodeSources(slug);
        return NextResponse.json({ success: true, data: sources });
      }

      case "toonstream-movie-sources": {
        const slug = searchParams.get("slug") || "";
        if (!slug) {
          return NextResponse.json(
            { success: false, error: "Missing slug parameter" },
            { status: 400 }
          );
        }
        const sources = await tatakaiToonStreamMovieSources(slug);
        return NextResponse.json({ success: true, data: sources });
      }

      case "toonstream-series": {
        const page = parseInt(searchParams.get("page") || "1");
        const results = await tatakaiToonStreamSeries(page);
        return NextResponse.json({ success: true, data: results });
      }

      case "toonstream-movies": {
        const page = parseInt(searchParams.get("page") || "1");
        const results = await tatakaiToonStreamMovies(page);
        return NextResponse.json({ success: true, data: results });
      }

      // ---- HindiDubbed ----
      case "hindidubbed-home": {
        const data = await tatakaiHindiDubbedHome();
        return NextResponse.json({ success: true, data });
      }

      case "hindidubbed-search": {
        const q = searchParams.get("q") || "";
        if (!q.trim()) {
          return NextResponse.json({ success: true, data: [] });
        }
        const results = await tatakaiHindiDubbedSearch(q);
        return NextResponse.json({ success: true, data: results });
      }

      case "hindidubbed-info": {
        const slug = searchParams.get("slug") || "";
        if (!slug) {
          return NextResponse.json(
            { success: false, error: "Missing slug parameter" },
            { status: 400 }
          );
        }
        const info = await tatakaiHindiDubbedInfo(slug);
        return NextResponse.json({ success: true, data: info });
      }

      case "hindidubbed-stream": {
        const url = searchParams.get("url") || "";
        const server = searchParams.get("server") || undefined;
        if (!url) {
          return NextResponse.json(
            { success: false, error: "Missing url parameter" },
            { status: 400 }
          );
        }
        const sources = await tatakaiHindiDubbedStream(url, server);
        return NextResponse.json({ success: true, data: sources });
      }

      // ---- AnimeLok (Multi-language) ----
      case "animelok-languages": {
        const languages = await tatakaiAnimeLokLanguages();
        return NextResponse.json({ success: true, data: languages });
      }

      case "animelok-language": {
        const lang = searchParams.get("lang") || "Hindi";
        const page = parseInt(searchParams.get("page") || "1");
        const results = await tatakaiAnimeLokByLanguage(lang, page);
        return NextResponse.json({ success: true, data: results });
      }

      // ---- HiAnime (sub/dub) ----
      case "hianime-search": {
        const q = searchParams.get("q") || "";
        const page = parseInt(searchParams.get("page") || "1");
        if (!q.trim()) {
          return NextResponse.json({ success: true, data: [] });
        }
        const results = await tatakaiHiAnimeSearch(q, page);
        return NextResponse.json({ success: true, data: results });
      }

      case "hianime-stream": {
        const episodeId = searchParams.get("episodeId") || "";
        const server = searchParams.get("server") || undefined;
        const category = (searchParams.get("category") || undefined) as
          | "sub"
          | "dub"
          | "raw"
          | undefined;
        if (!episodeId) {
          return NextResponse.json(
            { success: false, error: "Missing episodeId parameter" },
            { status: 400 }
          );
        }
        const data = await tatakaiHiAnimeStream(episodeId, server, category);
        return NextResponse.json({ success: true, data });
      }

      // ---- Health Check ----
      case "health": {
        const healthy = await tatakaiHealthCheck();
        return NextResponse.json({ success: true, healthy });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error:
              "Invalid action. Use: toonstream-home, toonstream-search, toonstream-series-info, toonstream-movie-info, toonstream-episode-sources, toonstream-movie-sources, toonstream-series, toonstream-movies, hindidubbed-home, hindidubbed-search, hindidubbed-info, hindidubbed-stream, animelok-languages, animelok-language, hianime-search, hianime-stream, health",
          },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
