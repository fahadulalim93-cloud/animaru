import { NextRequest, NextResponse } from "next/server";
import { animexWatch, getProviderDisplayName } from "@/lib/animex-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AnimeX Watch Endpoint — GraphQL slug resolution + REST API streams
 *
 * GET /api/animex/watch?anilistId=172463&episode=1&type=sub&provider=mimi
 *
 * Auto-discovers available providers and races them:
 *   1. AniList ID → GraphQL → slug
 *   2. Slug → REST API → episodes/servers/sources
 *   3. Source URL → server proxy (ALL providers need proxy)
 *
 * ALL providers use server proxy (Referer/Origin protection):
 *   - Mimi (hard sub): Referer: animex.one, PNG-wrapped segments
 *   - Yuki (soft sub): Referer: megaplay.buzz, TS disguised as .jpg
 *   - Kiwi (hard sub): Origin/Referer: anidb.app, Cloudflare protected
 *   - Mochi (hard sub): Referer: animex.one, MP4 passthrough
 *   - Kami (alt): Referer: animex.one
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const anilistId = parseInt(searchParams.get("anilistId") || "0");
    const episode = parseInt(searchParams.get("episode") || "1");
    const type = (searchParams.get("type") || "sub") as "sub" | "dub";
    const provider = searchParams.get("provider") || undefined;

    if (!anilistId) {
      return NextResponse.json(
        { error: "anilistId parameter required" },
        { status: 400 }
      );
    }

    const result = await animexWatch(anilistId, episode, type, provider);

    if (!result.sources.length) {
      return new NextResponse(
        getErrorHtml(episode, type, result.triedProviders),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const bestSource = result.sources[0];
    const providerId = result.provider;
    const rawUrl = bestSource.url;

    if (bestSource.isMP4) {
      // MP4 — proxy with Referer
      const proxyUrl = `/api/animex/proxy?url=${encodeURIComponent(rawUrl)}&provider=${providerId}&type=segment`;
      return new NextResponse(
        getMp4PlayerHtml(proxyUrl, episode, type, result),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // M3U8 — ALL go through server proxy (adds Referer/Origin, handles Cloudflare)
    const streamUrl = `/api/animex/proxy?url=${encodeURIComponent(rawUrl)}&provider=${providerId}&type=manifest`;

    return new NextResponse(
      getHlsPlayerHtml(streamUrl, providerId, episode, type, result),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch stream";
    console.error("[AnimeX Watch Error]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Player HTML ────────────────────────────────────────────────────────────

function getHlsPlayerHtml(
  streamUrl: string,
  providerId: string,
  episode: number,
  type: string,
  result: { sources: any[]; provider: string; subtitles: any[]; intro?: any; outro?: any }
): string {
  const providerName = getProviderDisplayName(result.provider);
  const safeUrl = streamUrl.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/"/g, "\\u0022");
  const subtitlesJson = JSON.stringify(result.subtitles || []).replace(/</g, "\\u003c");
  const introJson = result.intro ? JSON.stringify(result.intro) : "null";
  const outroJson = result.outro ? JSON.stringify(result.outro) : "null";

  // xhrSetup rewrites segment URLs through our proxy
  const xhrSetupCode = `
    xhrSetup:function(xhr,url){
      if(url && !url.startsWith('/api/animex/proxy') && !url.startsWith('data:')){
        var isManifest=url.includes('.m3u8')||url.includes('.txt')||url.includes('m3u8');
        var proxyUrl='/api/animex/proxy?url='+encodeURIComponent(url)+'&provider=${providerId}&type='+(isManifest?'manifest':'segment');
        xhr.open('GET',proxyUrl,true);
      }
    }`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${providerName} - EP${episode}</title>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.6"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
video{width:100%;height:100%;object-fit:contain}
#overlay{position:absolute;top:12px;right:12px;display:flex;gap:6px;z-index:10}
.badge{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;font-family:-apple-system,sans-serif}
.provider-badge{background:rgba(74,222,128,0.2);color:#4ADE80;border:1px solid rgba(74,222,128,0.3)}
.quality-badge{background:rgba(74,144,226,0.2);color:#4A90E2;border:1px solid rgba(74,144,226,0.3);cursor:pointer}
#skip-btn{position:absolute;bottom:80px;right:20px;padding:8px 20px;background:rgba(230,57,70,0.9);color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;z-index:15;display:none;font-family:-apple-system,sans-serif}
#skip-btn:hover{background:rgba(230,57,70,1)}
#loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;z-index:20;transition:opacity 0.5s}
#loading.hidden{opacity:0;pointer-events:none}
.spinner{width:40px;height:40px;border:3px solid rgba(74,222,128,0.2);border-top-color:#4ADE80;border-radius:50%;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#qmenu{position:absolute;bottom:60px;right:12px;z-index:15;display:none;flex-direction:column;gap:4px;background:rgba(0,0,0,0.9);border-radius:8px;padding:8px;border:1px solid rgba(255,255,255,0.1)}
#qmenu.show{display:flex}
.qbtn{padding:6px 16px;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;color:#ccc;background:rgba(255,255,255,0.05);font-family:-apple-system,sans-serif}
.qbtn:hover,.qbtn.active{background:rgba(74,222,128,0.2);color:#4ADE80}
#error-msg{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#0a0a0a;z-index:30;text-align:center;padding:20px;font-family:-apple-system,sans-serif}
#error-msg h3{color:#4ADE80;font-size:16px;margin-bottom:8px}
#error-msg p{font-size:12px;color:#666;line-height:1.5}
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div></div>
<div id="overlay">
  <span class="badge provider-badge">${providerName}</span>
  <span class="badge quality-badge" onclick="toggleQ()">AUTO</span>
</div>
<div id="qmenu"></div>
<button id="skip-btn" onclick="skipIntro()">Skip Intro &raquo;</button>
<div id="error-msg"><div><h3>Stream Failed</h3><p id="error-text"></p></div></div>
<video id="video" controls autoplay playsinline></video>
<script>
var url="${safeUrl}";
var video=document.getElementById("video");
var loading=document.getElementById("loading");
var skipBtn=document.getElementById("skip-btn");
var errorMsg=document.getElementById("error-msg");
var errorText=document.getElementById("error-text");
var subtitles=${subtitlesJson};
var introData=${introJson};
var outroData=${outroJson};
var hls;
var retryCount=0;

function showError(msg){errorMsg.style.display="flex";errorText.textContent=msg;loading.classList.add("hidden");try{parent.postMessage({type:"player-error",source:"animex",message:msg},"*")}catch(e){}}

function skipIntro(){
  if(introData&&introData.end){video.currentTime=introData.end;skipBtn.style.display="none"}
  if(outroData&&outroData.end){video.currentTime=outroData.end;skipBtn.style.display="none"}
}

function checkSkip(){
  if(introData&&video.currentTime>=introData.start&&video.currentTime<introData.end){skipBtn.textContent="Skip Intro \\u00BB";skipBtn.style.display="block";return}
  if(outroData&&video.currentTime>=outroData.start&&video.currentTime<outroData.end){skipBtn.textContent="Skip Outro \\u00BB";skipBtn.style.display="block";return}
  skipBtn.style.display="none"
}

if(Hls.isSupported()){
  hls=new Hls({maxBufferLength:30,maxMaxBufferLength:60,startLevel:-1,capLevelToPlayerSize:true,${xhrSetupCode}});
  hls.loadSource(url);hls.attachMedia(video);
  hls.on(Hls.Events.MANIFEST_PARSED,function(){loading.classList.add("hidden");try{parent.postMessage({type:"player-ready",source:"animex"},"*")}catch(e){};video.play().catch(function(){});buildQ();loadSubtitles()});
  hls.on(Hls.Events.ERROR,function(e,d){if(d.fatal){if(d.type===Hls.ErrorTypes.NETWORK_ERROR){if(retryCount<3){retryCount++;setTimeout(function(){hls.startLoad()},2000)}else{showError("Network error. Stream unavailable.")}}else if(d.type===Hls.ErrorTypes.MEDIA_ERROR){hls.recoverMediaError()}else{showError("Playback error: "+d.details)}}});
}else if(video.canPlayType("application/vnd.apple.mpegurl")){
  video.src=url;
  video.addEventListener("loadedmetadata",function(){loading.classList.add("hidden");video.play().catch(function(){})});
  video.addEventListener("error",function(){showError("Native HLS playback failed.")});
}

function loadSubtitles(){
  if(!subtitles||subtitles.length===0||!hls)return;
  subtitles.forEach(function(sub,i){
    if(sub.url&&sub.url.endsWith(".vtt")){
      hls.addTrack({kind:"subtitles",label:sub.language||sub.lang,language:sub.lang||"en",url:sub.url},true);
    }
  });
}

function buildQ(){
  var m=document.getElementById("qmenu");
  var levels=hls.levels||[];
  var abtn=document.createElement("button");abtn.className="qbtn active";abtn.textContent="Auto";
  abtn.onclick=function(){hls.currentLevel=-1;document.querySelectorAll(".qbtn").forEach(function(b){b.classList.remove("active")});abtn.classList.add("active")};
  m.appendChild(abtn);
  levels.forEach(function(l,i){
    var b=document.createElement("button");b.className="qbtn";b.textContent=l.height+"p";
    b.onclick=function(){hls.currentLevel=i;document.querySelectorAll(".qbtn").forEach(function(x){x.classList.remove("active")});b.classList.add("active")};
    m.appendChild(b);
  });
}
function toggleQ(){document.getElementById("qmenu").classList.toggle("show")}
document.addEventListener("click",function(e){if(!e.target.closest("#qmenu")&&!e.target.closest(".quality-badge"))document.getElementById("qmenu").classList.remove("show")});
video.addEventListener("play",function(){loading.classList.add("hidden");try{parent.postMessage({type:"player-ready",source:"animex"},"*")}catch(e){}});
video.addEventListener("timeupdate",checkSkip);
<\/script>
</body>
</html>`;
}

function getMp4PlayerHtml(
  streamUrl: string,
  episode: number,
  type: string,
  result: { sources: any[]; provider: string }
): string {
  const providerName = getProviderDisplayName(result.provider);
  const safeUrl = streamUrl.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/"/g, "\\u0022");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${providerName} - EP${episode}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
video{width:100%;height:100%;object-fit:contain}
#loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;z-index:20;transition:opacity 0.5s}
#loading.hidden{opacity:0;pointer-events:none}
.spinner{width:40px;height:40px;border:3px solid rgba(74,222,128,0.2);border-top-color:#4ADE80;border-radius:50%;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.badge{position:absolute;top:12px;right:12px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;font-family:-apple-system,sans-serif;background:rgba(74,222,128,0.2);color:#4ADE80;border:1px solid rgba(74,222,128,0.3)}
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div></div>
<span class="badge">${providerName}</span>
<video id="video" controls autoplay playsinline><source src="${safeUrl}" /></video>
<script>
var video=document.getElementById("video");
var loading=document.getElementById("loading");
video.addEventListener("canplay",function(){loading.classList.add("hidden");try{parent.postMessage({type:"player-ready",source:"animex-mp4"},"*")}catch(e){};video.play().catch(function(){})});
video.addEventListener("error",function(){loading.innerHTML='<div style="color:#4ADE80;font-size:14px;text-align:center">Stream failed</div>';try{parent.postMessage({type:"player-error",source:"animex-mp4",message:"MP4 stream failed"},"*")}catch(e){}});
<\/script>
</body>
</html>`;
}

function getErrorHtml(
  episode: number,
  type: string,
  triedProviders: string[]
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#0a0a0a;overflow:hidden;font-family:-apple-system,sans-serif}
.c{display:flex;align-items:center;justify-content:center;height:100%;color:#999;text-align:center;padding:20px}
.b{max-width:320px}
.i{width:48px;height:48px;margin:0 auto 16px;border-radius:12px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.2);display:flex;align-items:center;justify-content:center;font-size:24px;color:#4ADE80}
h3{color:#4ADE80;font-size:16px;margin-bottom:8px}
p{font-size:12px;line-height:1.5;color:#666}
.p{margin-top:12px;font-size:10px;color:#444}
</style>
</head>
<body>
<div class="c"><div class="b">
<div class="i">!</div>
<h3>No Stream Available</h3>
<p>Episode ${episode} (${type.toUpperCase()}) could not be loaded. Try another server.</p>
${triedProviders.length ? `<div class="p">Tried: ${triedProviders.join(", ")}</div>` : ""}
</div></div>
<script>try{parent.postMessage({type:"player-error",source:"animex",message:"No stream available for episode ${episode}"},"*")}catch(e){}</script>
</body>
</html>`;
}
