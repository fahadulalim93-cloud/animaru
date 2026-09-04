#!/usr/bin/env python3
"""
Try a movie page (single video, no episode picker) - should auto-play or have a simple Watch button.
Also try the /video/ URL pattern that may be the actual play page.
"""
import json
import time
from playwright.sync_api import sync_playwright

# Try a movie page
URLS = [
    "https://movieboxhd.net/moviedetail/beauty-in-black-E6NEe5Ha927",
    "https://movieboxhd.net/video/beauty-in-black-E6NEe5Ha927",
    "https://movieboxhd.net/detail/beauty-in-black-E6NEe5Ha927",
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport={"width": 1366, "height": 900},
        locale="en-US",
    )

    for url in URLS:
        print(f"\n\n========== {url} ==========")
        page = context.new_page()
        plays = []
        def on_response(resp, _plays=plays):
            if "subject/play" in resp.url or "share-unlock" in resp.url or "qrcode-unlock" in resp.url:
                try:
                    j = resp.json()
                    _plays.append({"url": resp.url, "body": j})
                    print(f"\n>>> PLAY/UNLOCK: {resp.url}")
                    print(json.dumps(j, indent=2)[:3000])
                except: pass
        page.on("response", on_response)

        try:
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
            time.sleep(5)
            print(f"  Final URL: {page.url}")
            # Try clicking Watch Online
            page.evaluate("""() => {
                const els = Array.from(document.querySelectorAll('div, span, button, a'));
                const watch = els.find(e => (e.innerText || '').trim() === 'Watch Online');
                if (watch) { watch.click(); return 'clicked Watch Online'; }
                const play = els.find(e => (e.innerText || '').trim() === 'Play');
                if (play) { play.click(); return 'clicked Play'; }
                return 'no button found';
            }""")
            time.sleep(5)
            print(f"  After click URL: {page.url}")
        except Exception as e:
            print(f"  error: {e}")
        page.close()

    browser.close()
