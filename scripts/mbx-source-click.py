#!/usr/bin/env python3
"""Click on source filters (Netflix, film, etc) and look for episode list."""
import json, time, sys
from playwright.sync_api import sync_playwright

SITE = "https://movieboxhd.net"
PATH = "beauty-in-black-E6NEe5Ha927"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        viewport={"width": 1366, "height": 900}, locale="en-US")
    page = context.new_page()
    
    plays = []
    m3u8s = []
    all_api = []
    def on_req(req):
        u = req.url
        if "wefeed" in u:
            all_api.append(req.url)
            print(f"  [api] {req.method} {u[:160]}", file=sys.stderr)
        if "subject/play" in u: plays.append(u)
        if ".m3u8" in u: m3u8s.append(u)
    page.on("request", on_req)
    
    page.goto(f"{SITE}/moviedetail/{PATH}", wait_until="domcontentloaded", timeout=30000)
    time.sleep(6)
    
    # Scroll down to find episode list
    print("\n=== Scrolling down ===", file=sys.stderr)
    for i in range(5):
        page.evaluate(f"window.scrollTo(0, {300 + i*400})")
        time.sleep(1)
    
    # Click on source filter "Netflix"
    print("\n=== Clicking 'Netflix' source ===", file=sys.stderr)
    page.evaluate("""() => {
        const els = Array.from(document.querySelectorAll('*'));
        const netflix = els.find(e => (e.innerText || '').trim() === 'Netflix' && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().width < 200);
        if (netflix) { netflix.click(); return 'clicked Netflix'; }
        return 'not found';
    }""")
    time.sleep(4)
    
    # Screenshot
    page.screenshot(path="/home/z/my-project/download/mbx-after-netflix.png", full_page=False)
    
    # Look for episodes now
    eps = page.evaluate("""() => {
        const out = [];
        document.querySelectorAll('div, span, button, a').forEach(el => {
            const t = (el.innerText || '').trim();
            if (t.length > 0 && t.length < 100) {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0 && r.y > 400) {  // below the fold
                    out.push({tag: el.tagName, cls: (el.className || '').slice(0,60), text: t.slice(0,80), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width)});
                }
            }
        });
        return out.slice(0, 40);
    }""")
    print(f"\n=== Elements below fold ({len(eps)}) ===", file=sys.stderr)
    for e in eps:
        print(f"  <{e['tag']} class={e['cls'][:40]}> text={e['text'][:60]!r} @({e['x']},{e['y']})", file=sys.stderr)
    
    # Click on "film" source
    print("\n=== Clicking 'film' source ===", file=sys.stderr)
    page.evaluate("""() => {
        const els = Array.from(document.querySelectorAll('*'));
        const film = els.find(e => (e.innerText || '').trim() === 'film' && e.getBoundingClientRect().width > 0);
        if (film) { film.click(); return 'clicked film'; }
        return 'not found';
    }""")
    time.sleep(4)
    page.screenshot(path="/home/z/my-project/download/mbx-after-film.png", full_page=False)
    
    # Look for episodes now
    eps2 = page.evaluate("""() => {
        const out = [];
        document.querySelectorAll('div, span, button, a').forEach(el => {
            const t = (el.innerText || '').trim();
            const r = el.getBoundingClientRect();
            if (t.length > 0 && t.length < 100 && r.width > 0 && r.height > 0 && r.y > 400) {
                out.push({tag: el.tagName, cls: (el.className || '').slice(0,60), text: t.slice(0,80), x: Math.round(r.x), y: Math.round(r.y)});
            }
        });
        return out.slice(0, 40);
    }""")
    print(f"\n=== Elements after 'film' click ({len(eps2)}) ===", file=sys.stderr)
    for e in eps2:
        print(f"  <{e['tag']} class={e['cls'][:40]}> text={e['text'][:60]!r} @({e['x']},{e['y']})", file=sys.stderr)
    
    # Try clicking "lklk" source
    print("\n=== Clicking 'lklk' source ===", file=sys.stderr)
    page.evaluate("""() => {
        const els = Array.from(document.querySelectorAll('*'));
        const lklk = els.find(e => (e.innerText || '').trim() === 'lklk' && e.getBoundingClientRect().width > 0);
        if (lklk) { lklk.click(); return 'clicked lklk'; }
        return 'not found';
    }""")
    time.sleep(4)
    
    # Final check for episode tiles or video elements
    videos = page.evaluate("""() => Array.from(document.querySelectorAll('video')).map(v => ({src: v.src || v.currentSrc, paused: v.paused, t: v.currentTime}))""")
    print(f"\n=== Videos: {len(videos)} ===", file=sys.stderr)
    for v in videos:
        print(f"  {v}", file=sys.stderr)
    
    print(f"\n=== Summary: plays={len(plays)} m3u8={len(m3u8s)} api_calls={len(all_api)} ===", file=sys.stderr)
    
    browser.close()
