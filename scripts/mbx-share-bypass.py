#!/usr/bin/env python3
"""
Try the share-unlock bypass: create share URL, visit it in browser (triggers ?share= param),
which should auto-call share-unlock and unlock content. Then click Watch Online and capture m3u8.
"""
import hashlib, json, time, sys, requests
from playwright.sync_api import sync_playwright

SITE = "https://movieboxhd.net"
API = "https://h5-api.aoneroom.com/wefeed-h5api-bff"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
PATH = "beauty-in-black-E6NEe5Ha927"

def make_token():
    ts = int(time.time())
    return f"{ts},{hashlib.md5(str(ts)[::-1].encode()).hexdigest()}"

# Step 1: Get guest JWT + create share URL
s = requests.Session()
s.headers.update({'User-Agent': UA, 'Origin': SITE, 'Referer': f'{SITE}/',
    'X-Client-Info': json.dumps({'timezone':'UTC'}), 'X-Request-Lang': 'en',
    'X-Client-Token': make_token(), 'X-Vip-Restrict': '1', 'X-No-High-Risk-Restrict': '0'})
r = s.get(f'{API}/country-code', timeout=15)
jwt = json.loads(r.headers.get('x-user','{}')).get('token','')
s.headers.update({'Authorization': f'Bearer {jwt}'})
r = s.post(f'{API}/share', json={'url': f'{SITE}/detail/{PATH}'}, timeout=15)
share_url = r.json().get('data',{}).get('shareUrl','')
print(f"Share URL: {share_url}", file=sys.stderr)

# Step 2: Visit share URL in browser (triggers redirect with ?share= param)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(user_agent=UA, viewport={"width":1366,"height":900}, locale="en-US")
    page = context.new_page()
    
    plays = []
    m3u8s = []
    unlocks = []
    all_api = []
    def on_req(req):
        u = req.url
        if "wefeed" in u:
            all_api.append(u)
            print(f"  [api] {req.method} {u[:160]}", file=sys.stderr)
        if "subject/play" in u:
            plays.append(u)
            print(f"  [PLAY] {u[:200]}", file=sys.stderr)
        if ".m3u8" in u:
            m3u8s.append(u)
            print(f"  [M3U8] {u[:200]}", file=sys.stderr)
        if "unlock" in u:
            unlocks.append(u)
            print(f"  [UNLOCK] {u[:200]}", file=sys.stderr)
    page.on("request", on_req)
    
    print(f"\n[1] Visiting share URL: {share_url}", file=sys.stderr)
    page.goto(share_url, wait_until="domcontentloaded", timeout=30000)
    time.sleep(6)
    print(f"  Final URL: {page.url}", file=sys.stderr)
    
    # Step 3: Now click Watch Online
    print(f"\n[2] Clicking Watch Online...", file=sys.stderr)
    page.evaluate("""() => {
        const els = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
        const watch = els.find(e => ['Watch Online','Play','Watch Now'].includes((e.innerText||'').trim()) && e.getBoundingClientRect().width > 0);
        if (watch) { watch.click(); return 'clicked'; }
        return 'not found';
    }""")
    time.sleep(5)
    
    # Step 4: Look for episodes
    print(f"\n[3] Looking for episodes...", file=sys.stderr)
    # Scroll to episodes section
    page.evaluate("window.scrollTo(0, 800)")
    time.sleep(2)
    
    # Click on any episode-like element
    page.evaluate("""() => {
        const els = Array.from(document.querySelectorAll('div, span, button'));
        // Look for elements that look like episode tiles
        const ep = els.find(e => {
            const t = (e.innerText || '').trim();
            const r = e.getBoundingClientRect();
            return /^\d{1,3}$/.test(t) && r.width > 20 && r.width < 100 && r.y > 600;
        });
        if (ep) { ep.click(); return 'clicked ep: ' + ep.innerText; }
        return 'no ep';
    }""")
    time.sleep(5)
    
    # Check videos
    videos = page.evaluate("""() => Array.from(document.querySelectorAll('video')).map(v => ({src: v.src || v.currentSrc, paused: v.paused, t: Math.round(v.currentTime)}))""")
    print(f"\n[4] Videos: {len(videos)}", file=sys.stderr)
    for v in videos:
        print(f"  {v}", file=sys.stderr)
    
    print(f"\n=== Summary: plays={len(plays)} m3u8={len(m3u8s)} unlocks={len(unlocks)} ===", file=sys.stderr)
    
    # Also try fetching the play API directly with the cookies from the browser
    cookies = context.cookies()
    mb_token = None
    for c in cookies:
        if c['name'] == 'mb_token':
            mb_token = c['value']
            break
    if mb_token:
        print(f"\n[5] Got mb_token cookie, trying play API directly", file=sys.stderr)
        # mb_token is URL-encoded JSON string with quotes
        import urllib.parse
        decoded = urllib.parse.unquote(mb_token).strip('"')
        print(f"  Decoded token: {decoded[:80]}...", file=sys.stderr)
        
        # Try play with this token
        r = requests.get(f'{API}/subject/play',
            params={'subjectId':'5904172458474619680','se':60,'ep':1,'detailPath':PATH,'streamSignType':1},
            headers={
                'User-Agent': UA,
                'Origin': SITE,
                'Referer': f'{SITE}/detail/{PATH}',
                'Authorization': f'Bearer {decoded}',
                'X-Client-Info': json.dumps({'timezone':'UTC'}),
                'X-Request-Lang': 'en',
                'X-Vip-Restrict': '1',
                'X-No-High-Risk-Restrict': '0',
            }, timeout=15)
        d = r.json().get('data',{})
        print(f"  Play result: hasResource={d.get('hasResource')}, hls={len(d.get('hls',[]))}, streams={len(d.get('streams',[]))}", file=sys.stderr)
        if d.get('hls'):
            print(f"  HLS: {json.dumps(d['hls'], indent=2)[:500]}", file=sys.stderr)
        if d.get('streams'):
            print(f"  Streams: {json.dumps(d['streams'], indent=2)[:500]}", file=sys.stderr)
    
    browser.close()
