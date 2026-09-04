#!/usr/bin/env python3
"""
Capture subject/play call by clicking the first episode on a TV detail page.
"""
import json
import time
from playwright.sync_api import sync_playwright

URLS = [
    "https://movieboxhd.net/detail/prison-break-mdR9oayBqn3",
    "https://movieboxhd.net/moviedetail/beauty-in-black-E6NEe5Ha927",
]

captured_plays = []

def make_handler(page_label):
    def on_response(response):
        url = response.url
        if "subject/play" in url:
            try:
                body = response.text()
                j = json.loads(body)
                captured_plays.append({"url": url, "status": response.status, "body": j, "page": page_label})
                print(f"\n>>> subject/play captured on {page_label}: {response.status}")
                print(json.dumps(j, indent=2)[:3000])
            except:
                pass
        elif "share-unlock" in url or "qrcode-unlock" in url:
            try:
                body = response.text()
                print(f"\n>>> unlock endpoint hit: {url}")
                print(body[:1000])
            except: pass
    return on_response

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport={"width": 1366, "height": 900},
        locale="en-US",
    )

    for url in URLS:
        label = url.split("/")[-1]
        print(f"\n========== Loading {label} ==========")
        page = context.new_page()
        page.on("response", make_handler(label))
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            time.sleep(4)
            # Click first episode / play button
            clicked = False
            for sel in [
                'text="Play"',
                'button:has-text("Play")',
                'a:has-text("Play")',
                '[class*="episode"]:first-child',
                '[class*="Episode"]:first-child',
                '[class*="play"]',
                '[class*="Play"]',
                '[data-v-*]:has-text("Episode 1")',
            ]:
                try:
                    els = page.query_selector_all(sel)
                    if els:
                        print(f"  selector '{sel}' matched {len(els)} elements")
                        els[0].click(timeout=3000, force=True)
                        clicked = True
                        time.sleep(4)
                        break
                except Exception as e:
                    pass
            if not clicked:
                # Try evaluating play button location from DOM
                print("  No play button found via selectors. Dumping page text snippet...")
                body_text = page.evaluate("() => document.body.innerText.slice(0, 1500)")
                print(body_text)
        except Exception as e:
            print(f"  warn: {e}")
        page.close()

    browser.close()

print(f"\n\n=== TOTAL PLAYS CAPTURED: {len(captured_plays)} ===")
