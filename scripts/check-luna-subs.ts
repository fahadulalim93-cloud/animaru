// Check what referer Luna returns for subtitle URLs
// Run with: npx tsx scripts/check-luna-subs.ts

async function main() {
  const { fetchAllLunaSources } = await import("../src/lib/luna-api");
  const results = await fetchAllLunaSources(21, 1);

  console.log(`\nLuna returned ${results.length} results:\n`);

  for (const r of results) {
    console.log(`Provider: ${r.provider} | type: ${r.type}`);
    console.log(`  Stream URL: ${r.streamUrl?.slice(0, 80)}...`);
    console.log(`  Subtitles: ${r.tracks?.length || 0}`);
    for (const t of r.tracks || []) {
      console.log(`    • ${t.label} | ${t.url.slice(0, 100)}...`);
    }
    console.log("");
  }
}
main().catch(console.error);
