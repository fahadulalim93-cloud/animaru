/**
 * Live test for 3 anime sources: AniKoto, AnimeX, AniDap
 * Tests basic API connectivity and data fetching.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function timedFetch(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    const elapsed = Date.now() - start;
    return { ok: res.ok, status: res.status, elapsed, data: null, error: null, res };
  } catch (e) {
    clearTimeout(timer);
    const elapsed = Date.now() - start;
    return { ok: false, status: 0, elapsed, data: null, error: e.message, res: null };
  }
}

async function readJson(result) {
  if (!result.res) return null;
  try { return await result.res.json(); } catch { return null; }
}

console.log("=".repeat(70));
console.log("ANIME SOURCE LIVE TEST");
console.log("=".repeat(70));

// ─── 1. ANIKOTO (anikotoapi.site) ──────────────────────────────────────
console.log("\n📡 [1] ANIKOTO — anikotoapi.site");

// Test 1a: Health/root
let r = await timedFetch("https://anikotoapi.site/", {
  headers: { "User-Agent": UA, Accept: "application/json" }
});
console.log(`   Health:  ${r.ok ? "✅" : "❌"}  ${r.status}  ${r.elapsed}ms  ${r.error || ""}`);

// Test 1b: Recent anime
r = await timedFetch("https://anikotoapi.site/recent-anime?page=1&per_page=5", {
  headers: { "User-Agent": UA, Accept: "application/json" }
});
let data = await readJson(r);
console.log(`   Recent:  ${r.ok ? "✅" : "❌"}  ${r.status}  ${r.elapsed}ms`);
if (data?.data?.length) {
  const anime = data.data[0];
  console.log(`   Sample:  "${anime.title}" (id=${anime.id}, ani_id=${anime.ani_id}, sub=${anime.is_sub}, dub=${anime.is_dub})`);
  // Test 1c: Series detail for first anime
  const r2 = await timedFetch(`https://anikotoapi.site/series/${anime.id}`, {
    headers: { "User-Agent": UA, Accept: "application/json" }
  });
  const sData = await readJson(r2);
  console.log(`   Series:  ${r2.ok ? "✅" : "❌"}  ${r2.status}  ${r2.elapsed}ms`);
  if (sData?.data?.episodes?.length) {
    const ep = sData.data.episodes[0];
    console.log(`   Ep sample: #${ep.number} "${ep.title}" sub=${ep.embed_url?.sub?.slice(0,60)}...`);
  }
} else {
  console.log(`   No data returned. Raw: ${JSON.stringify(data)?.slice(0, 200)}`);
}

// ─── 2. ANIMEX (graphql.animex.one + pp.animex.one) ────────────────────
console.log("\n📡 [2] ANIMEX — animex.one");

// Test 2a: GraphQL search
const gqlQuery = JSON.stringify({
  query: `{ searchAnime(query: "one piece", limit: 3) { items { id anilistId titles } } }`
});
r = await timedFetch("https://graphql.animex.one/graphql", {
  method: "POST",
  headers: {
    "User-Agent": UA,
    "Content-Type": "application/json",
    Origin: "https://animex.one",
    Referer: "https://animex.one/",
  },
  body: gqlQuery,
});
data = await readJson(r);
console.log(`   GraphQL: ${r.ok ? "✅" : "❌"}  ${r.status}  ${r.elapsed}ms`);
if (data?.data?.searchAnime?.items?.length) {
  const item = data.data.searchAnime.items[0];
  console.log(`   Sample:  id="${item.id}" anilistId=${item.anilistId} titles=${JSON.stringify(item.titles)?.slice(0,80)}`);
  
  // Test 2b: Servers endpoint
  const r2 = await timedFetch(`https://pp.animex.one/rest/api/servers?id=${encodeURIComponent(item.id)}&epNum=1`, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Origin: "https://animex.one",
      Referer: "https://animex.one/",
    }
  });
  const sData = await readJson(r2);
  console.log(`   Servers: ${r2.ok ? "✅" : "❌"}  ${r2.status}  ${r2.elapsed}ms`);
  if (sData) {
    const subCount = sData.subProviders?.length || 0;
    const dubCount = sData.dubProviders?.length || 0;
    console.log(`   Providers: ${subCount} sub + ${dubCount} dub`);
    if (sData.subProviders?.length) {
      console.log(`   Sub list: ${sData.subProviders.map(p => p.id).join(", ")}`);
    }
  }
} else {
  console.log(`   No results. Raw: ${JSON.stringify(data)?.slice(0, 300)}`);
}

// ─── 3. ANIDAP (anidap.lol + chad.anidap.lol) ──────────────────────────
console.log("\n📡 [3] ANIDAP — anidap.lol");

// Test 3a: AniList ID mapping (One Piece = anilistId 21)
r = await timedFetch("https://anidap.lol/api/anime/21", {
  headers: {
    "User-Agent": UA,
    Accept: "application/json",
    Origin: "https://anidap.lol",
    Referer: "https://anidap.lol/",
  }
});
data = await readJson(r);
console.log(`   Mapping: ${r.ok ? "✅" : "❌"}  ${r.status}  ${r.elapsed}ms`);
if (data?.success && data.data?.id) {
  const anidapId = data.data.id;
  console.log(`   AniDap ID: "${anidapId}" (anilistId=21 → One Piece)`);
  
  // Test 3b: Servers
  const r2 = await timedFetch(`https://chad.anidap.lol/rest/api/servers?id=${encodeURIComponent(anidapId)}&epNum=1`, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Origin: "https://anidap.lol",
      Referer: "https://anidap.lol/",
    }
  });
  const sData = await readJson(r2);
  console.log(`   Servers: ${r2.ok ? "✅" : "❌"}  ${r2.status}  ${r2.elapsed}ms`);
  if (sData) {
    const subCount = sData.subProviders?.length || 0;
    const dubCount = sData.dubProviders?.length || 0;
    console.log(`   Providers: ${subCount} sub + ${dubCount} dub`);
    if (sData.subProviders?.length) {
      console.log(`   Sub list: ${sData.subProviders.map(p => p.id).join(", ")}`);
    }
  }

  // Test 3c: Sources for first sub provider
  if (data?.data?.id) {
    const providers = sData?.subProviders || [{ id: "mimi" }];
    const firstP = providers[0]?.id || "mimi";
    const r3 = await timedFetch(`https://chad.anidap.lol/rest/api/sources?id=${encodeURIComponent(anidapId)}&epNum=1&type=sub&providerId=${firstP}`, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Origin: "https://anidap.lol",
        Referer: "https://anidap.lol/",
      }
    });
    const srcData = await readJson(r3);
    console.log(`   Sources: ${r3.ok ? "✅" : "❌"}  ${r3.status}  ${r3.elapsed}ms  provider=${firstP}`);
    if (srcData?.sources?.length) {
      srcData.sources.forEach(s => {
        console.log(`     → ${s.quality || "?"} ${s.type || "?"} ${s.url?.slice(0, 80)}...`);
      });
    }
  }
} else {
  console.log(`   Mapping failed. Raw: ${JSON.stringify(data)?.slice(0, 300)}`);
  
  // Try direct site reachability
  const rSite = await timedFetch("https://anidap.lol/", {
    headers: { "User-Agent": UA }
  });
  console.log(`   Site:    ${rSite.ok ? "✅" : "❌"}  ${rSite.status}  ${rSite.elapsed}ms (direct page load)`);
}

// ─── Summary ────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(70));
console.log("DONE — check ✅/❌ above for each endpoint");
console.log("=".repeat(70));
