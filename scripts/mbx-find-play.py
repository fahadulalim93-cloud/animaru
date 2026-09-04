#!/usr/bin/env python3
"""
Find the actual play button on Prison Break detail page.
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
    
    api_calls = []
    def on_request(req):
        if "wefeed" in req.url:
            api_calls.append({"url": req.url, "method": req.method})
    page.on("request", on_request)
    
    page.goto(URL, wait_until="domcontentloaded", timeout=30000)
    time.sleep(5)
    
    # Look for any episode-related clickable elements
    print("=== Looking for episode elements ===")
    info = page.evaluate("""() => {
        const out = [];
        // All clickable elements with text
        const candidates = document.querySelectorAll('a, button, div[role="button"], [class*="episode" i], [class*="play" i], [class*="item" i]');
        for (const el of candidates) {
            const t = (el.innerText || '').trim();
            if (t && t.length < 100 && (t.match(/episode\\s*\\d+/i) || t.match(/^\\d+$/) || el.className && typeof el.className === 'string' && (el.className.includes('pisode') || el.className.includes('play')))) {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                    out.push({
                        tag: el.tagName,
                        className: el.className,
                        text: t.slice(0, 60),
                        x: Math.round(r.x),
                        y: Math.round(r.y),
                        href: el.href || '',
                    });
                }
            }
        }
        return out.slice(0, 30);
    }""")
    for i, el in enumerate(info):
        print(f"  [{i}] <{el['tag']} class={el['className'][:60]}> text={el['text']!r} @({el['x']},{el['y']}) href={el['href']}")
    
    # Try clicking element 1 (likely "1" episode number)
    if len(info) > 1:
        print(f"\n=== Clicking element 1: {info[1]['text']} ===")
        try:
            page.mouse.click(info[1]['x'] + 5, info[1]['y'] + 5)
            time.sleep(5)
        except Exception as e:
            print(f"  click failed: {e}")
    
    print(f"\n=== API calls captured: {len(api_calls)} ===")
    for c in api_calls[-15:]:
        print(f"  {c['method']} {c['url'][:160]}")
    
    browser.close()
