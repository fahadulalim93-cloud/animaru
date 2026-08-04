// Test that wrapM3u8Url uses the correct kwik.cx referer for vault-XX.{owocdn,uwucdn}.top
// Run with: npx tsx scripts/test-animepahe-proxy.ts

// Inline the proxy logic so we don't need to compile the TS project
const XOR_KEY = "10b06cdc1ca48c9fb0b94af97cc040cf";
const WORKER_PROXY = "https://luffytv-proxy.ggy892767.workers.dev/p";

const CDN_REFERERS: Record<string, string> = {
  "vault-16.owocdn.top":   "https://kwik.cx/",
  "vault-01.uwucdn.top":   "https://kwik.cx/",
  "kwik.cx":               "https://kwik.cx/",
};

const CDN_REFERER_PATTERNS: Array<{ regex: RegExp; referer: string }> = [
  { regex: /^vault-\d+\.owocdn\.top$/i, referer: "https://kwik.cx/" },
  { regex: /^vault-\d+\.uwucdn\.top$/i, referer: "https://kwik.cx/" },
  { regex: /^eu-\d+\.uwucdn\.top$/i,    referer: "https://kwik.cx/" },
  { regex: /^us-\d+\.uwucdn\.top$/i,    referer: "https://kwik.cx/" },
  { regex: /^[a-z]{2}-\d+\.(owocdn|uwucdn)\.top$/i, referer: "https://kwik.cx/" },
];

function getRefererFor(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    if (CDN_REFERERS[hostname]) return CDN_REFERERS[hostname];
    for (const h of Object.keys(CDN_REFERERS)) {
      if (hostname.endsWith("." + h)) return CDN_REFERERS[h];
    }
    for (const { regex, referer } of CDN_REFERER_PATTERNS) {
      if (regex.test(hostname)) return referer;
    }
  } catch {}
  return "https://www.miruro.tv/";
}

function encodeWorkerToken(url: string, referer: string): string {
  const combined = url + "\0" + referer;
  const keyBytes = new TextEncoder().encode(XOR_KEY);
  const dataBytes = new TextEncoder().encode(combined);
  const xored = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    xored[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  let binary = "";
  for (let i = 0; i < xored.length; i++) binary += String.fromCharCode(xored[i]);
  return Buffer.from(binary, "binary").toString("base64url");
}

function wrapM3u8Url(url: string): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith(WORKER_PROXY)) return url;
  const referer = getRefererFor(url);
  const token = encodeWorkerToken(url, referer);
  return `${WORKER_PROXY}/${token}`;
}

// Test URLs — real animepahe CDN URLs we've seen
const testUrls = [
  "https://vault-99.owocdn.top/stream/99/02/2fd368985dc771516ef36b5bcdd9c18a13850b215d149087bee70d6eaf82e6aa/uwu.m3u8",
  "https://vault-05.uwucdn.top/stream/05/08/0df7ff5cbf5c20bf1834d37b22d918a4faa98d146dd264ce5cb83d3f30fddab6/uwu.m3u8",
  "https://kwik.cx/e/InzZMv1U52OE",
];

async function main() {
  console.log("=== Referer resolution test ===");
  for (const url of testUrls) {
    const referer = getRefererFor(url);
    const correct = referer === "https://kwik.cx/";
    console.log(`  ${correct ? "✓" : "✗"} ${url.slice(0, 70)}... → ${referer}`);
  }

  console.log("\n=== Live proxy fetch test ===");
  for (const url of testUrls) {
    const wrapped = wrapM3u8Url(url);
    try {
      const r = await fetch(wrapped, { signal: AbortSignal.timeout(10000) });
      const text = await r.text();
      const isM3u8 = text.trimStart().startsWith("#EXTM3U");
      console.log(`  HTTP ${r.status} | size=${text.length.toString().padStart(6)} | m3u8=${isM3u8 ? "✓" : "✗"} | ${url.slice(0, 60)}...`);
    } catch (e) {
      console.log(`  ERROR | ${url.slice(0, 60)}... → ${e.message}`);
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
