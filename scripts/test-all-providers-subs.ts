// Test which providers actually return subtitle URLs
// Run with: npx tsx scripts/test-all-providers-subs.ts

// We test with One Piece (anilistId=21, episode=1) — popular anime, all providers should have it

const ANILIST_ID = 21;
const EPISODE = 1;
const TITLE = "One Piece";

interface SubtitleTrack {
  url: string;
  lang?: string;
  label?: string;
}

interface ProviderResult {
  provider: string;
  hasSubtitles: boolean;
  subtitleCount: number;
  subtitleUrls: Array<{ url: string; lang?: string; label?: string; extension?: string }>;
  error?: string;
  durationMs?: number;
}

async function testProvider(
  name: string,
  fn: () => Promise<{ tracks?: SubtitleTrack[] } | any>,
): Promise<ProviderResult> {
  const start = Date.now();
  try {
    const result = await fn();
    const tracks = result?.tracks || result?.subtitleTracks || [];
    const subtitleUrls = tracks.map((t: SubtitleTrack) => {
      const url = t.url || "";
      const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "unknown";
      return { url, lang: t.lang, label: t.label, extension: ext };
    });
    return {
      provider: name,
      hasSubtitles: subtitleUrls.length > 0,
      subtitleCount: subtitleUrls.length,
      subtitleUrls,
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      provider: name,
      hasSubtitles: false,
      subtitleCount: 0,
      subtitleUrls: [],
      error: e?.message || String(e),
      durationMs: Date.now() - start,
    };
  }
}

async function main() {
  console.log(`\n${"═".repeat(80)}`);
  console.log(`  Testing subtitle URLs from all providers`);
  console.log(`  Anime: One Piece (anilistId=${ANILIST_ID}, episode=${EPISODE})`);
  console.log(`${"═".repeat(80)}\n`);

  const results: ProviderResult[] = [];

  // ── AnimeX (mimi + yuki) ──
  const { resolveAnimexMimiBoth, resolveAnimexProvider } = await import("../src/lib/animex-fast");
  results.push(await testProvider("AnimeX mimi", async () => {
    const r = await resolveAnimexMimiBoth(ANILIST_ID, EPISODE);
    return { tracks: r.sub?.tracks || [] };
  }));
  results.push(await testProvider("AnimeX yuki", async () => {
    const r = await resolveAnimexProvider(ANILIST_ID, EPISODE, "yuki");
    return { tracks: r?.tracks || [] };
  }));

  // ── AniDB ──
  const { resolveAniDbEmbeds } = await import("../src/lib/anidb-direct");
  results.push(await testProvider("AniDB", async () => {
    const r = await resolveAniDbEmbeds(ANILIST_ID, EPISODE);
    return { tracks: [] }; // AniDB returns embeds, no subtitle tracks
  }));

  // ── AniNeko ──
  const { resolveAniNekoM3u8 } = await import("../src/lib/anineko-direct");
  results.push(await testProvider("AniNeko", async () => {
    const r = await resolveAniNekoM3u8(ANILIST_ID, EPISODE);
    const tracks = r.flatMap(s => s.subtitleUrl ? [{ url: s.subtitleUrl, lang: "en", label: "English" }] : []);
    return { tracks };
  }));

  // ── AniKage ──
  const { resolveAniKageBoth } = await import("../src/lib/anikage-fast");
  results.push(await testProvider("AniKage", async () => {
    const r = await resolveAniKageBoth(ANILIST_ID, EPISODE, TITLE);
    return { tracks: r.sub?.tracks || r.dub?.tracks || [] };
  }));

  // ── Kyren ──
  const { fetchAllKyrenSources } = await import("../src/lib/kyren-api");
  results.push(await testProvider("Kyren", async () => {
    const r = await fetchAllKyrenSources(ANILIST_ID, EPISODE);
    const tracks = r.flatMap(s => s.tracks || []);
    return { tracks };
  }));

  // ── AniLight ──
  const { fetchAniLightSources } = await import("../src/lib/anilight-api");
  results.push(await testProvider("AniLight", async () => {
    const r = await fetchAniLightSources(ANILIST_ID, EPISODE);
    const tracks = r.flatMap(s => s.tracks || []);
    return { tracks };
  }));

  // ── AniPm ──
  const { fetchAniPmSources } = await import("../src/lib/anipm-api");
  results.push(await testProvider("AniPm", async () => {
    const r = await fetchAniPmSources(ANILIST_ID, EPISODE);
    const tracks = r.flatMap(s => s.tracks || []);
    return { tracks };
  }));

  // ── AniDap (all providers) ──
  const { fetchAllAniDapSources } = await import("../src/lib/anidap-api");
  results.push(await testProvider("AniDap (all)", async () => {
    const r = await fetchAllAniDapSources(ANILIST_ID, EPISODE, { sub: true, dub: false, timeoutMs: 8000 });
    const tracks = r.flatMap(s => s.tracks || []);
    return { tracks };
  }));

  // ── AniZone ──
  const { resolveAniZone } = await import("../src/lib/anizone-direct");
  results.push(await testProvider("AniZone", async () => {
    const r = await resolveAniZone(ANILIST_ID, EPISODE);
    return { tracks: r.subtitleTracks || [] };
  }));

  // ── AniWaves ──
  const { resolveAniWaves } = await import("../src/lib/aniwaves-direct");
  results.push(await testProvider("AniWaves", async () => {
    const r = await resolveAniWaves(ANILIST_ID, EPISODE);
    return { tracks: [] }; // AniWaves returns embeds
  }));

  // ── AnimePahe ──
  const { fetchAnimePaheSources } = await import("../src/lib/animepahe-api");
  results.push(await testProvider("AnimePahe", async () => {
    const r = await fetchAnimePaheSources(ANILIST_ID, EPISODE, TITLE);
    const tracks = r.flatMap(s => s.tracks || []);
    return { tracks };
  }));

  // ── Senshi ──
  const { resolveSenshi } = await import("../src/lib/senshi-direct");
  results.push(await testProvider("Senshi", async () => {
    const r = await resolveSenshi(ANILIST_ID, EPISODE);
    return { tracks: r.tracks || [] };
  }));

  // ── AllAnime/AllManga ──
  const { resolveAllManga } = await import("../src/lib/allmanga-direct");
  results.push(await testProvider("AllManga", async () => {
    const r = await resolveAllManga(ANILIST_ID, EPISODE);
    return { tracks: r.tracks || [] };
  }));

  // ── AniKoto ──
  const { resolveAniKoto } = await import("../src/lib/anikoto-direct");
  results.push(await testProvider("AniKoto", async () => {
    const r = await resolveAniKoto(ANILIST_ID, EPISODE);
    return { tracks: r.tracks || [] };
  }));

  // ── ReAnime ──
  const { fetchAllReAnimeSources } = await import("../src/lib/reanime-api");
  results.push(await testProvider("ReAnime", async () => {
    const r = await fetchAllReAnimeSources(ANILIST_ID, EPISODE);
    const tracks = r.flatMap(s => s.tracks || []);
    return { tracks };
  }));

  // ── Luna ──
  const { fetchAllLunaSources } = await import("../src/lib/luna-api");
  results.push(await testProvider("Luna", async () => {
    const r = await fetchAllLunaSources(ANILIST_ID, EPISODE);
    const tracks = r.flatMap(s => s.tracks || []);
    return { tracks };
  }));

  // ── AnimeOnsen ──
  const { fetchAllOnsenSources } = await import("../src/lib/animeonsen-api");
  results.push(await testProvider("AnimeOnsen", async () => {
    const r = await fetchAllOnsenSources(ANILIST_ID, EPISODE, { sub: true, dub: false });
    const tracks = r.flatMap(s => s.subtitleTracks || []);
    return { tracks };
  }));

  // ── AniKuro ──
  const { fetchAniKuroSources } = await import("../src/lib/anikuro-api");
  results.push(await testProvider("AniKuro", async () => {
    try {
      const r = await fetchAniKuroSources(ANILIST_ID, EPISODE);
      const tracks = r.flatMap(s => s.tracks || []);
      return { tracks };
    } catch (e) { return { tracks: [] }; }
  }));

  // ── Print results ──
  console.log(`\n${"═".repeat(80)}`);
  console.log("  RESULTS — which providers return subtitle URLs");
  console.log(`${"═".repeat(80)}\n`);

  const working = results.filter(r => r.hasSubtitles);
  const broken = results.filter(r => !r.hasSubtitles && r.error);
  const empty = results.filter(r => !r.hasSubtitles && !r.error);

  console.log(`✅ WORKING (${working.length}/${results.length}) — return subtitle URLs:`);
  for (const r of working) {
    console.log(`   ${r.provider.padEnd(20)} → ${r.subtitleCount} sub(s) [${r.durationMs}ms]`);
    for (const s of r.subtitleUrls.slice(0, 3)) {
      console.log(`      • ${s.extension?.toUpperCase() || "?"} | ${s.label || s.lang || "?"} | ${s.url.slice(0, 90)}${s.url.length > 90 ? "..." : ""}`);
    }
    if (r.subtitleUrls.length > 3) console.log(`      ... and ${r.subtitleUrls.length - 3} more`);
  }

  console.log(`\n❌ BROKEN (${broken.length}) — errored out:`);
  for (const r of broken) {
    console.log(`   ${r.provider.padEnd(20)} → ${r.error?.slice(0, 100)}`);
  }

  console.log(`\n⚪ NO SUBS (${empty.length}) — returned 0 tracks (no error):`);
  for (const r of empty) {
    console.log(`   ${r.provider.padEnd(20)} → 0 subtitles [${r.durationMs}ms]`);
  }

  // ── Test each subtitle URL through the worker ──
  console.log(`\n${"═".repeat(80)}`);
  console.log("  Testing subtitle URLs through luffytv-subs worker");
  console.log(`${"═".repeat(80)}\n`);

  const WORKER = "https://luffytv-subtitle.ggy892767.workers.dev";
  let passCount = 0;
  let failCount = 0;

  for (const r of working) {
    for (const s of r.subtitleUrls.slice(0, 2)) { // test up to 2 per provider
      const url = s.url.replace(/^https?:\/\/\/+/i, "https://"); // fix triple-slash
      const workerUrl = `${WORKER}/sub?url=${encodeURIComponent(url)}`;
      try {
        const resp = await fetch(workerUrl);
        const text = await resp.text();
        const isVtt = text.trimStart().startsWith("WEBVTT");
        const status = resp.status;
        const ok = status === 200 && isVtt;
        if (ok) passCount++; else failCount++;
        console.log(`  ${ok ? "✅" : "❌"} ${r.provider.padEnd(16)} ${s.extension?.toUpperCase().padEnd(4)} ${status} ${isVtt ? "VTT" : "not-VTT"} | ${text.slice(0, 60).replace(/\n/g, " ")}...`);
      } catch (e: any) {
        failCount++;
        console.log(`  ❌ ${r.provider.padEnd(16)} ${s.extension?.toUpperCase().padEnd(4)} FETCH-ERROR | ${e?.message?.slice(0, 80)}`);
      }
    }
  }

  console.log(`\n${"═".repeat(80)}`);
  console.log(`  WORKER TEST SUMMARY: ${passCount} passed, ${failCount} failed`);
  console.log(`${"═".repeat(80)}\n`);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
