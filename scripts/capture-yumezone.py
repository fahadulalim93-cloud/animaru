#!/usr/bin/env python3
"""
Capture yumezone.live's full network stack — especially their proxy.
We want to find:
  1. What URL pattern does their proxy use? (/proxy?u=, /stream/, /p/, etc.)
  2. What headers do they send upstream?
  3. How do they rewrite m3u8 files? (relative vs absolute, query vs path)
  4. What's their cache strategy?
  5. What CDN rules do they follow?
"""
import json
import os
import re
import sys
import time
from playwright.sync_api import sync_playwright

OUT_DIR = "/home/z/my-project/download/yumezone-research"
os.makedirs(OUT_DIR, exist_ok=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(user_agent=UA, viewport={"width":1440,"height":900}, locale="en-US",
                                   extra_http_headers={"Accept-Language":"en-US,en;q=0.9"})
    context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
    page = context.new_page()

    all_requests = []     # All network requests
    m3u8_responses = []   # m3u8 contents (rewritten)
    proxy_requests = []   # Anything that looks like a proxy call
    video_requests = []   # .ts/.mp4/.m4s segment requests
    api_calls = []        # JSON API calls
    ws_events = []

    def on_request(req):
        u = req.url
        all_requests.append({
            "method": req.method,
            "url": u,
            "type": req.resource_type,
            "headers": dict(req.headers),
        })
        # Identify proxy patterns
        if any(p in u for p in ["/proxy","/stream","/p/","/m3u8","/playlist","?url=","?u=","?target=","?src="]):
            proxy_requests.append({"method": req.method, "url": u, "headers": dict(req.headers)})
        if u.startswith("ws://") or u.startswith("wss://"):
            ws_events.append({"type":"connect","url":u})

    def on_response(resp):
        u = resp.url
        ct = resp.headers.get("content-type","")
        # Capture m3u8 responses (these reveal how they rewrite)
        if "mpegurl" in ct or "x-mpegurl" in ct or u.endswith(".m3u8") or "/index.m3u8" in u or "/playlist" in u:
            try:
                body = resp.text()
                m3u8_responses.append({
                    "url": u,
                    "status": resp.status,
                    "content_type": ct,
                    "headers": dict(resp.headers),
                    "body": body[:5000],  # First 5KB
                })
                print(f"  [M3U8] {resp.status} {u[:120]}", file=sys.stderr)
            except: pass
        # Capture API JSON responses
        elif "json" in ct:
            try:
                body = resp.text()
                if any(k in body.lower() for k in ["source","stream","video","url","m3u8"]):
                    api_calls.append({
                        "url": u,
                        "status": resp.status,
                        "body": body[:3000],
                    })
                    print(f"  [API] {resp.status} {u[:120]}", file=sys.stderr)
            except: pass
        # Capture segment requests
        elif u.endswith((".ts",".m4s",".mp4",".m4a")) or "/seg" in u or "/chunk" in u:
            video_requests.append({"url": u[:200], "status": resp.status, "content_type": ct})
            if len(video_requests) <= 5:
                print(f"  [SEG] {resp.status} {u[:120]}", file=sys.stderr)

    page.on("request", on_request)
    page.on("response", on_response)

    # Visit the watch page
    url = "https://yumezone.live/watch/178789/1"
    print(f"=== Loading {url} ===", file=sys.stderr)
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except Exception as e:
        print(f"  goto warn: {e}", file=sys.stderr)
    time.sleep(5)
    page.screenshot(path=f"{OUT_DIR}/1-loaded.png", full_page=False)
    print(f"  Title: {page.title()!r}", file=sys.stderr)

    # Look for a play button or server selector
    print("\n=== Looking for play button / server selector ===", file=sys.stderr)
    btns = page.evaluate("""() => {
        const out = [];
        document.querySelectorAll('button, a, div[role="button"]').forEach(el => {
            const t = (el.innerText || '').trim();
            const r = el.getBoundingClientRect();
            if (t && t.length < 40 && r.width > 0) out.push({text: t, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cls: (el.className||'').slice(0,80)});
        });
        return out.slice(0, 30);
    }""")
    for b in btns:
        if any(kw in b['text'].lower() for kw in ['play','server','stream','luffy','brooke','franky','miruro','quality']):
            print(f"  {b['text']:25s} @ ({b['x']},{b['y']}) cls={b['cls'][:60]}", file=sys.stderr)

    # Try clicking a server/play button
    print("\n=== Clicking play/server ===", file=sys.stderr)
    for word in ['Luffy','Brooke','Franky','Miruro','Miku','Play','Server 1','Server']:
        clicked = page.evaluate(f"""() => {{
            const els = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
            const m = els.find(e => {{
                const t = (e.innerText || '').trim();
                return t.includes('{word}') && e.getBoundingClientRect().width > 0;
            }});
            if (m) {{ m.click(); return m.innerText.trim().slice(0,40); }}
            return null;
        }}""")
        if clicked:
            print(f"  Clicked '{word}': {clicked!r}", file=sys.stderr)
            time.sleep(4)
            break

    # Wait for m3u8 traffic
    print("\n=== Waiting 15s for video to load (m3u8 traffic) ===", file=sys.stderr)
    time.sleep(15)
    page.screenshot(path=f"{OUT_DIR}/2-after-click.png", full_page=False)

    # Try clicking on the video element directly
    page.evaluate("""() => {
        const v = document.querySelector('video');
        if (v) { v.muted = true; v.play().catch(()=>{}); return 'video.play()'; }
        const iframes = document.querySelectorAll('iframe');
        return 'iframes: ' + iframes.length;
    }""")
    time.sleep(8)
    page.screenshot(path=f"{OUT_DIR}/3-playing.png", full_page=False)

    # Save findings
    print(f"\n=== SUMMARY ===", file=sys.stderr)
    print(f"  Total requests: {len(all_requests)}", file=sys.stderr)
    print(f"  m3u8 responses: {len(m3u8_responses)}", file=sys.stderr)
    print(f"  Proxy-pattern requests: {len(proxy_requests)}", file=sys.stderr)
    print(f"  Video segments: {len(video_requests)}", file=sys.stderr)
    print(f"  API JSON calls: {len(api_calls)}", file=sys.stderr)

    with open(f"{OUT_DIR}/findings.json", "w") as f:
        json.dump({
            "all_requests": [{"method":r["method"],"url":r["url"],"type":r["type"]} for r in all_requests[:300]],
            "proxy_requests": proxy_requests[:30],
            "m3u8_responses": m3u8_responses[:10],
            "video_segments": video_requests[:30],
            "api_calls": api_calls[:15],
            "ws_events": ws_events,
        }, f, indent=2)

    print(f"\nFiles saved to: {OUT_DIR}", file=sys.stderr)
    browser.close()
