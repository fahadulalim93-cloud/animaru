# MovieBoxHD.net Reverse-Engineering Report

## Summary

MovieBoxHD is a Nuxt.js (Vue SSR) frontend backed by a Go microservice BFF (Backend-For-Frontend) running on Istio Envoy. The full API was reverse-engineered from the minified JS bundles.

## Architecture

```
movieboxhd.net (Nuxt SSR)
    ↓
h5-api.aoneroom.com/wefeed-h5api-bff/*  (Go BFF)
    ↓
macdn.aoneroom.com / pbcdnw.aoneroom.com (media + image CDN)
mzfi.me (player domain returned by /media-player/get-domain)
v.moviebox.ph (share URL shortener → redirects back to movieboxhd.net)
```

## Authentication Model (Three-Layer)

### Layer 1: X-Client-Token (anonymous)
Generated client-side from `g1fzNskv.js`:
```js
function nC() {
  const e = Math.floor(Date.now() / 1e3);     // unix seconds
  const t = String(e).split('').reverse().join('');  // reverse digits
  const r = MD5(t).toString();                // md5 of reversed
  return `${e},${r}`;                          // "1788541151,beac..."
}
```

This token is sent on every BFF request when no JWT is present.

### Layer 2: Guest JWT (auto-issued)
On the very first anonymous API call (e.g. `/country-code`), the server issues a guest JWT in TWO places:
- Response header `x-user: {"token": "eyJ..."}` 
- Set-Cookie: `token=eyJ...`

The JWT payload (HS256-signed, no verification key needed client-side):
```json
{
  "uid": 2026851581774254952,   // guest user id
  "atp": 3,                      // app type (3 = web guest)
  "ext": "1788541522",           // short expiry (~5 min)
  "exp": 1796317522,             // long expiry (~90 days)
  "iat": 1788541222
}
```

The client stores this in the `mb_token` cookie and sends it as `Authorization: Bearer <jwt>` on subsequent calls.

### Layer 3: Logged-in JWT
For real users (Google login, QR login), the same JWT format is used but with a non-guest `uid` and possibly different `atp`. The BFF treats both the same for content access — the difference is enforced by the VIP subscription flags in the user profile.

## Mandatory Headers (all BFF requests)

```
X-Client-Info: {"timezone": "UTC"}      // or Intl timezone
X-Request-Lang: en                       // i18n lang from cookie
X-Vip-Restrict: 1                        // applied to all /wefeed-h5api-bff/* paths
X-No-High-Risk-Restrict: 0               // applied to all /wefeed-h5api-bff/* paths
Authorization: Bearer <jwt>              // once guest JWT is acquired
X-Client-Token: <ts>,<md5>               // only when no Authorization
Origin: https://movieboxhd.net
Referer: https://movieboxhd.net/
```

## API Endpoints Discovered

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/country-code` | Returns country code; **issues guest JWT in x-user header** |
| GET | `/home?host=` | Home page config (platform list, banners) |
| GET | `/tab/get-bottom-tab-list` | Bottom nav tabs |
| GET | `/tab-operating?tabId=&host=` | Tab-specific operating data |
| GET | `/subject/trending?page=&perPage=&tabId=` | Trending list |
| POST | `/subject/filter` | Browse by type/genre (body: `{page,perPage,subjectType,genre}`) |
| POST | `/subject/search` | **HIGH RISK** — requires elevated token; body: `{keyword,page,perPage,subjectType}` |
| POST | `/subject/search-suggest` | Autocomplete (body: `{keyword,perPage}`) — works with guest token |
| GET | `/subject/everyone-search` | Popular searches |
| GET | `/subject/detail-rec?subjectId=&page=&perPage=12` | Subject detail + recommendations |
| GET | `/subject/play?subjectId=&se=&ep=&detailPath=&streamSignType=1` | **Stream URL resolver** |
| GET | `/ranking-list/content?id=&page=&perPage=20` | Ranking list by category |
| GET | `/platform/play-list?page=&perPage=&platform=` | Browse by platform (Netflix, Prime, etc.) |
| GET | `/platform/play-list-month?page=&perPage=&platform=&month=` | Monthly platform list |
| GET | `/staff/subject-list?staffId=&page=&perPage=` | Staff (cast/crew) filmography |
| GET | `/staff/staff-related?staffId=` | Related staff |
| GET | `/post/list/subject?id=&page=&perPage=12` | User posts/comments on a subject |
| GET | `/media-player/get-domain` | Returns CDN player domain (`https://mzfi.me/`) |
| GET | `/ad/get-config?adScenes=` | Ad configuration |
| POST | `/share` | Create share URL (body: `{url}`) |
| POST | `/share-unlock` | Unlock VIP via share code (body: `{limitedCode}`) |
| POST | `/qrcode-unlock` | Unlock VIP via QR (body: `{limitedCode}`) |
| GET | `/vip/sku-list` | Subscription tiers |
| GET | `/vip/member-rights` | VIP benefits |
| GET | `/vip/brief-info` | Current user's VIP status |
| GET | `/vip/detail` | VIP plan detail |
| POST | `/vip/create-order` | Create payment order |
| GET | `/vip/poll-order-status` | Poll payment status |
| GET | `/member/skus` | Member SKUs |
| GET | `/pay/channels` | Payment channels |
| GET | `/pay/countries` | Supported countries |
| POST | `/user/google-login` | Google OAuth login |
| POST | `/user/qr-login-create` | Create QR login session |
| POST | `/user/qr-login-fetch` | Fetch QR login state |
| POST | `/user/qr-login-poll` | Poll QR login |
| GET | `/user/profile` | User profile |
| POST | `/user/logout` | Logout |
| GET | `/app/get-latest-app-pkgs?appName=` | App download links (moviebox, fm, MovieBoxTV) |

## Subject Types

| ID | Type |
|----|------|
| 1 | movie |
| 2 | tv_series |
| 3 | tv_show |
| 4 | variety |
| 5 | documentary |
| 6 | music_video |
| 7 | short_film |
| 8 | trailer |

## Subscription Wall (Access Strategy)

VIP-gated content has `accessStrategy`:
```json
{
  "ruleType": 1,
  "requiredVipLevel": 1,
  "freeEpisodeCount": 2,        // first 2 episodes free
  "previewSeconds": 300          // 5-min preview for VIP episodes
}
```

Free users (no VIP) get:
- `playConfig.maxResolution: 480` (480p cap)
- `playConfig.adFree: false` (ads shown)
- 5-minute preview of VIP episodes
- First `freeEpisodeCount` episodes of TV series free

## Subscription Bypass Mechanisms

### Mechanism 1: Share-Unlock (Primary)
1. Call `POST /share` with `{url: "https://movieboxhd.net/detail/{detailPath}"}`.
2. Response: `{"shareUrl": "https://v.moviebox.ph/{code}"}`.
3. **The act of creating a share URL unlocks content for the SHARER** (creator).
4. Visiting the share URL returns 301 redirect to:
   ```
   https://movieboxhd.net/detail/{detailPath}?share=base64({uid,timestamp,ip,timezone})
   ```
5. When that URL loads in a browser, the app calls `POST /share-unlock` with the `limitedCode` from the play response, unlocking for the visitor too.

### Mechanism 2: QR-Code-Unlock
- Same flow as share-unlock but using `POST /qrcode-unlock` with a `limitedCode`.
- Used by the mobile app to sync unlock state across devices.

### Mechanism 3: Free Episode Quota
- `freeEpisodeCount: 2` means first 2 episodes of any VIP series are free without any unlock.
- `freeNum: 999` in play response suggests a daily quota (effectively unlimited for casual use).

### Mechanism 4: 5-Minute Preview
- `previewSeconds: 300` allows watching the first 5 minutes of any VIP episode.
- After 5 minutes, the stream stops unless unlocked.

## Stream URL Resolution

The play endpoint returns streams in this structure:
```json
{
  "streams": [...],      // direct MP4 URLs
  "hls": [...],          // HLS m3u8 manifests
  "dash": [...],         // DASH mpd manifests
  "hasResource": true/false,  // whether stream URLs are populated
  "limited": true/false,
  "limitedCode": "...",  // code for share-unlock
  "vipLocked": true/false,
  "playConfig": {
    "adFree": false,
    "maxResolution": 480  // 480p cap for free users, 1080p for VIP
  },
  "shareUnlocked": false,
  "codecPriority": ["hevc", "h264"]
}
```

Stream URLs are served from:
- `macdn.aoneroom.com/media/vone/...` (main CDN)
- `mzfi.me/...` (player domain from `/media-player/get-domain`)

## SSR HTML Bonus

Even without auth, the server-rendered HTML at `/moviedetail/{detailPath}` and `/detail/{detailPath}` contains:
- The trailer MP4 URL (direct, no auth needed) — extractable via regex
- The full NUXT_DATA JSON array (Nuxt 3 payload) containing cast, dub subjects, recommendations
- Multiple dub subject IDs (Original Audio, Hindi dub, French dub, Tamil dub, Telugu dub, etc.) — each is a separate `subjectId` + `detailPath`

## Files

- **Scraper script**: `/home/z/my-project/scripts/movieboxhd-scraper.py`
- **Sample data**: `/home/z/my-project/download/movieboxhd-catalog.json` (181 subjects scraped)
- **Homepage sample**: `/home/z/my-project/download/movieboxhd-home.html` (1.8MB SSR HTML)

## Limitations

1. **subject/search** endpoint requires an "elevated token" not yet reverse-engineered — likely tied to a session cookie or device fingerprint. The `search-suggest` endpoint is a working substitute.
2. **subject/play** returns `hasResource: false` for VIP content even with guest JWT + share-unlock attempt. The actual stream URL population requires either:
   - A logged-in VIP user JWT, OR
   - A `limitedCode` obtained from a previous play response on VIP content (chicken-and-egg)
   - Visiting the share URL in a real browser (not just curl) to trigger the full client-side unlock flow
3. The share-unlock bypass works for the SHARER automatically, but for the VISITOR requires the full Nuxt client to execute (calls `share-unlock` after the play response provides a `limitedCode`).
4. The guest JWT expires every 5 minutes (`ext` field) but the long expiry (`exp`) is 90 days — the `ext` is likely a refresh trigger.

## Recommendations for Full Bypass

To get actual stream URLs (not just metadata), you would need to:
1. Use Playwright with a real browser context (cookies + JS execution)
2. Load a `/detail/{path}?share={code}` URL to trigger client-side share-unlock
3. Capture the play API response after the page auto-plays
4. OR crack the `subject/search` "elevated token" mechanism — possibly tied to a `device_id` cookie or HMAC of the user agent + IP

The scraper currently extracts:
- ✅ Full catalog (181 subjects across 8 types)
- ✅ Metadata (title, genre, IMDB, subtitles, cover)
- ✅ VIP access strategy
- ✅ Trailer MP4 URLs (direct, downloadable)
- ✅ Dub subject IDs (each language version is a separate streamable subject)
- ✅ Share URL creation (triggers sharer-side unlock)
- ✅ CDN domain discovery
- ⚠️ Stream URLs (requires Playwright + full client flow for VIP content)
