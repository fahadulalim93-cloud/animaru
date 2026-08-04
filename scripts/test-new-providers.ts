// Test the new AniKoto and AniNeko.to scrapers
// Run with: npx tsx scripts/test-new-providers.ts

async function main() {
  console.log("=".repeat(80));
  console.log("  Testing AniKoto scraper");
  console.log("=".repeat(80));

  const { resolveAniKotoStreams } = await import("../src/lib/anichi-direct");
  const anichiResults = await resolveAniKotoStreams(21, 1, "One Piece");
  console.log(`\nAniKoto returned ${anichiResults.length} streams:\n`);
  for (const r of anichiResults) {
    console.log(`  [${r.type}${r.hardsub ? "/hsub" : ""}] ${r.serverName} | embed=${r.isEmbed} | intro=${r.intro ? `${r.intro.start}-${r.intro.end}` : "no"} | outro=${r.outro ? `${r.outro.start}-${r.outro.end}` : "no"}`);
    console.log(`    URL: ${r.streamUrl.slice(0, 100)}...`);
    console.log(`    Subs: ${r.subtitleTracks.length}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("  Testing AniNeko.to scraper");
  console.log("=".repeat(80));

  const { resolveAninekoStreams } = await import("../src/lib/anineko-to-direct");
  const aninekoResults = await resolveAninekoStreams(21, 1, "One Piece");
  console.log(`\nAniNeko returned ${aninekoResults.length} streams:\n`);
  for (const r of aninekoResults) {
    console.log(`  [${r.type}${r.hardsub ? "/hsub" : ""}] ${r.serverName} | embed=${r.isEmbed} | subs=${r.subtitleTracks.length}`);
    console.log(`    URL: ${r.streamUrl.slice(0, 120)}...`);
    if (r.subtitleTracks.length > 0) {
      for (const s of r.subtitleTracks) {
        console.log(`    Sub: ${s.label} | ${s.url.slice(0, 80)}...`);
      }
    }
  }

  // Test the subtitle URLs through the worker
  console.log("\n" + "=".repeat(80));
  console.log("  Testing AniNeko subtitles through luffytv-subs worker");
  console.log("=".repeat(80) + "\n");

  const WORKER = "https://luffytv-subtitle.ggy892767.workers.dev";
  let passCount = 0, failCount = 0;
  for (const r of aninekoResults) {
    for (const s of r.subtitleTracks) {
      try {
        const workerUrl = `${WORKER}/sub?url=${encodeURIComponent(s.url)}&ref=${encodeURIComponent("https://anineko.to/")}`;
        const resp = await fetch(workerUrl);
        const text = await resp.text();
        const isVtt = text.trimStart().startsWith("WEBVTT");
        const ok = resp.status === 200 && isVtt;
        if (ok) passCount++; else failCount++;
        console.log(`  ${ok ? "✅" : "❌"} ${r.serverName.padEnd(15)} ${resp.status} ${isVtt ? "VTT" : "not-VTT"} | ${text.slice(0, 80).replace(/\n/g, " ")}...`);
      } catch (e: any) {
        failCount++;
        console.log(`  ❌ ${r.serverName.padEnd(15)} ERR | ${e.message?.slice(0, 60)}`);
      }
    }
  }
  console.log(`\nWorker test: ${passCount} passed, ${failCount} failed`);
}

main().catch(console.error);
