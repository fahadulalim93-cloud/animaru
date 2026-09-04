#!/usr/bin/env python3
"""
Capture real MovieBoxHD API calls by loading a detail page in Playwright.
This will reveal the exact param/header values needed to call subject/play.
"""
import json
import time
from playwright.sync_api import sync_playwright

DETAIL_URL = "https://movieboxhd.net/detail/prison-break-mdR9oayBqn3"
# Alternative: a movie detail page
MOVIE_DETAIL_URL = "https://movieboxhd.net/moviedetail/beauty-in-black-E6NEe5Ha927"

captured = []

def on_request(request):
    url = request.url
    if "wefeed-h5api-bff" in url or "h5-api.aoneroom.com" in url:
        captured.append({
            "method": request.method,
            "url": url,
            "headers": dict(request.headers),
            "post_data": request.post_data,
        })

def on_response(response):
    url = response.url
    if "subject/play" in url or "media-player" in url or "share-unlock" in url or "qrcode-unlock" in url:
        try:
            body = response.text()
        except:
            body = "<binary>"
        print(f"\n=== RESPONSE {response.status} {url[:120]} ===")
        try:
            j = json.loads(body)
            print(json.dumps(j, indent=2)[:2500])
        except:
            print(body[:1500])

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport={"width": 1280, "height": 800},
        locale="en-US",
    )
    page = context.new_page()
    page.on("request", on_request)
    page.on("response", on_response)

    print(f"Loading {DETAIL_URL} ...")
    try:
        page.goto(DETAIL_URL, wait_until="networkidle", timeout=30000)
    except Exception as e:
        print(f"goto warn: {e}")

    # Try clicking the first episode play button
    time.sleep(3)
    print("\n--- Looking for play button ---")
    try:
        # Try various play button selectors
        for sel in ['button:has-text("Play")', '[class*="play"]', '[class*="Play"]', 'a:has-text("Play")', '[data-test*="play"]']:
            els = page.query_selector_all(sel)
            if els:
                print(f"Found {len(els)} elements for selector: {sel}")
                if len(els) > 0:
                    els[0].click(timeout=5000)
                    print("Clicked first match")
                    time.sleep(5)
                    break
    except Exception as e:
        print(f"click warn: {e}")

    # Wait for play API call
    time.sleep(5)

    print(f"\n\n=== CAPTURED {len(captured)} API REQUESTS ===")
    for c in captured:
        print(f"\n{c['method']} {c['url']}")
        # Show only the most interesting headers
        for k in ["x-client-token", "x-client-info", "x-request-lang", "x-vip-restrict", "x-no-high-risk-restrict", "authorization", "cookie"]:
            if k in {h.lower() for h in c["headers"]}:
                for hk, hv in c["headers"].items():
                    if hk.lower() == k:
                        print(f"  {hk}: {hv[:200]}")
        if c["post_data"]:
            print(f"  body: {c['post_data'][:300]}")

    browser.close()
