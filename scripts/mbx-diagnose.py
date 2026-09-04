#!/usr/bin/env python3
"""Diagnose what happens after clicking Watch Online - take screenshots + dump DOM."""
import json, time, sys
from playwright.sync_api import sync_playwright

SITE = "https://movieboxhd.net"
PATH = "beauty-in-black-E6NEe5Ha927"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    
    # Try BOTH desktop and mobile
    for label, ua, vw, vh in [
        ("desktop", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", 1366, 900),
        ("mobile", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", 390, 844),
    ]:
        print(f"\n========== {label.upper()} ==========", file=sys.stderr)
        context = browser.new_context(user_agent=ua, viewport={"width": vw, "height": vh}, locale="en-US",
                                       is_mobile=(label=="mobile"), has_touch=(label=="mobile"))
        page = context.new_page()
        
        # Capture everything
        plays = []
        m3u8s = []
        all_urls = []
        def on_req(req):
            u = req.url
            all_urls.append(u)
            if "subject/play" in u: plays.append(u)
            if ".m3u8" in u: m3u8s.append(u)
        page.on("request", on_req)
        
        page.goto(f"{SITE}/detail/{PATH}", wait_until="domcontentloaded", timeout=30000)
        time.sleep(5)
        
        # Screenshot before click
        page.screenshot(path=f"/home/z/my-project/download/mbx-{label}-1-before.png", full_page=False)
        print(f"  Screenshot 1 saved (before click)", file=sys.stderr)
        
        # Click Watch Online
        page.evaluate("""() => {
            const els = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
            const watch = els.find(e => {
                const t = (e.innerText || '').trim();
                return (t === 'Watch Online' || t === 'Play' || t === 'Watch Now') && e.getBoundingClientRect().width > 0;
            });
            if (watch) { watch.click(); return 'clicked'; }
            return 'not found';
        }""")
        time.sleep(4)
        
        # Screenshot after click
        page.screenshot(path=f"/home/z/my-project/download/mbx-{label}-2-after-click.png", full_page=False)
        print(f"  Screenshot 2 saved (after Watch Online click)", file=sys.stderr)
        
        # Look for any new modals/dialogs
        modals = page.evaluate("""() => {
            const out = [];
            document.querySelectorAll('[class*="modal" i], [class*="dialog" i], [class*="popup" i], [role="dialog"], [class*="sheet" i]').forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                    out.push({cls: el.className.slice(0,100), text: (el.innerText || '').slice(0, 300), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)});
                }
            });
            return out;
        }""")
        print(f"  Modals found: {len(modals)}", file=sys.stderr)
        for m in modals:
            print(f"    {m['cls'][:60]}: {m['text'][:80]!r}", file=sys.stderr)
        
        # Check for iframes
        iframes = page.evaluate("""() => Array.from(document.querySelectorAll('iframe')).map(f => ({src: f.src, w: f.getBoundingClientRect().width, h: f.getBoundingClientRect().height}))""")
        print(f"  Iframes: {len(iframes)}", file=sys.stderr)
        for i in iframes:
            print(f"    {i}", file=sys.stderr)
        
        # Check for video elements
        videos = page.evaluate("""() => Array.from(document.querySelectorAll('video')).map(v => ({src: v.src || v.currentSrc, current: v.currentTime, paused: v.paused, w: v.getBoundingClientRect().width, h: v.getBoundingClientRect().height}))""")
        print(f"  Videos: {len(videos)}", file=sys.stderr)
        for v in videos:
            print(f"    {v}", file=sys.stderr)
        
        print(f"  Play calls: {len(plays)}, m3u8: {len(m3u8s)}", file=sys.stderr)
        print(f"  Total network requests: {len(all_urls)}", file=sys.stderr)
        
        # Now try clicking anywhere that looks like an episode
        # Look for episode list elements with various selectors
        for sel in ['[class*="episode" i]', '[class*="ep-item" i]', '[class*="ep-item" i]', '[class*="play-item" i]', '[class*="video-item" i]', '[class*="season" i]']:
            els = page.query_selector_all(sel)
            if els:
                print(f"  Selector '{sel}' matched {len(els)} elements", file=sys.stderr)
                for e in els[:3]:
                    try:
                        r = e.bounding_box()
                        t = e.inner_text()[:80]
                        print(f"    text={t!r} box={r}", file=sys.stderr)
                    except: pass
        
        # Look for any clickable element with "1" or "EP1"  
        ep1 = page.evaluate("""() => {
            const all = Array.from(document.querySelectorAll('*'));
            const matches = all.filter(el => {
                const t = (el.innerText || '').trim();
                const r = el.getBoundingClientRect();
                return (t === '1' || t === 'EP1' || t === 'E1' || t === 'Episode 1') && r.width > 0 && r.width < 150;
            }).map(el => ({tag: el.tagName, cls: (el.className || '').slice(0,80), text: (el.innerText || '').trim(), x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y)}));
            return matches.slice(0, 10);
        }""")
        print(f"  Episode '1' elements: {len(ep1)}", file=sys.stderr)
        for e in ep1:
            print(f"    {e}", file=sys.stderr)
        
        context.close()
    
    browser.close()
