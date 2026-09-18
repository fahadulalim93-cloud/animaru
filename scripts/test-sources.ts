/**
 * Direct test of each API route by calling the scraper libraries.
 * Tests with Jujutsu Kaisen (AniList ID: 1015, Episode: 1)
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

const ID = 1015;
const EP = 1;
const TITLE = "Jujutsu Kaisen";

async function testSource(name, fn) {
  try {
    const result = await fn();
    const servers = result || [];
    const validServers = servers.filter(s => s && s.streamUrl);
    if (validServers.length > 0) {
      console.log(`✅ ${name}: ${validServers.length} servers`);
      for (const s of validServers.slice(0, 3)) {
        console.log(`   ${s.id} | src=${s.source} | type=${s.type} | name=${s.name}`);
      }
      if (validServers.length > 3) console.log(`   ... +${validServers.length - 3} more`);
    } else {
      console.log(`❌ ${name}: 0 servers`);
    }
  } catch (e) {
    console.log(`❌ ${name}: ERROR - ${e?.message || e}`);
  }
}

async function main() {
  console.log(`\n=== Testing with Jujutsu Kaisen (ID: ${ID}, Ep: ${EP}) ===\n`);

  // 1. AniNeko.to
  await testSource("anineko-to", async () => {
    const results = await resolveAninekoStreams(ID, EP, TITLE);
    return results.map(r => ({
      id: `anineko-to:${r.type}`,
      source: "anineko-to",
      type: r.type,
      name: r.serverName || "AniNeko",
      streamUrl: r.streamUrl,
    }));
  });

  // 2. AniKoto
  await testSource("anikoto", async () => {
    const result = await resolveAniKoto(ID, EP, TITLE);
    if (!result?.servers?.length) return [];
    return result.servers.map(s => ({
      id: `anikoto:${s.type}`,
      source: "anikoto",
      type: s.type,
      name: s.name || "AniKoto",
      streamUrl: s.m3u8Url || s.embedUrl,
    }));
  });

  // 3. AniChi
  await testSource("anichi", async () => {
    const results = await resolveAniKotoStreams(ID, EP, TITLE);
    return results.map(r => ({
      id: `anichi:${r.type}`,
      source: "anichi",
      type: r.type,
      name: r.serverName || "AniChi",
      streamUrl: r.streamUrl,
    }));
  });

  // 4. AnimeX (mimi)
  await testSource("animex", async () => {
    const m = await resolveAnimexMimiBoth(ID, EP);
    const servers = [];
    if (m.sub?.m3u8Url) servers.push({ id: "animex:mimi:sub", source: "animex", type: "sub", name: "Dragon", streamUrl: m.sub.m3u8Url });
    if (m.dub?.m3u8Url) servers.push({ id: "animex:mimi:dub", source: "animex", type: "dub", name: "Dragon Dub", streamUrl: m.dub.m3u8Url });
    return servers;
  });

  // 5. AniDap
  await testSource("anidap", async () => {
    const results = await fetchAllAniDapSources(ID, EP, { sub: true, dub: true, timeoutMs: 15000 });
    return results.map(r => ({
      id: `anidap:${r.provider}:${r.type}`,
      source: "anidap",
      type: r.type,
      name: r.provider,
      streamUrl: r.streamUrl,
    }));
  });

  // 6. Kyren
  await testSource("kyren", async () => {
    const results = await fetchAllKyrenSources(ID, EP, { sub: true, dub: true, timeoutMs: 15000 });
    return results.map(r => ({
      id: `kyren:${r.server}:${r.type}`,
      source: "kyren",
      type: r.type,
      name: KYREN_SERVER_NAMES[r.server as keyof typeof KYREN_SERVER_NAMES] || r.server,
      streamUrl: r.streamUrl,
    }));
  });

  // 7. AniLight
  await testSource("anilight", async () => {
    const results = await fetchAniLightSources(ID, EP, { sub: true, dub: true, timeoutMs: 15000 });
    return results.map((r: any) => ({
      id: `anilight:${r.type}`,
      source: "anilight",
      type: r.type,
      name: "AniLight",
      streamUrl: r.streamUrl,
    }));
  });

  // 8. AniDB
  await testSource("anidb", async () => {
    const r = await resolveAniDbEmbeds(ID, EP, TITLE);
    const servers: any[] = [];
    if (r.sub?.m3u8Url) servers.push({ id: "anidb:sub", source: "anidb", type: "sub", name: "Pedro", streamUrl: r.sub.m3u8Url });
    else if (r.sub?.embedUrl) servers.push({ id: "anidb:sub", source: "anidb", type: "sub", name: "Pedro", streamUrl: r.sub.embedUrl });
    if (r.dub?.m3u8Url) servers.push({ id: "anidb:dub", source: "anidb", type: "dub", name: "Pedro Dub", streamUrl: r.dub.m3u8Url });
    else if (r.dub?.embedUrl) servers.push({ id: "anidb:dub", source: "anidb", type: "dub", name: "Pedro Dub", streamUrl: r.dub.embedUrl });
    return servers;
  });

  // 9. AniPm
  await testSource("anipm", async () => {
    const results = await fetchAniPmSources(ID, EP, { sub: true, dub: true, timeoutMs: 15000 });
    return results.filter((r: any) => r.streamUrl).map((r: any) => ({
      id: `anipm:${r.provider}:${r.type}`,
      source: "anipm",
      type: r.type,
      name: r.provider,
      streamUrl: r.streamUrl,
    }));
  });

  // 10. Miruro V3
  await testSource("miruro", async () => {
    const { getMiruroV3Servers } = await import("../src/lib/miruro-v3-api");
    const results = await getMiruroV3Servers(ID, EP, { sub: true, dub: true });
    return results.map((r: any) => ({
      id: `miruro:${r.provider}:${r.type}`,
      source: "miruro",
      type: r.type,
      name: r.provider || "Miruro",
      streamUrl: r.streamUrl,
    }));
  });

  // Hindi sources
  console.log("\n=== Hindi Sources ===\n");

  // DesiDub
  await testSource("desidub (hindi)", async () => {
    const search = await desidubFindByTitle(TITLE);
    if (!search?.slug) return [];
    const results = await desidubResolveAllServers(search.slug, EP);
    return results.map((r: any) => ({
      id: `desidub:${r.serverName || "main"}`,
      source: "desidub",
      type: "dub",
      name: r.name || "DesiDub",
      streamUrl: r.streamUrl,
    }));
  });

  console.log("\n=== Done ===");
}

main().catch(e => console.error("Fatal:", e));
