#!/usr/bin/env python3
"""
AnimePahe scraper — Playwright + proxy with MAXIMUM stealth.

These datacenter proxies get hard-blocked by Cloudflare's anti-bot.
We use full stealth (WebGL, plugins, chrome.runtime mocking) + 90s wait
to give the JS challenge time to complete.
"""
import argparse
import json
import os
import re
import sys
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus

from playwright.sync_api import sync_playwright

PROXY_FILE = "/home/z/my-project/upload/stripe_ok_proxies.txt"
SITE = "https://animepahe.pw"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"


def full_stealth_script():
    return """
    // Mask webdriver
    Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
    delete navigator.__proto__.webdriver;
    
    // Mock plugins (mimic real Chrome)
    Object.defineProperty(navigator, 'plugins', {
        get: () => {
            const p = [
                {name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format'},
                {name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format'},
                {name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format'},
                {name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format'},
                {name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format'},
            ];
            p.length = 5;
            return p;
        }
    });
    
    // Mock mimeTypes
    Object.defineProperty(navigator, 'mimeTypes', {
        get: () => {
            const m = [
                {type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format'},
                {type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format'},
            ];
            m.length = 2;
            return m;
        }
    });
    
    // Languages + platform
    Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
    Object.defineProperty(navigator, 'platform', {get: () => 'Win32'});
    Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 8});
    Object.defineProperty(navigator, 'deviceMemory', {get: () => 8});
    Object.defineProperty(navigator, 'maxTouchPoints', {get: () => 0});
    
    // Chrome runtime
    window.chrome = window.chrome || {};
    window.chrome.runtime = window.chrome.runtime || {};
    window.chrome.app = window.chrome.app || {isInstalled: false};
    window.chrome.csi = window.chrome.csi || function() { return {} };
    window.chrome.loadTimes = window.chrome.loadTimes || function() { return {} };
    
    // Permissions
    const origQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
            Promise.resolve({state: Notification.permission}) :
            origQuery(parameters)
    );
    
    // WebGL fingerprint
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.call(this, parameter);
    };
    
    // Notification
    Object.defineProperty(window, 'Notification', {
        value: function() {}, writable: true
    });
    Object.defineProperty(window.Notification, 'permission', {get: () => 'default'});
    Object.defineProperty(window.Notification, 'requestPermission', {
        value: () => Promise.resolve('default')
    });
    
    // Hide Playwright traces
    delete window.__playwright;
    delete window.__pw_manual;
    """


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
                })
    return proxies


def try_proxy(playwright, proxy: Dict, cf_timeout: int = 90) -> Tuple[Optional[Any], Optional[Any], str]:
    """Try to load animepahe.pw through this proxy with full stealth."""
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
                "--disable-features=IsolateOrigins,site-per-process",
                "--no-first-run",
                "--no-default-browser-check",
                "--start-maximized",
                "--disable-extensions",
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
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "none",
                "sec-fetch-user": "?1",
                "upgrade-insecure-requests": "1",
            },
        )
        context.add_init_script(full_stealth_script())
        page = context.new_page()
        
        try:
            page.goto(SITE, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            browser.close()
            return None, None, f"goto failed: {str(e)[:50]}"
        
        # Wait for CF challenge with extended timeout
        deadline = time.time() + cf_timeout
        last_title = ""
        while time.time() < deadline:
            try:
                title = page.title()
                content = page.content()
                last_title = title
                
                # Hard block
                if "been blocked" in content and "cf-error" in content:
                    browser.close()
                    return None, None, "CF hard block"
                
                # Success
                if ("Just a moment" not in title and
                    "Checking your browser" not in title and
                    "cf-browser-verification" not in content and
                    "challenge-platform" not in content and
                    title and "Just a moment" not in title):
                    if "/api" in content or "animepahe" in (title + content).lower():
                        return page, context, f"OK: {title[:40]}"
                
                time.sleep(3)
            except Exception as e:
                # Execution context destroyed — CF killed the page
                browser.close()
                return None, None, f"context destroyed (last: {last_title[:30]})"
        
        browser.close()
        return None, None, f"timeout 90s (last: {last_title[:30]})"
    except Exception as e:
        try: browser.close()
        except: pass
        return None, None, f"error: {str(e)[:50]}"


def main():
    ap = argparse.ArgumentParser(description="AnimePahe — Playwright + proxy + full stealth")
    ap.add_argument("--search", help="Search for anime")
    ap.add_argument("--browse-pages", type=int, default=2)
    ap.add_argument("--with-episodes", action="store_true")
    ap.add_argument("--with-streams", action="store_true")
    ap.add_argument("--proxy-file", default=PROXY_FILE)
    ap.add_argument("--max-try", type=int, default=20)
    ap.add_argument("--cf-timeout", type=int, default=90, help="Seconds to wait for CF challenge")
    ap.add_argument("--output", default="/home/z/my-project/download/animepahe-proxied.json")
    args = ap.parse_args()

    proxies = parse_proxies(args.proxy_file)
    print(f"[proxy] Parsed {len(proxies)} proxies", file=sys.stderr)
    
    catalog: List[Dict] = []
    seen_ids = set()
    page = None
    context = None
    working_proxy = None
    
    with sync_playwright() as p:
        # Find working proxy
        print(f"\n[1] Trying {min(len(proxies), args.max_try)} proxies (CF timeout: {args.cf_timeout}s)...", file=sys.stderr)
        for i, proxy in enumerate(proxies[:args.max_try]):
            print(f"  [{i+1}] {proxy['display']:40s} ... ", file=sys.stderr, end="", flush=True)
            page, context, msg = try_proxy(p, proxy, cf_timeout=args.cf_timeout)
            if page:
                print(f"✓ {msg}", file=sys.stderr)
                working_proxy = proxy
                break
            else:
                print(f"✗ {msg}", file=sys.stderr)
        
        if not page:
            print("\n\nFATAL: No proxy could bypass Cloudflare.", file=sys.stderr)
            print("These datacenter IPs are all flagged by CF.", file=sys.stderr)
            print("Need residential proxies (e.g. brightdata, smartproxy, oxylabs).", file=sys.stderr)
            sys.exit(1)
        
        print(f"\n[2] ✓ Using proxy: {working_proxy['display']}", file=sys.stderr)
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
                        print(f"  CF re-challenge, waiting 15s...", file=sys.stderr)
                        time.sleep(15)
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
            print(f"\n[3] Search: {args.search!r}", file=sys.stderr)
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
        
        # Episodes
        if args.with_episodes:
            limit = min(len(catalog), 30)
            print(f"\n[4] Fetching episodes for {limit} anime...", file=sys.stderr)
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
            print(f"\n[5] Fetching stream URLs for {stream_limit} anime...", file=sys.stderr)
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
