/**
 * Quick test - each source for Demon Slayer (ID: 101825, Ep: 1)
 */
import { resolveAninekoStreams } from "../src/lib/anineko-to-direct";
import { resolveAniKoto } from "../src/lib/anikoto-direct";
import { resolveAniKotoStreams } from "../src/lib/anichi-direct";
import { resolveAnimexMimiBoth } from "../src/lib/animex-fast";
import { fetchAllAniDapSources } from "../src/lib/anidap-api";
import { fetchAllKyrenSources, KYREN_SERVER_NAMES } from "../src/lib/kyren-api";
import { fetchAniLightSources } from "../src/lib/anilight-api";
import { resolveAniDbEmbeds } from "../src/lib/anidb-direct";
import { fetchAniPmSources } from "../src/lib/anipm-api";
import { desidubFindByTitle, desidubResolveAllServers } from "../src/lib/desidubanime-api";
import { fetchBlakiteServers } from "../src/lib/blakite-api";

const ID = 1;
const EP = 1;
const TITLE = "Cowboy Bebop";

async function testSource(name, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const servers = (result || []).filter(s => s && s.streamUrl);
    if (servers.length > 0) {
      console.log(`✅ ${name}: ${servers.length} servers (${elapsed}s)`);
      for (const s of servers.slice(0, 2)) {
        console.log(`   ${s.id} | src=${s.source} | type=${s.type}`);
      }
      if (servers.length > 2) console.log(`   ... +${servers.length - 2} more`);
    } else {
      console.log(`❌ ${name}: 0 servers (${elapsed}s)`);
    }
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`❌ ${name}: ERROR (${elapsed}s) - ${e?.message?.slice(0, 80) || e}`);
  }
}

async function main() {
  console.log(`\n=== Sub/Dub Sources — Demon Slayer (ID: ${ID}, Ep: ${EP}) ===\n`);

  await testSource("anineko-to", async () => {
    const r = await resolveAninekoStreams(ID, EP, TITLE);
    return r.map(x => ({ id: `anineko-to:${x.type}`, source: "anineko-to", type: x.type, name: x.serverName, streamUrl: x.streamUrl }));
  });

  await testSource("anikoto", async () => {
    const r = await resolveAniKoto(ID, EP, TITLE);
    return (r?.servers || []).map(x => ({ id: `anikoto:${x.type}`, source: "anikoto", type: x.type, name: x.name, streamUrl: x.m3u8Url || x.embedUrl }));
  });

  await testSource("anichi", async () => {
    const r = await resolveAniKotoStreams(ID, EP, TITLE);
    return r.map(x => ({ id: `anichi:${x.type}`, source: "anichi", type: x.type, name: x.serverName, streamUrl: x.streamUrl }));
  });

  await testSource("animex", async () => {
    const m = await resolveAnimexMimiBoth(ID, EP);
    const s = [];
    if (m.sub?.m3u8Url) s.push({ id: "animex:mimi:sub", source: "animex", type: "sub", name: "Dragon", streamUrl: m.sub.m3u8Url });
    if (m.dub?.m3u8Url) s.push({ id: "animex:mimi:dub", source: "animex", type: "dub", name: "Dragon Dub", streamUrl: m.dub.m3u8Url });
    return s;
  });

  await testSource("anidap", async () => {
    const r = await fetchAllAniDapSources(ID, EP, { sub: true, dub: true, timeoutMs: 15000 });
    return r.map(x => ({ id: `anidap:${x.provider}:${x.type}`, source: "anidap", type: x.type, name: x.provider, streamUrl: x.streamUrl }));
  });

  await testSource("kyren", async () => {
    const r = await fetchAllKyrenSources(ID, EP, { sub: true, dub: true, timeoutMs: 15000 });
    return r.map(x => ({ id: `kyren:${x.server}:${x.type}`, source: "kyren", type: x.type, name: KYREN_SERVER_NAMES[x.server as keyof typeof KYREN_SERVER_NAMES] || x.server, streamUrl: x.streamUrl }));
  });

  await testSource("anilight", async () => {
    const r = await fetchAniLightSources(ID, EP, { sub: true, dub: true, timeoutMs: 15000 });
    return r.map((x: any) => ({ id: `anilight:${x.type}`, source: "anilight", type: x.type, name: "AniLight", streamUrl: x.streamUrl }));
  });

  await testSource("anidb", async () => {
    const r = await resolveAniDbEmbeds(ID, EP, TITLE);
    const s: any[] = [];
    if (r.sub?.m3u8Url) s.push({ id: "anidb:sub", source: "anidb", type: "sub", name: "Pedro", streamUrl: r.sub.m3u8Url });
    else if (r.sub?.embedUrl) s.push({ id: "anidb:sub", source: "anidb", type: "sub", name: "Pedro", streamUrl: r.sub.embedUrl });
    if (r.dub?.m3u8Url) s.push({ id: "anidb:dub", source: "anidb", type: "dub", name: "Pedro Dub", streamUrl: r.dub.m3u8Url });
    else if (r.dub?.embedUrl) s.push({ id: "anidb:dub", source: "anidb", type: "dub", name: "Pedro Dub", streamUrl: r.dub.embedUrl });
    return s;
  });

  await testSource("anipm", async () => {
    const r = await fetchAniPmSources(ID, EP, { sub: true, dub: true, timeoutMs: 15000 });
    return r.filter((x: any) => x.streamUrl).map((x: any) => ({ id: `anipm:${x.provider}:${x.type}`, source: "anipm", type: x.type, name: x.provider, streamUrl: x.streamUrl }));
  });

  await testSource("miruro", async () => {
    const { getMiruroV3Servers } = await import("../src/lib/miruro-v3-api");
    const r = await getMiruroV3Servers(ID, EP, { sub: true, dub: true });
    return r.map((x: any) => ({ id: `miruro:${x.provider}:${x.type}`, source: "miruro", type: x.type, name: x.provider, streamUrl: x.streamUrl }));
  });

  console.log("\n=== Hindi Sources ===\n");

  await testSource("blakite (hindi)", async () => {
    const r = await fetchBlakiteServers(ID, EP, TITLE);
    return (r.servers || []).map((x: any) => ({ id: `blak-1`, source: "blakite", type: "dub", name: x.name || "Blakite", streamUrl: x.streamUrl }));
  });

  await testSource("desidub (hindi)", async () => {
    const search = await desidubFindByTitle(TITLE);
    if (!search?.slug) return [];
    const r = await desidubResolveAllServers(search.slug, EP);
    return r.map((x: any) => ({ id: `desidub-1`, source: "desidub", type: "dub", name: x.name || "DesiDub", streamUrl: x.streamUrl }));
  });

  console.log("\n=== SUMMARY ===");
}

main().catch(e => console.error("Fatal:", e));
