/**
 * Client-side flow test — hits the actual Next.js API routes
 * that the watch page uses, same as the browser would.
 * 
 * Tests: anikoto-servers, animex-provider, anidap-provider
 * Anime: One Piece (anilistId=21), Episode 1
 */

const BASE = "https://luffytv.live"; // Production site

// If you want to test local, change to: const BASE = "http://localhost:3000";

const ANILIST_ID = 21; // One Piece
const EP = 1;

async function test(label, url, timeoutMs = 15000) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const elapsed = Date.now() - start;
    const data = await res.json();
    return { label, ok: res.ok, status: res.status, elapsed, data };
  } catch (e) {
    clearTimeout(timer);
    return { label, ok: false, status: 0, elapsed: Date.now() - start, data: null, error: e.message };
  }
}

async function main() {
  console.log("=".repeat(70));
  console.log("CLIENT-SIDE API ROUTE TEST (same paths the watch page uses)");
  console.log(`Anime: One Piece (anilistId=${ANILIST_ID}), Episode ${EP}`);
  console.log(`Target: ${BASE}`);
  console.log("=".repeat(70));

  // 1. AniKoto servers
  console.log("\n📡 [1] AniKoto — /api/anime/anikoto-servers/21/1");
  const r1 = await test("AniKoto", `${BASE}/api/anime/anikoto-servers/${ANILIST_ID}/${EP}?title=One%20Piece`);
  if (r1.ok && r1.data?.servers?.length) {
    console.log(`   ✅ ${r1.status} ${r1.elapsed}ms — ${r1.data.servers.length} servers`);
    r1.data.servers.forEach(s => {
      console.log(`     → ${s.name} | ${s.type} | ${s.quality} | m3u8=${s.isM3U8} | url=${s.streamUrl?.slice(0,80)}...`);
    });
  } else {
    console.log(`   ❌ ${r1.status} ${r1.elapsed}ms — ${r1.error || JSON.stringify(r1.data)?.slice(0,200)}`);
  }

  // 2. AnimeX per-provider (fast providers)
  const ANIMEX_FAST = ["mimi", "beep", "yuki"];
  console.log("\n📡 [2] AnimeX — /api/anime/animex-provider/21/1/{provider}");
  for (const prov of ANIMEX_FAST) {
    const r = await test(`AnimeX ${prov}`, `${BASE}/api/anime/animex-provider/${ANILIST_ID}/${EP}/${prov}`, 8000);
    if (r.ok && r.data?.servers?.length) {
      console.log(`   ✅ ${prov}: ${r.status} ${r.elapsed}ms — ${r.data.servers.length} servers`);
      r.data.servers.forEach(s => {
        console.log(`     → ${s.name} | ${s.type} | ${s.quality} | url=${s.streamUrl?.slice(0,80)}...`);
      });
    } else {
      console.log(`   ❌ ${prov}: ${r.status} ${r.elapsed}ms — ${r.error || JSON.stringify(r.data)?.slice(0,150)}`);
    }
  }

  // 3. AniDap per-provider (fast providers)
  const ANIDAP_FAST = ["mimi", "beep", "yuki"];
  console.log("\n📡 [3] AniDap — /api/anime/anidap-provider/21/1/{provider}");
  for (const prov of ANIDAP_FAST) {
    const r = await test(`AniDap ${prov}`, `${BASE}/api/anime/anidap-provider/${ANILIST_ID}/${EP}/${prov}`, 8000);
    if (r.ok && r.data?.servers?.length) {
      console.log(`   ✅ ${prov}: ${r.status} ${r.elapsed}ms — ${r.data.servers.length} servers`);
      r.data.servers.forEach(s => {
        const hasProxy = s.streamUrl?.includes("luffytv.live/p/") || s.streamUrl?.includes("/p/");
        console.log(`     → ${s.name} | ${s.type} | ${s.quality} | proxied=${hasProxy} | url=${s.streamUrl?.slice(0,80)}...`);
      });
    } else {
      console.log(`   ❌ ${prov}: ${r.status} ${r.elapsed}ms — ${r.error || JSON.stringify(r.data)?.slice(0,150)}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("KEY CHECK: Look for 'proxied=true' on AniDap — if false, that's a bug!");
  console.log("=".repeat(70));
}

main().catch(console.error);
