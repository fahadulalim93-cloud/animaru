import { fetchAniPmSources, resolveAniPmId, searchAniPm, getAniPmSources } from "../src/lib/anipm-api";
import { getTitle } from "../src/lib/anilist-cache";

async function main() {
  const anilistId = 11061;
  const epNum = 1;

  console.log("=== Step 1: Get Title ===");
  const title = await getTitle(anilistId);
  console.log("Title:", title);

  console.log("\n=== Step 2: Search AniPm ===");
  const results = await searchAniPm(title || "Hunter x Hunter", 8000);
  console.log("Search results:", results.length);
  results.slice(0, 3).forEach(r => console.log(`  id=${r.id} anilistId=${r.anilistId} title=${r.title}`));

  console.log("\n=== Step 3: Resolve AniPm ID ===");
  const resolved = await resolveAniPmId(anilistId, 8000);
  console.log("Resolved:", resolved);

  console.log("\n=== Step 4: Get AniPm Sources ===");
  const sources = await getAniPmSources(anilistId, epNum, 8000);
  console.log("Sources:", sources ? `sub=${sources.sub?.length} dub=${sources.dub?.length}` : "null");
  if (sources?.sub) {
    sources.sub.slice(0, 3).forEach(s => console.log(`  sub: ${s.provider} | ${s.kind} | ${s.url?.slice(0, 80)}`));
  }
  if (sources?.dub) {
    sources.dub.slice(0, 3).forEach(s => console.log(`  dub: ${s.provider} | ${s.kind} | ${s.url?.slice(0, 80)}`));
  }

  console.log("\n=== Step 5: Fetch AniPm Sources (full) ===");
  const full = await fetchAniPmSources(anilistId, epNum, { sub: true, dub: true, timeoutMs: 10000 });
  console.log("Full results:", full.length);
  full.forEach(s => console.log(`  ${s.provider} | ${s.type} | m3u8=${s.isM3U8} | url=${s.streamUrl?.slice(0, 60)}`));
}

main().catch(e => console.error("FATAL:", e));
