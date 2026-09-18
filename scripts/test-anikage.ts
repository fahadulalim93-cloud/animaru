import { fetchAnikageSources } from "../src/lib/anikage-api";

async function main() {
  console.log("=== AniKage (staggered, with cache) ===");
  const kage = await fetchAnikageSources(11061, 1, { timeoutMs: 15000 });
  console.log(`AniKage: ${kage.length} servers`);
  kage.forEach(s => console.log(`  ${s.server} | ${s.type} | ${s.streamUrl?.slice(0, 70)}`));
}

main().catch(e => console.error("FATAL:", e));
