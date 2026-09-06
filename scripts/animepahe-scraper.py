#!/usr/bin/env python3
"""
AnimePahe + Gogoanime full scraper.

Primary target: animepahe.pw (Cloudflare-blocked from datacenter IPs — uses .cc mirror)
Working fallback: gogoanime.fi (no anti-bot, direct HTML scraping)

Extracts:
  - Anime catalog (search or browse)
  - Episode lists
  - Stream provider URLs (kwik, streamtape, mp4upload, etc.)

Usage:
    python3 animepahe-scraper.py --search "one piece" --with-episodes --with-streams
    python3 animepahe-scraper.py --browse-pages 3 --with-episodes
    python3 animepahe-scraper.py --source gogoanime --search "naruto"
"""
import argparse
import json
import re
import sys
import time
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus, urljoin

from curl_cffi import requests as CfRequests

# ============================================================
# Config
# ============================================================
ANIMEPAHE_SITES = ["https://animepahe.pw", "https://animepahe.cc"]
GOGOANIME_SITE = "https://gogoanime.fi"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"


# ============================================================
# Gogoanime scraper (working — no anti-bot)
# ============================================================
class GogoAnimeClient:
    def __init__(self):
        self.session = CfRequests.Session()
        self.site = GOGOANIME_SITE

    def _get(self, path: str, **kw) -> str:
        url = path if path.startswith("http") else f"{self.site}{path}"
        r = self.session.get(url, impersonate="chrome120", timeout=20,
                              headers={"Referer": self.site + "/", "User-Agent": UA, **kw.pop("headers", {})},
                              **kw)
        return r.text

    def search(self, keyword: str) -> List[Dict]:
        """Search for anime. Returns list of {slug, title, url}."""
        html = self._get(f"/search.html?keyword={quote_plus(keyword)}")
        results = []
        seen = set()
        # gogoanime.fi uses absolute URLs: href="https://gogoanime.fi/category/slug"
        # Find all category links
        for m in re.finditer(r'href="(https?://gogoanime\.fi/category/([^"/]+))', html):
            href, slug = m.group(1), m.group(2)
            if slug not in seen:
                # Find title from the link's title attr or inner text
                title = slug.replace("-", " ").title()
                title_m = re.search(rf'href="{re.escape(href)}"[^>]*title="([^"]*)"', html)
                if title_m:
                    title = title_m.group(1)
                results.append({
                    "source": "gogoanime",
                    "id": slug,
                    "slug": slug,
                    "title": title,
                    "url": href,
                })
                seen.add(slug)
        return results

    def browse_recent(self, page: int = 1) -> List[Dict]:
        """Browse recent releases."""
        html = self._get(f"/recent-release-episodes?page={page}")
        results = []
        seen = set()
        # gogoanime.fi uses absolute URLs
        for m in re.finditer(r'href="(https?://gogoanime\.fi/[^"/]+-episode-(\d+)-english-subbed/?)"[^>]*title="([^"]*)"', html):
            url, ep, title = m.group(1), m.group(2), m.group(3)
            # Extract slug from URL: /one-piece-episode-1177-english-subbed -> one-piece
            slug_m = re.match(r'https?://gogoanime\.fi/(.+)-episode-\d+', url)
            slug = slug_m.group(1) if slug_m else "unknown"
            if slug not in seen:
                results.append({
                    "source": "gogoanime",
                    "id": slug,
                    "slug": slug,
                    "title": title or slug.replace("-"," ").title(),
                    "url": f"{self.site}/category/{slug}/",
                    "latest_episode": int(ep),
                })
                seen.add(slug)
        return results

    def get_episodes(self, slug: str) -> List[Dict]:
        """Get episode list. Combines /category/ (recent eps) + /series/ (all eps)."""
        episodes = []
        seen = set()
        # /series/ endpoint has the full episode list
        for endpoint in [f"/series/{slug}/", f"/category/{slug}"]:
            try:
                html = self._get(endpoint)
                for m in re.finditer(r'<a[^>]+href="(https?://gogoanime\.fi/[^"]*-episode-(\d+)[^"]*)"[^>]*title="([^"]*)"', html):
                    url, num, title = m.group(1), int(m.group(2)), m.group(3)
                    if num not in seen:
                        episodes.append({
                            "episode": num,
                            "session": str(num),
                            "title": title,
                            "url": url,
                        })
                        seen.add(num)
            except: pass
        episodes.sort(key=lambda e: e["episode"])
        return episodes

    def get_stream_providers(self, episode_url: str) -> List[Dict]:
        """Get stream + download URLs from an episode page.

        gogoanime.fi structure:
          - <iframe src="https://www.blogger.com/video.g?token=..."> main stream
          - <option value="base64(iframe_html)"> mirror servers
          - <a href="https://gofile.io/d/..."> download link
        """
        import base64
        html = self._get(episode_url)
        providers = []
        seen = set()

        # 1. Find direct iframe (main stream)
        for m in re.finditer(r'<iframe[^>]+src="(https?://[^"]+)"', html):
            url = m.group(1)
            if "gogoanime.fi" in url: continue
            if url not in seen:
                if "blogger.com" in url:
                    label = "Blogger"
                elif "youtube" in url:
                    label = "YouTube"
                else:
                    label = "Stream"
                providers.append({"url": url, "label": label, "type": "iframe"})
                seen.add(url)

        # 2. Find mirror dropdown options (base64-encoded iframe HTML)
        for m in re.finditer(r'<option[^>]+value="([A-Za-z0-9+/=]{50,})"', html):
            b64 = m.group(1)
            try:
                decoded = base64.b64decode(b64).decode("utf-8", errors="ignore")
                src_m = re.search(r'src="(https?://[^"]+)"', decoded)
                if src_m:
                    url = src_m.group(1)
                    if url not in seen:
                        if "blogger.com" in url:
                            label = "Blogger (Mirror)"
                        else:
                            label = "Mirror"
                        providers.append({"url": url, "label": label, "type": "mirror"})
                        seen.add(url)
            except: pass

        # 3. Find download links (usually gofile.io)
        for m in re.finditer(r'<a[^>]+href="(https?://gofile\.io/[^"]+)"', html):
            url = m.group(1)
            if url not in seen:
                providers.append({"url": url, "label": "Download (Gofile)", "type": "download"})
                seen.add(url)
        # Generic download link search
        for m in re.finditer(r'<a[^>]+href="(https?://[^"]+)"[^>]*target="_blank"[^>]*>[^<]*<[^>]*>[^<]*<span[^>]*>Download</span>', html):
            url = m.group(1)
            if url not in seen:
                providers.append({"url": url, "label": "Download", "type": "download"})
                seen.add(url)

        return providers


# ============================================================
# AnimePahe scraper (needs non-blocked IP)
# ============================================================
class AnimePaheClient:
    def __init__(self):
        self.session = CfRequests.Session()
        self.site = None
        # Find working domain
        for s in ANIMEPAHE_SITES:
            try:
                r = self.session.get(s + "/", impersonate="chrome120", timeout=10)
                if r.status_code == 200 and "animepahe" in r.text.lower() and "Attention Required" not in r.text:
                    self.site = s
                    break
                elif r.status_code == 200 and "Joken" in r.text:
                    # Need to solve Joken challenge — try following the redirect
                    self.site = s
                    break
            except: pass

    def _get(self, path: str, **kw) -> str:
        url = path if path.startswith("http") else f"{self.site}{path}"
        r = self.session.get(url, impersonate="chrome120", timeout=15,
                              headers={"Referer": self.site + "/", "User-Agent": UA, **kw.pop("headers", {})},
                              **kw)
        return r.text

    def _get_json(self, path: str) -> Optional[Dict]:
        url = path if path.startswith("http") else f"{self.site}{path}"
        r = self.session.get(url, impersonate="chrome120", timeout=15,
                              headers={"Referer": self.site + "/", "X-Requested-With": "XMLHttpRequest", "Accept": "application/json"})
        if r.status_code != 200: return None
        try: return r.json()
        except: return None

    def search(self, keyword: str) -> List[Dict]:
        data = self._get_json(f"/api?m=search&q={quote_plus(keyword)}")
        if not data: return []
        results = []
        for a in data.get("data", []):
            results.append({
                "source": "animepahe",
                "id": str(a.get("id","")),
                "slug": a.get("session","") or a.get("slug",""),
                "title": a.get("title",""),
                "type": a.get("type",""),
                "episodes": a.get("episodes",0),
                "status": a.get("status",""),
                "season": a.get("season",""),
                "year": a.get("year",""),
                "score": a.get("score",0),
                "poster": a.get("poster",""),
                "synopsis": (a.get("synopsis") or "")[:500],
                "url": f"{self.site}/anime/{a.get('session','')}",
            })
        return results

    def browse(self, page: int = 1, sort: str = "recent") -> List[Dict]:
        data = self._get_json(f"/api?m=list&page={page}&l=30&sort={sort}")
        if not data:
            data = self._get_json(f"/api?m=release&page={page}&l=30&sort={sort}")
        if not data: return []
        results = []
        for a in data.get("data", []):
            results.append({
                "source": "animepahe",
                "id": str(a.get("id","")),
                "slug": a.get("session","") or a.get("slug",""),
                "title": a.get("title",""),
                "type": a.get("type",""),
                "episodes": a.get("episodes",0),
                "status": a.get("status",""),
                "season": a.get("season",""),
                "year": a.get("year",""),
                "score": a.get("score",0),
                "poster": a.get("poster",""),
                "synopsis": (a.get("synopsis") or "")[:500],
                "url": f"{self.site}/anime/{a.get('session','')}",
            })
        return results

    def get_episodes(self, slug: str, anime_id: str = "") -> List[Dict]:
        if not anime_id:
            html = self._get(f"/anime/{slug}")
            m = re.search(r'/api\?m=release&id=(\d+)', html)
            anime_id = m.group(1) if m else ""
        if not anime_id: return []
        data = self._get_json(f"/api?m=release&id={anime_id}&page=1&l=30&sort=episode_asc")
        if not data: return []
        return [{
            "episode": ep.get("episode",0),
            "session": ep.get("session",""),
            "title": ep.get("title","") or f"Episode {ep.get('episode','')}",
            "url": f"{self.site}/play/{slug}/{ep.get('session','')}",
        } for ep in data.get("data",[])]

    def get_stream_providers(self, play_url: str) -> List[Dict]:
        html = self._get(play_url)
        providers = []
        for m in re.finditer(r'<a[^>]+href="(https?://[^"]+)"[^>]*>([^<]*)', html):
            url, label = m.group(1), m.group(2).strip()
            if any(p in url.lower() for p in ["kwik","lions","mp4upload","gdrive","streamtape","doodstream","filemoon"]):
                providers.append({"url": url, "label": label[:60]})
        return providers


# ============================================================
# Main
# ============================================================
def main():
    ap = argparse.ArgumentParser(description="Anime scraper (animepahe + gogoanime)")
    ap.add_argument("--search", help="Search for anime")
    ap.add_argument("--browse-pages", type=int, default=3)
    ap.add_argument("--with-episodes", action="store_true")
    ap.add_argument("--with-streams", action="store_true")
    ap.add_argument("--source", choices=["auto","animepahe","gogoanime"], default="auto")
    ap.add_argument("--output", default="/home/z/my-project/download/anime-catalog.json")
    ap.add_argument("--anime-limit", type=int, default=50, help="Max anime to fetch episodes for")
    args = ap.parse_args()

    catalog: List[Dict] = []
    actual_source = None

    # Try sources in order
    sources = ["animepahe", "gogoanime"] if args.source == "auto" else [args.source]
    for src in sources:
        print(f"\n{'='*60}\n[{src}] Initializing...\n{'='*60}", file=sys.stderr)
        if src == "animepahe":
            client = AnimePaheClient()
            if not client.site:
                print("[animepahe] ✗ All animepahe domains blocked/unavailable from this IP", file=sys.stderr)
                continue
            print(f"[animepahe] Using {client.site}", file=sys.stderr)
        else:
            client = GogoAnimeClient()
            print(f"[gogoanime] Using {client.site}", file=sys.stderr)

        # Search or browse
        if args.search:
            print(f"[{src}] Search: {args.search!r}", file=sys.stderr)
            catalog = client.search(args.search)
        else:
            print(f"[{src}] Browsing {args.browse_pages} pages...", file=sys.stderr)
            for pg in range(1, args.browse_pages + 1):
                items = client.browse_recent(pg) if hasattr(client, "browse_recent") else client.browse(pg)
                catalog.extend(items)
                print(f"  page {pg}: +{len(items)} (total {len(catalog)})", file=sys.stderr)
                time.sleep(1)
            # Dedupe
            seen = set()
            deduped = []
            for a in catalog:
                if a["slug"] not in seen:
                    deduped.append(a)
                    seen.add(a["slug"])
            catalog = deduped

        if not catalog:
            print(f"[{src}] ✗ No results, trying next source", file=sys.stderr)
            continue

        print(f"[{src}] ✓ Got {len(catalog)} anime", file=sys.stderr)
        actual_source = src

        # Episodes
        if args.with_episodes:
            limit = min(len(catalog), args.anime_limit)
            print(f"\n[{src}] Fetching episodes for {limit} anime...", file=sys.stderr)
            for i, anime in enumerate(catalog[:limit]):
                try:
                    # Gogoanime: get_episodes(slug), AnimePahe: get_episodes(slug, anime_id)
                    if src == "animepahe":
                        eps = client.get_episodes(anime["slug"], anime.get("id",""))
                    else:
                        eps = client.get_episodes(anime["slug"])
                    anime["episodes_list"] = eps
                    anime["total_episodes_available"] = len(eps)
                    print(f"  [{i+1}] {anime['title'][:40]}: {len(eps)} eps", file=sys.stderr)
                    time.sleep(0.8)
                except Exception as e:
                    print(f"  [{i+1}] error: {e}", file=sys.stderr)

        # Streams
        if args.with_streams and catalog:
            stream_limit = min(len(catalog), 5)
            print(f"\n[{src}] Fetching stream URLs for {stream_limit} anime (3 eps each)...", file=sys.stderr)
            for anime in catalog[:stream_limit]:
                if not anime.get("episodes_list"): continue
                for ep in anime["episodes_list"][:3]:
                    try:
                        providers = client.get_stream_providers(ep["url"])
                        ep["providers"] = providers
                        print(f"  {anime['title'][:30]} E{ep['episode']}: {len(providers)} providers", file=sys.stderr)
                        time.sleep(1)
                    except Exception as e:
                        print(f"  stream error: {e}", file=sys.stderr)

        break  # Success — don't try next source

    if not catalog:
        print("\nFATAL: All sources failed.", file=sys.stderr)
        sys.exit(1)

    # Save
    output = {
        "scraped_at": int(time.time()),
        "source": actual_source,
        "total_anime": len(catalog),
        "anime": catalog,
    }
    with open(args.output, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\n[done] Saved {len(catalog)} anime to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
