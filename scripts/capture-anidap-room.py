#!/usr/bin/env python3
"""Visit an AniDap room, capture the WebSocket sync protocol."""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

OUT_DIR = "/home/z/my-project/download/watch-together"
os.makedirs(OUT_DIR, exist_ok=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36"

# Use a real room ID from the public rooms API
ROOM_ID = "fjNV4S"  # High School DxD NEW E3

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(user_agent=UA, viewport={"width":1440,"height":900}, locale="en-US")
    context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
    page = context.new_page()

    ws_events = []
    api_calls = []
    webrtc_ice = []

    def on_req(req):
        u = req.url
        if u.startswith("ws://") or u.startswith("wss://"):
            ws_events.append({"type":"connect","url":u,"ts":time.time()})
            print(f"  [WS-CONNECT] {u}", file=sys.stderr)
        if "anidap" in u and any(x in u for x in ["/api/","/rooms","/sync","/w2g"]):
            api_calls.append({"method":req.method,"url":u[:250]})
    def on_ws(ws):
        ws.on("framereceived", lambda payload: (
            ws_events.append({"type":"recv","data":str(payload)[:2000],"ts":time.time()}),
            print(f"  [WS-RECV] {str(payload)[:500]}", file=sys.stderr)
        ))
        ws.on("framesent", lambda payload: (
            ws_events.append({"type":"sent","data":str(payload)[:2000],"ts":time.time()}),
            print(f"  [WS-SENT] {str(payload)[:500]}", file=sys.stderr)
        ))
        ws.on("close", lambda: ws_events.append({"type":"close","ts":time.time()}))
    def on_response(resp):
        try:
            txt = resp.text()
            for m in re.finditer(r'(stun:|turn:)[^"\',\s]+', txt):
                if m.group(0) not in webrtc_ice:
                    webrtc_ice.append(m.group(0))
                    print(f"  [ICE] {m.group(0)}", file=sys.stderr)
        except: pass
    page.on("request", on_req)
    page.on("websocket", on_ws)
    page.on("response", on_response)

    # Visit the room
    url = f"https://anidap.lol/w2g/room/{ROOM_ID}"
    print(f"=== Loading room: {url} ===", file=sys.stderr)
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except Exception as e:
        print(f"  goto warn: {e}", file=sys.stderr)
    time.sleep(8)
    page.screenshot(path=f"{OUT_DIR}/anidap-room-1.png", full_page=False)
    print(f"  URL: {page.url}", file=sys.stderr)
    print(f"  Title: {page.title()!r}", file=sys.stderr)

    # Wait longer for WS to establish
    print("\n=== Waiting 25s for WebSocket activity ===", file=sys.stderr)
    time.sleep(25)
    page.screenshot(path=f"{OUT_DIR}/anidap-room-2-active.png", full_page=False)

    # Try interacting — click play button
    print("\n=== Looking for player ===", file=sys.stderr)
    page.evaluate("""() => {
        const v = document.querySelector('video');
        if (v) { v.muted = true; v.play().catch(()=>{}); return 'video playing'; }
        return 'no video';
    }""")
    time.sleep(5)
    page.screenshot(path=f"{OUT_DIR}/anidap-room-3-playing.png", full_page=False)

    # Save findings
    with open(f"{OUT_DIR}/anidap-room-protocol.json", "w") as f:
        json.dump({"room_id": ROOM_ID, "ws_events": ws_events, "api_calls": api_calls, "webrtc_ice": webrtc_ice}, f, indent=2)

    print(f"\n=== SUMMARY ===", file=sys.stderr)
    print(f"  WS events: {len(ws_events)}", file=sys.stderr)
    print(f"  API calls: {len(api_calls)}", file=sys.stderr)
    print(f"  WebRTC ICE: {len(webrtc_ice)}", file=sys.stderr)

    browser.close()
