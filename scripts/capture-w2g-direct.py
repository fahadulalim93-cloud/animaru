#!/usr/bin/env python3
"""Direct W2G room creation — go to /rooms/new, capture WS sync."""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

OUT_DIR = "/home/z/my-project/download/watch-together"
os.makedirs(OUT_DIR, exist_ok=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(user_agent=UA, viewport={"width":1440,"height":900}, locale="en-US")
    context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
    page = context.new_page()

    ws_events = []
    api_calls = []

    def on_req(req):
        u = req.url
        if u.startswith("ws://") or u.startswith("wss://"):
            ws_events.append({"type":"connect","url":u,"ts":time.time()})
            print(f"  [WS] {u}", file=sys.stderr)
        if "w2g-api" in u or "sync" in u or "/rooms" in u:
            api_calls.append({"method":req.method,"url":u[:250]})
    def on_ws(ws):
        ws.on("framereceived", lambda payload: (
            ws_events.append({"type":"recv","data":str(payload)[:1000],"ts":time.time()}),
            print(f"  [WS-RECV] {str(payload)[:300]}", file=sys.stderr)
        ))
        ws.on("framesent", lambda payload: (
            ws_events.append({"type":"sent","data":str(payload)[:1000],"ts":time.time()}),
            print(f"  [WS-SENT] {str(payload)[:300]}", file=sys.stderr)
        ))
    page.on("request", on_req)
    page.on("websocket", on_ws)

    # Go directly to /rooms/new
    print("=== Loading w2g.tv/rooms/new ===", file=sys.stderr)
    try:
        page.goto("https://w2g.tv/rooms/new", wait_until="domcontentloaded", timeout=30000)
    except Exception as e:
        print(f"  goto warn: {e}", file=sys.stderr)
    time.sleep(8)
    page.screenshot(path=f"{OUT_DIR}/w2g-rooms-new.png", full_page=False)
    print(f"  URL: {page.url}", file=sys.stderr)
    print(f"  Title: {page.title()!r}", file=sys.stderr)

    # If we're on a /rooms/<id> page, wait longer for WS
    if "/rooms/" in page.url and page.url != "https://w2g.tv/rooms/new":
        print(f"\n=== IN A ROOM! Waiting 20s for WS sync ===", file=sys.stderr)
        time.sleep(20)
        page.screenshot(path=f"{OUT_DIR}/w2g-room-active.png", full_page=False)
        # Try clicking play
        page.evaluate("""() => {
            const v = document.querySelector('video');
            if (v) { v.muted = true; v.play().catch(()=>{}); return 'playing'; }
            return 'no video';
        }""")
        time.sleep(5)
        page.screenshot(path=f"{OUT_DIR}/w2g-room-playing.png", full_page=False)
    else:
        # Look for "Create" button on /rooms/new
        print("\n=== Looking for create button ===", file=sys.stderr)
        page.evaluate("""() => {
            const els = Array.from(document.querySelectorAll('a, button'));
            const match = els.find(e => /create|start|new room/i.test((e.innerText||'').trim()));
            if (match) { match.click(); return match.innerText.trim().slice(0,40); }
            return null;
        }""")
        time.sleep(6)
        print(f"  After click: {page.url}", file=sys.stderr)
        page.screenshot(path=f"{OUT_DIR}/w2g-after-create.png", full_page=False)
        if "/rooms/" in page.url and page.url != "https://w2g.tv/rooms/new":
            time.sleep(15)
            page.screenshot(path=f"{OUT_DIR}/w2g-room-active.png", full_page=False)

    # Save findings
    with open(f"{OUT_DIR}/w2g-protocol.json", "w") as f:
        json.dump({"ws_events": ws_events, "api_calls": api_calls}, f, indent=2)

    print(f"\n=== SUMMARY ===", file=sys.stderr)
    print(f"  WS events: {len(ws_events)}", file=sys.stderr)
    print(f"  API calls: {len(api_calls)}", file=sys.stderr)
    for c in api_calls[:15]:
        print(f"    {c['method']} {c['url'][:140]}", file=sys.stderr)

    browser.close()
