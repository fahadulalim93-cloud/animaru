#!/usr/bin/env python3
"""
Try clicking "Episodes" tab to load episode list, then click episode 1.
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
    all_calls = []
    def on_request(req):
        if "wefeed" in req.url:
            all_calls.append(req.url)
    def on_response(resp):
        if "subject/play" in resp.url:
            try:
                j = resp.json()
                plays.append({"url": resp.url, "body": j})
                print(f"\n>>> PLAY URL: {resp.url}")
                print(json.dumps(j, indent=2)[:3000])
            except: pass
    page.on("request", on_request)
    page.on("response", on_response)

    page.goto(URL, wait_until="domcontentloaded", timeout=30000)
    time.sleep(6)

    # Click "Episodes" tab
    print("=== Clicking 'Episodes' tab ===")
    clicked = page.evaluate("""() => {
        const els = Array.from(document.querySelectorAll('div, span, button, a'));
        const ep = els.find(e => (e.innerText || '').trim() === 'Episodes');
        if (ep) {
            const r = ep.getBoundingClientRect();
            ep.click();
            return {found: true, x: r.x, y: r.y};
        }
        // Try "Watch Online"
        const watch = els.find(e => (e.innerText || '').trim() === 'Watch Online');
        if (watch) {
            watch.click();
            return {found: 'watch_online'};
        }
        return {found: false};
    }""")
    print(f"  Click result: {clicked}")
    time.sleep(5)
    
    print(f"\n=== After click: {len(all_calls)} total API calls ===")
    for u in all_calls[-10:]:
        print(f"  {u[:160]}")
    
    # Try clicking Watch Online button (usually triggers play)
    if not plays:
        print("\n=== Trying 'Watch Online' button ===")
        try:
            page.evaluate("""() => {
                const els = Array.from(document.querySelectorAll('div, span, button, a'));
                const watch = els.find(e => (e.innerText || '').trim() === 'Watch Online');
                if (watch) watch.click();
            }""")
            time.sleep(6)
        except Exception as e:
            print(f"  failed: {e}")
    
    # Try clicking any element with text "1" (likely episode 1)
    if not plays:
        print("\n=== Trying to click episode '1' ===")
        try:
            page.evaluate("""() => {
                const els = Array.from(document.querySelectorAll('div, span, button, a'));
                // Find a small element with text "1"
                const ep1 = els.find(e => {
                    const t = (e.innerText || '').trim();
                    if (t !== '1') return false;
                    const r = e.getBoundingClientRect();
                    return r.width > 0 && r.width < 100 && r.height > 0;
                });
                if (ep1) {
                    ep1.click();
                    return 'clicked';
                }
                return 'not found';
            }""")
            time.sleep(5)
        except Exception as e:
            print(f"  failed: {e}")
    
    # Dump all visible text near top
    print("\n=== Page state ===")
    print(page.evaluate("() => document.body.innerText.slice(0, 800)"))
    
    print(f"\n=== Final: {len(all_calls)} total API calls ===")
    for u in all_calls[-15:]:
        print(f"  {u[:160]}")
    
    browser.close()
    print(f"\n=== Total plays captured: {len(plays)} ===")
