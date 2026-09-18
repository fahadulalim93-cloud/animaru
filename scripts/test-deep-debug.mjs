/**
 * Deep debug — test the exact scraper functions that are failing
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function fetchJSON(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    const text = await res.text();
    console.log(`   [${res.status}] ${url.slice(0, 80)}... → ${text.slice(0, 300)}`);
    try { return JSON.parse(text); } catch { return text; }
  } catch (e) {
    clearTimeout(timer);
    console.log(`   [ERR] ${url.slice(0, 80)}... → ${e.message}`);
    return null;
  }
}

console.log("=".repeat(70));
console.log("DEEP DEBUG — AnimeX + AniDap resolver functions");
console.log("=".repeat(70));

// ─── AnimeX GraphQL ─────────────────────────────────────────────────────
console.log("\n🔍 [AnimeX] GraphQL searchAnime for anilistId=21");

// The animex-api.ts uses animexGetAnime(anilistId) which does a GraphQL search
// Let's test the exact GraphQL query it would use
const gqlBody = JSON.stringify({
  query: `query ($id: Int!) { anime(id: $id) { id anilistId titles } }`,
  variables: { id: 21 }
});
// Actually let's check what query animexGetAnime uses - it might use a different query

// First: try the searchAnime query (by title)
const gqlSearch = JSON.stringify({
  query: `{ searchAnime(query: "one piece", limit: 5) { items { id anilistId titles } } }`
});
const searchResult = await fetchJSON("https://graphql.animex.one/graphql", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": UA, Origin: "https://animex.one", Referer: "https://animex.one/" },
  body: gqlSearch,
});
if (searchResult?.data?.searchAnime?.items?.length) {
  const item = searchResult.data.searchAnime.items[0];
  console.log(`\n   Found: id="${item.id}" anilistId=${item.anilistId}`);
}

// Second: try getting anime by anilistId directly
const gqlById = JSON.stringify({
  query: `query ($anilistId: Int!) { searchAnime(query: "", limit: 1, anilistId: $anilistId) { items { id anilistId } } }`,
  variables: { anilistId: 21 }
});
console.log("\n🔍 [AnimeX] Try searchAnime with anilistId filter:");
await fetchJSON("https://graphql.animex.one/graphql", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": UA, Origin: "https://animex.one", Referer: "https://animex.one/" },
  body: gqlById,
});

// Third: introspect the schema to find available fields
const introspectQuery = JSON.stringify({
  query: `{ __type(name: "Query") { fields { name args { name type { name kind ofType { name } } } } } }`
});
console.log("\n🔍 [AnimeX] GraphQL schema introspection:");
const schema = await fetchJSON("https://graphql.animex.one/graphql", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": UA, Origin: "https://animex.one", Referer: "https://animex.one/" },
  body: introspectQuery,
});
if (schema?.data?.__type?.fields) {
  const fields = schema.data.__type.fields;
  console.log(`\n   Available Query fields:`);
  for (const f of fields) {
    const args = f.args.map(a => `${a.name}: ${a.type?.name || a.type?.ofType?.name || '?'}`).join(", ");
    console.log(`     ${f.name}(${args})`);
  }
}

// ─── AniDap Sources ─────────────────────────────────────────────────────
console.log("\n🔍 [AniDap] Testing sources endpoint for one-piece-p8k27 ep1");

// We know resolveAniDapId(21) = "one-piece-p8k27" from earlier test
// Let's test the sources endpoint directly with different providers
for (const prov of ["beep", "mimi", "yuki"]) {
  console.log(`\n   Provider: ${prov}`);
  await fetchJSON(`https://chad.anidap.lol/rest/api/sources?id=one-piece-p8k27&epNum=1&type=sub&providerId=${prov}`, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Origin: "https://anidap.lol",
      Referer: "https://anidap.lol/",
    }
  });
}

// Also test the servers endpoint
console.log("\n🔍 [AniDap] Servers for one-piece-p8k27 ep1:");
await fetchJSON("https://chad.anidap.lol/rest/api/servers?id=one-piece-p8k27&epNum=1", {
  headers: {
    "User-Agent": UA,
    Accept: "application/json",
    Origin: "https://anidap.lol",
    Referer: "https://anidap.lol/",
  }
});

console.log("\n" + "=".repeat(70));
