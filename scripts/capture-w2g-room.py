#!/usr/bin/env python3
"""
W2G room capture with consent banner dismissal.
"""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

OUT_DIR = "/home/z/my-project/download/watch-together"
os.makedirs(OUT_DIR, exist_ok=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    # Use a fresh context that has never seen W2G — no consent needed
    context = browser.new_context(user_agent=UA, viewport={"width":1440,"height":900}, locale="en-US",
                                   extra_http_headers={"Accept-Language":"en-US,en;q=0.9"})
    context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
    page = context.new_page()

    ws_events = []
    api_calls = []

    def on_req(req):
        u = req.url
        if u.startswith("ws://") or u.startswith("wss://"):
            ws_events.append({"type":"connect","url":u})
            print(f"  [WS-CONNECT] {u}", file=sys.stderr)
        if "socket.io" in u:
            ws_events.append({"type":"socketio","url":u,"method":req.method})
            print(f"  [SIO] {req.method} {u[:140]}", file=sys.stderr)
        if any(x in u for x in ["/api/","w2g-api","/sync","/room","/state"]) and not u.endswith((".js",".css",".png",".jpg",".svg",".woff",".woff2",".ico",".json")):
            api_calls.append({"method":req.method,"url":u[:250]})

    def on_ws(ws):
        def on_recv(payload):
            ws_events.append({"type":"recv","data":str(payload)[:800]})
            print(f"  [WS-RECV] {str(payload)[:300]}", file=sys.stderr)
        def on_sent(payload):
            ws_events.append({"type":"sent","data":str(payload)[:800]})
            print(f"  [WS-SENT] {str(payload)[:300]}", file=sys.stderr)
        ws.on("framereceived", on_recv)
        ws.on("framesent", on_sent)
        ws.on("close", lambda: ws_events.append({"type":"close"}))

    page.on("request", on_req)
    page.on("websocket", on_ws)

    # Step 1: Visit W2G
    print("=== W2G landing ===", file=sys.stderr)
    page.goto("https://w2g.tv/en/", wait_until="domcontentloaded", timeout=30000)
    time.sleep(4)

    # Dismiss consent banner — try multiple strategies
    print("=== Dismissing consent ===", file=sys.stderr)
    for sel in [
        '#onetrust-accept-btn-handler',
        'button:has-text("Accept All")',
        'button:has-text("Accept")',
        'button:has-text("Agree")',
        'button:has-text("OK")',
        'button:has-text("Consent")',
        '[class*="consent" i] button',
        '[class*="accept" i]',
        'button[id*="accept" i]',
    ]:
        try:
            els = page.query_selector_all(sel)
            if els:
                els[0].click(timeout=3000)
                print(f"  Clicked: {sel}", file=sys.stderr)
                time.sleep(3)
                break
        except: pass

    # Try clicking "Create your room"
    print("=== Clicking Create Room ===", file=sys.stderr)
    clicked = page.evaluate("""() => {
        const els = Array.from(document.querySelectorAll('a, button, div[role="button"]'));
        const match = els.find(e => {
            const t = (e.innerText || '').trim().toLowerCase();
            return t.includes('create') && t.includes('room');
        });
        if (match) { match.click(); return match.innerText.trim().slice(0,60); }
        return null;
    }""")
    print(f"  Clicked: {clicked!r}", file=sys.stderr)
    time.sleep(8)
    page.screenshot(path=f"{OUT_DIR}/w2g-room-1.png", full_page=False)
    print(f"  URL after click: {page.url}", file=sys.stderr)

    # If we're in a room, wait for WS to establish
    if "/rooms/" in page.url or "room" in page.url.lower():
        print("=== In a room, waiting for WS sync ===", file=sys.stderr)
        time.sleep(10)
        page.screenshot(path=f"{OUT_DIR}/w2g-room-2.png", full_page=False)

        # Try interacting with the player
        print("=== Looking for player controls ===", file=sys.stderr)
        page.evaluate("""() => {
            const v = document.querySelector('video');
            if (v) { v.muted = true; v.play().catch(()=>{}); return 'video playing'; }
            return 'no video';
        }""")
        time.sleep(5)
        page.screenshot(path=f"{OUT_DIR}/w2g-room-3.png", full_page=False)

    # Also try direct URL to create room
    if "/rooms/" not in page.url:
        print("=== Trying direct room creation URL ===", file=sys.stderr)
        for path in ["/rooms/new", "/rooms/create", "/r/new", "/create"]:
            r = page.request.get(f"https://w2g.tv{path}", headers={"Referer":"https://w2g.tv/"})
            print(f"  {path}: HTTP {r.status}", file=sys.stderr)
        # Try the API
        r = page.request.post("https://w2g-api.w2g.tv/rooms/create.json", headers={"Referer":"https://w2g.tv/","Content-Type":"application/json"})
        print(f"  POST /rooms/create.json: HTTP {r.status} body={r.text()[:200]}", file=sys.stderr)

    # Save findings
    with open(f"{OUT_DIR}/w2g-ws-events.json", "w") as f:
        json.dump({"ws_events": ws_events, "api_calls": api_calls}, f, indent=2)

    print(f"\n=== SUMMARY ===", file=sys.stderr)
    print(f"  WS events: {len(ws_events)}", file=sys.stderr)
    print(f"  API calls: {len(api_calls)}", file=sys.stderr)
    for c in api_calls[:15]:
        print(f"    {c['method']} {c['url'][:140]}", file=sys.stderr)

    browser.close()
