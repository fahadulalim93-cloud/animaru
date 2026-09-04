#!/usr/bin/env python3
"""
MovieBoxHD.net Scraper
======================

Reverse-engineered API scraper for movieboxhd.net (Nuxt.js frontend, BFF API at h5-api.aoneroom.com).

Authentication model (reverse-engineered from g1fzNskv.js):
  - Anonymous visitors get auto-issued a guest JWT via the `x-user` response header
    on any BFF API call (also set as `token` cookie).
  - The JWT is sent back as `Authorization: Bearer <jwt>` on subsequent requests.
  - When no JWT is present, the client synthesizes an `X-Client-Token` header:
        ts = floor(now / 1000)
        reversed_ts = str(ts).split('').reverse().join('')
        md5_hash = md5(reversed_ts).hexdigest()
        X-Client-Token = f"{ts},{md5_hash}"
  - All BFF requests also get:
        X-Client-Info: {"timezone": "UTC"}
        X-Request-Lang: "en"
        X-Vip-Restrict: "1"
        X-No-High-Risk-Restrict: "0"

Subscription wall:
  - VIP content has `accessStrategy: {ruleType: 1, requiredVipLevel: 1, freeEpisodeCount: 2, previewSeconds: 300}`
  - Free users get maxResolution 480p, ad-supported, and 5-min previews for VIP content.
  - Bypass mechanism 1: `share-unlock` endpoint accepts a `limitedCode` (returned in play response
    when content is limited). Calling this endpoint unlocks that limitedCode for the current guest.
  - Bypass mechanism 2: Visiting a share URL (v.moviebox.ph/{code}) redirects back to detail page
    with `?share=base64({uid,timestamp,ip,timezone})` query param, which triggers share-unlock on load.

Endpoints discovered (all under https://h5-api.aoneroom.com/wefeed-h5api-bff/):
  - GET  /country-code                → issues guest JWT
  - GET  /home?host=                  → home page config
  - GET  /subject/trending            → trending list
  - POST /subject/filter              → browse by type/genre (body: {page,perPage,subjectType,genre})
  - POST /subject/search              → search (body: {keyword,page,perPage,subjectType}) - HIGH RISK, needs special token
  - POST /subject/search-suggest      → autocomplete (body: {keyword,perPage})
  - GET  /subject/detail-rec          → detail + recommendations
  - GET  /subject/play                → stream URLs (params: subjectId,se,ep,detailPath,streamSignType)
  - POST /share                       → create share URL (unlocks for sharer)
  - POST /share-unlock                → unlock using limitedCode
  - POST /qrcode-unlock               → unlock via QR code
  - GET  /media-player/get-domain     → CDN domain (mzfi.me)
  - GET  /vip/sku-list                → subscription tiers
  - GET  /vip/member-rights           → VIP benefits

Usage:
    python3 movieboxhd-scraper.py [--pages N] [--search "query"] [--output out.json]
"""
import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
from typing import Any, Dict, List, Optional

import requests

# ============================================================
# Config
# ============================================================
API_BASE = "https://h5-api.aoneroom.com/wefeed-h5api-bff"
SITE_ORIGIN = "https://movieboxhd.net"
SHARE_DOMAIN = "https://v.moviebox.ph"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Subject type mapping (discovered via API probing)
SUBJECT_TYPES = {
    1: "movie",
    2: "tv_series",
    3: "tv_show",
    4: "variety",
    5: "documentary",
    6: "music_video",
    7: "short_film",
    8: "trailer",
}


# ============================================================
# Auth
# ============================================================
def make_client_token() -> str:
    """Generate X-Client-Token = '{ts},{md5(reverse(ts))}'."""
    ts = int(time.time())
    reversed_ts = str(ts)[::-1]
    md5_hash = hashlib.md5(reversed_ts.encode()).hexdigest()
    return f"{ts},{md5_hash}"


class MovieBoxClient:
    """Authenticated MovieBoxHD API client."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": USER_AGENT,
            "Origin": SITE_ORIGIN,
            "Referer": f"{SITE_ORIGIN}/",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Client-Info": json.dumps({"timezone": "UTC"}),
            "X-Request-Lang": "en",
            "X-Vip-Restrict": "1",
            "X-No-High-Risk-Restrict": "0",
        })
        self.guest_jwt: Optional[str] = None
        self.guest_uid: Optional[int] = None

    def _ensure_auth(self) -> str:
        """Get a guest JWT by hitting /country-code (auto-issues one)."""
        if self.guest_jwt:
            return self.guest_jwt
        # First call - no Authorization, just X-Client-Token
        headers = {"X-Client-Token": make_client_token()}
        r = self.session.get(f"{API_BASE}/country-code", headers=headers, timeout=15)
        r.raise_for_status()
        # JWT is in x-user header AND in token cookie
        x_user = r.headers.get("x-user", "{}")
        try:
            self.guest_jwt = json.loads(x_user).get("token", "")
        except json.JSONDecodeError:
            self.guest_jwt = ""
        # Decode JWT payload to get uid
        if self.guest_jwt:
            try:
                payload_b64 = self.guest_jwt.split(".")[1]
                # Add padding
                payload_b64 += "=" * (-len(payload_b64) % 4)
                payload = json.loads(base64.urlsafe_b64decode(payload_b64))
                self.guest_uid = payload.get("uid")
            except Exception:
                pass
        # Update session headers with JWT
        if self.guest_jwt:
            self.session.headers["Authorization"] = f"Bearer {self.guest_jwt}"
        print(f"[auth] Guest JWT acquired (uid={self.guest_uid})", file=sys.stderr)
        return self.guest_jwt or ""

    # ---------- API methods ----------
    def home(self) -> Dict[str, Any]:
        self._ensure_auth()
        r = self.session.get(f"{API_BASE}/home", params={"host": "movieboxhd.net"}, timeout=15)
        r.raise_for_status()
        return r.json().get("data", {})

    def trending(self, page: int = 1, per_page: int = 18, tab_id: Optional[str] = None) -> List[Dict]:
        self._ensure_auth()
        params = {"page": page, "perPage": per_page}
        if tab_id:
            params["tabId"] = tab_id
        r = self.session.get(f"{API_BASE}/subject/trending", params=params, timeout=15)
        r.raise_for_status()
        return r.json().get("data", {}).get("subjectList", [])

    def filter_subjects(self, page: int = 1, per_page: int = 20, subject_type: Optional[int] = None,
                        genre: Optional[str] = None) -> Dict[str, Any]:
        self._ensure_auth()
        body: Dict[str, Any] = {"page": page, "perPage": per_page}
        if subject_type is not None:
            body["subjectType"] = subject_type
        if genre:
            body["genre"] = genre
        r = self.session.post(f"{API_BASE}/subject/filter", json=body, timeout=15)
        r.raise_for_status()
        return r.json().get("data", {})

    def search_suggest(self, keyword: str, per_page: int = 10) -> List[Dict]:
        """Search-suggest endpoint - works with anonymous token. Returns suggestion items."""
        self._ensure_auth()
        r = self.session.post(f"{API_BASE}/subject/search-suggest",
                              json={"keyword": keyword, "perPage": per_page}, timeout=15)
        r.raise_for_status()
        return r.json().get("data", {}).get("items", [])

    def detail_rec(self, subject_id: str, page: int = 1) -> Dict[str, Any]:
        """Get subject detail + recommendations."""
        self._ensure_auth()
        r = self.session.get(f"{API_BASE}/subject/detail-rec",
                             params={"subjectId": subject_id, "page": page, "perPage": 12}, timeout=15)
        r.raise_for_status()
        return r.json().get("data", {})

    def play(self, subject_id: str, se: Any = "", ep: Any = "", detail_path: str = "",
             stream_sign_type: int = 1) -> Dict[str, Any]:
        """Get stream URLs for a subject. Returns {streams, hls, dash, limited, limitedCode, ...}."""
        self._ensure_auth()
        params = {
            "subjectId": subject_id,
            "se": se,
            "ep": ep,
            "detailPath": detail_path,
            "streamSignType": stream_sign_type,
        }
        r = self.session.get(f"{API_BASE}/subject/play", params=params, timeout=15)
        r.raise_for_status()
        return r.json().get("data", {})

    def create_share(self, url: str) -> Dict[str, Any]:
        """Create a share URL. Triggers share-unlock for the creator."""
        self._ensure_auth()
        r = self.session.post(f"{API_BASE}/share", json={"url": url}, timeout=15)
        r.raise_for_status()
        return r.json().get("data", {})

    def share_unlock(self, limited_code: str) -> Dict[str, Any]:
        """Unlock VIP content using a limitedCode (from play response)."""
        self._ensure_auth()
        r = self.session.post(f"{API_BASE}/share-unlock", json={"limitedCode": limited_code}, timeout=15)
        r.raise_for_status()
        return r.json()

    def qrcode_unlock(self, limited_code: str) -> Dict[str, Any]:
        """Unlock via QR code."""
        self._ensure_auth()
        r = self.session.post(f"{API_BASE}/qrcode-unlock", json={"limitedCode": limited_code}, timeout=15)
        r.raise_for_status()
        return r.json()

    def media_player_domain(self) -> str:
        self._ensure_auth()
        r = self.session.get(f"{API_BASE}/media-player/get-domain", timeout=15)
        r.raise_for_status()
        return r.json().get("data", "")

    def vip_skus(self) -> List[Dict]:
        self._ensure_auth()
        r = self.session.get(f"{API_BASE}/vip/sku-list", timeout=15)
        r.raise_for_status()
        return r.json().get("data", {}).get("skus", [])


# ============================================================
# Share-unlock bypass
# ============================================================
def share_unlock_via_visit(client: MovieBoxClient, detail_path: str) -> Dict[str, Any]:
    """
    MovieBoxHD's share-unlock bypass:
    1. POST /share to create a share URL (v.moviebox.ph/{code}).
       This action alone unlocks content for the SHARER.
    2. Visiting the share URL redirects back to the detail page with ?share=base64({uid,ts,ip,tz}).
       That visit triggers share-unlock for the visitor.
    """
    detail_url = f"{SITE_ORIGIN}/detail/{detail_path}"
    share_data = client.create_share(detail_url)
    share_url = share_data.get("shareUrl", "")
    if not share_url:
        return {"error": "no share URL returned"}
    # Visit the share URL to trigger the redirect-based unlock
    r = client.session.get(share_url, timeout=15, allow_redirects=True)
    return {
        "share_url": share_url,
        "final_url": r.url,
        "share_data": share_data,
    }


# ============================================================
# SSR HTML scraping (trailer URLs are embedded in __NUXT_DATA__)
# ============================================================
def extract_nuxt_data(html: str) -> Optional[List[Any]]:
    """Extract the __NUXT_DATA__ JSON array from an SSR HTML page."""
    m = re.search(r'<script type="application/json"[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>',
                  html, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def extract_trailer_url(html: str) -> Optional[str]:
    """Extract trailer MP4 URL from SSR HTML."""
    m = re.search(r'https://[a-z0-9]+\.aoneroom\.com/[^"\']+\.(?:mp4|m3u8|mpd)[^"\']*', html)
    return m.group(0) if m else None


def extract_dub_subjects(html: str) -> List[Dict[str, str]]:
    """Extract available dub/subject versions from SSR HTML.

    The NUXT data array pairs dub labels with subjectId + detailPath.
    Pattern in array: [label_str, subject_id_str, detail_path_str, ...]
    """
    nuxt = extract_nuxt_data(html)
    if not nuxt:
        return []
    dubs = []
    for i, item in enumerate(nuxt):
        if isinstance(item, str) and (
            item.endswith(" dub") or item.endswith(" sub") or item == "Original Audio"
        ):
            # Next items are subjectId and detailPath
            if i + 2 < len(nuxt):
                sid = nuxt[i + 1]
                dp = nuxt[i + 2]
                if isinstance(sid, str) and isinstance(dp, str) and re.match(r"^\d{15,}$", sid):
                    dubs.append({
                        "label": item,
                        "subjectId": sid,
                        "detailPath": dp,
                    })
    return dubs


# ============================================================
# Main scraping flow
# ============================================================
def normalize_subject(s: Dict) -> Dict:
    """Extract a clean subject record from API response."""
    return {
        "subjectId": s.get("subjectId", ""),
        "subjectType": SUBJECT_TYPES.get(s.get("subjectType"), f"unknown_{s.get('subjectType')}"),
        "title": s.get("title", ""),
        "description": s.get("description", ""),
        "releaseDate": s.get("releaseDate", ""),
        "duration": s.get("duration", 0),
        "genre": s.get("genre", ""),
        "country": s.get("countryName", ""),
        "imdbRating": s.get("imdbRatingValue", ""),
        "imdbVotes": s.get("imdbRatingCount", 0),
        "subtitles": (s.get("subtitles") or "").split(",") if s.get("subtitles") else [],
        "cover": s.get("cover", {}).get("url", "") if isinstance(s.get("cover"), dict) else "",
        "detailPath": s.get("detailPath", ""),
        "hasResource": s.get("hasResource", False),
        "accessStrategy": s.get("accessStrategy"),
        "season": s.get("season", 0),
    }


def main():
    ap = argparse.ArgumentParser(description="MovieBoxHD.net scraper")
    ap.add_argument("--pages", type=int, default=2, help="How many pages of trending+filter to scrape")
    ap.add_argument("--search", type=str, default="", help="Search keyword")
    ap.add_argument("--output", type=str, default="/home/z/my-project/download/movieboxhd-catalog.json",
                    help="Output JSON path")
    ap.add_argument("--include-trailers", action="store_true",
                    help="Also fetch SSR HTML pages to extract trailer MP4 URLs")
    ap.add_argument("--try-share-unlock", action="store_true",
                    help="Attempt share-unlock bypass for VIP content")
    args = ap.parse_args()

    client = MovieBoxClient()
    catalog: List[Dict] = []
    seen_ids = set()

    # 1. Trending
    print(f"[scrape] Fetching {args.pages} pages of trending...", file=sys.stderr)
    for page in range(1, args.pages + 1):
        try:
            items = client.trending(page=page, per_page=18)
            for s in items:
                sid = s.get("subjectId")
                if sid and sid not in seen_ids:
                    catalog.append(normalize_subject(s))
                    seen_ids.add(sid)
            print(f"  page {page}: +{len(items)} (total {len(catalog)})", file=sys.stderr)
        except Exception as e:
            print(f"  page {page} error: {e}", file=sys.stderr)

    # 2. Filter by each subject type
    print(f"[scrape] Fetching filtered catalog by subject type...", file=sys.stderr)
    for st_id, st_name in SUBJECT_TYPES.items():
        try:
            data = client.filter_subjects(page=1, per_page=20, subject_type=st_id)
            items = data.get("items", [])
            for s in items:
                sid = s.get("subjectId")
                if sid and sid not in seen_ids:
                    rec = normalize_subject(s)
                    catalog.append(rec)
                    seen_ids.add(sid)
            print(f"  {st_name}: +{len(items)}", file=sys.stderr)
        except Exception as e:
            print(f"  {st_name} error: {e}", file=sys.stderr)

    # 3. Optional search
    if args.search:
        print(f"[scrape] Search-suggest: {args.search!r}", file=sys.stderr)
        try:
            items = client.search_suggest(args.search, per_page=20)
            for it in items:
                sub = it.get("subject")
                if sub and sub.get("subjectId") and sub["subjectId"] not in seen_ids:
                    catalog.append(normalize_subject(sub))
                    seen_ids.add(sub["subjectId"])
        except Exception as e:
            print(f"  search error: {e}", file=sys.stderr)

    # 4. Optional: fetch SSR pages to extract trailer URLs + dub subjects
    if args.include_trailers:
        print(f"[scrape] Fetching SSR HTML for trailer URLs + dub list...", file=sys.stderr)
        for rec in catalog[:30]:  # limit to first 30 to be polite
            dp = rec.get("detailPath")
            if not dp:
                continue
            try:
                r = client.session.get(f"{SITE_ORIGIN}/moviedetail/{dp}", timeout=15)
                html = r.text
                trailer = extract_trailer_url(html)
                if trailer:
                    rec["trailerUrl"] = trailer
                dubs = extract_dub_subjects(html)
                if dubs:
                    rec["dubs"] = dubs
                time.sleep(0.3)
            except Exception as e:
                print(f"  trailer fetch error for {dp}: {e}", file=sys.stderr)

    # 5. Optional: try share-unlock bypass for first VIP item
    if args.try_share_unlock and catalog:
        vip_item = next((c for c in catalog if c.get("accessStrategy")), None)
        if vip_item:
            print(f"[scrape] Trying share-unlock bypass for: {vip_item['title']!r}", file=sys.stderr)
            try:
                result = share_unlock_via_visit(client, vip_item["detailPath"])
                vip_item["shareUnlockAttempt"] = result
                # Now try play again
                play_data = client.play(vip_item["subjectId"], detail_path=vip_item["detailPath"])
                vip_item["playAfterUnlock"] = play_data
            except Exception as e:
                print(f"  share-unlock error: {e}", file=sys.stderr)

    # 6. Get VIP SKU info
    try:
        skus = client.vip_skus()
        cdn_domain = client.media_player_domain()
    except Exception:
        skus = []
        cdn_domain = ""

    output = {
        "scraped_at": int(time.time()),
        "source": "movieboxhd.net",
        "api_base": API_BASE,
        "media_cdn": cdn_domain,
        "total_subjects": len(catalog),
        "vip_skus": skus,
        "subjects": catalog,
    }

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\n[done] Saved {len(catalog)} subjects to {args.output}", file=sys.stderr)
    print(f"[done] CDN domain: {cdn_domain}", file=sys.stderr)
    print(f"[done] VIP SKUs: {len(skus)}", file=sys.stderr)


if __name__ == "__main__":
    main()
