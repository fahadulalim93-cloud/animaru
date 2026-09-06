#!/usr/bin/env python3
"""
AnimePahe scraper with proxy rotation.

Uses the proxies from /home/z/my-project/upload/stripe_ok_proxies.txt
to bypass the Cloudflare IP block on animepahe.pw.

Proxy file format:
  host:port:username:password|exit_ip|latency|metric
  (We only use the first 4 fields, split on ':' then take first 4.)

Strategy:
  1. Test each proxy in parallel against animepahe.pw
  2. Keep the working ones in a rotation pool
  3. Use curl_cffi with Chrome impersonation + proxy for each request
  4. Auto-retry with a different proxy on failure
"""
import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus, urljoin

from curl_cffi import requests as CfRequests

PROXY_FILE = "/home/z/my-project/upload/stripe_ok_proxies.txt"
SITE = "https://animepahe.pw"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"


# ============================================================
# Proxy parsing
# ============================================================
def parse_proxies(path: str) -> List[Dict]:
    """Parse proxy file. Returns list of {host, port, user, pass, proxy_url}."""
    proxies = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # Format: host:port:user:pass|exit_ip|latency|metric
            # Split on | first, then take the first part
            proxy_part = line.split("|")[0]
            parts = proxy_part.split(":")
            if len(parts) < 4:
                # Maybe no auth: host:port
                if len(parts) == 2:
                    host, port = parts
                    user, password = "", ""
                else:
                    continue
            else:
                host, port, user, password = parts[0], parts[1], parts[2], ":".join(parts[3:])
            try:
                port_int = int(port)
            except:
                continue
            if user and password:
                proxy_url = f"http://{user}:{password}@{host}:{port_int}"
            else:
                proxy_url = f"http://{host}:{port_int}"
            proxies.append({
                "host": host, "port": port_int,
                "user": user, "password": password,
                "proxy_url": proxy_url,
                "display": f"{host}:{port_int}",
            })
    return proxies


# ============================================================
# Proxy testing
# ============================================================
def test_proxy(proxy: Dict, target_url: str = SITE + "/", timeout: int = 15) -> Tuple[Dict, bool, str]:
    """Test if a proxy can reach animepahe.pw. Returns (proxy, success, message)."""
    try:
        r = CfRequests.get(
            target_url,
            impersonate="chrome120",
            proxies={"http": proxy["proxy_url"], "https": proxy["proxy_url"]},
            timeout=timeout,
            allow_redirects=True,
        )
        if r.status_code == 200:
            # Check if it's the real animepahe page (not CF block)
            if "animepahe" in r.text.lower() and "Attention Required" not in r.text:
                # Look for /api reference to confirm real page
                if "/api" in r.text or "animepahe" in r.text.lower()[:500]:
                    return proxy, True, f"OK ({len(r.text)} bytes)"
            elif "Attention Required" in r.text or "been blocked" in r.text:
                return proxy, False, "CF blocked"
            else:
                return proxy, False, f"unexpected body: {r.text[:80]}"
        elif r.status_code == 403:
            return proxy, False, "403 CF block"
        else:
            return proxy, False, f"HTTP {r.status_code}"
    except Exception as e:
        return proxy, False, f"error: {str(e)[:80]}"


def find_working_proxies(proxies: List[Dict], max_workers: int = 10, max_test: int = 50) -> List[Dict]:
    """Test proxies in parallel, return the working ones."""
    print(f"[proxy] Testing {min(len(proxies), max_test)} proxies (max {max_workers} parallel)...", file=sys.stderr)
    working = []
    test_pool = proxies[:max_test]
    
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {ex.submit(test_proxy, p): p for p in test_pool}
        for i, fut in enumerate(as_completed(futures)):
            proxy, ok, msg = fut.result()
            tag = "✓" if ok else "✗"
            print(f"  [{i+1}/{len(test_pool)}] {tag} {proxy['display']:40s} {msg}", file=sys.stderr)
            if ok:
                working.append(proxy)
    
    print(f"\n[proxy] {len(working)}/{len(test_pool)} proxies work", file=sys.stderr)
    return working


# ============================================================
# AnimePahe client with proxy rotation
# ============================================================
class AnimePaheProxyClient:
    def __init__(self, working_proxies: List[Dict]):
        self.proxies = working_proxies
        self.proxy_idx = 0
        self.site = SITE
        self.session = CfRequests.Session()
        # Try each proxy in rotation
        self.current_proxy = None
        self._find_working_proxy()
    
    def _find_working_proxy(self) -> bool:
        """Find a working proxy for the session."""
        if not self.proxies:
            return False
        # Try each proxy until one works for the homepage
        for _ in range(len(self.proxies)):
            proxy = self.proxies[self.proxy_idx % len(self.proxies)]
            self.proxy_idx += 1
            try:
                r = self.session.get(
                    self.site + "/",
                    impersonate="chrome120",
                    proxies={"http": proxy["proxy_url"], "https": proxy["proxy_url"]},
                    timeout=20,
                    headers={"User-Agent": UA},
                )
                if r.status_code == 200 and "animepahe" in r.text.lower() and "Attention Required" not in r.text:
                    self.current_proxy = proxy
                    print(f"[pahe] Using proxy: {proxy['display']}", file=sys.stderr)
                    # Save cookies from this response
                    return True
            except: pass
        return False
    
    def _request(self, method: str, path: str, **kw) -> Optional[Any]:
        """Make a request via the current proxy. Auto-rotate on failure."""
        url = path if path.startswith("http") else f"{self.site}{path}"
        max_retries = len(self.proxies)
        
        for attempt in range(max_retries):
            if not self.current_proxy:
                if not self._find_working_proxy():
                    continue
            
            proxy = self.current_proxy
            try:
                kw.setdefault("impersonate", "chrome120")
                kw.setdefault("timeout", 20)
                kw["proxies"] = {"http": proxy["proxy_url"], "https": proxy["proxy_url"]}
                kw.setdefault("headers", {})
                kw["headers"].setdefault("User-Agent", UA)
                kw["headers"].setdefault("Referer", self.site + "/")
                
                if method == "GET":
                    r = self.session.get(url, **kw)
                else:
                    r = self.session.post(url, **kw)
                
                if r.status_code == 200:
                    return r
                elif r.status_code == 403:
                    print(f"[pahe] Proxy {proxy['display']} got 403, rotating...", file=sys.stderr)
                    self.current_proxy = None
                    time.sleep(1)
                else:
                    return r
            except Exception as e:
                print(f"[pahe] Proxy {proxy['display']} error: {str(e)[:60]}, rotating...", file=sys.stderr)
                self.current_proxy = None
                time.sleep(1)
        
        return None
    
    def search(self, keyword: str) -> List[Dict]:
        """Search for anime."""
        r = self._request("GET", f"/api?m=search&q={quote_plus(keyword)}",
                          headers={"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"})
        if not r:
            return []
        try:
            data = r.json()
        except:
            return []
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
        """Browse anime."""
        r = self._request("GET", f"/api?m=list&page={page}&l=30&sort={sort}",
                          headers={"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"})
        if not r:
            r = self._request("GET", f"/api?m=release&page={page}&l=30&sort={sort}",
                              headers={"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"})
        if not r:
            return []
        try:
            data = r.json()
        except:
            return []
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
        """Get episode list. If anime_id not provided, fetch from anime page."""
        if not anime_id:
            r = self._request("GET", f"/anime/{slug}")
            if r:
                m = re.search(r'/api\?m=release&id=(\d+)', r.text)
                if m:
                    anime_id = m.group(1)
        if not anime_id:
            return []
        r = self._request("GET", f"/api?m=release&id={anime_id}&page=1&l=30&sort=episode_asc",
                          headers={"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"})
        if not r:
            return []
        try:
            data = r.json()
        except:
            return []
        return [{
            "episode": ep.get("episode",0),
            "session": ep.get("session",""),
            "title": ep.get("title","") or f"Episode {ep.get('episode','')}",
            "url": f"{self.site}/play/{slug}/{ep.get('session','')}",
        } for ep in data.get("data",[])]
    
    def get_stream_providers(self, play_url: str) -> List[Dict]:
        """Get stream provider URLs from /play/ page."""
        r = self._request("GET", play_url)
        if not r:
            return []
        html = r.text
        providers = []
        seen = set()
        # Find kwik, lions, mp4upload, streamtape, doodstream, filemoon links
        for m in re.finditer(r'<a[^>]+href="(https?://[^"]+)"[^>]*>([^<]*)', html):
            url, label = m.group(1), m.group(2).strip()
            if any(p in url.lower() for p in ["kwik","lions","mp4upload","gdrive","streamtape","doodstream","filemoon"]):
                if url not in seen:
                    providers.append({"url": url, "label": label[:60]})
                    seen.add(url)
        # Also find download buttons
        for m in re.finditer(r'<a[^>]+href="(https?://[^"]+)"[^>]*class="[^"]*download[^"]*"', html, re.I):
            url = m.group(1)
            if url not in seen:
                providers.append({"url": url, "label": "Download"})
                seen.add(url)
        return providers


# ============================================================
# Main
# ============================================================
def main():
    ap = argparse.ArgumentParser(description="AnimePahe scraper with proxy rotation")
    ap.add_argument("--search", help="Search for anime")
    ap.add_argument("--browse-pages", type=int, default=3)
    ap.add_argument("--with-episodes", action="store_true")
    ap.add_argument("--with-streams", action="store_true")
    ap.add_argument("--proxy-file", default=PROXY_FILE)
    ap.add_argument("--max-proxies-test", type=int, default=50, help="How many proxies to test")
    ap.add_argument("--output", default="/home/z/my-project/download/animepahe-proxied.json")
    args = ap.parse_args()

    # Step 1: Parse + test proxies
    if not os.path.exists(args.proxy_file):
        print(f"FATAL: proxy file not found: {args.proxy_file}", file=sys.stderr)
        sys.exit(1)
    
    proxies = parse_proxies(args.proxy_file)
    print(f"[proxy] Parsed {len(proxies)} proxies from {args.proxy_file}", file=sys.stderr)
    
    working = find_working_proxies(proxies, max_workers=10, max_test=args.max_proxies_test)
    if not working:
        print("\nFATAL: No working proxies for animepahe.pw", file=sys.stderr)
        sys.exit(1)
    
    # Save working proxies for reuse
    with open("/home/z/my-project/download/animepahe-working-proxies.txt", "w") as f:
        for p in working:
            f.write(f"{p['host']}:{p['port']}:{p['user']}:{p['password']}\n")
    print(f"[proxy] Saved {len(working)} working proxies to animepahe-working-proxies.txt", file=sys.stderr)
    
    # Step 2: Initialize client
    client = AnimePaheProxyClient(working)
    if not client.current_proxy:
        print("FATAL: Could not establish session via any proxy", file=sys.stderr)
        sys.exit(1)
    
    # Step 3: Search or browse
    catalog: List[Dict] = []
    seen_ids = set()
    
    if args.search:
        print(f"\n[pahe] Search: {args.search!r}", file=sys.stderr)
        catalog = client.search(args.search)
        print(f"  Found {len(catalog)} results", file=sys.stderr)
        for a in catalog[:5]:
            print(f"    {a['title']} ({a.get('type','?')}) - {a.get('episodes','?')} eps", file=sys.stderr)
    else:
        print(f"\n[pahe] Browsing {args.browse_pages} pages...", file=sys.stderr)
        for sort in ["recent", "popularity"]:
            for pg in range(1, args.browse_pages + 1):
                items = client.browse(pg, sort=sort)
                for a in items:
                    if a["id"] not in seen_ids:
                        catalog.append(a)
                        seen_ids.add(a["id"])
                print(f"  sort={sort} page={pg}: +{len(items)} (total {len(catalog)})", file=sys.stderr)
                time.sleep(2)
    
    if not catalog:
        print("\nNo results. Try a different proxy or search term.", file=sys.stderr)
        sys.exit(1)
    
    # Step 4: Episodes
    if args.with_episodes:
        limit = min(len(catalog), 50)
        print(f"\n[pahe] Fetching episodes for {limit} anime...", file=sys.stderr)
        for i, anime in enumerate(catalog[:limit]):
            try:
                eps = client.get_episodes(anime["slug"], anime.get("id",""))
                anime["episodes_list"] = eps
                anime["total_episodes_available"] = len(eps)
                print(f"  [{i+1}] {anime['title'][:40]}: {len(eps)} eps", file=sys.stderr)
                time.sleep(1.5)
            except Exception as e:
                print(f"  [{i+1}] error: {e}", file=sys.stderr)
    
    # Step 5: Streams
    if args.with_streams and catalog:
        stream_limit = min(len(catalog), 5)
        print(f"\n[pahe] Fetching stream URLs for {stream_limit} anime (3 eps each)...", file=sys.stderr)
        for anime in catalog[:stream_limit]:
            if not anime.get("episodes_list"):
                continue
            for ep in anime["episodes_list"][:3]:
                try:
                    providers = client.get_stream_providers(ep["url"])
                    ep["providers"] = providers
                    print(f"  {anime['title'][:30]} E{ep['episode']}: {len(providers)} providers", file=sys.stderr)
                    time.sleep(2)
                except Exception as e:
                    print(f"  stream error: {e}", file=sys.stderr)
    
    # Save
    output = {
        "scraped_at": int(time.time()),
        "source": "animepahe.pw (via proxy)",
        "total_anime": len(catalog),
        "proxy_used": client.current_proxy["display"] if client.current_proxy else None,
        "working_proxies_count": len(working),
        "anime": catalog,
    }
    with open(args.output, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\n[done] Saved {len(catalog)} anime to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
