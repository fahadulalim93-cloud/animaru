#!/usr/bin/env python3
"""
Gogoanime scraper with proxy rotation.

Uses the working proxies from stripe_ok_proxies.txt to scrape gogoanime.fi
with IP rotation — avoids rate limits and lets us browse more pages faster.

The proxies DON'T work for animepahe.pw (Cloudflare detects headless Chromium
+ datacenter IPs), but they work perfectly for gogoanime.fi (no anti-bot).
"""
import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus

from curl_cffi import requests as CfRequests

PROXY_FILE = "/home/z/my-project/upload/stripe_ok_proxies.txt"
GOGO = "https://gogoanime.fi"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"


def parse_proxies(path: str) -> List[Dict]:
    proxies = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line: continue
            parts = line.split("|")[0].split(":")
            if len(parts) >= 4:
                host, port = parts[0], int(parts[1])
                user, password = parts[2], ":".join(parts[3:])
                proxies.append({
                    "host": host, "port": port,
                    "user": user, "password": password,
                    "display": f"{host}:{port}",
                    "proxy_url": f"http://{user}:{password}@{host}:{port}",
                })
    return proxies


def test_proxy(proxy: Dict) -> Optional[Dict]:
    """Test if proxy works for gogoanime.fi."""
    try:
        r = CfRequests.get(
            f"{GOGO}/search.html?keyword=test",
            impersonate="chrome120",
            proxies={"http": proxy["proxy_url"], "https": proxy["proxy_url"]},
            timeout=10,
            headers={
                "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "User-Agent": UA,
            },
        )
        if r.status_code == 200 and "gogoanime" in r.text.lower():
            return proxy
    except: pass
    return None


class ProxyRotator:
    """Round-robin proxy rotator with auto-failover."""
    def __init__(self, proxies: List[Dict]):
        self.proxies = proxies
        self.idx = 0
        self.failed = set()
    
    def get_proxy(self) -> Optional[Dict]:
        """Get next working proxy."""
        for _ in range(len(self.proxies)):
            if self.idx >= len(self.proxies):
                self.idx = 0
            p = self.proxies[self.idx]
            self.idx += 1
            if p["display"] not in self.failed:
                return p
        # All failed — reset and try again
        self.failed.clear()
        return self.proxies[0] if self.proxies else None
    
    def mark_failed(self, proxy: Dict):
        self.failed.add(proxy["display"])
    
    def get_html(self, url: str, retries: int = 3) -> str:
        """Fetch HTML with proxy rotation."""
        for attempt in range(retries):
            proxy = self.get_proxy()
            if not proxy: return ""
            try:
                r = CfRequests.get(
                    url,
                    impersonate="chrome120",
                    proxies={"http": proxy["proxy_url"], "https": proxy["proxy_url"]},
                    timeout=15,
                    headers={
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Language": "en-US,en;q=0.9",
                        "User-Agent": UA,
                        "Referer": GOGO + "/",
                    },
                )
                if r.status_code == 200:
                    return r.text
                elif r.status_code in (403, 429):
                    print(f"  [proxy] {proxy['display']} got {r.status_code}, rotating", file=sys.stderr)
                    self.mark_failed(proxy)
                else:
                    return r.text
            except Exception as e:
                print(f"  [proxy] {proxy['display']} error: {str(e)[:40]}", file=sys.stderr)
                self.mark_failed(proxy)
        return ""


def search(rotator: ProxyRotator, keyword: str) -> List[Dict]:
    """Search for anime."""
    html = rotator.get_html(f"{GOGO}/search.html?keyword={quote_plus(keyword)}")
    results = []
    seen = set()
    for m in re.finditer(r'href="(https?://gogoanime\.fi/category/([^"/]+))', html):
        href, slug = m.group(1), m.group(2)
        if slug not in seen:
            title = slug.replace("-", " ").title()
            title_m = re.search(rf'href="{re.escape(href)}"[^>]*title="([^"]*)"', html)
            if title_m: title = title_m.group(1)
            results.append({
                "source": "gogoanime",
                "id": slug,
                "slug": slug,
                "title": title,
                "url": href,
            })
            seen.add(slug)
    return results


def browse_recent(rotator: ProxyRotator, page: int = 1) -> List[Dict]:
    """Browse recent releases."""
    html = rotator.get_html(f"{GOGO}/recent-release-episodes?page={page}")
    results = []
    seen = set()
    for m in re.finditer(r'href="(https?://gogoanime\.fi/([^"/]+)-episode-(\d+)-english-subbed)', html):
        url, slug, ep = m.group(1), m.group(2), int(m.group(3))
        if slug not in seen:
            results.append({
                "source": "gogoanime",
                "id": slug,
                "slug": slug,
                "title": slug.replace("-", " ").title(),
                "url": f"{GOGO}/category/{slug}/",
                "latest_episode": ep,
            })
            seen.add(slug)
    return results


def get_episodes(rotator: ProxyRotator, slug: str) -> List[Dict]:
    """Get episode list for an anime."""
    episodes = []
    seen = set()
    for endpoint in [f"/series/{slug}/", f"/category/{slug}"]:
        html = rotator.get_html(f"{GOGO}{endpoint}")
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
    episodes.sort(key=lambda e: e["episode"])
    return episodes


def get_stream_providers(rotator: ProxyRotator, episode_url: str) -> List[Dict]:
    """Get stream + download URLs from an episode page."""
    import base64
    html = rotator.get_html(episode_url)
    providers = []
    seen = set()
    
    # 1. Direct iframes
    for m in re.finditer(r'<iframe[^>]+src="(https?://[^"]+)"', html):
        url = m.group(1)
        if "gogoanime.fi" in url: continue
        if url not in seen:
            label = "Blogger" if "blogger.com" in url else ("YouTube" if "youtube" in url else "Stream")
            providers.append({"url": url, "label": label, "type": "iframe"})
            seen.add(url)
    
    # 2. Base64-encoded mirror options
    for m in re.finditer(r'<option[^>]+value="([A-Za-z0-9+/=]{50,})"', html):
        b64 = m.group(1)
        try:
            decoded = base64.b64decode(b64).decode("utf-8", errors="ignore")
            src_m = re.search(r'src="(https?://[^"]+)"', decoded)
            if src_m:
                url = src_m.group(1)
                if url not in seen:
                    label = "Blogger (Mirror)" if "blogger.com" in url else "Mirror"
                    providers.append({"url": url, "label": label, "type": "mirror"})
                    seen.add(url)
        except: pass
    
    # 3. Download links
    for m in re.finditer(r'<a[^>]+href="(https?://gofile\.io/[^"]+)"', html):
        url = m.group(1)
        if url not in seen:
            providers.append({"url": url, "label": "Download (Gofile)", "type": "download"})
            seen.add(url)
    
    return providers


def main():
    ap = argparse.ArgumentParser(description="Gogoanime scraper with proxy rotation")
    ap.add_argument("--search", help="Search for anime")
    ap.add_argument("--browse-pages", type=int, default=5, help="How many browse pages")
    ap.add_argument("--with-episodes", action="store_true")
    ap.add_argument("--with-streams", action="store_true")
    ap.add_argument("--proxy-file", default=PROXY_FILE)
    ap.add_argument("--anime-limit", type=int, default=100, help="Max anime to fetch episodes for")
    ap.add_argument("--parallel-episodes", type=int, default=5, help="Parallel episode fetchers")
    ap.add_argument("--output", default="/home/z/my-project/download/anime-gogo-proxied.json")
    args = ap.parse_args()

    # Parse + test proxies
    proxies = parse_proxies(args.proxy_file)
    print(f"[proxy] Parsed {len(proxies)} proxies, testing...", file=sys.stderr)
    working = []
    with ThreadPoolExecutor(max_workers=15) as ex:
        futures = {ex.submit(test_proxy, p): p for p in proxies}
        for fut in as_completed(futures):
            p = fut.result()
            if p:
                working.append(p)
                print(f"  ✓ {p['display']}", file=sys.stderr)
    print(f"\n  {len(working)} proxies working", file=sys.stderr)
    if not working:
        print("FATAL: No working proxies", file=sys.stderr)
        sys.exit(1)
    
    rotator = ProxyRotator(working)
    catalog: List[Dict] = []
    seen_ids = set()
    
    # Search or browse
    if args.search:
        print(f"\n[1] Search: {args.search!r}", file=sys.stderr)
        catalog = search(rotator, args.search)
        print(f"  Found {len(catalog)} anime", file=sys.stderr)
    else:
        print(f"\n[1] Browsing {args.browse_pages} pages...", file=sys.stderr)
        for pg in range(1, args.browse_pages + 1):
            items = browse_recent(rotator, pg)
            for a in items:
                if a["slug"] not in seen_ids:
                    catalog.append(a)
                    seen_ids.add(a["slug"])
            print(f"  page {pg}: +{len(items)} (total {len(catalog)})", file=sys.stderr)
    
    if not catalog:
        print("No results", file=sys.stderr)
        sys.exit(1)
    
    # Episodes (parallel)
    if args.with_episodes:
        limit = min(len(catalog), args.anime_limit)
        print(f"\n[2] Fetching episodes for {limit} anime (parallel={args.parallel_episodes})...", file=sys.stderr)
        
        def fetch_eps(anime):
            eps = get_episodes(rotator, anime["slug"])
            anime["episodes_list"] = eps
            anime["total_episodes_available"] = len(eps)
            return anime
        
        with ThreadPoolExecutor(max_workers=args.parallel_episodes) as ex:
            futures = {ex.submit(fetch_eps, a): a for a in catalog[:limit]}
            for i, fut in enumerate(as_completed(futures)):
                a = fut.result()
                print(f"  [{i+1}] {a['title'][:40]}: {a.get('total_episodes_available',0)} eps", file=sys.stderr)
    
    # Streams (parallel)
    if args.with_streams and catalog:
        stream_limit = min(len(catalog), 10)
        print(f"\n[3] Fetching stream URLs for {stream_limit} anime...", file=sys.stderr)
        
        def fetch_streams(anime):
            if not anime.get("episodes_list"): return anime
            for ep in anime["episodes_list"][:5]:
                ep["providers"] = get_stream_providers(rotator, ep["url"])
            return anime
        
        with ThreadPoolExecutor(max_workers=args.parallel_episodes) as ex:
            futures = {ex.submit(fetch_streams, a): a for a in catalog[:stream_limit]}
            for i, fut in enumerate(as_completed(futures)):
                a = fut.result()
                total_providers = sum(len(e.get("providers",[])) for e in a.get("episodes_list",[]))
                print(f"  [{i+1}] {a['title'][:40]}: {total_providers} total providers", file=sys.stderr)
    
    # Save
    output = {
        "scraped_at": int(time.time()),
        "source": "gogoanime.fi (via proxy rotation)",
        "proxies_used": len(working),
        "total_anime": len(catalog),
        "anime": catalog,
    }
    with open(args.output, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\n[done] Saved {len(catalog)} anime to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
