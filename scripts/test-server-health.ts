/**
 * Server Health Check Script for LuffyTV
 * Tests ALL streaming server endpoints with One Piece (AniList ID: 21) Episode 1
 * Identifies: dead servers, timeouts, ns binding issues, missing m3u8/mp4
 */

const ANILIST_ID = 21; // One Piece
const EPISODE = 1;
const TITLE = "One Piece";
const TIMEOUT_MS = 15000;

interface ServerResult {
  name: string;
  endpoint: string;
  status: "alive" | "dead" | "timeout" | "error";
  serverCount: number;
  hasM3U8: boolean;
  hasMP4: boolean;
  hasEmbed: boolean;
  latencyMs: number;
  error?: string;
  servers?: any[];
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; data: any; latencyMs: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const latencyMs = Date.now() - start;
    let data: any = null;
    try { data = await res.json(); } catch {}
    clearTimeout(timeout);
    return { ok: res.ok, status: res.status, data, latencyMs };
  } catch (e: any) {
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    const isTimeout = e?.name === "AbortError" || e?.code === "ETIMEDOUT" || e?.message?.includes("abort");
    return { ok: false, status: isTimeout ? 408 : 502, data: null, latencyMs };
  }
}

function analyzeServers(name: string, data: any): { hasM3U8: boolean; hasMP4: boolean; hasEmbed: boolean; servers: any[] } {
  const servers = data?.servers || [];
  return {
    hasM3U8: servers.some((s: any) => s.isM3U8),
    hasMP4: servers.some((s: any) => s.isMP4),
    hasEmbed: servers.some((s: any) => s.isEmbed),
    servers: servers.map((s: any) => ({
      id: s.id,
      name: s.name,
      source: s.source,
      type: s.type,
      quality: s.quality,
      isM3U8: s.isM3U8,
      isMP4: s.isMP4,
      isEmbed: s.isEmbed,
      hasStreamUrl: !!(s.streamUrl || s.url),
      hardsub: s.hardsub,
    })),
  };
}

async function main() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`LuffyTV Server Health Check — ${TITLE} (AniList ${ANILIST_ID}) Ep ${EPISODE}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms per endpoint`);
  console.log(`${"=".repeat(80)}\n`);

  const endpoints: Array<{ name: string; url: string }> = [
    // Primary instant-servers
    {
      name: "instant-servers (PRIMARY)",
      url: `http://localhost:3000/api/anime/instant-servers/${ANILIST_ID}/${EPISODE}?title=${encodeURIComponent(TITLE)}`,
    },
    // Miruro V3
    {
      name: "miruro-v3",
      url: `http://localhost:3000/api/anime/miruro-v3/servers/${ANILIST_ID}/${EPISODE}?sub=1&dub=1`,
    },
    // Slow group
    {
      name: "servers (slow group)",
      url: `http://localhost:3000/api/anime/servers/${ANILIST_ID}/${EPISODE}?group=slow`,
    },
    // Fast group
    {
      name: "servers (fast group)",
      url: `http://localhost:3000/api/anime/servers/${ANILIST_ID}/${EPISODE}?group=fast`,
    },
    // Animex dedicated
    {
      name: "animex-servers",
      url: `http://localhost:3000/api/anime/animex-servers/${ANILIST_ID}/${EPISODE}`,
    },
    // AniDap dedicated
    {
      name: "anidap-servers",
      url: `http://localhost:3000/api/anime/anidap-servers/${ANILIST_ID}/${EPISODE}`,
    },
    // AniKuro dedicated
    {
      name: "anikuro-servers",
      url: `http://localhost:3000/api/anime/anikuro-servers/${ANILIST_ID}/${EPISODE}`,
    },
    // AniChi dedicated
    {
      name: "anichi-servers",
      url: `http://localhost:3000/api/anime/anichi-servers/${ANILIST_ID}/${EPISODE}?title=${encodeURIComponent(TITLE)}`,
    },
    // AniNeko.to dedicated
    {
      name: "anineko-to-servers",
      url: `http://localhost:3000/api/anime/anineko-to-servers/${ANILIST_ID}/${EPISODE}?title=${encodeURIComponent(TITLE)}`,
    },
    // AniLight dedicated
    {
      name: "anilight-servers",
      url: `http://localhost:3000/api/anime/anilight-direct/${ANILIST_ID}/${EPISODE}`,
    },
    // AniMo4 dedicated
    {
      name: "animo4-servers",
      url: `http://localhost:3000/api/anime/animo4-servers/${ANILIST_ID}/${EPISODE}`,
    },
    // AniKoto dedicated
    {
      name: "anikoto-servers",
      url: `http://localhost:3000/api/anime/anikoto-servers/${ANILIST_ID}/${EPISODE}?title=${encodeURIComponent(TITLE)}`,
    },
    // AniXtv dedicated
    {
      name: "anixtv-servers",
      url: `http://localhost:3000/api/anime/anixtv-servers/${ANILIST_ID}/${EPISODE}`,
    },
    // UniqueStream dedicated
    {
      name: "uniquestream-servers",
      url: `http://localhost:3000/api/anime/animostream-servers/${ANILIST_ID}/${EPISODE}`,
    },
    // AnimeGG dedicated
    {
      name: "animegg-servers",
      url: `http://localhost:3000/api/anime/animegg-servers/${ANILIST_ID}/${EPISODE}`,
    },
    // ReAnime dedicated
    {
      name: "reanime-servers",
      url: `http://localhost:3000/api/anime/reanime-servers/${ANILIST_ID}/${EPISODE}`,
    },
    // WatchAnimeWorld dedicated
    {
      name: "watchanimeworld-servers",
      url: `http://localhost:3000/api/anime/watchanimeworld-servers/${ANILIST_ID}/${EPISODE}`,
    },
    // AniZone
    {
      name: "anizone-search",
      url: `http://localhost:3000/api/anime/anizone-search?q=${encodeURIComponent(TITLE)}`,
    },
    // Kyren
    {
      name: "kyren-direct",
      url: `http://localhost:3000/api/anime/kyren-direct/${ANILIST_ID}/${EPISODE}`,
    },
    // Animex debug
    {
      name: "animex-debug",
      url: `http://localhost:3000/api/anime/animex-debug/${ANILIST_ID}`,
    },
  ];

  // Also test the UPSTREAM APIs directly (these are the real servers we fetch from)
  const upstreamEndpoints: Array<{ name: string; url: string; method?: string; body?: string; headers?: Record<string, string> }> = [
    // Animex GraphQL
    {
      name: "UPSTREAM: graphql.animex.one",
      url: "https://graphql.animex.one/graphql",
      method: "POST",
      body: JSON.stringify({
        query: "query($id:Int){anime(anilistId:$id){id anilistId titleEnglish titleRomaji}}",
        variables: { id: ANILIST_ID },
      }),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Origin: "https://animex.one",
        Referer: "https://animex.one/",
      },
    },
    // AniDap REST API (chad.anidap.lol) — servers
    {
      name: "UPSTREAM: chad.anidap.lol/servers",
      url: "https://chad.anidap.lol/rest/api/servers?id=one-piece-p8k27&epNum=1",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Origin: "https://anidap.lol",
        Referer: "https://anidap.lol/",
      },
    },
    // AniDap REST API — episodes
    {
      name: "UPSTREAM: chad.anidap.lol/episodes",
      url: "https://chad.anidap.lol/rest/api/episodes?id=one-piece-p8k27",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Origin: "https://anidap.lol",
        Referer: "https://anidap.lol/",
      },
    },
    // AniDap frontend (anidap.lol)
    {
      name: "UPSTREAM: anidap.lol",
      url: `https://anidap.lol/api/anime/${ANILIST_ID}`,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Origin: "https://anidap.lol",
        Referer: "https://anidap.lol/",
      },
    },
    // AniDB
    {
      name: "UPSTREAM: anidb.app",
      url: "https://anidb.app/search/suggestions?q=One+Piece",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://anidb.app/",
      },
    },
    // AniNeko.to
    {
      name: "UPSTREAM: anineko.to",
      url: `https://anineko.to/browser?keyword=${encodeURIComponent(TITLE)}`,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100100 Firefox/121.0",
      },
    },
    // AniList
    {
      name: "UPSTREAM: anilist.co",
      url: "https://graphql.anilist.co",
      method: "POST",
      body: JSON.stringify({
        query: `query($id:Int){Media(id:$id,type:ANIME){id title{english romaji} episodes}}`,
        variables: { id: ANILIST_ID },
      }),
      headers: { "Content-Type": "application/json" },
    },
    // Miruro
    {
      name: "UPSTREAM: miruro.tv",
      url: "https://www.miruro.tv",
      headers: { "User-Agent": "Mozilla/5.0" },
    },
    // Kyren
    {
      name: "UPSTREAM: kyren.moe",
      url: "https://kyren.moe",
      headers: { "User-Agent": "Mozilla/5.0" },
    },
    // Senshi
    {
      name: "UPSTREAM: senshi.live",
      url: "https://senshi.live",
      headers: { "User-Agent": "Mozilla/5.0" },
    },
    // AniKage
    {
      name: "UPSTREAM: anikage.cc",
      url: "https://anikage.cc",
      headers: { "User-Agent": "Mozilla/5.0" },
    },
    // AniLight
    {
      name: "UPSTREAM: anilight.live",
      url: "https://anilight.live",
      headers: { "User-Agent": "Mozilla/5.0" },
    },
    // Luna
    {
      name: "UPSTREAM: luna.animeaqua.net",
      url: "https://luna.animeaqua.net",
      headers: { "User-Agent": "Mozilla/5.0" },
    },
    // AniPm
    {
      name: "UPSTREAM: ani.pm",
      url: "https://ani.pm",
      headers: { "User-Agent": "Mozilla/5.0" },
    },
    // UniqueStream
    {
      name: "UPSTREAM: uniquestream.net",
      url: "https://uniquestream.net",
      headers: { "User-Agent": "Mozilla/5.0" },
    },
    // VidNest
    {
      name: "UPSTREAM: vidnest.fun",
      url: "https://vidnest.fun",
      headers: { "User-Agent": "Mozilla/5.0" },
    },
    // Videasy
    {
      name: "UPSTREAM: player.videasy.net",
      url: "https://player.videasy.net",
      headers: { "User-Agent": "Mozilla/5.0" },
    },
  ];

  const results: ServerResult[] = [];

  // Test UPSTREAM endpoints first (direct server connectivity)
  console.log(`\n${"─".repeat(80)}`);
  console.log("PHASE 1: Testing UPSTREAM server connectivity (direct HTTP)");
  console.log(`${"─".repeat(80)}\n`);

  for (const ep of upstreamEndpoints) {
    const start = Date.now();
    process.stdout.write(`  Testing ${ep.name}... `);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(ep.url, {
        method: (ep.method as any) || "GET",
        headers: ep.headers || {},
        body: ep.body || undefined,
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      const status = res.status;
      const ok = res.ok;

      // Check for HTML content-type (might be CF challenge page)
      const ct = res.headers.get("content-type") || "";
      const isCFChallenge = !ok && (status === 403 || status === 503);
      const isNSBindingError = status === 500 && ct.includes("text/html");

      if (ok) {
        console.log(`✅ ALIVE (${latencyMs}ms, HTTP ${status})`);
      } else if (isCFChallenge) {
        console.log(`⚠️  CF-BLOCKED (${latencyMs}ms, HTTP ${status})`);
      } else {
        console.log(`❌ DEAD (${latencyMs}ms, HTTP ${status})`);
      }
    } catch (e: any) {
      const latencyMs = Date.now() - start;
      const isTimeout = e?.name === "AbortError";
      const isDnsError = e?.code === "ENOTFOUND" || e?.message?.includes("ENOTFOUND") || e?.message?.includes("getaddrinfo");
      const isConnRefused = e?.code === "ECONNREFUSED";
      const isNsError = e?.message?.includes("ns") && e?.message?.includes("bind");

      if (isNsError) {
        console.log(`🔴 NS-BINDING ERROR (${latencyMs}ms): ${e.message}`);
      } else if (isDnsError) {
        console.log(`🔴 DNS ERROR (ENOTFOUND, ${latencyMs}ms): ${e?.code || e?.message}`);
      } else if (isTimeout) {
        console.log(`⏱️  TIMEOUT (${latencyMs}ms)`);
      } else if (isConnRefused) {
        console.log(`❌ CONNECTION REFUSED (${latencyMs}ms)`);
      } else {
        console.log(`❌ ERROR (${latencyMs}ms): ${e?.message?.slice(0, 80) || "unknown"}`);
      }
    }
  }

  // Test local API endpoints
  console.log(`\n${"─".repeat(80)}`);
  console.log("PHASE 2: Testing LOCAL API endpoints (requires dev server running)");
  console.log(`${"─".repeat(80)}\n`);

  for (const ep of endpoints) {
    process.stdout.write(`  Testing ${ep.name}... `);
    const { ok, status, data, latencyMs } = await fetchWithTimeout(ep.url, TIMEOUT_MS);

    if (status === 408) {
      console.log(`⏱️  TIMEOUT (${latencyMs}ms)`);
      results.push({ name: ep.name, endpoint: ep.url, status: "timeout", serverCount: 0, hasM3U8: false, hasMP4: false, hasEmbed: false, latencyMs });
      continue;
    }

    if (!ok || !data) {
      console.log(`❌ DEAD (${latencyMs}ms, HTTP ${status})`);
      results.push({ name: ep.name, endpoint: ep.url, status: "dead", serverCount: 0, hasM3U8: false, hasMP4: false, hasEmbed: false, latencyMs, error: `HTTP ${status}` });
      continue;
    }

    const analysis = analyzeServers(ep.name, data);
    const serverCount = analysis.servers.length;
    const statusStr = serverCount > 0 ? "✅ ALIVE" : "⚠️  EMPTY";

    console.log(`${statusStr} (${latencyMs}ms, ${serverCount} servers, m3u8:${analysis.hasM3U8} mp4:${analysis.hasMP4} embed:${analysis.hasEmbed})`);

    // Print individual servers
    if (serverCount > 0) {
      for (const s of analysis.servers.slice(0, 10)) { // show first 10
        const streamIcon = s.hasStreamUrl ? "🔗" : "❌no-url";
        const formatIcon = s.isM3U8 ? "HLS" : s.isMP4 ? "MP4" : s.isEmbed ? "EMB" : "???";
        console.log(`    ${streamIcon} [${formatIcon}] ${s.name} (${s.source}/${s.type}, ${s.quality})${s.hardsub ? " [HS]" : ""}`);
      }
      if (serverCount > 10) console.log(`    ... and ${serverCount - 10} more`);
    }

    results.push({
      name: ep.name,
      endpoint: ep.url,
      status: serverCount > 0 ? "alive" : "dead",
      serverCount,
      hasM3U8: analysis.hasM3U8,
      hasMP4: analysis.hasMP4,
      hasEmbed: analysis.hasEmbed,
      latencyMs,
      servers: analysis.servers,
    });
  }

  // Summary
  console.log(`\n${"=".repeat(80)}`);
  console.log("SUMMARY");
  console.log(`${"=".repeat(80)}\n`);

  const alive = results.filter(r => r.status === "alive");
  const dead = results.filter(r => r.status === "dead");
  const timedOut = results.filter(r => r.status === "timeout");
  const errors = results.filter(r => r.status === "error");

  console.log(`  ✅ ALIVE endpoints: ${alive.length}`);
  for (const r of alive) console.log(`     - ${r.name}: ${r.serverCount} servers (${r.latencyMs}ms)`);

  console.log(`\n  ❌ DEAD endpoints: ${dead.length}`);
  for (const r of dead) console.log(`     - ${r.name}: ${r.error || "no servers"} (${r.latencyMs}ms)`);

  console.log(`\n  ⏱️  TIMEOUT endpoints: ${timedOut.length}`);
  for (const r of timedOut) console.log(`     - ${r.name}: timed out after ${r.latencyMs}ms`);

  console.log(`\n  🔴 ERROR endpoints: ${errors.length}`);
  for (const r of errors) console.log(`     - ${r.name}: ${r.error}`);

  // Total live servers
  const totalServers = alive.reduce((sum, r) => sum + r.serverCount, 0);
  const totalWithM3U8 = alive.filter(r => r.hasM3U8).length;
  const totalWithMP4 = alive.filter(r => r.hasMP4).length;
  console.log(`\n  📊 Total LIVE servers: ${totalServers}`);
  console.log(`  📊 Endpoints with m3u8: ${totalWithM3U8}`);
  console.log(`  📊 Endpoints with mp4: ${totalWithMP4}`);

  // Problem endpoints
  const problems = [...dead, ...timedOut, ...errors];
  if (problems.length > 0) {
    console.log(`\n  ⚠️  PROBLEM ENDPOINTS TO FIX:`);
    for (const r of problems) {
      console.log(`     - ${r.name}: ${r.status} — ${r.error || "needs investigation"}`);
    }
  }
}

main().catch(console.error);
