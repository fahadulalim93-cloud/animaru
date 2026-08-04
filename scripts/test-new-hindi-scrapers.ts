/**
 * Test script — verify the 3 new scrapers work end-to-end.
 * Run: npx tsx scripts/test-new-hindi-scrapers.ts
 */
import {
  fetchAnimo4Catalog,
  fetchAnimo4Detail,
  resolveAnimo4Streams,
  searchAnimo4,
} from "../src/lib/animo4-direct";
import {
  fetchAnimoStreamCatalog,
  fetchAnimoStreamDetail,
  resolveAnimoStreamStreams,
  searchAnimoStream,
} from "../src/lib/animostream-direct";
import {
  fetchAnimeggCatalog,
  resolveAnimeggStreams,
  searchAnimegg,
} from "../src/lib/animegg-direct";

async function main() {
  console.log("\n========== 4animo.xyz ==========");
  try {
    const catalog = await fetchAnimo4Catalog(true);
    console.log(`✓ catalog: ${catalog.length} anime`);
    console.log(`  sample: ${catalog.slice(0, 5).map(a => `${a.title}(${a.id})`).join(", ")}`);

    // Find Demon Slayer and test detail + stream
    const demon = catalog.find(a => a.title.toLowerCase().includes("demon slayer"));
    if (demon) {
      console.log(`\n--- Detail for ${demon.title} (${demon.slug}) ---`);
      const detail = await fetchAnimo4Detail(demon.id, demon.slug);
      if (detail) {
        console.log(`  ✓ title: ${detail.title}`);
        console.log(`  ✓ type: ${detail.type} | status: ${detail.status}`);
        console.log(`  ✓ episodes: total=${detail.totalEpisodes} sub=${detail.subEpisodes} dub=${detail.dubEpisodes}`);
        console.log(`  ✓ score: ${detail.score} | year: ${detail.year} | season: ${detail.season}`);
        console.log(`  ✓ genres: ${(detail.genres || []).slice(0, 6).join(", ")}`);
        console.log(`  ✓ synopsis: ${(detail.synopsis || "").slice(0, 120)}...`);
      }

      console.log(`\n--- Streams for ep 1 ---`);
      const streams = await resolveAnimo4Streams(demon.id, 1, demon.slug);
      for (const s of streams) {
        console.log(`  • ${s.type} ${s.serverName} ${s.quality} [${s.isEmbed ? "embed" : s.isM3U8 ? "m3u8" : "mp4"}]`);
        console.log(`    ${s.streamUrl}`);
        console.log(`    subtitles: ${s.subtitleTracks.length} tracks`);
        if (s.intro) console.log(`    intro: ${s.intro.start}-${s.intro.end}`);
      }
    }

    console.log(`\n--- Search 'one piece' ---`);
    const search = await searchAnimo4("one piece");
    console.log(`  found: ${search.length} results`);
    search.slice(0, 3).forEach(a => console.log(`  - ${a.title} (${a.id})`));
  } catch (e: any) {
    console.error("4animo test failed:", e?.message || e);
  }

  console.log("\n========== animostream.xyz ==========");
  try {
    const catalog = await fetchAnimoStreamCatalog(true);
    console.log(`✓ catalog: ${catalog.length} Hindi-dubbed anime`);
    console.log(`  sample: ${catalog.slice(0, 5).map(a => a.title).join(", ")}`);
    console.log(`  movies: ${catalog.filter(a => a.isMovie).length}`);
    console.log(`  series: ${catalog.filter(a => a.isSeries).length}`);

    // Find Junji Ito (we saw its animeData earlier)
    const junji = catalog.find(a => a.title.toLowerCase().includes("junji"));
    if (junji) {
      console.log(`\n--- Detail for ${junji.title} ---`);
      const detail = await fetchAnimoStreamDetail(junji.postId);
      if (detail) {
        console.log(`  ✓ seasons: ${detail.seasons.length}`);
        for (const s of detail.seasons) {
          console.log(`    ${s.id}: ${s.episodes.length} episodes, servers: ${Object.keys(s.servers).join(", ")}`);
        }
        console.log(`  ✓ audio: ${detail.audioInfo || "n/a"}`);
        console.log(`  ✓ categories: ${detail.categories.slice(0, 8).join(", ")}`);
      }

      console.log(`\n--- Streams for ep 1 ---`);
      const streams = await resolveAnimoStreamStreams(junji.postId, 1, "s1");
      for (const s of streams) {
        console.log(`  • ${s.serverName} ${s.quality} [${s.isEmbed ? "embed" : "m3u8"}]`);
        console.log(`    ${s.streamUrl}`);
      }
    }

    console.log(`\n--- Search 'naruto' ---`);
    const search = await searchAnimoStream("naruto");
    console.log(`  found: ${search.length} results`);
    search.slice(0, 5).forEach(a => console.log(`  - ${a.title} [${a.isMovie ? "Movie" : a.isSeries ? "Series" : "Other"}]`));
  } catch (e: any) {
    console.error("animostream test failed:", e?.message || e);
  }

  console.log("\n========== animegg.org ==========");
  try {
    const catalog = await fetchAnimeggCatalog(true);
    console.log(`✓ catalog: ${catalog.length} anime (homepage-only, CF blocks deeper paths)`);
    console.log(`  sample: ${catalog.slice(0, 5).map(a => a.title).join(", ")}`);

    if (catalog.length > 0) {
      const test = catalog[0];
      console.log(`\n--- Streams for ${test.title} ep 1 ---`);
      const streams = await resolveAnimeggStreams(test.slug, 1, ["sub"]);
      for (const s of streams) {
        console.log(`  • ${s.serverName} ${s.quality} [${s.isEmbed ? "embed" : "m3u8"}]`);
        console.log(`    ${s.streamUrl}`);
      }
    }
  } catch (e: any) {
    console.error("animegg test failed:", e?.message || e);
  }

  console.log("\n========== done ==========");
}

main().catch(console.error);
