#!/usr/bin/env python3
"""Click AniDap's Watch2gether nav link, screenshot + capture WS protocol."""
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
    webrtc_ice = []

    def on_req(req):
        u = req.url
        if u.startswith("ws://") or u.startswith("wss://"):
            ws_events.append({"type":"connect","url":u,"ts":time.time()})
            print(f"  [WS-CONNECT] {u}", file=sys.stderr)
        if "socket.io" in u or "/sync" in u or "/room" in u or "/party" in u or "w2g" in u.lower():
            api_calls.append({"method":req.method,"url":u[:250]})
            print(f"  [API] {req.method} {u[:140]}", file=sys.stderr)
    def on_ws(ws):
        ws.on("framereceived", lambda payload: (
            ws_events.append({"type":"recv","data":str(payload)[:1000],"ts":time.time()}),
            print(f"  [WS-RECV] {str(payload)[:400]}", file=sys.stderr)
        ))
        ws.on("framesent", lambda payload: (
            ws_events.append({"type":"sent","data":str(payload)[:1000],"ts":time.time()}),
            print(f"  [WS-SENT] {str(payload)[:400]}", file=sys.stderr)
        ))
    def on_response(resp):
        try:
            txt = resp.text()
            for m in re.finditer(r'(stun:|turn:)[^"\',\s]+', txt):
                if m.group(0) not in webrtc_ice:
                    webrtc_ice.append(m.group(0))
                    print(f"  [ICE] {m.group(0)}", file=sys.stderr)
            # Look for ws:// or wss:// URLs in JS
            for m in re.finditer(r'wss?://[a-z0-9.\-]+(?:/[a-zA-Z0-9._\-/?=&]*)?', txt):
                u = m.group(0)
                if u not in [w.get("url","") for w in ws_events if w.get("type")=="connect"]:
                    if "sync" in u or "socket" in u or "w2g" in u or "party" in u or "room" in u:
                        print(f"  [WS-HINT] {u[:120]}", file=sys.stderr)
        except: pass
    page.on("request", on_req)
    page.on("websocket", on_ws)
    page.on("response", on_response)

    # Load homepage
    print("=== Loading anidap.lol ===", file=sys.stderr)
    page.goto("https://anidap.lol/", wait_until="domcontentloaded", timeout=30000)
    time.sleep(4)

    # Click "Watch2gether" nav link
    print("\n=== Looking for Watch2gether nav link ===", file=sys.stderr)
    link_info = page.evaluate("""() => {
        const els = Array.from(document.querySelectorAll('a, button'));
        const match = els.find(e => {
            const t = (e.innerText || '').trim().toLowerCase();
            return t.includes('watch2gether') || t.includes('watch together') || t.includes('w2g');
        });
        if (match) return {text: match.innerText.trim(), href: match.href || '', tag: match.tagName};
        return null;
    }""")
    print(f"  Found: {link_info}", file=sys.stderr)

    if link_info and link_info.get("href"):
        print(f"\n=== Navigating to: {link_info['href']} ===", file=sys.stderr)
        page.goto(link_info["href"], wait_until="domcontentloaded", timeout=30000)
        time.sleep(6)
        page.screenshot(path=f"{OUT_DIR}/anidap-w2g-1-landing.png", full_page=False)
        print(f"  URL: {page.url}", file=sys.stderr)
        print(f"  Title: {page.title()!r}", file=sys.stderr)

        # Look for "Create Room" / "Join Room" buttons
        print("\n=== Looking for Create/Join Room buttons ===", file=sys.stderr)
        buttons = page.evaluate("""() => {
            const out = [];
            document.querySelectorAll('a, button, div[role="button"]').forEach(el => {
                const t = (el.innerText || '').trim();
                if (t && t.length < 40 && /create|join|start|new room|enter/i.test(t)) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0) out.push({text: t, href: el.href || '', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)});
                }
            });
            return out;
        }""")
        for b in buttons:
            print(f"    {b}", file=sys.stderr)

        # Click first create/join button
        if buttons:
            b = buttons[0]
            if b.get("href"):
                print(f"\n=== Navigating to: {b['href']} ===", file=sys.stderr)
                page.goto(b["href"], wait_until="domcontentloaded", timeout=30000)
            else:
                page.evaluate(f"document.elementFromPoint({b['x']+5}, {b['y']+5}).click()")
            time.sleep(8)
            page.screenshot(path=f"{OUT_DIR}/anidap-w2g-2-room.png", full_page=False)
            print(f"  After click URL: {page.url}", file=sys.stderr)
            # Wait for WS to connect
            time.sleep(10)
            page.screenshot(path=f"{OUT_DIR}/anidap-w2g-3-room-active.png", full_page=False)
    else:
        # Try direct URL patterns
        print("\n=== Trying direct URL patterns ===", file=sys.stderr)
        for path in ["/w2g", "/watch2gether", "/watch-together", "/party", "/room"]:
            r = page.request.get(f"https://anidap.lol{path}", headers={"Referer":"https://anidap.lol/"})
            print(f"  {path}: HTTP {r.status} len={len(r.text())}", file=sys.stderr)

    # Save findings
    with open(f"{OUT_DIR}/anidap-w2g-protocol.json", "w") as f:
        json.dump({"ws_events": ws_events, "api_calls": api_calls, "webrtc_ice": webrtc_ice}, f, indent=2)

    print(f"\n=== SUMMARY ===", file=sys.stderr)
    print(f"  WS events: {len(ws_events)}", file=sys.stderr)
    print(f"  API calls: {len(api_calls)}", file=sys.stderr)
    print(f"  WebRTC ICE: {len(webrtc_ice)}", file=sys.stderr)

    browser.close()
