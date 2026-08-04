// Get FRESH subtitle URLs from AniDap and test them immediately
// Run with: npx tsx scripts/test-fresh-subs.ts

const ANILIST_ID = 21;
const EPISODE = 1;
const WORKER = "https://luffytv-subtitle.ggy892767.workers.dev";

async function main() {
  console.log("Fetching FRESH subtitle URLs from AniDap...\n");
  const { fetchAllAniDapSources } = await import("../src/lib/anidap-api");
  const results = await fetchAllAniDapSources(ANILIST_ID, EPISODE, {
    sub: true,
    dub: false,
    timeoutMs: 8000,
  });

  const allTracks: Array<{ provider: string; url: string; lang?: string; label?: string }> = [];
  for (const r of results) {
    for (const t of r.tracks || []) {
      allTracks.push({ provider: r.provider, url: t.url, lang: t.lang, label: t.label });
    }
  }

  console.log(`Got ${allTracks.length} fresh subtitle URLs\n`);

  // Test each URL with DIFFERENT referers to find the right one
  const referers = [
    "https://animex.one/",
    "https://megaplay.buzz/",
    "https://krussdomi.com/",
    "https://1oe.lostproject.club/",
    "https://lostproject.club/",
    "https://anidap.com/",
    "https://www.anidap.com/",
    "https://yuki.pro/",
    "https://api.anidap.com/",
  ];

  for (const track of allTracks.slice(0, 3)) {
    const url = track.url.replace(/^https?:\/\/\/+/i, "https://");
    console.log(`\n${"─".repeat(80)}`);
    console.log(`Provider: ${track.provider} | URL: ${url.slice(0, 100)}...`);
    console.log(`${"─".repeat(80)}`);

    for (const ref of referers) {
      try {
        const resp = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
            Referer: ref,
            Origin: ref.replace(/\/$/, ""),
          },
          redirect: "follow",
        });
        const status = resp.status;
        const ct = resp.headers.get("content-type") || "";
        const text = await resp.text();
        const isVtt = text.trimStart().startsWith("WEBVTT");
        const isSrt = /\d{2}:\d{2}:\d{2},\d{3}/.test(text);
        const preview = text.slice(0, 50).replace(/\n/g, " ");
        const marker = status === 200 ? (isVtt ? "✅ VTT" : isSrt ? "✅ SRT" : "⚠️ 200-unknown") : "❌";
        console.log(`  ${marker} ${String(status).padEnd(4)} ${ref.padEnd(35)} | ${preview}...`);
        if (status === 200) break; // found the working referer
      } catch (e: any) {
        console.log(`  ❌ ERR  ${ref.padEnd(35)} | ${e.message?.slice(0, 60)}`);
      }
    }
  }

  // Also test through the worker
  console.log(`\n${"═".repeat(80)}`);
  console.log("  Testing fresh URLs through the luffytv-subs worker");
  console.log(`${"═".repeat(80)}\n`);

  for (const track of allTracks.slice(0, 5)) {
    const url = track.url.replace(/^https?:\/\/\/+/i, "https://");
    const workerUrl = `${WORKER}/sub?url=${encodeURIComponent(url)}`;
    try {
      const resp = await fetch(workerUrl);
      const text = await resp.text();
      const isVtt = text.trimStart().startsWith("WEBVTT");
      const status = resp.status;
      const ok = status === 200 && isVtt;
      const marker = ok ? "✅" : "❌";
      console.log(`  ${marker} ${track.provider.padEnd(10)} ${String(status).padEnd(4)} ${isVtt ? "VTT" : "not-VTT"} | ${text.slice(0, 70).replace(/\n/g, " ")}...`);
    } catch (e: any) {
      console.log(`  ❌ ${track.provider.padEnd(10)} ERR  | ${e.message?.slice(0, 80)}`);
    }
  }
}

main().catch(console.error);
