#!/usr/bin/env python3
"""
Deeper capture:
  1. AniDap — go to a watch page, look for the "Side" button there
  2. W2G — create an actual room, capture the WebSocket sync protocol
"""
import json
import os
import re
import sys
import time
from playwright.sync_api import sync_playwright

OUT_DIR = "/home/z/my-project/download/watch-together"
os.makedirs(OUT_DIR, exist_ok=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(user_agent=UA, viewport={"width":1440,"height":900}, locale="en-US")
    context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
    page = context.new_page()

    ws_logs = []  # All WS frames
    api_logs = []
    webrtc_logs = []

    def on_request(req):
        u = req.url
        if u.startswith("ws://") or u.startswith("wss://"):
            ws_logs.append({"type": "connect", "url": u})
            print(f"  [WS-CONNECT] {u}", file=sys.stderr)
        if "socket.io" in u:
            ws_logs.append({"type": "socketio", "url": u, "method": req.method})
            print(f"  [SIO] {req.method} {u[:120]}", file=sys.stderr)
        if any(x in u for x in ["/api/","/sync","/room","/state","/w2g/","/side"]) and not u.endswith((".js",".css",".png",".jpg",".svg",".woff",".woff2",".ico")):
            api_logs.append({"method": req.method, "url": u[:250]})

    def on_response(resp):
        try:
            txt = resp.text()
            # Look for STUN/TURN
            for m in re.finditer(r'(stun:|turn:)[^"\',\s]+', txt):
                if m.group(0) not in webrtc_logs:
                    webrtc_logs.append(m.group(0))
                    print(f"  [ICE] {m.group(0)}", file=sys.stderr)
            # Look for socket.io URL hints
            for m in re.finditer(r'wss?://[^"\']+socket\.io[^"\']*', txt):
                if m.group(0) not in [w.get("url","") for w in ws_logs]:
                    print(f"  [WS-HINT] {m.group(0)[:120]}", file=sys.stderr)
            for m in re.finditer(r'wss?://[^"\']+', txt[:50000]):
                u = m.group(0)
                if "w2g" in u or "socket" in u or "sync" in u:
                    if u not in [w.get("url","") for w in ws_logs]:
                        print(f"  [WS-URL] {u[:120]}", file=sys.stderr)
        except: pass

    # Capture WebSocket frames
    def on_ws(ws):
        ws.on("framereceived", lambda payload: ws_logs.append({
            "type": "recv", "data": str(payload)[:500]
        }) or print(f"  [WS-RECV] {str(payload)[:200]}", file=sys.stderr))
        ws.on("framesent", lambda payload: ws_logs.append({
            "type": "sent", "data": str(payload)[:500]
        }) or print(f"  [WS-SENT] {str(payload)[:200]}", file=sys.stderr))
        ws.on("close", lambda: ws_logs.append({"type": "close"}))

    page.on("request", on_request)
    page.on("response", on_response)
    page.on("websocket", on_ws)

    # ============== W2G — CREATE A REAL ROOM ==============
    print("\n=== W2G: Creating a room ===", file=sys.stderr)
    page.goto("https://w2g.tv/en/", wait_until="domcontentloaded", timeout=30000)
    time.sleep(5)
    page.screenshot(path=f"{OUT_DIR}/w2g-1-landing.png", full_page=False)

    # Look for "Create Room" / "Create a Room" button
    clicked = page.evaluate("""() => {
        const els = Array.from(document.querySelectorAll('a, button, div[role="button"]'));
        const match = els.find(e => {
            const t = (e.innerText || '').trim().toLowerCase();
            return (t.includes('create') && t.includes('room')) || t === 'start' || t.includes('get started');
        });
        if (match) {
            const r = match.getBoundingClientRect();
            return {text: match.innerText.trim().slice(0, 60), href: match.href || '', x: Math.round(r.x), y: Math.round(r.y)};
        }
        return null;
    }""")
    print(f"  Found create-room button: {clicked}", file=sys.stderr)
    if clicked:
        try: page.evaluate(f"document.elementFromPoint({clicked['x']+5}, {clicked['y']+5}).click()")
        except: pass
        time.sleep(6)
        print(f"  After click URL: {page.url}", file=sys.stderr)
        page.screenshot(path=f"{OUT_DIR}/w2g-2-after-create.png", full_page=False)
    else:
        # Try direct room URL
        page.goto("https://w2g.tv/rooms/", wait_until="domcontentloaded", timeout=30000)
        time.sleep(5)
        print(f"  /rooms/ URL: {page.url}", file=sys.stderr)
        page.screenshot(path=f"{OUT_DIR}/w2g-2-rooms.png", full_page=False)

    # Wait for WS to establish
    time.sleep(8)
    page.screenshot(path=f"{OUT_DIR}/w2g-3-room-final.png", full_page=False)

    # Get the page state
    body_text = page.evaluate("() => document.body.innerText.slice(0, 1500)")
    print(f"\n  Page text:\n{body_text[:500]}", file=sys.stderr)

    # ============== ANIDAP — FIND SIDE FEATURE ==============
    print("\n=== AniDap: Looking for Side feature ===", file=sys.stderr)
    page.goto("https://anidap.lol/", wait_until="domcontentloaded", timeout=30000)
    time.sleep(4)

    # Look for "Side" in any link/button
    side_elements = page.evaluate("""() => {
        const out = [];
        document.querySelectorAll('a, button, div[role="button"], [class*="nav" i]').forEach(el => {
            const t = (el.innerText || '').trim();
            if (t && t.length < 30 && t.toLowerCase().includes('side')) {
                const r = el.getBoundingClientRect();
                if (r.width > 0) out.push({tag: el.tagName, text: t, href: el.href || '', cls: (el.className||'').slice(0,60)});
            }
        });
        return out;
    }""")
    print(f"  'Side' elements found: {len(side_elements)}", file=sys.stderr)
    for s in side_elements:
        print(f"    {s}", file=sys.stderr)

    # If side has a link, visit it
    if side_elements:
        for s in side_elements:
            if s.get("href"):
                print(f"  Visiting: {s['href']}", file=sys.stderr)
                page.goto(s["href"], wait_until="domcontentloaded", timeout=20000)
                time.sleep(5)
                page.screenshot(path=f"{OUT_DIR}/anidap-side-page.png", full_page=False)
                print(f"  Title: {page.title()!r}", file=sys.stderr)
                print(f"  URL: {page.url}", file=sys.stderr)
                break
    else:
        # Try /side URL directly
        for path in ["/side", "/watch-together", "/party", "/room"]:
            r = page.request.get(f"https://anidap.lol{path}", headers={"Referer":"https://anidap.lol/"})
            print(f"  {path}: HTTP {r.status}", file=sys.stderr)
            if r.status == 200:
                page.goto(f"https://anidap.lol{path}", wait_until="domcontentloaded", timeout=20000)
                time.sleep(4)
                page.screenshot(path=f"{OUT_DIR}/anidap-{path.strip('/')}.png", full_page=False)

    # Save findings
    with open(f"{OUT_DIR}/deep-findings.json", "w") as f:
        json.dump({
            "ws_logs": ws_logs[:50],
            "api_logs": api_logs[:50],
            "webrtc_ice": webrtc_logs,
        }, f, indent=2)

    print(f"\n=== TOTAL FINDINGS ===", file=sys.stderr)
    print(f"  WebSocket events: {len(ws_logs)}", file=sys.stderr)
    print(f"  API calls: {len(api_logs)}", file=sys.stderr)
    print(f"  WebRTC ICE servers: {len(webrtc_logs)}", file=sys.stderr)

    browser.close()
