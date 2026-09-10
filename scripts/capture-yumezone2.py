#!/usr/bin/env python3
"""Yumezone capture with full stealth + extended CF wait."""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

OUT_DIR = "/home/z/my-project/download/yumezone-research"
os.makedirs(OUT_DIR, exist_ok=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"


def stealth():
    return """
    Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
    delete navigator.__proto__.webdriver;
    Object.defineProperty(navigator, 'plugins', {get: () => {
        const p = [{name:'PDF Viewer'},{name:'Chrome PDF Viewer'},{name:'Chromium PDF Viewer'},{name:'Microsoft Edge PDF Viewer'},{name:'WebKit built-in PDF'}];
        p.length = 5; return p;
    }});
    Object.defineProperty(navigator, 'languages', {get: () => ['en-US','en']});
    Object.defineProperty(navigator, 'platform', {get: () => 'Win32'});
    Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 8});
    Object.defineProperty(navigator, 'deviceMemory', {get: () => 8});
    window.chrome = {runtime:{}, app:{isInstalled:false}, csi:()=>{}, loadTimes:()=>{}};
    const oq = window.navigator.permissions.query;
    window.navigator.permissions.query = (p) => p.name === 'notifications' ?
        Promise.resolve({state: Notification.permission}) : oq(p);
    const gp = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(p) {
        if (p === 37445) return 'Intel Inc.';
        if (p === 37446) return 'Intel Iris OpenGL Engine';
        return gp.call(this, p);
    };
    """

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox","--disable-blink-features=AutomationControlled","--disable-dev-shm-usage","--no-first-run","--start-maximized"])
    context = browser.new_context(user_agent=UA, viewport={"width":1920,"height":1080}, locale="en-US", timezone_id="America/Los_Angeles",
                                   extra_http_headers={
                                       "Accept-Language":"en-US,en;q=0.9",
                                       "sec-ch-ua":'"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
                                       "sec-ch-ua-mobile":"?0","sec-ch-ua-platform":'"Windows"',
                                   })
    context.add_init_script(stealth())
    page = context.new_page()

    m3u8_responses = []
    proxy_requests = []
    video_requests = []
    api_calls = []
    all_reqs = []

    def on_req(req):
        u = req.url
        all_reqs.append({"method":req.method,"url":u,"type":req.resource_type})
        if any(p in u for p in ["/proxy","/stream","/p/","/m3u8","/playlist","?url=","?u=","?target=","?src=","?video="]):
            proxy_requests.append({"method":req.method,"url":u,"headers":{k:v for k,v in req.headers.items() if k.lower() in ('range','referer','origin','accept','user-agent')}})

    def on_resp(resp):
        u = resp.url
        ct = resp.headers.get("content-type","")
        if "mpegurl" in ct or "x-mpegurl" in ct or u.endswith(".m3u8") or "/index.m3u8" in u or "/playlist" in u:
            try:
                body = resp.text()
                m3u8_responses.append({"url":u,"status":resp.status,"content_type":ct,"headers":dict(resp.headers),"body":body[:8000]})
                print(f"  [M3U8] {resp.status} {u[:140]}", file=sys.stderr)
            except: pass
        elif "json" in ct:
            try:
                body = resp.text()
                if any(k in body.lower() for k in ["source","stream","video","url","m3u8","playlist"]):
                    api_calls.append({"url":u,"status":resp.status,"body":body[:3000]})
                    print(f"  [API] {resp.status} {u[:140]}", file=sys.stderr)
            except: pass
        elif u.endswith((".ts",".m4s",".mp4",".m4a",".aac")) or "/seg" in u or "/chunk" in u:
            video_requests.append({"url":u[:200],"status":resp.status,"content_type":ct})
            if len(video_requests) <= 3:
                print(f"  [SEG] {resp.status} {u[:140]}", file=sys.stderr)

    page.on("request", on_req)
    page.on("response", on_resp)

    url = "https://yumezone.live/watch/178789/1"
    print(f"=== Loading {url} ===", file=sys.stderr)
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except Exception as e:
        print(f"  goto warn: {e}", file=sys.stderr)

    # Wait for CF challenge to clear (up to 60s)
    print("\n=== Waiting for Cloudflare challenge ===", file=sys.stderr)
    for i in range(30):
        time.sleep(2)
        title = page.title()
        if "Just a moment" not in title and "Checking" not in title:
            print(f"  Cleared at {i*2}s — title: {title!r}", file=sys.stderr)
            break
    else:
        print(f"  CF didn't clear. Final title: {page.title()!r}", file=sys.stderr)

    time.sleep(5)
    page.screenshot(path=f"{OUT_DIR}/1-loaded.png", full_page=False)
    print(f"\n  Title: {page.title()!r}", file=sys.stderr)
    print(f"  URL: {page.url}", file=sys.stderr)

    # Wait for m3u8 traffic
    print("\n=== Waiting 30s for video traffic ===", file=sys.stderr)
    time.sleep(30)
    page.screenshot(path=f"{OUT_DIR}/2-after-wait.png", full_page=False)

    # Try clicking play
    print("\n=== Looking for play/server buttons ===", file=sys.stderr)
    btns = page.evaluate("""() => {
        const out = [];
        document.querySelectorAll('button, a, div[role="button"], [class*="server" i]').forEach(el => {
            const t = (el.innerText || '').trim();
            const r = el.getBoundingClientRect();
            if (t && t.length < 40 && r.width > 0) out.push({text:t, x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height), cls:(el.className||'').slice(0,80)});
        });
        return out.slice(0, 40);
    }""")
    for b in btns:
        if any(kw in b['text'].lower() for kw in ['play','server','stream','luffy','miruro','miku','quality','sub','dub']):
            print(f"  {b['text']:25s} @ ({b['x']},{b['y']}) cls={b['cls'][:50]}", file=sys.stderr)

    # Click first matching server button
    for word in ['Luffy','Brooke','Franky','Miruro','Miku','Server 1','Server','Play','Sub','Dub']:
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
            time.sleep(5)
            page.screenshot(path=f"{OUT_DIR}/3-after-click.png", full_page=False)
            break

    # Try video element
    page.evaluate("""() => {
        const v = document.querySelector('video');
        if (v) { v.muted = true; v.play().catch(()=>{}); return 'video.play()'; }
        return 'no video';
    }""")
    time.sleep(8)
    page.screenshot(path=f"{OUT_DIR}/4-final.png", full_page=False)

    print(f"\n=== SUMMARY ===", file=sys.stderr)
    print(f"  Total reqs: {len(all_reqs)}", file=sys.stderr)
    print(f"  m3u8: {len(m3u8_responses)}", file=sys.stderr)
    print(f"  Proxy-pattern: {len(proxy_requests)}", file=sys.stderr)
    print(f"  Segments: {len(video_requests)}", file=sys.stderr)
    print(f"  API JSON: {len(api_calls)}", file=sys.stderr)

    with open(f"{OUT_DIR}/findings.json", "w") as f:
        json.dump({
            "all_requests":[{"method":r["method"],"url":r["url"],"type":r["type"]} for r in all_reqs[:400]],
            "proxy_requests": proxy_requests[:30],
            "m3u8_responses": m3u8_responses[:10],
            "video_segments": video_requests[:30],
            "api_calls": api_calls[:15],
        }, f, indent=2)

    browser.close()
