import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side proxy for megaplay.buzz embed pages.
 * Megaplay.buzz requires Referer: https://anikototv.to/ to serve content.
 * Without it, returns 410 error. This route fetches the embed page
 * server-side with the correct headers and returns the HTML.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const ep = searchParams.get("ep") || "1";
  const type = searchParams.get("type") || "dub";

  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  const streamUrl = `https://megaplay.buzz/stream/ani/${id}/${ep}/${type}`;

  try {
    const html = await fetchEmbedPage(streamUrl);

    // Rewrite relative URLs in the HTML to absolute megaplay.buzz URLs
    const rewritten = html
      .replace(/(src|href)="\/(?!\/)/g, '$1="https://megaplay.buzz/')
      .replace(/(src|href)='\//g, "$1='https://megaplay.buzz/")
      // Also fix URL patterns in JS strings
      .replace(/url:\s*["']\/(?!\/)/g, 'url: "https://megaplay.buzz/')
      .replace(/base_url:\s*["']https?:\/\/megaplay\.buzz\/?["']/g, 'base_url: "https://megaplay.buzz/"');

    return new NextResponse(rewritten, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load embed";
    console.error("[HindiEmbed] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function fetchEmbedPage(url: string, maxRedirects = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error("Too many redirects"));
      return;
    }

    const mod = url.startsWith("https") ? require("https") : require("http");
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error("Timeout fetching embed page"));
    }, 15000);

    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Referer: "https://anikototv.to/",
          Origin: "https://anikototv.to",
          "Accept-Language": "en-US,en;q=0.5",
        },
      },
      (res: any) => {
        // Follow redirects
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          const redirectUrl = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          res.resume();
          clearTimeout(timer);
          fetchEmbedPage(redirectUrl, maxRedirects - 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          clearTimeout(timer);
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode >= 400) {
            reject(
              new Error(`Embed page returned HTTP ${res.statusCode}`)
            );
          } else {
            resolve(body);
          }
        });
        res.on("error", (err: Error) => {
          clearTimeout(timer);
          reject(err);
        });
      }
    );

    req.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
