import { animexGetAnime, animexServers, animexSources } from "../src/lib/animex-api";

const ID = 21; // One Piece
const EP = 1;

async function main() {
  console.log(`\n=== Testing FULL AnimeX route for One Piece (ID: ${ID}, Ep: ${EP}) ===\n`);

  // Step 1: Resolve slug
  const anime = await animexGetAnime(ID);
  console.log(`Slug: ${anime?.slug}`);

  if (!anime?.slug) { console.log("No slug found"); return; }

  // Step 2: Get provider list
  const serversList = await animexServers(anime.slug, EP);
  const subProviders = (serversList.subProviders || []).map((p: any) => p.id);
  const dubProviders = (serversList.dubProviders || []).map((p: any) => p.id);
  console.log(`\nSub providers (${subProviders.length}): ${subProviders.join(", ")}`);
  console.log(`Dub providers (${dubProviders.length}): ${dubProviders.join(", ")}`);

  // Step 3: Try each provider and see what we get
  const allJobs = [
    ...subProviders.map(p => ({ provider: p, type: "sub" as const })),
    ...dubProviders.map(p => ({ provider: p, type: "dub" as const })),
  ];

  console.log(`\nTotal jobs: ${allJobs.length}`);

  const results: any[] = [];
  for (const job of allJobs) {
    try {
      const result = await Promise.race([
        animexSources(anime.slug, EP, job.type, job.provider),
        new Promise<null>(r => setTimeout(() => r(null), 10000)),
      ]);

      if (!result?.sources?.length) {
        console.log(`  ❌ ${job.provider} (${job.type}): no sources`);
        continue;
      }

      const p = result.sources.find((s: any) => {
        const u = s.url || "", t = s.type || "";
        return ((u.includes(".m3u8") || t.includes("mpegurl") || (u.includes(".txt") && t.includes("mpegurl")) || u.includes(".mp4")) && !u.includes(".mpd"));
      });

      if (!p?.url) {
        console.log(`  ❌ ${job.provider} (${job.type}): no valid stream URL`);
        continue;
      }

      const isM3U8 = p.url.includes(".m3u8") || p.type?.includes("mpegurl");
      // Show a short version of the URL for comparison
      let shortUrl = p.url;
      try { shortUrl = new URL(p.url).hostname + new URL(p.url).pathname.slice(0, 30); } catch {}

      results.push({ provider: job.provider, type: job.type, url: p.url, shortUrl, isM3U8 });
      console.log(`  ✅ ${job.provider} (${job.type}): ${shortUrl}`);
    } catch (e: any) {
      console.log(`  ❌ ${job.provider} (${job.type}): ERROR - ${e?.message?.slice(0, 60)}`);
    }
  }

  // Show dedup analysis
  console.log(`\n=== DEDUP ANALYSIS ===`);
  console.log(`Total with streams: ${results.length}`);

  const seenUrls = new Set<string>();
  let uniqueCount = 0;
  const uniqueResults: any[] = [];
  for (const r of results) {
    const baseUrl = r.url.split("?")[0];
    if (seenUrls.has(baseUrl)) {
      console.log(`  DEDUP: ${r.provider} (${r.type}) shares URL with another provider`);
    } else {
      seenUrls.add(baseUrl);
      uniqueCount++;
      uniqueResults.push(r);
    }
  }
  console.log(`\nUnique URLs: ${uniqueCount}`);
  console.log(`After URL dedup (current behavior): ${uniqueCount} servers`);
  console.log(`Without URL dedup: ${results.length} servers`);

  console.log(`\n=== UNIQUE SERVERS AFTER DEDUP ===`);
  for (const r of uniqueResults) {
    console.log(`  ${r.provider} (${r.type}) — ${r.shortUrl}`);
  }
}

main().catch(e => console.error("Fatal:", e));
