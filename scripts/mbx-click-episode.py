#!/usr/bin/env python3
"""
Click on a season tab + first episode to trigger subject/play.
"""
import json
import time
from playwright.sync_api import sync_playwright

URL = "https://movieboxhd.net/detail/prison-break-mdR9oayBqn3"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport={"width": 1366, "height": 900},
        locale="en-US",
    )
    page = context.new_page()

    plays = []
    def on_response(resp):
        if "subject/play" in resp.url:
            try:
                j = resp.json()
                plays.append({"url": resp.url, "body": j})
                print(f"\n>>> PLAY URL: {resp.url}")
                print(json.dumps(j, indent=2)[:3000])
            except: pass
    page.on("response", on_response)

    page.goto(URL, wait_until="domcontentloaded", timeout=30000)
    time.sleep(6)

    # Find all visible divs/spans with short text - look for season selector
    print("\n=== Looking for Season selectors ===")
    seasons = page.evaluate("""() => {
        const out = [];
        document.querySelectorAll('div, span, button, a').forEach(el => {
            const t = (el.innerText || '').trim();
            if (t.length < 40 && /^Season\\s*\\d+$/.test(t)) {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                    out.push({tag: el.tagName, cls: el.className.slice(0,60), text: t, x: Math.round(r.x), y: Math.round(r.y)});
                }
            }
        });
        return out;
    }""")
    for s in seasons:
        print(f"  {s}")
    
    # Look for S1, S2 etc chips
    print("\n=== Looking for S1/S2 chips ===")
    chips = page.evaluate("""() => {
        const out = [];
        document.querySelectorAll('div, span, button').forEach(el => {
            const t = (el.innerText || '').trim();
            if (t.length < 10 && /^S\\d+$/.test(t)) {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                    out.push({tag: el.tagName, cls: el.className.slice(0,60), text: t, x: Math.round(r.x), y: Math.round(r.y)});
                }
            }
        });
        return out;
    }""")
    for c in chips:
        print(f"  {c}")
    
    # Look for episode number tiles
    print("\n=== Looking for episode tiles (just numbers 1-50) ===")
    eps = page.evaluate("""() => {
        const out = [];
        document.querySelectorAll('div, span, button, a').forEach(el => {
            const t = (el.innerText || '').trim();
            if (/^\\d{1,3}$/.test(t) && parseInt(t) >= 1 && parseInt(t) <= 50) {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0 && r.width < 100) {
                    out.push({tag: el.tagName, cls: el.className.slice(0,80), text: t, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)});
                }
            }
        });
        return out;
    }""")
    print(f"Found {len(eps)} numeric tiles. First 20:")
    for e in eps[:20]:
        print(f"  {e}")
    
    # Try clicking each Season chip and first episode tile
    if chips:
        for c in chips[:3]:
            print(f"\n=== Clicking {c['text']} ===")
            page.mouse.click(c['x'] + c.get('w',20)//2 if c.get('w') else c['x']+10, c['y'] + 10)
            time.sleep(2)
            # Try clicking ep 1
            eps_now = page.evaluate("""() => {
                const out = [];
                document.querySelectorAll('div, span, button, a').forEach(el => {
                    const t = (el.innerText || '').trim();
                    if (/^\\d{1,3}$/.test(t) && parseInt(t) === 1) {
                        const r = el.getBoundingClientRect();
                        if (r.width > 0 && r.height > 0 && r.width < 100) {
                            out.push({x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cls: el.className.slice(0,80)});
                        }
                    }
                });
                return out;
            }""")
            if eps_now:
                e = eps_now[0]
                print(f"  Clicking ep1 @ ({e['x']},{e['y']}) cls={e['cls']}")
                page.mouse.click(e['x'] + e['w']//2, e['y'] + e['h']//2)
                time.sleep(5)
                if plays:
                    print(f"  ✓ subject/play was called!")
                    break
    
    browser.close()
    print(f"\n=== Total plays captured: {len(plays)} ===")
