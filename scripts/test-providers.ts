import { fetchAniPmSources, resolveAniPmId } from "../src/lib/anipm-api";
import { fetchAnikageSources } from "../src/lib/anikage-api";

async function main() {
  const anilistId = 11061;
  const epNum = 1;

  console.log("=== AniPm ===");
  const pm = await fetchAniPmSources(anilistId, epNum, { sub: true, dub: true, timeoutMs: 15000 });
  console.log(`AniPm: ${pm.length} servers`);
  pm.forEach(s => console.log(`  ${s.provider} | ${s.type} | m3u8=${s.isM3U8} | embed=${s.isEmbed}`));

  console.log("\n=== AniKage ===");
  const kage = await fetchAnikageSources(anilistId, epNum, { timeoutMs: 15000 });
  console.log(`AniKage: ${kage.length} servers`);
  kage.forEach(s => console.log(`  ${s.server} | ${s.type} | m3u8=${s.isM3U8}`));
}

main().catch(e => console.error("FATAL:", e));
