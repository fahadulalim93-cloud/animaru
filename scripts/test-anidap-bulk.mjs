/**
 * Test AniDap resolveAniDapId from the production API route
 */
const BASE = "https://luffytv.live";

// First test if the resolveAniDapId even works on the server
// We'll hit the anidap-servers bulk endpoint to see if that works
console.log("Testing AniDap bulk endpoint...");
const r = await fetch(`${BASE}/api/anime/anidap-servers/21/1`, {
  headers: { "User-Agent": "Mozilla/5.0" }
});
const data = await r.json();
console.log(`Status: ${r.status}`);
console.log(`Servers: ${data?.servers?.length || 0}`);
if (data?.servers?.length) {
  for (const s of data.servers.slice(0, 3)) {
    const hasProxy = s.streamUrl?.includes("luffytv.live/p/") || s.streamUrl?.includes("/api/");
    console.log(`  → ${s.name} | ${s.type} | proxied=${hasProxy} | url=${s.streamUrl?.slice(0,80)}...`);
  }
} else {
  console.log(`Response: ${JSON.stringify(data)?.slice(0, 500)}`);
}
