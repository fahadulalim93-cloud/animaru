/**
 * AllManga Direct — our own scraper for allmanga.to / allanime.day
 *
 * Based on the working scraper code provided by the user.
 * Uses the REAL API at api.allanime.day (NOT allanime.ai).
 *
 * Pipeline:
 *   1. Resolve AniList ID → AllAnime show ID (via AniList title → GraphQL search)
 *   2. Fetch episode sources via persisted GraphQL query
 *   3. Decrypt "tobeparsed" responses using AES-CTR
 *   4. Decode hex-encoded URLs
 *   5. Extract direct stream URLs from embed providers (mp4upload, uns.bio, ok.ru, etc.)
 *
 * NO third-party API dependency — this is our own code.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0";

import { getCachedTitle } from "./anilist-cache";
// Use api.mkissa.net instead of api.allanime.day — same API, NOT Cloudflare-protected
const API = "https://api.mkissa.net";
const API_PATH = "/api/graphql"; // mkissa uses /api/graphql (allanime uses /api)
const REFERER = "https://allmanga.to";
const ANIZIP = "https://api.ani.zip/mappings";
const PASSPHRASE = "Xot36i3lK3:v1";

const HASHES = {
  episode: "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec",
};

const HEX_TABLE: Record<string, string> = {
  "79": "A", "7a": "B", "7b": "C", "7c": "D", "7d": "E", "7e": "F", "7f": "G",
  "70": "H", "71": "I", "72": "J", "73": "K", "74": "L", "75": "M", "76": "N",
  "77": "O", "68": "P", "69": "Q", "6a": "R", "6b": "S", "6c": "T", "6d": "U",
  "6e": "V", "6f": "W", "60": "X", "61": "Y", "62": "Z", "59": "a", "5a": "b",
  "5b": "c", "5c": "d", "5d": "e", "5e": "f", "5f": "g", "50": "h", "51": "i",
  "52": "j", "53": "k", "54": "l", "55": "m", "56": "n", "57": "o", "48": "p",
  "49": "q", "4a": "r", "4b": "s", "4c": "t", "4d": "u", "4e": "v", "4f": "w",
  "40": "x", "41": "y", "42": "z", "08": "0", "09": "1", "0a": "2", "0b": "3",
  "0c": "4", "0d": "5", "0e": "6", "0f": "7", "00": "8", "01": "9", "15": "-",
  "16": ".", "67": "_", "46": "~", "02": ":", "17": "/", "07": "?", "1b": "#",
  "63": "[", "65": "]", "78": "@", "19": "!", "1c": "$", "1e": "&", "10": "(",
  "11": ")", "12": "*", "13": "+", "14": ",", "03": ";", "05": "=", "1d": "%",
};

// ── AES Key cache ──
let _aesKey: CryptoKey | null = null;

async function getAESKey(): Promise<CryptoKey> {
  if (_aesKey) return _aesKey;
  const raw = new TextEncoder().encode(PASSPHRASE);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  _aesKey = await crypto.subtle.importKey("raw", hash, { name: "AES-CTR" }, false, ["decrypt"]);
  return _aesKey;
}

async function decryptTobeparsed(b64: string): Promise<string> {
  const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv12 = buf.slice(1, 13);
  const counter = new Uint8Array(16);
  counter.set(iv12, 0);
  counter[12] = 0; counter[13] = 0; counter[14] = 0; counter[15] = 2;
  const ctLen = buf.length - 13 - 16;
  const ciphertext = buf.slice(13, 13 + ctLen);
  const key = await getAESKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-CTR", counter, length: 32 }, key, ciphertext);
  return new TextDecoder().decode(plain);
}

function decodeHexUrl(hex: string): string {
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    const pair = hex.substring(i, i + 2).toLowerCase();
    out += HEX_TABLE[pair] ?? pair;
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const c = hex.replace(/[^0-9a-f]/gi, "");
  const b = new Uint8Array(c.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(c.slice(i * 2, i * 2 + 2), 16);
  return b;
}

async function aesDecrypt(hex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("kiemtienmua911ca"), { name: "AES-CBC" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv: new TextEncoder().encode("1234567890oiuytr") }, key, hexToBytes(hex) as any);
  return new TextDecoder().decode(plain);
}

// ── Embed extractors ──
async function extractMp4(id: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.mp4upload.com/embed-${id}.html`, { headers: { "User-Agent": UA, Referer: "https://allanime.to/" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const h = await r.text();
    const m = h.match(/player\.src\s*\(\s*\{[^}]*\bsrc\s*:\s*"([^"]+)"/) || h.match(/"file"\s*:\s*"(https?:[^"]+\.mp4[^"]*)"/) || h.match(/\bsrc\s*:\s*"(https?:[^"]+\.mp4[^"]*)"/);
    return m?.[1]?.replace(/\\/g, "") || null;
  } catch { return null; }
}

async function extractUns(id: string): Promise<string | null> {
  try {
    const base = "https://allanime.uns.bio";
    const r = await fetch(`${base}/api/v1/video?id=${id}&w=1280&h=720&r=`, { headers: { "User-Agent": UA, Referer: `${base}/#${id}`, Origin: base }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const hex = (await r.text()).trim();
    if (!hex || !/^[0-9a-f]+$/i.test(hex)) return null;
    const p = JSON.parse(await aesDecrypt(hex));
    return p.source || p.cf || null;
  } catch { return null; }
}

async function extractOk(id: string): Promise<string | null> {
  try {
    const r = await fetch(`https://ok.ru/videoembed/${id}`, { headers: { "User-Agent": UA, Referer: "https://ok.ru/" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const h = await r.text();
    const m = h.match(/ondemandHls\\&quot;:\\&quot;(https?:\/\/.*?)\\&quot;/);
    return m ? m[1].replace(/\\u0026/g, "&") : null;
  } catch { return null; }
}

async function extractStreamSB(id: string): Promise<string | null> {
  try {
    const baseHeaders: Record<string, string> = { "User-Agent": UA, "Referer": "https://allmanga.to/", "watchsb": "streamsb", "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9" };
    const r1 = await fetch(`https://streamsb.net/api/v1/video?id=${id}`, { headers: baseHeaders, signal: AbortSignal.timeout(15000) });
    const sid = (r1.headers.get("set-cookie") || "").match(/sid=([^;]+)/)?.[1] ?? "";
    const html1 = await r1.text();
    const m = html1.match(/window\.location\.replace\('([^']+)'\)/);
    if (!m) return null;
    const r2 = await fetch(m[1], { headers: { ...baseHeaders, "Cookie": `sid=${sid}`, "Referer": `https://streamsb.net/e/${id}.html` }, signal: AbortSignal.timeout(15000) });
    if (!r2.ok) return null;
    const ct = r2.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return null;
    const data = await r2.json();
    return data?.stream_data?.file ?? data?.data?.file ?? null;
  } catch { return null; }
}

async function extractStreamlare(id: string): Promise<string | null> {
  try {
    const r = await fetch("https://streamlare.com/api/video/stream/get", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA, "Referer": "https://streamlare.com/", "Origin": "https://streamlare.com", "Accept": "application/json, */*" }, body: JSON.stringify({ id }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.data?.file ?? null;
  } catch { return null; }
}

function embedMediaType(url: string | null): string | null {
  if (!url) return null;
  if (url.includes(".m3u8")) return "hls";
  if (url.includes(".mp4")) return "mp4";
  return "direct";
}

// ── API fetch helpers ──
// Uses api.mkissa.net (same API as allanime.day, but NOT Cloudflare-protected)
async function apiFetch(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Referer": REFERER, "Origin": REFERER },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  if (json?.data?.tobeparsed) {
    const decrypted = await decryptTobeparsed(json.data.tobeparsed);
    json.data = JSON.parse(decrypted);
  }
  return json.data;
}

function buildApiUrl(variables: any, hash: string): string {
  const v = encodeURIComponent(JSON.stringify(variables));
  const e = encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }));
  return `${API}${API_PATH}?variables=${v}&extensions=${e}`;
}

async function apiPost(query: string, variables: any): Promise<any> {
  const res = await fetch(`${API}${API_PATH}`, {
    method: "POST",
    headers: { "User-Agent": UA, "Referer": REFERER, "Origin": REFERER, "Content-Type": "application/json" },
    body: JSON.stringify({ variables, query }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`API POST ${res.status}`);
  const json = await res.json();
  if (json?.data?.tobeparsed) {
    const decrypted = await decryptTobeparsed(json.data.tobeparsed);
    json.data = JSON.parse(decrypted);
  }
  return json.data;
}

// ── Search ──
async function searchAllAnime(query: string, mode = "sub"): Promise<any[]> {
  const gql = `query($search:SearchInput $limit:Int $page:Int $translationType:VaildTranslationTypeEnumType $countryOrigin:VaildCountryOriginEnumType){shows(search:$search limit:$limit page:$page translationType:$translationType countryOrigin:$countryOrigin){edges{_id name englishName nativeName availableEpisodes availableEpisodesDetail aniListId __typename}}}`;
  const data = await apiPost(gql, { search: { allowAdult: false, allowUnknown: false, query }, limit: 40, page: 1, translationType: mode, countryOrigin: "ALL" });
  return data?.shows?.edges ?? [];
}

// ── Episode sources ──
async function getEpisodeSources(showId: string, epNum: number, audio = "sub"): Promise<any | null> {
  const url = buildApiUrl({ showId, translationType: audio, episodeString: String(epNum) }, HASHES.episode);
  const data = await apiFetch(url);
  return data?.episode ?? null;
}

// ── AniList title resolution (via centralized cache) ──
async function fetchAniListTitleInfo(anilistId: number) {
  return getCachedTitle(anilistId);
}

async function fetchAniZip(anilistId: number): Promise<any> {
  try {
    const res = await fetch(`${ANIZIP}?anilist_id=${anilistId}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return {};
    return res.json();
  } catch { return {}; }
}

function normalize(s: string): string {
  return (s || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function findBestMatch(results: any[], titles: string[], targetYear: number | null, targetId: number): any {
  const normalizedTitles = titles.map(normalize).filter(Boolean);
  let bestShow = null;
  let maxScore = -Infinity;
  for (const r of results) {
    if (targetId && r.aniListId && String(r.aniListId) === String(targetId)) return r;
    const names = [r.name, r.englishName, r.nativeName].map(normalize).filter(Boolean);
    let nameScore = 0;
    let isExact = false;
    for (const n of names) { if (normalizedTitles.includes(n)) { nameScore = 100; isExact = true; break; } }
    if (!isExact) {
      let maxFuzzy = 0;
      for (const rName of names) for (const t of normalizedTitles) {
        if (t.includes(rName) || rName.includes(t)) {
          const score = Math.min(rName.length, t.length) - Math.abs(rName.length - t.length) * 0.1;
          if (score > maxFuzzy) maxFuzzy = score;
        }
      }
      nameScore = maxFuzzy;
    }
    const totalScore = nameScore;
    if (totalScore > maxScore) { maxScore = totalScore; bestShow = r; }
  }
  return bestShow || results[0];
}

async function resolveAllAnimeId(anilistId: number): Promise<{ showId: string; show: any; anizip: any } | null> {
  const [anizipRes, alInfo] = await Promise.all([
    fetchAniZip(anilistId),
    fetchAniListTitleInfo(anilistId),
  ]);

  let titlesToTry: string[] = [];
  if (anizipRes?.titles) {
    titlesToTry = [anizipRes.titles.en, anizipRes.titles.ja, anizipRes.titles["x-jat"], ...Object.values(anizipRes.titles)].filter(Boolean);
  }
  if (alInfo) {
    titlesToTry = [...new Set([alInfo.english, alInfo.romaji, alInfo.native, ...titlesToTry].filter((t): t is string => !!t))];
  }
  if (!titlesToTry.length) return null;

  const targetYear = null;
  let allResults: any[] = [];
  for (const title of titlesToTry.slice(0, 3)) {
    try {
      const results = await searchAllAnime(title, "sub");
      allResults.push(...results);
    } catch { /* try next title */ }
  }
  const seen = new Set<string>();
  allResults = allResults.filter((r) => { if (seen.has(r._id)) return false; seen.add(r._id); return true; });
  if (!allResults.length) return null;

  const match = findBestMatch(allResults, titlesToTry, targetYear, anilistId);
  return { showId: match._id, show: match, anizip: anizipRes };
}

// ── Types ──
export interface AllMangaSource {
  name: string;
  url: string;
  type: string;
  quality: string;
}

export interface AllMangaResult {
  sources: AllMangaSource[];
  showId: string;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

// ── Main: resolve all sources + intro/outro ──
export async function resolveAllManga(
  anilistId: number,
  epNum: number,
  audio: "sub" | "dub" = "sub",
): Promise<AllMangaResult | null> {
  try {
    const resolved = await resolveAllAnimeId(anilistId);
    if (!resolved) return null;

    const { showId, anizip } = resolved;
    const episode = await getEpisodeSources(showId, epNum, audio);
    if (!episode) return null;

    const sources: AllMangaSource[] = [];
    const sourceUrls = episode.sourceUrls || [];

    for (const src of sourceUrls) {
      let url = src.sourceUrl;
      if (url && url.startsWith("--")) url = decodeHexUrl(url.slice(2));
      if (url && url.startsWith("/apivtwo/clock")) {
        url = "https://allanime.day" + url.replace("/clock", "/clock.json");
      }

      let extractedUrl: string | null = null;
      const name = src.sourceName || "";

      if (url?.includes("mp4upload.com")) {
        const m = url.match(/embed-([a-zA-Z0-9]+)\.html/);
        if (m?.[1]) extractedUrl = await extractMp4(m[1]);
      } else if (url?.includes("allanime.uns.bio")) {
        const id = url.split("#").pop();
        if (id && id.length > 2) extractedUrl = await extractUns(id);
      } else if (url?.includes("ok.ru")) {
        const id = url.split("/").pop();
        if (id) extractedUrl = await extractOk(id);
      } else if (url?.includes("streamsb.net")) {
        const m = url.match(/\/(?:e\/|embed-)([a-zA-Z0-9]+)(?:\.html)?/);
        if (m?.[1]) extractedUrl = await extractStreamSB(m[1]);
      } else if (url?.includes("streamlare.com")) {
        const m = url.match(/\/e\/([a-zA-Z0-9]+)/);
        if (m?.[1]) extractedUrl = await extractStreamlare(m[1]);
      } else if (url && (url.includes(".m3u8") || url.includes(".mp4"))) {
        // Direct stream URL — use as-is
        extractedUrl = url;
      }

      if (extractedUrl) {
        const type = embedMediaType(extractedUrl) || "direct";
        // ONLY keep MP4 sources — HLS and other types don't work reliably
        if (type === "mp4") {
          sources.push({
            name: name || "AllManga",
            url: extractedUrl,
            type,
            quality: src.priority >= 500 ? "1080p" : src.priority >= 300 ? "720p" : "auto",
          });
        }
      }
    }

    if (sources.length === 0) return null;

    // Get intro/outro from ani.zip
    const epMeta = anizip?.episodes?.[String(epNum)] ?? {};
    const intro = epMeta.intro ?? null;
    const outro = epMeta.outro ?? null;

    console.log(`[allmanga-direct] AniList ${anilistId} ep ${epNum}: ${sources.length} sources`);

    return { sources, showId, intro, outro };
  } catch (err) {
    console.error(`[allmanga-direct] resolveAllManga error:`, err);
    return null;
  }
}
