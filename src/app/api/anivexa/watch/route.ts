import { NextRequest, NextResponse } from "next/server";
import { anivexaWatch, getBestEmbedUrl } from "@/lib/anivexa-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AniVexa Watch Endpoint — Returns embed HTML for anineko/allmanga providers
 *
 * GET /api/anivexa/watch?anilistId=16498&episode=1&type=sub&provider=anineko
 *
 * Strategy:
 *   1. Fetch streams from AniVexa API (public, no CF issues)
 *   2. If iframeable embed found → serve HTML with iframe
 *   3. If HLS/MP4 stream → serve HTML with HLS.js player
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const anilistId = parseInt(searchParams.get("anilistId") || "0");
    const episode = parseInt(searchParams.get("episode") || "1");
    const type = (searchParams.get("type") || "sub") as "sub" | "dub";
    const provider = searchParams.get("provider") || "anineko";

    if (!anilistId) {
      return NextResponse.json(
        { error: "anilistId parameter required" },
        { status: 400 }
      );
    }

    console.log(`[anivexa/watch] anilistId=${anilistId} ep=${episode} type=${type} provider=${provider}`);

    const result = await anivexaWatch(anilistId, episode, type, provider);

    if (!result || result.streams.length === 0) {
      console.warn(`[anivexa/watch] No streams found`);
      return new NextResponse(
        buildErrorHtml(episode, type),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Try iframeable embed first — serve HTML with embedded iframe
    const bestEmbed = getBestEmbedUrl(result);
    if (bestEmbed && bestEmbed.type === "iframe") {
      console.log(`[anivexa/watch] Serving embed iframe: ${bestEmbed.url.slice(0, 80)}...`);
      const providerName = `AniVexa/${provider}`;
      const html = buildEmbedHtml(bestEmbed.url, providerName, episode, type);
      return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
    }

    // Try HLS stream from result
    const hlsStream = result.streams.find(s => s.type === "hls" && s.url);
    if (hlsStream) {
      const providerName = `AniVexa/${provider}`;
      const introJson = result.intro ? JSON.stringify(result.intro) : "null";
      const outroJson = result.outro ? JSON.stringify(result.outro) : "null";
      const subtitleTracks = result.subtitles
        .filter(s => s.kind === "captions" || s.kind === "subtitles")
        .map((s, i) => ({
          url: s.file,
          label: s.label || s.language || `Track ${i + 1}`,
          language: s.language || "en",
          default: s.default || false,
        }));

      const html = buildPlayerHtml(
        hlsStream.url,
        providerName,
        episode,
        type,
        introJson,
        outroJson,
        JSON.stringify(subtitleTracks)
      );
      return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
    }

    // Fallback: try MP4 URL directly
    const mp4Stream = result.streams.find(s => (s.type === "mp4" || s.type === "player") && s.url);
    if (mp4Stream) {
      const providerName = `AniVexa/${provider}`;
      const html = buildPlayerHtml(
        mp4Stream.url,
        providerName,
        episode,
        type,
        "null",
        "null",
        "[]"
      );
      return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
    }

    // No usable streams
    return new NextResponse(
      buildErrorHtml(episode, type),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch stream";
    console.error("[anivexa/watch] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildPlayerHtml(
  streamUrl: string,
  providerName: string,
  episode: number,
  type: string,
  introJson: string,
  outroJson: string,
  subtitleTracksJson: string
): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>' + providerName + ' - EP' + episode + '</title>',
    '<script src="https://cdn.jsdelivr.net/npm/hls.js@1.6"></' + 'script>',
    '<style>',
    '*{margin:0;padding:0;box-sizing:border-box}',
    'html,body{width:100%;height:100%;background:#000;overflow:hidden}',
    'video{width:100%;height:100%;object-fit:contain}',
    '#overlay{position:absolute;top:12px;right:12px;display:flex;gap:6px;z-index:10}',
    '.badge{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;font-family:-apple-system,sans-serif}',
    '.provider-badge{background:rgba(168,85,247,0.2);color:#A855F7;border:1px solid rgba(168,85,247,0.3)}',
    '#skip-btn{position:absolute;bottom:80px;right:20px;padding:8px 20px;background:rgba(230,57,70,0.9);color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;z-index:15;display:none;font-family:-apple-system,sans-serif}',
    '#skip-btn:hover{background:rgba(230,57,70,1)}',
    '#loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;z-index:20;transition:opacity 0.5s}',
    '#loading.hidden{opacity:0;pointer-events:none}',
    '.spinner{width:40px;height:40px;border:3px solid rgba(168,85,247,0.2);border-top-color:#A855F7;border-radius:50%;animation:spin 0.8s linear infinite}',
    '@keyframes spin{to{transform:rotate(360deg)}}',
    '#error-msg{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#0a0a0a;z-index:30;text-align:center;padding:20px;font-family:-apple-system,sans-serif}',
    '#error-msg h3{color:#A855F7;font-size:16px;margin-bottom:8px}',
    '#error-msg p{font-size:12px;color:#666}',
    '</style>',
    '</head>',
    '<body>',
    '<div id="loading"><div class="spinner"></div></div>',
    '<div id="overlay"><span class="badge provider-badge">' + providerName + '</span></div>',
    '<button id="skip-btn">Skip Intro</button>',
    '<div id="error-msg"><div><h3>Stream Failed</h3><p id="error-text"></p></div></div>',
    '<video id="video" controls autoplay playsinline></video>',
    '<script>',
    'var url="' + streamUrl + '";',
    'var video=document.getElementById("video");',
    'var loading=document.getElementById("loading");',
    'var skipBtn=document.getElementById("skip-btn");',
    'var errorMsg=document.getElementById("error-msg");',
    'var errorText=document.getElementById("error-text");',
    'var introData=' + introJson + ';',
    'var outroData=' + outroJson + ';',
    'var subtitleTracks=' + subtitleTracksJson + ';',
    'var retryCount=0;',
    'function showError(msg){errorMsg.style.display="flex";errorText.textContent=msg;loading.classList.add("hidden");try{parent.postMessage({type:"player-error",source:"anivexa",message:msg},"*")}catch(e){}}',
    'if(Hls.isSupported()){',
    '  var hls=new Hls({maxBufferLength:30,maxMaxBufferLength:60,startLevel:-1,capLevelToPlayerSize:true});',
    '  hls.loadSource(url);hls.attachMedia(video);',
    '  if(subtitleTracks&&subtitleTracks.length>0){',
    '    subtitleTracks.forEach(function(t){',
    '      if(t.url){hls.addTrack({kind:"subtitles",label:t.label||"English",srclang:t.language||"en",url:t.url,default:!!t.default})}',
    '    });',
    '  }',
    '  hls.on(Hls.Events.MANIFEST_PARSED,function(){loading.classList.add("hidden");try{parent.postMessage({type:"player-ready",source:"anivexa"},"*")}catch(e){};video.play().catch(function(){})});',
    '  hls.on(Hls.Events.ERROR,function(e,d){if(d.fatal){if(d.type===Hls.ErrorTypes.NETWORK_ERROR){if(retryCount<3){retryCount++;setTimeout(function(){hls.startLoad()},2000)}else{showError("Network error: Stream unavailable.")}}else if(d.type===Hls.ErrorTypes.MEDIA_ERROR){hls.recoverMediaError()}else{showError("Playback error: "+d.details)}}});',
    '}else if(video.canPlayType("application/vnd.apple.mpegurl")){',
    '  video.src=url;video.addEventListener("loadedmetadata",function(){loading.classList.add("hidden");try{parent.postMessage({type:"player-ready",source:"anivexa-native"},"*")}catch(e){};video.play().catch(function(){})});',
    '  video.addEventListener("error",function(){showError("Native HLS playback failed.")});',
    '}',
    'video.addEventListener("play",function(){loading.classList.add("hidden");try{parent.postMessage({type:"player-ready",source:"anivexa"},"*")}catch(e){}});',
    'video.addEventListener("timeupdate",function(){',
    '  if(introData&&video.currentTime>=introData.start&&video.currentTime<introData.end){skipBtn.textContent="Skip Intro";skipBtn.style.display="block";return}',
    '  if(outroData&&video.currentTime>=outroData.start&&video.currentTime<outroData.end){skipBtn.textContent="Skip Outro";skipBtn.style.display="block";return}',
    '  skipBtn.style.display="none"',
    '});',
    'skipBtn.onclick=function(){',
    '  if(introData&&introData.end){video.currentTime=introData.end;skipBtn.style.display="none"}',
    '  if(outroData&&outroData.end){video.currentTime=outroData.end;skipBtn.style.display="none"}',
    '};',
    '</' + 'script>',
    '</body>',
    '</html>',
  ].join('\n');
}

function buildEmbedHtml(embedUrl: string, providerName: string, episode: number, type: string): string {
  const safeUrl = embedUrl.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/"/g, "\\u0022");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${providerName} - EP${episode}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
iframe{width:100%;height:100%;border:0}
#loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;z-index:20;transition:opacity 0.5s}
#loading.hidden{opacity:0;pointer-events:none}
.spinner{width:40px;height:40px;border:3px solid rgba(168,85,247,0.2);border-top-color:#A855F7;border-radius:50%;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.badge{position:absolute;top:12px;right:12px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;font-family:-apple-system,sans-serif;background:rgba(168,85,247,0.2);color:#A855F7;border:1px solid rgba(168,85,247,0.3);z-index:10}
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div></div>
<span class="badge">${providerName}</span>
<iframe src="${safeUrl}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media" referrerpolicy="no-referrer" onload="document.getElementById('loading').classList.add('hidden');try{parent.postMessage({type:'player-ready',source:'anivexa-embed'},'*')}catch(e){}"></iframe>
</body>
</html>`;
}

function buildErrorHtml(episode: number, type: string): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<style>',
    '*{margin:0;padding:0;box-sizing:border-box}',
    'html,body{width:100%;height:100%;background:#0a0a0a;overflow:hidden;font-family:-apple-system,sans-serif}',
    '.c{display:flex;align-items:center;justify-content:center;height:100%;color:#999;text-align:center;padding:20px}',
    '.b{max-width:320px}',
    '.i{width:48px;height:48px;margin:0 auto 16px;border-radius:12px;background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.2);display:flex;align-items:center;justify-content:center;font-size:24px;color:#A855F7}',
    'h3{color:#A855F7;font-size:16px;margin-bottom:8px}',
    'p{font-size:12px;line-height:1.5;color:#666}',
    '</style>',
    '</head>',
    '<body>',
    '<div class="c"><div class="b">',
    '<div class="i">!</div>',
    '<h3>No Stream Available</h3>',
    '<p>Episode ' + episode + ' (' + type.toUpperCase() + ') could not be loaded. Try another server.</p>',
    '</div></div>',
    '<script>try{parent.postMessage({type:"player-error",source:"anivexa",message:"No stream available for episode ' + episode + '"},"*")}catch(e){}</' + 'script>',
    '</body>',
    '</html>',
  ].join('\n');
}
