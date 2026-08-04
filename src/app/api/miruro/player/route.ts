import { NextRequest, NextResponse } from "next/server";
import { miruroEpisodes, miruroWatch, getEpisodeSlugForProvider, getAvailableProvidersForEpisode } from "@/lib/miruro-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/miruro/player?provider=kiwi&anilistId=1535&episode=1&type=sub
 *
 * Returns a self-contained HTML page with hls.js that:
 * 1. Fetches episode slug from Miruro episodes API
 * 2. Fetches stream data from Miruro watch API
 * 3. Plays HLS or shows embed
 */
export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider") || "kiwi";
  const anilistId = parseInt(req.nextUrl.searchParams.get("anilistId") || "0");
  const episode = parseInt(req.nextUrl.searchParams.get("episode") || "1");
  const translationType = (req.nextUrl.searchParams.get("type") || "sub") as "sub" | "dub";

  if (!anilistId) {
    return new NextResponse("<html><body><h2>Error: anilistId required</h2></body></html>", {
      headers: { "Content-Type": "text/html" },
    });
  }

  // Fetch episodes to get the slug for this provider + episode
  let episodeSlug: string | null = null;
  let providersMap: any = {};

  try {
    const epData = await miruroEpisodes(anilistId);
    if (epData.providersMap && Object.keys(epData.providersMap).length > 0) {
      providersMap = epData.providersMap;
      episodeSlug = getEpisodeSlugForProvider(providersMap, provider, episode, translationType);

      // If requested provider doesn't have this episode, find one that does
      if (!episodeSlug) {
        const availableProviders = getAvailableProvidersForEpisode(providersMap, episode, translationType);
        for (const altProvider of availableProviders) {
          const altSlug = getEpisodeSlugForProvider(providersMap, altProvider, episode, translationType);
          if (altSlug) {
            // We'll use the alternative provider
            episodeSlug = altSlug;
            break;
          }
        }
      }
    }
  } catch (err) {
    console.error("[MiruroPlayer] Episodes fetch error:", err);
  }

  // If we still don't have a slug, try using the episode number as slug
  if (!episodeSlug) {
    episodeSlug = String(episode);
  }

  // Now fetch the actual stream data
  let streamData: any = null;
  let activeProvider = provider;

  try {
    const result = await miruroWatch(provider, anilistId, translationType, episodeSlug, providersMap, episode);
    if (result && result.sources.length > 0) {
      streamData = result;
      activeProvider = result.provider || provider;
    }
  } catch (err) {
    console.error("[MiruroPlayer] Watch fetch error:", err);
  }

  // Build the HTML page
  const hlsJsUrl = "https://cdn.jsdelivr.net/npm/hls.js@latest";

  let hlsSources: Array<{ url: string; quality: string; label: string }> = [];
  let embedSources: Array<{ url: string; quality: string; label: string }> = [];
  let subtitles: Array<{ url: string; label: string }> = [];

  if (streamData) {
    for (const source of streamData.sources || []) {
      if (source.isM3U8 || source.url?.includes(".m3u8")) {
        hlsSources.push({
          url: source.url,
          quality: source.quality || "Auto",
          label: source.quality || "Auto",
        });
      } else if (source.sourceType === "external" || source.type === "iframe" || source.type === "embed") {
        embedSources.push({
          url: source.url,
          quality: source.quality || "SD",
          label: source.sourceName || source.quality || "Embed",
        });
      } else if (source.url) {
        // Try as HLS
        hlsSources.push({
          url: source.url,
          quality: source.quality || "Auto",
          label: source.quality || "Auto",
        });
      }
    }

    for (const sub of streamData.subtitles || []) {
      subtitles.push({
        url: sub.url,
        label: sub.lang || sub.language || "English",
      });
    }
  }

  // If we have embed sources and no HLS, we can redirect to embed
  if (embedSources.length > 0 && hlsSources.length === 0) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe src="${embedSources[0].url}" allowfullscreen allow="autoplay; fullscreen; encrypted-media"></iframe>
</body>
</html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
  }

  // Build HLS player page
  const hlsSourcesJson = JSON.stringify(hlsSources);
  const subtitlesJson = JSON.stringify(subtitles);
  const providerLabel = activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1);
  const errorJson = JSON.stringify(!streamData || (hlsSources.length === 0 && embedSources.length === 0));

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Miruro ${providerLabel} Player</title>
  <script src="${hlsJsUrl}"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { width: 100%; height: 100%; display: flex; flex-direction: column; }
    video { width: 100%; height: 100%; background: #000; }
    .error-screen { display: flex; align-items: center; justify-content: center; height: 100%; color: #fff; text-align: center; padding: 20px; }
    .error-screen h2 { font-size: 18px; margin-bottom: 8px; color: #ff6b6b; }
    .error-screen p { font-size: 13px; color: #888; }
    .loading-screen { display: flex; align-items: center; justify-content: center; height: 100%; color: #fff; }
    .spinner { width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid #E63946; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .quality-bar { display: none; position: absolute; top: 8px; right: 8px; z-index: 10; gap: 4px; flex-wrap: wrap; }
    .quality-btn { padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; border: none; cursor: pointer; color: #fff; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); }
    .quality-btn.active { background: #E63946; }
    .quality-btn:hover { background: rgba(139,92,246,0.6); }
  </style>
</head>
<body>
  <div class="container" id="container">
    <div class="loading-screen" id="loading">
      <div class="spinner"></div>
    </div>
  </div>

  <script>
    const HLS_SOURCES = ${hlsSourcesJson};
    const SUBTITLES = ${subtitlesJson};
    const HAS_ERROR = ${errorJson};
    const PROVIDER = "${providerLabel}";

    const container = document.getElementById('container');
    const loading = document.getElementById('loading');

    if (HAS_ERROR) {
      loading.innerHTML = '<div class="error-screen"><div><h2>Stream Not Available</h2><p>Could not load stream from Miruro ' + PROVIDER + '. Try another server.</p></div></div>';
    } else if (HLS_SOURCES.length === 0) {
      loading.innerHTML = '<div class="error-screen"><div><h2>No HLS Sources</h2><p>No playable streams found. Try another server.</p></div></div>';
    } else {
      // Create video element
      const video = document.createElement('video');
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.style.cssText = 'width:100%;height:100%;background:#000;';

      // Add subtitles
      for (const sub of SUBTITLES) {
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = sub.label;
        track.srclang = sub.label.toLowerCase().includes('english') ? 'en' : sub.label.substring(0, 2).toLowerCase();
        track.src = sub.url;
        video.appendChild(track);
      }

      container.innerHTML = '';
      container.appendChild(video);

      // Quality bar
      if (HLS_SOURCES.length > 1) {
        const bar = document.createElement('div');
        bar.className = 'quality-bar';
        bar.style.display = 'flex';
        container.style.position = 'relative';
        container.appendChild(bar);

        HLS_SOURCES.forEach((src, idx) => {
          const btn = document.createElement('button');
          btn.className = 'quality-btn' + (idx === 0 ? ' active' : '');
          btn.textContent = src.label || src.quality;
          btn.onclick = () => {
            loadSource(src.url);
            bar.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
          };
          bar.appendChild(btn);
        });
      }

      function loadSource(url) {
        if (Hls.isSupported() && url.includes('.m3u8')) {
          const hls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            startLevel: -1,
          });
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError();
                  break;
                default:
                  console.error('Fatal HLS error:', data);
                  break;
              }
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          video.addEventListener('loadedmetadata', () => {
            video.play().catch(() => {});
          });
        } else {
          video.src = url;
          video.play().catch(() => {});
        }
      }

      // Load the first (best) source
      loadSource(HLS_SOURCES[0].url);
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
