#!/usr/bin/env python3
"""
AnimePahe scraper — Playwright + proxy rotation.

The proxies in stripe_ok_proxies.txt are datacenter IPs. Cloudflare
returns 403 to direct curl_cffi requests because they can't run JS.
But Playwright CAN execute the Cloudflare JS challenge through the proxy,
which gives us a cf_clearance cookie that unlocks the site.

Strategy:
  1. For each proxy, launch a Playwright browser configured to route through it
  2. Navigate to animepahe.pw — Cloudflare will issue a JS challenge
  3. Wait for the challenge to complete (real browser JS execution)
  4. Once we have cf_clearance cookie + the page loads, use that browser context
     for all subsequent API calls (page.request.get preserves cookies + TLS)
"""
import argparse
import json
import os
import re
import sys
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus

from curl_cffi import requests as CfRequests
from playwright.sync_api import sync_playwright

PROXY_FILE = "/home/z/my-project/upload/stripe_ok_proxies.txt"
SITE = "https://animepahe.pw"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"


def parse_proxies(path: str) -> List[Dict]:
    """Parse proxy file. Returns list of {host, port, user, pass}."""
    proxies = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            proxy_part = line.split("|")[0]
            parts = proxy_part.split(":")
            if len(parts) < 4:
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
            proxies.append({
                "host": host, "port": port_int,
                "user": user, "password": password,
                "display": f"{host}:{port_int}",
            })
    return proxies


def try_proxy_with_playwright(playwright, proxy: Dict, timeout: int = 60) -> Tuple[Optional[Any], Optional[Any], str]:
    """
    Try to load animepahe.pw through this proxy using Playwright.
    Returns (page, context, status_message).
    """
    launch_args = [
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--disable-features=IsolateOrigins,site-per-process",
    ]
    
    browser_proxy = {"server": f"http://{proxy['host']}:{proxy['port']}"}
    if proxy.get("user") and proxy.get("password"):
        browser_proxy["username"] = proxy["user"]
        browser_proxy["password"] = proxy["password"]
    
    try:
        browser = playwright.chromium.launch(headless=True, args=launch_args)
    except Exception as e:
        return None, None, f"browser launch failed: {str(e)[:60]}"
    
    try:
        context = browser.new_context(
            user_agent=UA,
            viewport={"width": 1366, "height": 900},
            locale="en-US",
            proxy=browser_proxy,
            extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
        )
        # Stealth
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
            Object.defineProperty(navigator, 'platform', {get: () => 'Win32'});
            window.chrome = {runtime: {}};
        """)
        page = context.new_page()
        
        # Navigate with shorter timeout — if proxy is dead, fail fast
        try:
            page.goto(SITE, wait_until="domcontentloaded", timeout=25000)
        except Exception as e:
            browser.close()
            return None, None, f"goto failed: {str(e)[:60]}"
        
        # Wait for CF challenge
        deadline = time.time() + timeout
        while time.time() < deadline:
            title = page.title()
            content = page.content()
            
            # Check for hard block
            if "been blocked" in content and "cf-error" in content:
                browser.close()
                return None, None, "CF hard block (IP blocked)"
            
            # Check if we're through
            if ("Just a moment" not in title and
                "cf-browser-verification" not in content and
                "challenge-platform" not in content and
                title and "animepahe" in (title + content).lower()):
                # Verify we can see /api references
                if "/api" in content or "animepahe" in title.lower():
                    return page, context, f"OK (title: {title[:40]})"
            
            time.sleep(2)
        
        # Timeout
        title = page.title()
        browser.close()
        return None, None, f"timeout (last title: {title[:40]})"
    except Exception as e:
        try: browser.close()
        except: pass
        return None, None, f"error: {str(e)[:60]}"


def main():
    ap = argparse.ArgumentParser(description="AnimePahe scraper — Playwright + proxy")
    ap.add_argument("--search", help="Search for anime")
    ap.add_argument("--browse-pages", type=int, default=2)
    ap.add_argument("--with-episodes", action="store_true")
    ap.add_argument("--with-streams", action="store_true")
    ap.add_argument("--proxy-file", default=PROXY_FILE)
    ap.add_argument("--max-proxies-try", type=int, default=15, help="How many proxies to try")
    ap.add_argument("--output", default="/home/z/my-project/download/animepahe-proxied.json")
    args = ap.parse_args()

    # Parse proxies
    if not os.path.exists(args.proxy_file):
        print(f"FATAL: proxy file not found: {args.proxy_file}", file=sys.stderr)
        sys.exit(1)
    
    proxies = parse_proxies(args.proxy_file)
    print(f"[proxy] Parsed {len(proxies)} proxies", file=sys.stderr)
    
    catalog: List[Dict] = []
    seen_ids = set()
    page = None
    context = None
    working_proxy = None
    
    with sync_playwright() as p:
        # Step 1: Find a working proxy via Playwright
        print(f"\n[1] Trying {min(len(proxies), args.max_proxies_try)} proxies via Playwright...", file=sys.stderr)
        for i, proxy in enumerate(proxies[:args.max_proxies_try]):
            print(f"  [{i+1}/{min(len(proxies), args.max_proxies_try)}] {proxy['display']:40s} ...", file=sys.stderr, end=" ", flush=True)
            page, context, msg = try_proxy_with_playwright(p, proxy, timeout=45)
            if page:
                print(f"✓ {msg}", file=sys.stderr)
                working_proxy = proxy
                break
            else:
                print(f"✗ {msg}", file=sys.stderr)
        
        if not page or not working_proxy:
            print("\nFATAL: No proxy could bypass Cloudflare via Playwright.", file=sys.stderr)
            print("All proxies are datacenter IPs that Cloudflare hard-blocks.", file=sys.stderr)
            sys.exit(1)
        
        print(f"\n[2] ✓ Using proxy: {working_proxy['display']}", file=sys.stderr)
        time.sleep(2)
        
        # Helper: fetch JSON via page.request (preserves cookies + TLS)
        def fetch_json(url: str) -> Optional[Dict]:
            try:
                r = page.request.get(url, headers={
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": SITE + "/",
                })
                if r.status != 200:
                    print(f"  HTTP {r.status}: {url[:100]}", file=sys.stderr)
                    return None
                try:
                    return r.json()
                except:
                    body = r.text()
                    # Maybe CF re-challenged
                    if "Attention Required" in body or "Just a moment" in body:
                        print(f"  CF re-challenge detected, waiting...", file=sys.stderr)
                        time.sleep(10)
                        r = page.request.get(url, headers={
                            "Accept": "application/json",
                            "X-Requested-With": "XMLHttpRequest",
                            "Referer": SITE + "/",
                        })
                        try: return r.json()
                        except: return None
                    print(f"  Not JSON: {body[:200]}", file=sys.stderr)
                    return None
            except Exception as e:
                print(f"  fetch error: {e}", file=sys.stderr)
                return None
        
        def fetch_html(url: str) -> str:
            try:
                return page.request.get(url, headers={"Referer": SITE + "/"}).text()
            except Exception as e:
                print(f"  fetch_html error: {e}", file=sys.stderr)
                return ""
        
        # Step 2: Search or browse
        if args.search:
            print(f"\n[3] Searching: {args.search!r}", file=sys.stderr)
            data = fetch_json(f"{SITE}/api?m=search&q={quote_plus(args.search)}")
            if data:
                for a in data.get("data", []):
                    sid = str(a.get("id",""))
                    if sid and sid not in seen_ids:
                        catalog.append({
                            "source": "animepahe",
                            "id": sid,
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
                            "url": f"{SITE}/anime/{a.get('session','')}",
                        })
                        seen_ids.add(sid)
                print(f"  Found {len(catalog)} anime", file=sys.stderr)
                for a in catalog[:5]:
                    print(f"    {a['title']} ({a.get('type','?')}) - {a.get('episodes','?')} eps", file=sys.stderr)
        else:
            print(f"\n[3] Browsing {args.browse_pages} pages...", file=sys.stderr)
            for sort in ["recent", "popularity"]:
                for pg in range(1, args.browse_pages + 1):
                    data = fetch_json(f"{SITE}/api?m=list&page={pg}&l=30&sort={sort}")
                    if not data:
                        data = fetch_json(f"{SITE}/api?m=release&page={pg}&l=30&sort={sort}")
                    if data:
                        items = data.get("data", [])
                        for a in items:
                            sid = str(a.get("id",""))
                            if sid and sid not in seen_ids:
                                catalog.append({
                                    "source": "animepahe",
                                    "id": sid,
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
                                    "url": f"{SITE}/anime/{a.get('session','')}",
                                })
                                seen_ids.add(sid)
                        print(f"  sort={sort} page={pg}: +{len(items)} (total {len(catalog)})", file=sys.stderr)
                    time.sleep(2)
        
        if not catalog:
            print("\nNo results.", file=sys.stderr)
            browser = context.browser
            if browser: browser.close()
            sys.exit(1)
        
        # Step 4: Episodes
        if args.with_episodes:
            limit = min(len(catalog), 30)
            print(f"\n[4] Fetching episodes for {limit} anime...", file=sys.stderr)
            for i, anime in enumerate(catalog[:limit]):
                try:
                    # Get anime page to find internal ID
                    html = fetch_html(f"{SITE}/anime/{anime['slug']}")
                    anime_id = anime.get("id","")
                    m = re.search(r'/api\?m=release&id=(\d+)', html)
                    if m:
                        anime_id = m.group(1)
                    # Get episodes
                    ep_data = fetch_json(f"{SITE}/api?m=release&id={anime_id}&page=1&l=30&sort=episode_asc")
                    if ep_data:
                        eps = ep_data.get("data", [])
                        anime["episodes_list"] = [{
                            "episode": ep.get("episode",0),
                            "session": ep.get("session",""),
                            "title": ep.get("title","") or f"Episode {ep.get('episode','')}",
                            "url": f"{SITE}/play/{anime['slug']}/{ep.get('session','')}",
                        } for ep in eps]
                        anime["total_episodes_available"] = ep_data.get("total", len(eps))
                        print(f"  [{i+1}] {anime['title'][:40]}: {len(eps)} eps", file=sys.stderr)
                    time.sleep(1.5)
                except Exception as e:
                    print(f"  [{i+1}] error: {e}", file=sys.stderr)
        
        # Step 5: Stream providers
        if args.with_streams and catalog:
            stream_limit = min(len(catalog), 5)
            print(f"\n[5] Fetching stream URLs for {stream_limit} anime...", file=sys.stderr)
            for anime in catalog[:stream_limit]:
                if not anime.get("episodes_list"):
                    continue
                for ep in anime["episodes_list"][:3]:
                    try:
                        html = fetch_html(ep["url"])
                        providers = []
                        seen = set()
                        for m in re.finditer(r'<a[^>]+href="(https?://[^"]+)"[^>]*>([^<]*)', html):
                            url, label = m.group(1), m.group(2).strip()
                            if any(p in url.lower() for p in ["kwik","lions","mp4upload","gdrive","streamtape","doodstream","filemoon"]):
                                if url not in seen:
                                    providers.append({"url": url, "label": label[:60]})
                                    seen.add(url)
                        ep["providers"] = providers
                        print(f"  {anime['title'][:30]} E{ep['episode']}: {len(providers)} providers", file=sys.stderr)
                        time.sleep(2)
                    except Exception as e:
                        print(f"  stream error: {e}", file=sys.stderr)
        
        browser = context.browser
        if browser: browser.close()
    
    # Save
    output = {
        "scraped_at": int(time.time()),
        "source": "animepahe.pw",
        "via_proxy": working_proxy["display"] if working_proxy else None,
        "total_anime": len(catalog),
        "anime": catalog,
    }
    with open(args.output, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\n[done] Saved {len(catalog)} anime to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
