// Test ALL providers — check which return working m3u8 streams
// Run with: npx tsx scripts/test-all-providers.ts

const ANILIST_ID = 101922; // Demon Slayer
const EPISODE = 1;
const TITLE = "Demon Slayer: Kimetsu no Yaiba";

interface ProviderResult {
  name: string;
  source: string;
  serverCount: number;
  sampleUrl?: string;
  isM3U8?: boolean;
  isEmbed?: boolean;
  hasSubtitles?: boolean;
  error?: string;
  durationMs: number;
}

async function testProvider(name: string, fn: () => Promise<any[]>): Promise<ProviderResult> {
  const start = Date.now();
  try {
    const results = await Promise.race([
      fn(),
      new Promise<any[]>(resolve => setTimeout(() => resolve([]), 15000)),
    ]);
    return {
      name,
      source: name,
      serverCount: results.length,
      sampleUrl: results[0]?.streamUrl || results[0]?.m3u8Url,
      isM3U8: results[0]?.isM3U8,
      isEmbed: results[0]?.isEmbed,
      hasSubtitles: (results[0]?.subtitleTracks || results[0]?.tracks || []).length > 0,
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      name,
      source: name,
      serverCount: 0,
      error: e?.message?.slice(0, 80) || "Failed",
      durationMs: Date.now() - start,
    };
  }
}

async function main() {
  console.log(`\n${"═".repeat(80)}`);
  console.log(`  Testing ALL providers — Demon Slayer ep 1`);
  console.log(`${"═".repeat(80)}\n`);

  const results: ProviderResult[] = [];

  // ── AnimeX (mimi + yuki) ──
  const { resolveAnimexMimiBoth, resolveAnimexProvider } = await import("../src/lib/animex-fast");
  results.push(await testProvider("AnimeX mimi", async () => {
    const r = await resolveAnimexMimiBoth(ANILIST_ID, EPISODE);
    const servers = [];
    if (r.sub?.m3u8Url) servers.push({ streamUrl: r.sub.m3u8Url, isM3U8: true, isEmbed: false, subtitleTracks: r.sub.tracks || [] });
    if (r.dub?.m3u8Url) servers.push({ streamUrl: r.dub.m3u8Url, isM3U8: true, isEmbed: false, subtitleTracks: r.dub.tracks || [] });
    return servers;
  }));
  results.push(await testProvider("AnimeX yuki", async () => {
    const r = await resolveAnimexProvider(ANILIST_ID, EPISODE, "yuki");
    const servers = [];
    if (r?.sub?.m3u8Url) servers.push({ streamUrl: r.sub.m3u8Url, isM3U8: true, isEmbed: false, subtitleTracks: r.sub.tracks || [] });
    return servers;
  }));

  // ── AniDB ──
  const { resolveAniDbEmbeds } = await import("../src/lib/anidb-direct");
  results.push(await testProvider("AniDB", async () => {
    const r = await resolveAniDbEmbeds(ANILIST_ID, EPISODE);
    const servers = [];
    if (r.sub?.m3u8Url) servers.push({ streamUrl: r.sub.m3u8Url, isM3U8: true, isEmbed: false });
    if (r.sub?.embedUrl) servers.push({ streamUrl: r.sub.embedUrl, isM3U8: false, isEmbed: true });
    return servers;
  }));

  // ── Kyren ──
  const { fetchAllKyrenSources } = await import("../src/lib/kyren-api");
  results.push(await testProvider("Kyren", async () => {
    const r = await fetchAllKyrenSources(ANILIST_ID, EPISODE);
    return r.map(s => ({ streamUrl: s.streamUrl, isM3U8: s.isM3U8, isEmbed: false, subtitleTracks: s.tracks || [] }));
  }));

  // ── AniDap ──
  const { fetchAllAniDapSources } = await import("../src/lib/anidap-api");
  results.push(await testProvider("AniDap", async () => {
    const r = await fetchAllAniDapSources(ANILIST_ID, EPISODE, { sub: true, dub: true, timeoutMs: 8000 });
    return r.map(s => ({ streamUrl: s.streamUrl, isM3U8: s.isM3U8, isEmbed: false, subtitleTracks: s.tracks || [] }));
  }));

  // ── AniPm ──
  const { fetchAniPmSources } = await import("../src/lib/anipm-api");
  results.push(await testProvider("AniPm", async () => {
    const r = await fetchAniPmSources(ANILIST_ID, EPISODE);
    return r.map(s => ({ streamUrl: s.streamUrl, isM3U8: s.isM3U8, isEmbed: s.isEmbed, subtitleTracks: s.tracks || [] }));
  }));

  // ── Senshi ──
  const { resolveSenshi } = await import("../src/lib/senshi-direct");
  results.push(await testProvider("Senshi", async () => {
    const s = await resolveSenshi(ANILIST_ID, EPISODE);
    if (!s) return [];
    return [{ streamUrl: s.m3u8Url, isM3U8: true, isEmbed: false, subtitleTracks: s.tracks || [] }];
  }));

  // ── AllManga ──
  const { resolveAllManga } = await import("../src/lib/allmanga-direct");
  results.push(await testProvider("AllManga", async () => {
    const am = await resolveAllManga(ANILIST_ID, EPISODE);
    if (!am?.sources?.length) return [];
    return am.sources.slice(0, 3).map(src => ({ streamUrl: src.url, isM3U8: src.type === "hls", isEmbed: false }));
  }));

  // ── AniNeko (old) ──
  const { resolveAniNekoM3u8 } = await import("../src/lib/anineko-direct");
  results.push(await testProvider("AniNeko (old)", async () => {
    const r = await resolveAniNekoM3u8(ANILIST_ID, EPISODE, TITLE);
    return r.slice(0, 3).map(s => ({ streamUrl: s.m3u8Url, isM3U8: true, isEmbed: false, subtitleTracks: s.subtitleUrl ? [{ url: s.subtitleUrl }] : [] }));
  }));

  // ── AniLight ──
  const { fetchAniLightSources } = await import("../src/lib/anilight-api");
  results.push(await testProvider("AniLight", async () => {
    const r = await fetchAniLightSources(ANILIST_ID, EPISODE);
    return r.slice(0, 3).map(s => ({ streamUrl: s.streamUrl, isM3U8: s.isM3U8, isEmbed: false, subtitleTracks: s.tracks || [] }));
  }));

  // ── AniZone ──
  const { resolveAniZone } = await import("../src/lib/anizone-direct");
  results.push(await testProvider("AniZone", async () => {
    const az = await resolveAniZone(ANILIST_ID, EPISODE);
    if (!az?.m3u8Url) return [];
    return [{ streamUrl: az.m3u8Url, isM3U8: true, isEmbed: false, subtitleTracks: az.subtitleTracks || [] }];
  }));

  // ── AniWaves ──
  const { resolveAniWaves } = await import("../src/lib/aniwaves-direct");
  results.push(await testProvider("AniWaves", async () => {
    const aw = await resolveAniWaves(ANILIST_ID, EPISODE);
    if (!aw?.servers?.length) return [];
    return aw.servers.slice(0, 3).map(s => ({ streamUrl: s.embedUrl, isM3U8: false, isEmbed: true }));
  }));

  // ── AniKoto ──
  const { resolveAniKoto } = await import("../src/lib/anikoto-direct");
  results.push(await testProvider("AniKoto", async () => {
    const r = await resolveAniKoto(ANILIST_ID, EPISODE);
    return r.slice(0, 3).map(s => ({ streamUrl: s.m3u8Url, isM3U8: true, isEmbed: false }));
  }));

  // ── ReAnime ──
  const { fetchAllReAnimeSources } = await import("../src/lib/reanime-api");
  results.push(await testProvider("ReAnime", async () => {
    const r = await fetchAllReAnimeSources(ANILIST_ID, EPISODE);
    return r.slice(0, 3).map(s => ({ streamUrl: s.streamUrl, isM3U8: s.isM3U8, isEmbed: false }));
  }));

  // ── Luna ──
  const { fetchAllLunaSources } = await import("../src/lib/luna-api");
  results.push(await testProvider("Luna", async () => {
    const r = await fetchAllLunaSources(ANILIST_ID, EPISODE);
    return r.slice(0, 3).map(s => ({ streamUrl: s.streamUrl, isM3U8: s.isM3U8, isEmbed: false, subtitleTracks: s.tracks || [] }));
  }));

  // ── AniKage ──
  const { resolveAniKageBoth } = await import("../src/lib/anikage-fast");
  results.push(await testProvider("AniKage", async () => {
    const r = await resolveAniKageBoth(ANILIST_ID, EPISODE, TITLE);
    const servers = [];
    if (r.sub?.sources) for (const s of r.sub.sources.slice(0, 2)) servers.push({ streamUrl: s.streamUrl || s.url, isM3U8: true, isEmbed: false });
    if (r.dub?.sources) for (const s of r.dub.sources.slice(0, 2)) servers.push({ streamUrl: s.streamUrl || s.url, isM3U8: true, isEmbed: false });
    return servers;
  }));

  // ── AnimePahe ──
  const { fetchAnimePaheSources } = await import("../src/lib/animepahe-api");
  results.push(await testProvider("AnimePahe", async () => {
    const r = await fetchAnimePaheSources(ANILIST_ID, EPISODE, TITLE);
    return r.slice(0, 3).map(s => ({ streamUrl: s.streamUrl, isM3U8: s.isM3U8, isEmbed: false }));
  }));

  // ── AniKuro (separate endpoint) ──
  try {
    const { default: fetchAniKuroSources } = await import("../src/lib/anikuro-api");
    results.push(await testProvider("AniKuro", async () => {
      const r = await fetchAniKuroSources(ANILIST_ID, EPISODE);
      return r.slice(0, 3).map(s => ({ streamUrl: s.streamUrl, isM3U8: s.isM3U8, isEmbed: false }));
    }));
  } catch (e: any) {
    results.push({ name: "AniKuro", source: "anikuro", serverCount: 0, error: e?.message?.slice(0, 60), durationMs: 0 });
  }

  // ── Animetsu (separate endpoint) ──
  try {
    const { default: fetchAnimetsuSources } = await import("../src/lib/animetsu-api");
    results.push(await testProvider("Animetsu", async () => {
      const r = await fetchAnimetsuSources(ANILIST_ID, EPISODE);
      return r.slice(0, 3).map(s => ({ streamUrl: s.streamUrl, isM3U8: s.isM3U8, isEmbed: false }));
    }));
  } catch (e: any) {
    results.push({ name: "Animetsu", source: "animetsu", serverCount: 0, error: e?.message?.slice(0, 60), durationMs: 0 });
  }

  // ── AniKoto (separate endpoint) ──
  const { resolveAniKotoStreams } = await import("../src/lib/anichi-direct");
  results.push(await testProvider("AniKoto", async () => {
    const r = await resolveAniKotoStreams(ANILIST_ID, EPISODE, TITLE);
    return r.map(s => ({ streamUrl: s.streamUrl, isM3U8: s.isM3U8, isEmbed: s.isEmbed, subtitleTracks: s.subtitleTracks || [] }));
  }));

  // ── AniNeko.to (separate endpoint) ──
  const { resolveAninekoStreams } = await import("../src/lib/anineko-to-direct");
  results.push(await testProvider("AniNeko.to", async () => {
    const r = await resolveAninekoStreams(ANILIST_ID, EPISODE, TITLE);
    return r.map(s => ({ streamUrl: s.streamUrl, isM3U8: s.isM3U8, isEmbed: s.isEmbed, subtitleTracks: s.subtitleTracks || [] }));
  }));

  // ── Print results ──
  console.log(`\n${"═".repeat(80)}`);
  console.log("  PROVIDER AUDIT RESULTS");
  console.log(`${"═".repeat(80)}\n`);

  const working = results.filter(r => r.serverCount > 0 && !r.error);
  const broken = results.filter(r => r.error);
  const empty = results.filter(r => r.serverCount === 0 && !r.error);

  console.log(`✅ WORKING (${working.length}/${results.length}):`);
  for (const r of working) {
    const type = r.isM3U8 ? "m3u8" : r.isEmbed ? "embed" : "?";
    const subs = r.hasSubtitles ? " +subs" : "";
    console.log(`   ${r.name.padEnd(18)} → ${r.serverCount} server(s) [${type}${subs}] ${r.durationMs}ms`);
  }

  console.log(`\n❌ BROKEN/ERROR (${broken.length}):`);
  for (const r of broken) {
    console.log(`   ${r.name.padEnd(18)} → ${r.error}`);
  }

  console.log(`\n⚪ NO SERVERS (${empty.length}):`);
  for (const r of empty) {
    console.log(`   ${r.name.padEnd(18)} → 0 servers ${r.durationMs}ms`);
  }

  console.log(`\n${"═".repeat(80)}`);
  console.log(`  SUMMARY: ${working.length} working, ${broken.length} broken, ${empty.length} empty`);
  console.log(`${"═".repeat(80)}\n`);
}

main().catch(console.error);
