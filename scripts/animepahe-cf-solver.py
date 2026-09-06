#!/usr/bin/env python3
"""
AnimePahe scraper — proxy + Playwright with extended CF challenge wait.

KEY FINDING: The datacenter proxies get "Just a moment..." (JS challenge)
from Cloudflare, NOT a hard block. This means the proxies CAN reach
animepahe.pw — they just need a real browser to solve the JS challenge.

Strategy:
  1. Use a working proxy (tested against gogoanime.fi first)
  2. Launch Playwright through the proxy
  3. Navigate to animepahe.pw — get "Just a moment..." challenge
  4. Wait UP TO 3 MINUTES for the JS challenge to auto-solve
  5. Once solved, use the browser context for API calls
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


def test_proxy_speed(proxy: Dict) -> Tuple[bool, str]:
    """Quick test: can this proxy reach gogoanime.fi? (proves proxy works)"""
    try:
        r = CfRequests.get(
            "https://gogoanime.fi/search.html?keyword=test",
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
            return True, "OK"
        return False, f"HTTP {r.status_code}"
    except Exception as e:
        return False, str(e)[:40]


def solve_cf_with_playwright(playwright, proxy: Dict, cf_wait: int = 180) -> Tuple[Optional[Any], Optional[Any], str]:
    """
    Try to solve Cloudflare's JS challenge through the proxy.
    Wait up to cf_wait seconds for the challenge to auto-complete.
    """
    browser_proxy = {"server": f"http://{proxy['host']}:{proxy['port']}"}
    if proxy.get("user"):
        browser_proxy["username"] = proxy["user"]
        browser_proxy["password"] = proxy["password"]
    
    try:
        browser = playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-first-run",
                "--no-default-browser-check",
                "--start-maximized",
            ],
        )
    except Exception as e:
        return None, None, f"launch failed: {str(e)[:50]}"
    
    try:
        context = browser.new_context(
            user_agent=UA,
            viewport={"width": 1920, "height": 1080},
            locale="en-US",
            timezone_id="America/Los_Angeles",
            proxy=browser_proxy,
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "sec-ch-ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
            },
        )
        # Full stealth
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
            Object.defineProperty(navigator, 'platform', {get: () => 'Win32'});
            Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 8});
            Object.defineProperty(navigator, 'deviceMemory', {get: () => 8});
            window.chrome = {runtime: {}, app: {isInstalled: false}, csi: ()=>{}, loadTimes: ()=>{}};
            const origQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (p) => p.name === 'notifications' ?
                Promise.resolve({state: Notification.permission}) : origQuery(p);
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) return 'Intel Inc.';
                if (parameter === 37446) return 'Intel Iris OpenGL Engine';
                return getParameter.call(this, parameter);
            };
        """)
        page = context.new_page()
        
        try:
            page.goto(SITE, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            browser.close()
            return None, None, f"goto: {str(e)[:50]}"
        
        # Wait for CF challenge to auto-solve
        deadline = time.time() + cf_wait
        last_title = ""
        checks = 0
        while time.time() < deadline:
            checks += 1
            try:
                title = page.title()
                content = page.content()
                last_title = title
                
                # Hard block (not solvable)
                if "been blocked" in content and "cf-error" in content:
                    browser.close()
                    return None, None, "CF hard block"
                
                # Success! Challenge solved
                if ("Just a moment" not in title and
                    "Checking your browser" not in title and
                    "challenge-platform" not in content and
                    "cf-browser-verification" not in content):
                    if "/api" in content or "animepahe" in (title + content).lower():
                        return page, context, f"solved in {checks*3}s (title: {title[:30]})"
                
                # Check cookies for cf_clearance
                cookies = context.cookies()
                for c in cookies:
                    if c["name"] == "cf_clearance":
                        # Got clearance cookie! Try reloading
                        page.reload(wait_until="domcontentloaded", timeout=15000)
                        time.sleep(3)
                        title2 = page.title()
                        if "Just a moment" not in title2:
                            return page, context, f"cf_clearance obtained (title: {title2[:30]})"
                
                time.sleep(3)
            except Exception as e:
                # Context might be destroyed by CF
                if "Execution context was destroyed" in str(e):
                    # Try to recover by reloading
                    try:
                        page.reload(wait_until="domcontentloaded", timeout=15000)
                        time.sleep(5)
                    except:
                        browser.close()
                        return None, None, f"context destroyed (last: {last_title[:30]})"
                else:
                    time.sleep(3)
        
        browser.close()
        return None, None, f"timeout {cf_wait}s (last: {last_title[:30]})"
    except Exception as e:
        try: browser.close()
        except: pass
        return None, None, f"error: {str(e)[:50]}"


def main():
    ap = argparse.ArgumentParser(description="AnimePahe — proxy + Playwright CF solver")
    ap.add_argument("--search", help="Search for anime")
    ap.add_argument("--browse-pages", type=int, default=2)
    ap.add_argument("--with-episodes", action="store_true")
    ap.add_argument("--with-streams", action="store_true")
    ap.add_argument("--proxy-file", default=PROXY_FILE)
    ap.add_argument("--max-try", type=int, default=10)
    ap.add_argument("--cf-wait", type=int, default=120, help="Seconds to wait for CF challenge")
    ap.add_argument("--output", default="/home/z/my-project/download/animepahe-proxied.json")
    args = ap.parse_args()

    proxies = parse_proxies(args.proxy_file)
    print(f"[proxy] Parsed {len(proxies)} proxies", file=sys.stderr)
    
    # Step 1: Filter to working proxies (test against gogoanime.fi)
    print(f"\n[1] Testing {len(proxies)} proxies for connectivity...", file=sys.stderr)
    working_proxies = []
    for p in proxies:
        ok, msg = test_proxy_speed(p)
        if ok:
            working_proxies.append(p)
            print(f"  ✓ {p['display']:40s} {msg}", file=sys.stderr)
        else:
            print(f"  ✗ {p['display']:40s} {msg}", file=sys.stderr)
    
    print(f"\n  {len(working_proxies)} proxies are functional", file=sys.stderr)
    if not working_proxies:
        print("FATAL: No working proxies", file=sys.stderr)
        sys.exit(1)
    
    catalog: List[Dict] = []
    seen_ids = set()
    page = None
    context = None
    working_proxy = None
    
    with sync_playwright() as p:
        # Step 2: Try to solve CF challenge through each working proxy
        print(f"\n[2] Solving CF challenge through {min(len(working_proxies), args.max_try)} proxies...", file=sys.stderr)
        print(f"    (waiting up to {args.cf_wait}s per proxy)", file=sys.stderr)
        for i, proxy in enumerate(working_proxies[:args.max_try]):
            print(f"  [{i+1}] {proxy['display']:40s} ... ", file=sys.stderr, end="", flush=True)
            page, context, msg = solve_cf_with_playwright(p, proxy, cf_wait=args.cf_wait)
            if page:
                print(f"✓ {msg}", file=sys.stderr)
                working_proxy = proxy
                break
            else:
                print(f"✗ {msg}", file=sys.stderr)
        
        if not page:
            print("\n\nFATAL: Could not solve CF challenge through any proxy.", file=sys.stderr)
            print("The proxies reach the challenge page but CF detects headless Chromium.", file=sys.stderr)
            print("\nOptions:", file=sys.stderr)
            print("  1. Use residential proxies (brightdata.com, smartproxy.com)", file=sys.stderr)
            print("  2. Run from your home IP (not datacenter)", file=sys.stderr)
            print("  3. Use the gogoanime.fi scraper (already working, same data)", file=sys.stderr)
            sys.exit(1)
        
        print(f"\n[3] ✓ CF bypassed via {working_proxy['display']}!", file=sys.stderr)
        time.sleep(2)
        
        def fetch_json(url):
            try:
                r = page.request.get(url, headers={
                    "Accept": "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": SITE + "/",
                })
                if r.status != 200: return None
                try: return r.json()
                except:
                    body = r.text()
                    if "Just a moment" in body:
                        print(f"  CF re-challenge, waiting 20s...", file=sys.stderr)
                        time.sleep(20)
                        r = page.request.get(url, headers={"Accept":"application/json","X-Requested-With":"XMLHttpRequest","Referer":SITE+"/"})
                        try: return r.json()
                        except: return None
                    return None
            except: return None
        
        def fetch_html(url):
            try: return page.request.get(url, headers={"Referer": SITE + "/"}).text()
            except: return ""
        
        # Search or browse
        if args.search:
            print(f"\n[4] Search: {args.search!r}", file=sys.stderr)
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
            print(f"\n[4] Browsing {args.browse_pages} pages...", file=sys.stderr)
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
        
        # Episodes
        if args.with_episodes:
            limit = min(len(catalog), 30)
            print(f"\n[5] Fetching episodes for {limit} anime...", file=sys.stderr)
            for i, anime in enumerate(catalog[:limit]):
                try:
                    html = fetch_html(f"{SITE}/anime/{anime['slug']}")
                    anime_id = anime.get("id","")
                    m = re.search(r'/api\?m=release&id=(\d+)', html)
                    if m: anime_id = m.group(1)
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
        
        # Streams
        if args.with_streams and catalog:
            stream_limit = min(len(catalog), 5)
            print(f"\n[6] Fetching stream URLs for {stream_limit} anime...", file=sys.stderr)
            for anime in catalog[:stream_limit]:
                if not anime.get("episodes_list"): continue
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
