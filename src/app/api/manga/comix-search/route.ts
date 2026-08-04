import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

/**
 * GET /api/manga/comix-search?q={title}
 *
 * Searches comix.to for a manga by title using z-ai web-search.
 * Returns the comix.to HID (needed to fetch detail/chapters).
 *
 * Flow:
 * 1. Use z-ai web-search to find "site:comix.to/title {title}"
 * 2. Extract the HID from the comix.to URL
 * 3. Return { hid, title, url }
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });

  try {
    const zai = await ZAI.create();

    // Use web-search to find the manga on comix.to
    const searchResult: any = await zai.functions.invoke("web_search", {
      query: `site:comix.to "${q}"`,
    });

    // The response can be a list or {data: {results: [...]}}
    let results: any[] = [];
    if (Array.isArray(searchResult)) {
      results = searchResult;
    } else if (Array.isArray(searchResult?.data)) {
      results = searchResult.data;
    } else if (Array.isArray(searchResult?.data?.results)) {
      results = searchResult.data.results;
    } else if (Array.isArray(searchResult?.results)) {
      results = searchResult.results;
    }

    // Extract comix.to title URLs from search results
    let hid: string | null = null;
    let title: string = "";
    let url: string = "";

    for (const result of results) {
      const link = result.link || result.url || result.href || "";
      // Match comix.to/title/{hid}-{slug} pattern
      const match = link.match(/comix\.to\/title\/([a-z0-9]+)-/i);
      if (match) {
        hid = match[1];
        title = result.title?.replace(/\s*-\s*Comix.*$/i, "").replace(/\s*-\s*Read.*$/i, "").trim() || q;
        url = link;
        break;
      }
    }

    // If web-search didn't find it, try page_reader on the browse page
    // and extract title links from the HTML
    if (!hid) {
      try {
        const pageResult: any = await zai.functions.invoke("page_reader", {
          url: `https://comix.to/browse?q=${encodeURIComponent(q)}`,
        });
        const html = pageResult?.data?.html || "";
        // Parse title links: /title/{hid}-{slug}
        const links = html.match(/\/title\/([a-z0-9]+)-([a-z0-9-]+)/g) || [];
        const unique = new Set<string>();
        for (const link of links) {
          const m = link.match(/\/title\/([a-z0-9]+)-/);
          if (m) unique.add(m[1]);
        }

        // For each HID, fetch the title page and check if it matches
        for (const candidateHid of unique) {
          try {
            const titleResult: any = await zai.functions.invoke("page_reader", {
              url: `https://comix.to/title/${candidateHid}`,
            });
            const titleHtml = titleResult?.data?.html || "";
            const dataMatch = titleHtml.match(
              /<script type="application\/json" id="initial-data">(.*?)<\/script>/s
            );
            if (dataMatch) {
              const data = JSON.parse(dataMatch[1]);
              if (data.page === "manga") {
                for (const [, val] of Object.entries(data.queries || {})) {
                  if (val && typeof val === "object" && "title" in val) {
                    const comixTitle = (val as any).title?.toLowerCase() || "";
                    const searchTitle = q.toLowerCase();
                    if (
                      comixTitle.includes(searchTitle) ||
                      searchTitle.includes(comixTitle) ||
                      comixTitle.slice(0, 20) === searchTitle.slice(0, 20)
                    ) {
                      hid = candidateHid;
                      title = (val as any).title || "";
                      url = `https://comix.to/title/${candidateHid}`;
                      break;
                    }
                  }
                }
              }
            }
            if (hid) break;
          } catch { /* ignore individual title fetch errors */ }
        }
      } catch { /* ignore page_reader errors */ }
    }

    if (hid) {
      return NextResponse.json({ hid, title, url });
    }
    return NextResponse.json({ hid: null, title: "", url: "" });
  } catch (err: any) {
    console.error("[comix-search] Error:", err?.message || err);
    return NextResponse.json({ hid: null, error: err?.message || "Search failed" });
  }
}
