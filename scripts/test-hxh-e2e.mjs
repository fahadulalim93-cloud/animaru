import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

async function curlGet(url, headers = {}, timeout = 5) {
  const args = ["-s", "-L", "--max-time", String(timeout)];
  for (const [k, v] of Object.entries(headers)) {
    args.push("-H", `${k}: ${v}`);
  }
  args.push(url);
  const { stdout } = await exec("curl", args, { timeout: (timeout + 2) * 1000, maxBuffer: 5 * 1024 * 1024 });
  return stdout;
}

async function curlPost(url, body, headers = {}, timeout = 5) {
  const args = ["-s", "-L", "--max-time", String(timeout), "-X", "POST", "-d", JSON.stringify(body)];
  for (const [k, v] of Object.entries(headers)) {
    args.push("-H", `${k}: ${v}`);
  }
  args.push(url);
  const { stdout } = await exec("curl", args, { timeout: (timeout + 2) * 1000, maxBuffer: 5 * 1024 * 1024 });
  return stdout;
}

const ANIDAP_H = { "Origin": "https://anidap.lol", "Referer": "https://anidap.lol/", "User-Agent": "Mozilla/5.0" };
const ANIMEX_H = { "Origin": "https://animex.one", "Referer": "https://animex.one/", "User-Agent": "Mozilla/5.0" };

async function run() {
  const TOTAL_START = Date.now();
  console.log("=== FULL E2E: Hunter x Hunter 2011 EP1 (curl-based = VPS fix) ===\n");

  // Phase 1: Parallel slug resolution
  console.log("Phase 1: Slug Resolution (3 calls in parallel)...");
  const p1 = Date.now();

  const [anilistR, animexR, anidapR] = await Promise.all([
    curlPost("https://graphql.anilist.co",
      { query: "query($id:Int){Media(id:$id,type:ANIME){id title{english romaji}episodes}}", variables: { id: 11061 } },
      { "Content-Type": "application/json" }, 3),
    curlPost("https://graphql.animex.one/graphql",
      { query: "query($id:Int){anime(anilistId:$id){id anilistId titleEnglish}}", variables: { id: 11061 } },
      { "Content-Type": "application/json", ...ANIMEX_H }, 5),
    curlGet("https://anidap.lol/api/anime/11061", ANIDAP_H, 5),
  ]);

  let animexSlug = null, anidapSlug = null;
  try { animexSlug = JSON.parse(animexR)?.data?.anime?.id; } catch {}
  try { anidapSlug = JSON.parse(anidapR)?.data?.id; } catch {}

  const alTitle = JSON.parse(anilistR)?.data?.Media?.title?.english || "?";
  console.log(`  AniList: ${alTitle}`);
  console.log(`  AnimeX slug: ${animexSlug}`);
  console.log(`  AniDap slug: ${anidapSlug}`);
  console.log(`  ⏱ Phase 1: ${Date.now() - p1}ms\n`);

  // Phase 2: AnimeX episodes + servers (parallel)
  console.log("Phase 2: AnimeX Episodes + Servers...");
  const p2 = Date.now();
  const [epR, srvR] = await Promise.all([
    curlGet(`https://pp.animex.one/rest/api/episodes?id=${animexSlug}`, ANIMEX_H, 5),
    curlGet(`https://pp.animex.one/rest/api/servers?id=${animexSlug}&epNum=1`, ANIMEX_H, 5),
  ]);

  let subProv = [], dubProv = [];
  try { const d = JSON.parse(srvR); subProv = (d.subProviders||[]).map(p=>p.id); dubProv = (d.dubProviders||[]).map(p=>p.id); } catch {}
  let epCount = 0;
  try { const d = JSON.parse(epR); epCount = Array.isArray(d) ? d.length : (d?.data?.length || 0); } catch {}
  console.log(`  Episodes: ${epCount} | Sub: [${subProv.join(",")}] | Dub: [${dubProv.join(",")}]`);
  console.log(`  ⏱ Phase 2: ${Date.now() - p2}ms\n`);

  // Phase 3: AnimeX sources (ALL sub providers in parallel)
  console.log(`Phase 3: AnimeX Sources (${subProv.length} providers in parallel)...`);
  const p3 = Date.now();
  const axResults = await Promise.allSettled(subProv.map(async p => {
    const r = await curlGet(`https://pp.animex.one/rest/api/sources?id=${animexSlug}&epNum=1&type=sub&providerId=${p}`, ANIMEX_H, 4);
    const d = JSON.parse(r);
    return { provider: p, ok: !!(d?.sources?.length), quality: d?.sources?.[0]?.quality || "?" };
  }));
  for (const r of axResults) {
    if (r.status === "fulfilled") {
      console.log(`  ${r.value.provider}: ${r.value.ok ? "✅ " + r.value.quality : "❌"}`);
    }
  }
  const axOk = axResults.filter(r => r.status === "fulfilled" && r.value.ok).length;
  console.log(`  ${axOk}/${subProv.length} providers returned sources`);
  console.log(`  ⏱ Phase 3: ${Date.now() - p3}ms\n`);

  // Phase 4: AniDap servers + sources
  console.log("Phase 4: AniDap Servers + Sources...");
  const p4 = Date.now();
  const adSrvR = await curlGet(`https://chad.anidap.lol/rest/api/servers?id=${anidapSlug}&epNum=1`, ANIDAP_H, 5);
  let adSub = [], adDub = [];
  try { const d = JSON.parse(adSrvR); adSub = (d.subProviders||[]).map(p=>p.id); adDub = (d.dubProviders||[]).map(p=>p.id); } catch {}
  console.log(`  AniDap sub: [${adSub.join(",")}] | dub: [${adDub.join(",")}]`);

  const adResults = await Promise.allSettled(adSub.map(async p => {
    const r = await curlGet(`https://chad.anidap.lol/rest/api/sources?id=${anidapSlug}&epNum=1&type=sub&providerId=${p}`, ANIDAP_H, 4);
    const d = JSON.parse(r);
    return { provider: p, ok: !!(d?.sources?.length), quality: d?.sources?.[0]?.quality || "?" };
  }));
  for (const r of adResults) {
    if (r.status === "fulfilled") {
      console.log(`  ${r.value.provider}: ${r.value.ok ? "✅ " + r.value.quality : "❌"}`);
    }
  }
  const adOk = adResults.filter(r => r.status === "fulfilled" && r.value.ok).length;
  console.log(`  ${adOk}/${adSub.length} AniDap providers returned sources`);
  console.log(`  ⏱ Phase 4: ${Date.now() - p4}ms\n`);

  console.log("═══════════════════════════════════════");
  console.log(`  TOTAL E2E TIME: ${Date.now() - TOTAL_START}ms`);
  console.log("═══════════════════════════════════════");
}

run().catch(e => console.error("Error:", e.message));
