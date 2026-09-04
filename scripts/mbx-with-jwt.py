#!/usr/bin/env python3
"""
Use Playwright to load MovieBoxhd, capture the auto-issued guest JWT,
then use it to call subject/play directly. The JWT is stored in mb_token cookie.
"""
import json
import time
import requests
import hashlib
from playwright.sync_api import sync_playwright

DETAIL_PATH = "beauty-in-black-E6NEe5Ha927"
SUBJECT_ID = "5904172458474619680"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport={"width": 1366, "height": 900},
        locale="en-US",
    )
    page = context.new_page()
    
    # Capture all API calls + cookies
    api_calls = []
    def on_req(req):
        if "wefeed" in req.url:
            api_calls.append({
                "url": req.url,
                "method": req.method,
                "headers": {k.lower(): v for k, v in req.headers.items()},
            })
    page.on("request", on_req)
    
    # Navigate to detail page to get JWT
    page.goto(f"https://movieboxhd.net/detail/{DETAIL_PATH}", wait_until="domcontentloaded", timeout=30000)
    time.sleep(5)
    
    # Get cookies
    cookies = context.cookies()
    print("=== Cookies ===")
    for c in cookies:
        print(f"  {c['name']}={c['value'][:80]}...")
    
    # Find the mb_token cookie
    mb_token = None
    for c in cookies:
        if c['name'] == 'mb_token':
            mb_token = c['value']
            # It's URL-encoded JSON, decode it
            import urllib.parse
            try:
                decoded = urllib.parse.unquote(mb_token)
                try:
                    mb_token = json.loads(decoded)
                except:
                    pass
            except: pass
            print(f"\n=== mb_token (decoded) ===")
            print(repr(mb_token)[:200])
            break
    
    # Find the Authorization header that was actually used
    print("\n=== Look for Authorization in API calls ===")
    auth_token = None
    for c in api_calls:
        h = c['headers']
        if 'authorization' in h and h['authorization']:
            auth_token = h['authorization']
            print(f"  URL: {c['url'][:100]}")
            print(f"  Auth: {auth_token[:100]}...")
            break
    
    browser.close()

# Now try subject/play with the captured Bearer token
if auth_token:
    print("\n\n=== Trying subject/play with captured JWT ===")
    ts = int(time.time())
    reversed_ts = str(ts)[::-1]
    client_token = f'{ts},{hashlib.md5(reversed_ts.encode()).hexdigest()}'
    
    s = requests.Session()
    s.headers.update({
        'User-Agent': 'Mozilla/5.0',
        'Origin': 'https://movieboxhd.net',
        'Referer': 'https://movieboxhd.net/',
        'Accept': 'application/json',
        'X-Client-Info': json.dumps({'timezone':'UTC'}),
        'X-Request-Lang': 'en',
        'X-Vip-Restrict': '1',
        'X-No-High-Risk-Restrict': '0',
        'Authorization': auth_token,
    })
    
    # Test play with various se values
    for se_val in [60, 13, 235, '', 1, 0]:
        r = s.get('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/play',
            params={'subjectId':SUBJECT_ID,'se':se_val,'ep':1,'detailPath':DETAIL_PATH,'streamSignType':1},
            timeout=15)
        d = r.json().get('data',{})
        print(f'se={se_val!r}: hasResource={d.get("hasResource")}, hls={len(d.get("hls",[]))}, streams={len(d.get("streams",[]))}, limited={d.get("limited")}, code={d.get("limitedCode")!r}, vipLocked={d.get("vipLocked")}, playConfig={d.get("playConfig")}')
        if d.get('hls'):
            print('  HLS:', json.dumps(d['hls'], indent=2)[:1500])
            break
        if d.get('streams'):
            print('  Streams:', json.dumps(d['streams'], indent=2)[:1500])
            break
