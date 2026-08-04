# LuffyTV Proxy — Cloudflare Worker

One-file proxy that replaces `/api/hls-proxy` + `/api/image-proxy` and adds a general-purpose fetch proxy. Runs on Cloudflare's edge — free tier handles ~100k requests/day.

## Deploy (5 min)

### Option A — Dashboard (easiest)

1. Go to **Cloudflare → Workers & Pages → Create application → Create Worker**
2. Name it `luffytv-proxy` → click **Deploy**
3. Click **Edit code** → delete the default contents
4. Paste the entire `luffytv-proxy.js` file → **Save and deploy**
5. Your proxy URL is now live at:
   ```
   https://luffytv-proxy.<your-cloudflare-subdomain>.workers.dev
   ```

### Option B — Wrangler CLI

```bash
npm install -g wrangler
wrangler login

cd luffytv-fahad/worker
wrangler deploy luffytv-proxy.js --name luffytv-proxy --compatibility-date 2024-09-01
```

## Endpoints

| Path | Mode | Caching | Use For |
|------|------|---------|---------|
| `/proxy?url=...` | auto | none | Default — auto-detects m3u8 vs image vs other |
| `/proxy/m3u8?url=...` | force m3u8 | never | HLS playlists (URLs inside get rewritten) |
| `/proxy/image?url=...` | force image | 1h edge | Posters, thumbnails, logos |
| `/proxy/raw?url=...` | pass-through | none | JSON APIs, GraphQL, anything else |
| `/proxy/health` | — | — | Health check |

## Examples

```js
const PROXY = "https://luffytv-proxy.your-subdomain.workers.dev";

// HLS manifest
const hlsUrl = `${PROXY}/proxy/m3u8?url=${encodeURIComponent("https://dami-tv.pro/stream.m3u8")}`;

// Image
const imgEl = document.querySelector("img");
imgEl.src = `${PROXY}/proxy/image?url=${encodeURIComponent("https://s4.anilist.co/file/.../cover.jpg")}`;

// AniList GraphQL (bypass CORS in browser)
const resp = await fetch(`${PROXY}/proxy/raw?url=${encodeURIComponent("https://graphql.anilist.co")}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "{ GenreCollection }" }),
});
```

## Wire it into the frontend

In your `src/lib/` create a helper:

```ts
// src/lib/proxy.ts
export const PROXY_BASE = "https://luffytv-proxy.your-subdomain.workers.dev";

export function proxify(url: string, mode: "auto" | "m3u8" | "image" | "raw" = "auto") {
  if (!url) return url;
  if (url.startsWith("/api/")) return url;  // already internal
  if (url.startsWith(PROXY_BASE)) return url;  // already proxied
  return `${PROXY_BASE}/proxy/${mode === "auto" ? "" : mode}?url=${encodeURIComponent(url)}`;
}
```

Then swap usages:

```ts
// Before:
fetch(`/api/hls-proxy?url=${encodeURIComponent(streamUrl)}`)
// After:
fetch(proxify(streamUrl, "m3u8"))

// Before:
`/api/image-proxy?url=${encodeURIComponent(imgUrl)}`
// After:
proxify(imgUrl, "image")
```

## What it does

- **m3u8 rewriting**: every URL inside the manifest (sub-playlists, segments, key URIs) is rewritten to route through the worker. Hosts in `ALWAYS_PROXY_HOSTS` always get proxied; others stay direct (they have CORS).
- **Referer spoofing**: each host in `REFERER_MAP` sends the right Referer/Origin so 403s go away.
- **Range support**: `Range:` header is forwarded for video segments (enables seeking).
- **CORS**: every response gets `Access-Control-Allow-Origin: *` and preflight `OPTIONS` is handled.
- **Image caching**: 1h edge cache via `caches.default` (free).
- **Live m3u8 never cached**: every request hits upstream fresh.
- **404 → transparent 1x1 PNG**: broken images don't show broken icons.

## Customizing

Edit `REFERER_MAP` and `ALWAYS_PROXY_HOSTS` at the top of `luffytv-proxy.js` to add new streaming CDNs as you integrate them. Redeploy and you're done.
