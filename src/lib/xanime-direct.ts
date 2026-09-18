import sitemapLookup from "@/data/xanime-sitemap-lookup.json";
const XANIME_BASE = "https://xanime.me";
const CF_WORKER = "https://luffytv-proxy.ggy892767.workers.dev";
const XOR_KEY = "10b06cdc1ca48c9fb0b94af97cc040cf";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function encodeToken(url: string, referer: string): string {
  const c = url + "\0" + referer;
  const k = new TextEncoder().encode(XOR_KEY);
  const d = new TextEncoder().encode(c);
  const x = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) x[i] = d[i] ^ k[i % k.length];
  let b = ""; for (let i = 0; i < x.length; i++) b += String.fromCharCode(x[i]);
  return Buffer.from(b, "binary").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function httpGet(url: string): Promise<string> {
  const token = encodeToken(url, XANIME_BASE + "/");
  const res = await fetch(`${CF_WORKER}/p/${token}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function normalize(s: string): string { return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim(); }

function matchTitle(title: string, romaji?: string, english?: string): { xanimeId: string; slug: string } | null {
  const lookup = sitemapLookup as Record<string, { xanimeId: string; slug: string }>;
  const variants = [english, romaji, title, title?.replace(/\s*(season|part|cour)\s*\d+/gi, "")].filter(Boolean) as string[];
  for (const t of variants) {
    const n = normalize(t);
    if (lookup[n]) return lookup[n];
    const ws = n.replace(/\s*(tv|season \d+|part \d+|cour \d+)$/, "");
    if (lookup[ws]) return lookup[ws];
    const words = n.split(" ").filter(w => w.length > 2);
    if (words.length === 0) continue;
    const min = Math.max(1, Math.ceil(words.length * 0.6));
    let best: { xanimeId: string; slug: string } | null = null, bestScore = 0;
    for (const [k, v] of Object.entries(lookup)) {
      if (k.startsWith("id:")) continue;
      const kw = k.split(" ").filter(w => w.length > 2);
      let sc = 0;
      for (const tw of words) if (kw.some(kw => kw === tw || kw.includes(tw) || tw.includes(kw))) sc++;
      if (sc >= min && sc > bestScore) { bestScore = sc; best = v; }
    }
    if (best) return best;
  }
  return null;
}

export interface XanimeServer { name: string; m3u8Url: string; cdnHost: string; type: "sub" | "dub"; quality: string; subtitleTracks: Array<{ url: string; lang: string; label: string }>; }
export interface XanimeResult { servers: XanimeServer[]; episodes: Array<{ number: number; episodeId: string }>; }

export async function resolveXanime(xanimeId: string, slug: string, epNum: number, expectedTitle?: string): Promise<XanimeResult | null> {
  try {
    const titleUrl = `${XANIME_BASE}/title/${xanimeId}-${slug}`;
    const titleHtml = await httpGet(titleUrl);
    const epMatches = [...titleHtml.matchAll(new RegExp(`/title/${xanimeId}/([a-z0-9]+)`, "g"))];
    if (epMatches.length === 0) return null;
    const latestEpId = epMatches[epMatches.length - 1][1];
    const latestEpUrl = `${XANIME_BASE}/title/${xanimeId}/${latestEpId}`;
    const latestHtml = await httpGet(latestEpUrl);
    const allEps: Array<{ number: number; episodeId: string }> = [];
    const seen = new Set<string>();
    for (const m of epMatches) { if (!seen.has(m[1])) { seen.add(m[1]); const nm = m[1].match(/(\d+)$/); allEps.push({ number: nm ? parseInt(nm[1]) : allEps.length + 1, episodeId: m[1] }); } }
    allEps.sort((a, b) => a.number - b.number);
    const targetNum = Math.max(1, Math.min(epNum, allEps.length));
    const targetEp = allEps.find(e => e.number === targetNum) || allEps[0];
    let html = latestHtml;
    if (targetEp.episodeId !== latestEpId) html = await httpGet(`${XANIME_BASE}/title/${xanimeId}/${targetEp.episodeId}`);
    const m3u8Pattern = /https?:\/\/(xanivsrc\d+\.org)\/([^"'\s]+\.m3u8[^"'\s]*)/g;
    const urls: Array<{ url: string; host: string }> = [];
    let m; while ((m = m3u8Pattern.exec(html)) !== null) { if (!urls.find(u => u.url === m![0])) urls.push({ url: m![0], host: m![1] }); }
    const subPattern = /https?:\/\/[^"'\s]+\.vtt[^"'\s]*/g;
    const subs: Array<{ url: string; lang: string; label: string }> = [];
    while ((m = subPattern.exec(html)) !== null) { if (!subs.find(s => s.url === m![0])) { const u = m![0]; const lang = u.includes("eng") ? "en" : "en"; subs.push({ url: u, lang, label: "English" }); } }
    if (urls.length === 0) return null;
    const servers: XanimeServer[] = urls.map((u, i) => ({ name: `Brook HD${urls.length > 1 ? `-${i + 1}` : ""}`, m3u8Url: u.url, cdnHost: u.host, type: i === 1 ? "dub" : "sub" as const, quality: "1080p", subtitleTracks: subs }));
    return { servers, episodes: allEps };
  } catch (e) { console.error(`[xanime] Error:`, e); return null; }
}

export async function resolveXanimeByAnilist(anilistId: number, epNum: number, anilistTitle?: string): Promise<XanimeResult | null> {
  try {
    let enTitle = anilistTitle || "", romaji = "", english = "";
    if (!enTitle) {
      try {
        const { cachedQuery } = await import("./anilist-cache");
        const data = await cachedQuery<{ Media: { title: { english?: string; romaji?: string } } } | null>(
          `query ($id: Int) { Media(id: $id, type: ANIME) { title { english romaji } } }`, { id: anilistId }, { ttl: 86400000, timeoutMs: 5000 });
        if (data?.Media) { english = data.Media.title?.english || ""; romaji = data.Media.title?.romaji || ""; enTitle = english || romaji; }
      } catch {}
    } else { english = enTitle; }
    if (!enTitle) return null;
    const match = matchTitle(enTitle, romaji, english);
    if (!match) { console.warn(`[xanime] No match for "${enTitle}" (AniList ${anilistId})`); return null; }
    console.log(`[xanime] Matched AniList ${anilistId} "${enTitle}" → ${match.xanimeId}:${match.slug}`);
    return await resolveXanime(match.xanimeId, match.slug, epNum, enTitle);
  } catch (e) { console.error(`[xanime] resolveByAnilist error:`, e); return null; }
}
