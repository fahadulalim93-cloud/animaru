#!/usr/bin/env python3
"""
Capture screenshots + network activity from anidap.lol (Side feature)
and watch2gether.com (the canonical watch-together UI).

We want to:
  1. Find anidap's "Side" feature — click around, screenshot it
  2. Visit watch2gether.com — screenshot the room UI
  3. Capture all WebSocket / socket.io / WebRTC traffic to identify the sync protocol
  4. Save screenshots + a JSON dump of network findings
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


def capture_site(name: str, url: str, click_words=None, scroll=True, wait=8):
    """Load a site, screenshot it, capture network, optionally click elements with given text."""
    click_words = click_words or []
    findings = {
        "name": name,
        "url": url,
        "screenshots": [],
        "ws_connections": [],   # WebSocket URLs
        "webrtc_ice": [],        # STUN/TURN servers
        "socketio_endpoints": [],
        "api_calls": [],         # REST API calls (paths only)
        "sync_keywords": [],     # play/pause/seek/room/party refs in JS
        "final_url": "",
        "title": "",
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-blink-features=AutomationControlled"])
        context = browser.new_context(
            user_agent=UA, viewport={"width": 1440, "height": 900}, locale="en-US",
            extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
        )
        context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
        page = context.new_page()

        # Network capture
        def on_request(req):
            u = req.url
            if u.startswith("ws://") or u.startswith("wss://"):
                findings["ws_connections"].append(u)
                print(f"  [WS] {u}", file=sys.stderr)
            if "socket.io" in u:
                findings["socketio_endpoints"].append(u)
                print(f"  [SIO] {u}", file=sys.stderr)
            # REST API calls (skip static assets)
            if any(x in u for x in ["/api/","/v1/","/v2/","/sync","/room","/party","/state","/w2g","/side"]) and not u.endswith((".js",".css",".png",".jpg",".svg",".woff",".woff2")):
                findings["api_calls"].append({"method": req.method, "url": u[:200]})
        def on_response(resp):
            # Look for WebRTC STUN/TURN configs in any response
            txt = ""
            try: txt = resp.text()[:5000]
            except: pass
            for m in re.finditer(r'(stun:|turn:)[^"\',\s]+', txt):
                if m.group(0) not in findings["webrtc_ice"]:
                    findings["webrtc_ice"].append(m.group(0))
                    print(f"  [ICE] {m.group(0)}", file=sys.stderr)
        page.on("request", on_request)
        page.on("response", on_response)

        # Capture console errors for debugging
        page.on("console", lambda msg: print(f"  [console.{msg.type}] {msg.text[:120]}", file=sys.stderr) if msg.type in ("error","warning") else None)

        print(f"\n=== [{name}] Loading {url} ===", file=sys.stderr)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            print(f"  goto warn: {e}", file=sys.stderr)
        time.sleep(wait)

        findings["final_url"] = page.url
        findings["title"] = page.title()
        print(f"  Title: {findings['title']!r}", file=sys.stderr)
        print(f"  Final URL: {findings['final_url']}", file=sys.stderr)

        # Screenshot 1: initial state
        shot1 = f"{OUT_DIR}/{name}-1-home.png"
        page.screenshot(path=shot1, full_page=False)
        findings["screenshots"].append(shot1)
        print(f"  Screenshot 1: {shot1}", file=sys.stderr)

        # Scroll + screenshot
        if scroll:
            for i in range(3):
                page.evaluate(f"window.scrollTo(0, {(i+1) * 500})")
                time.sleep(0.5)
            shot_scroll = f"{OUT_DIR}/{name}-2-scrolled.png"
            page.screenshot(path=shot_scroll, full_page=False)
            findings["screenshots"].append(shot_scroll)

        # Click elements matching click_words
        for word in click_words:
            try:
                clicked = page.evaluate(f"""() => {{
                    const els = Array.from(document.querySelectorAll('button, a, div[role="button"], [class*="btn" i]'));
                    const match = els.find(e => {{
                        const t = (e.innerText || '').trim().toLowerCase();
                        return t.includes('{word.lower()}') && e.getBoundingClientRect().width > 0;
                    }});
                    if (match) {{ match.click(); return match.innerText.trim().slice(0, 50); }}
                    return null;
                }}""")
                if clicked:
                    print(f"  Clicked '{word}': {clicked!r}", file=sys.stderr)
                    time.sleep(4)
                    shot = f"{OUT_DIR}/{name}-3-after-{word.replace(' ','_')}.png"
                    page.screenshot(path=shot, full_page=False)
                    findings["screenshots"].append(shot)
                    findings[f"clicked_{word}"] = clicked
            except Exception as e:
                print(f"  Click '{word}' failed: {e}", file=sys.stderr)

        # Scan page content for sync keywords
        try:
            content = page.content()
            for kw in ["watch together","watch-together","watchtogether","side","party","room","sync","host","co-host","invite","lobby","playback","seek","pause-sync"]:
                if kw.lower() in content.lower():
                    findings["sync_keywords"].append(kw)
        except: pass

        # Save HTML for inspection
        try:
            with open(f"{OUT_DIR}/{name}-page.html", "w") as f:
                f.write(page.content())
        except: pass

        browser.close()

    return findings


# ============================================================
# Capture both sites
# ============================================================
results = {}

# 1. AniDap.lol — find the "Side" feature
results["anidap"] = capture_site(
    "anidap",
    "https://anidap.lol/",
    click_words=["Side", "Watch Together", "Watch Party", "Party", "Room"],
    scroll=True,
    wait=6,
)

# 2. Watch2Gether — the canonical watch-together site
results["w2g"] = capture_site(
    "w2g",
    "https://w2g.tv/",
    click_words=["Create Room", "Create a Room", "Start", "New Room"],
    scroll=True,
    wait=8,
)

# Save findings
with open(f"{OUT_DIR}/findings.json", "w") as f:
    json.dump(results, f, indent=2)

print(f"\n=== SUMMARY ===", file=sys.stderr)
for name, r in results.items():
    print(f"\n[{name}] {r['url']}", file=sys.stderr)
    print(f"  Title: {r['title']!r}", file=sys.stderr)
    print(f"  Final URL: {r['final_url']}", file=sys.stderr)
    print(f"  Screenshots: {len(r['screenshots'])}", file=sys.stderr)
    print(f"  WebSocket connections: {len(r['ws_connections'])}", file=sys.stderr)
    for ws in r["ws_connections"][:5]:
        print(f"    {ws}", file=sys.stderr)
    print(f"  Socket.IO endpoints: {len(r['socketio_endpoints'])}", file=sys.stderr)
    print(f"  WebRTC ICE servers: {len(r['webrtc_ice'])}", file=sys.stderr)
    for ice in r["webrtc_ice"][:5]:
        print(f"    {ice}", file=sys.stderr)
    print(f"  API calls: {len(r['api_calls'])}", file=sys.stderr)
    for c in r["api_calls"][:10]:
        print(f"    {c['method']} {c['url'][:120]}", file=sys.stderr)
    print(f"  Sync keywords found: {r['sync_keywords']}", file=sys.stderr)

print(f"\nFiles saved to: {OUT_DIR}", file=sys.stderr)
