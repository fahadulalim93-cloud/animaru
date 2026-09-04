#!/usr/bin/env python3
"""
MovieBoxHD stream extractor — captures m3u8 URLs by driving the real UI.

Strategy:
1. Load /detail/{path} in Playwright (real browser context, JS executes)
2. Wait for season list to render
3. Click first season → click Episode 1
4. Capture subject/play API response (contains hls/streams arrays)
5. Also capture any direct .m3u8 network requests (HLS player)
6. Parse master playlist for all quality variants + subtitle tracks
"""
import argparse
import json
import re
import sys
import time
from typing import Any, Dict, List, Optional

import requests
from playwright.sync_api import sync_playwright

SITE = "https://movieboxhd.net"
API_BASE = "https://h5-api.aoneroom.com/wefeed-h5api-bff"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def make_client_token() -> str:
    import hashlib
    ts = int(time.time())
    reversed_ts = str(ts)[::-1]
    return f"{ts},{hashlib.md5(reversed_ts.encode()).hexdigest()}"


def get_guest_jwt() -> str:
    """Get a guest JWT by calling /country-code."""
    r = requests.get(f"{API_BASE}/country-code", headers={
        "User-Agent": UA,
        "Origin": SITE,
        "Referer": f"{SITE}/",
        "X-Client-Info": json.dumps({"timezone": "UTC"}),
        "X-Request-Lang": "en",
        "X-Client-Token": make_client_token(),
        "X-Vip-Restrict": "1",
        "X-No-High-Risk-Restrict": "0",
    }, timeout=15)
    x_user = r.headers.get("x-user", "{}")
    return json.loads(x_user).get("token", "")


def extract_streams_via_playwright(detail_path: str, headless: bool = True) -> Dict[str, Any]:
    """
    Load the detail page in a real browser, click Watch Online → Episode 1,
    and capture the subject/play response + any m3u8 network requests.
    """
    result = {
        "detailPath": detail_path,
        "playResponses": [],       # subject/play API responses
        "m3u8Requests": [],        # direct m3u8 network requests
        "mp4Requests": [],         # direct mp4 network requests
        "shareUnlockCalls": [],    # share-unlock API calls
        "allApiCalls": [],         # all BFF API calls (URL only)
        "finalUrl": "",
        "pageErrors": [],
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless, args=["--no-sandbox", "--disable-blink-features=AutomationControlled"])
        context = browser.new_context(
            user_agent=UA,
            viewport={"width": 1366, "height": 900},
            locale="en-US",
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        page = context.new_page()

        def on_request(req):
            url = req.url
            if "wefeed-h5api-bff" in url:
                result["allApiCalls"].append({"method": req.method, "url": url})
            if ".m3u8" in url:
                result["m3u8Requests"].append(url)
                print(f"  [m3u8] {url[:200]}", file=sys.stderr)
            if ".mp4" in url and "aoneroom.com" in url:
                result["mp4Requests"].append(url)
                print(f"  [mp4] {url[:200]}", file=sys.stderr)

        def on_response(resp):
            url = resp.url
            if "subject/play" in url:
                try:
                    j = resp.json()
                    result["playResponses"].append({"url": url, "status": resp.status, "body": j})
                    print(f"  [play] {resp.status} hasResource={j.get('data',{}).get('hasResource')} hls={len(j.get('data',{}).get('hls',[]))} streams={len(j.get('data',{}).get('streams',[]))}", file=sys.stderr)
                except Exception as e:
                    print(f"  [play] error parsing: {e}", file=sys.stderr)
            if "share-unlock" in url or "qrcode-unlock" in url:
                try:
                    j = resp.json()
                    result["shareUnlockCalls"].append({"url": url, "body": j})
                    print(f"  [unlock] {resp.status} {url[:100]}", file=sys.stderr)
                except: pass

        page.on("request", on_request)
        page.on("response", on_response)
        page.on("pageerror", lambda e: result["pageErrors"].append(str(e)))

        url = f"{SITE}/detail/{detail_path}"
        print(f"[1] Loading {url}", file=sys.stderr)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            print(f"  goto warn: {e}", file=sys.stderr)
        time.sleep(5)

        # Step 2: Click "Watch Online" button (opens player modal)
        print("[2] Clicking 'Watch Online'...", file=sys.stderr)
        click_result = page.evaluate("""() => {
            const els = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
            const watch = els.find(e => {
                const t = (e.innerText || '').trim();
                return (t === 'Watch Online' || t === 'Play' || t === 'Watch Now') && e.getBoundingClientRect().width > 0;
            });
            if (watch) { watch.click(); return 'clicked: ' + watch.innerText.trim(); }
            return 'not found';
        }""")
        print(f"  {click_result}", file=sys.stderr)
        time.sleep(4)

        # Step 3: Look for season selector + episode tiles
        print("[3] Looking for season selector + episodes...", file=sys.stderr)
        seasons = page.evaluate("""() => {
            const out = [];
            document.querySelectorAll('*').forEach(el => {
                const t = (el.innerText || '').trim();
                if (t.length < 30 && /^Season\\s*\\d+$/.test(t)) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) {
                        out.push({text: t, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)});
                    }
                }
            });
            return out;
        }""")
        if seasons:
            print(f"  Found {len(seasons)} season labels: {[s['text'] for s in seasons]}", file=sys.stderr)
            # Click first season
            s = seasons[0]
            page.mouse.click(s["x"] + s["w"]//2, s["y"] + s["h"]//2)
            time.sleep(3)

        # Look for episode tiles (numbers 1-50)
        eps = page.evaluate("""() => {
            const out = [];
            document.querySelectorAll('div, span, button, a').forEach(el => {
                const t = (el.innerText || '').trim();
                if (/^\\d{1,3}$/.test(t) && parseInt(t) >= 1 && parseInt(t) <= 50) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0 && r.width < 120) {
                        out.push({text: t, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cls: (el.className || '').slice(0, 80)});
                    }
                }
            });
            return out;
        }""")
        if eps:
            print(f"  Found {len(eps)} episode tiles, clicking ep 1", file=sys.stderr)
            ep1 = next((e for e in eps if e["text"] == "1"), eps[0])
            page.mouse.click(ep1["x"] + ep1["w"]//2, ep1["y"] + ep1["h"]//2)
            time.sleep(6)
        else:
            print("  No episode tiles found. Trying to click anything that looks playable...", file=sys.stderr)
            # Maybe it's a movie — just wait for video to auto-play
            page.evaluate("""() => {
                const v = document.querySelector('video');
                if (v) { v.muted = true; v.play(); return 'video.play()'; }
                return 'no video';
            }""")
            time.sleep(5)

        # Step 4: Try clicking play button if a modal opened
        print("[4] Looking for play button in modal...", file=sys.stderr)
        page.evaluate("""() => {
            const els = Array.from(document.querySelectorAll('button, a, div[role="button"], [class*="play" i]'));
            // Look for any visible "Play" or triangle icon
            const play = els.find(e => {
                const t = (e.innerText || '').trim();
                const r = e.getBoundingClientRect();
                return (t === 'Play' || t === '▶' || e.className && typeof e.className === 'string' && e.className.includes('play')) && r.width > 0;
            });
            if (play) { play.click(); return 'clicked play'; }
            return 'no play btn';
        }""")
        time.sleep(5)

        # Try clicking on the video element itself
        page.evaluate("""() => {
            const v = document.querySelector('video');
            if (v) { v.muted = true; v.play().catch(()=>{}); return 'video clicked'; }
            const iframes = document.querySelectorAll('iframe');
            if (iframes.length > 0) return 'iframes: ' + iframes.length;
            return 'no video';
        }""")
        time.sleep(3)

        result["finalUrl"] = page.url

        # Dump page state if nothing happened
        if not result["playResponses"] and not result["m3u8Requests"]:
            print("\n[debug] Page state:", file=sys.stderr)
            txt = page.evaluate("() => document.body.innerText.slice(0, 800)")
            print(txt[:500], file=sys.stderr)

        browser.close()

    return result


def parse_hls_master(m3u8_url: str, headers: Optional[Dict] = None) -> Dict[str, Any]:
    """Fetch and parse a master m3u8 playlist for quality variants + subtitle tracks."""
    h = headers or {"User-Agent": UA}
    try:
        r = requests.get(m3u8_url, headers=h, timeout=15)
        r.raise_for_status()
    except Exception as e:
        return {"url": m3u8_url, "error": str(e)}

    text = r.text
    base_url = m3u8_url.rsplit("/", 1)[0] + "/"

    variants = []
    subtitles = []
    audios = []
    current_meta = {}

    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#EXT-X-STREAM-INF:"):
            # Parse attributes
            attrs = {}
            # Split on commas but respect quotes
            parts = line[len("#EXT-X-STREAM-INF:"):].split(",")
            for p in parts:
                if "=" in p:
                    k, v = p.split("=", 1)
                    attrs[k.strip()] = v.strip().strip('"')
            current_meta = {
                "bandwidth": attrs.get("BANDWIDTH", ""),
                "resolution": attrs.get("RESOLUTION", ""),
                "codecs": attrs.get("CODECS", ""),
                "frameRate": attrs.get("FRAME-RATE", ""),
                "audio": attrs.get("AUDIO", ""),
                "subtitles": attrs.get("SUBTITLES", ""),
            }
        elif line.startswith("#EXT-X-MEDIA:"):
            attrs = {}
            parts = line[len("#EXT-X-MEDIA:"):].split(",")
            for p in parts:
                if "=" in p:
                    k, v = p.split("=", 1)
                    attrs[k.strip()] = v.strip().strip('"')
            media_type = attrs.get("TYPE", "")
            entry = {
                "type": media_type,
                "groupId": attrs.get("GROUP-ID", ""),
                "name": attrs.get("NAME", ""),
                "language": attrs.get("LANGUAGE", ""),
                "uri": attrs.get("URI", ""),
                "default": attrs.get("DEFAULT", "") == "YES",
                "autoSelect": attrs.get("AUTOSELECT", "") == "YES",
            }
            if media_type == "SUBTITLES":
                subtitles.append(entry)
            elif media_type == "AUDIO":
                audios.append(entry)
        elif line and not line.startswith("#"):
            # This is a URL — either a variant playlist or media segment
            if current_meta:
                full_url = line if line.startswith("http") else base_url + line
                current_meta["url"] = full_url
                variants.append(current_meta)
                current_meta = {}

    return {
        "url": m3u8_url,
        "master": True,
        "variants": variants,
        "subtitles": subtitles,
        "audios": audios,
        "raw": text[:2000],
    }


def fetch_play_via_api(subject_id: str, se: Any = "", ep: Any = "", detail_path: str = "",
                       jwt: Optional[str] = None) -> Dict[str, Any]:
    """Direct API call to subject/play."""
    headers = {
        "User-Agent": UA,
        "Origin": SITE,
        "Referer": f"{SITE}/detail/{detail_path}",
        "Accept": "application/json",
        "X-Client-Info": json.dumps({"timezone": "UTC"}),
        "X-Request-Lang": "en",
        "X-Vip-Restrict": "1",
        "X-No-High-Risk-Restrict": "0",
    }
    if jwt:
        headers["Authorization"] = f"Bearer {jwt}"
    else:
        headers["X-Client-Token"] = make_client_token()

    params = {
        "subjectId": subject_id,
        "se": se,
        "ep": ep,
        "detailPath": detail_path,
        "streamSignType": 1,
    }
    r = requests.get(f"{API_BASE}/subject/play", headers=headers, params=params, timeout=15)
    return r.json().get("data", {})


def main():
    ap = argparse.ArgumentParser(description="MovieBoxHD m3u8 stream extractor")
    ap.add_argument("detail_path", help="Detail path (e.g. beauty-in-black-E6NEe5Ha927)")
    ap.add_argument("--subject-id", help="Subject ID (optional — auto-discovered from page)")
    ap.add_argument("--headed", action="store_true", help="Show browser window")
    ap.add_argument("--output", default="/home/z/my-project/download/movieboxhd-streams.json")
    args = ap.parse_args()

    print(f"\n=== Extracting streams for: {args.detail_path} ===\n", file=sys.stderr)

    # Step 1: Get guest JWT
    jwt = get_guest_jwt()
    print(f"[auth] Guest JWT: {jwt[:60]}...", file=sys.stderr)

    # Step 2: Run Playwright to capture play API calls + m3u8 requests
    pw_result = extract_streams_via_playwright(args.detail_path, headless=not args.headed)

    # Step 3: Also try direct API calls with various se/ep combos
    print("\n[api] Trying direct subject/play API calls...", file=sys.stderr)
    # Try to discover subjectId from page state
    subject_id = args.subject_id
    if not subject_id:
        # Look in allApiCalls for subjectId in query params
        for call in pw_result["allApiCalls"]:
            m = re.search(r"subjectId=(\d+)", call["url"])
            if m:
                subject_id = m.group(1)
                break

    api_results = []
    if subject_id:
        # Try multiple se/ep combos
        for se in ["", 1, 60, 13, 235, 73, 17, 395, 491, 499]:
            for ep in ["", 1, 2]:
                data = fetch_play_via_api(subject_id, se=se, ep=ep, detail_path=args.detail_path, jwt=jwt)
                has_streams = bool(data.get("hls") or data.get("streams"))
                api_results.append({"se": se, "ep": ep, "result": data})
                if has_streams:
                    print(f"  ✓ se={se!r} ep={ep!r}: hls={len(data.get('hls',[]))} streams={len(data.get('streams',[]))}", file=sys.stderr)
                    break
            else:
                continue
            break
    else:
        print("  Could not determine subjectId", file=sys.stderr)

    # Step 4: Parse any m3u8 URLs found
    parsed_playlists = []
    all_m3u8 = list(set(pw_result["m3u8Requests"]))
    # Also extract m3u8 URLs from play API responses
    for pr in pw_result["playResponses"]:
        body = pr.get("body", {}).get("data", {})
        for hls_entry in body.get("hls", []):
            if isinstance(hls_entry, dict):
                url = hls_entry.get("url") or hls_entry.get("streamUrl") or ""
                if url:
                    all_m3u8.append(url)
            elif isinstance(hls_entry, str):
                all_m3u8.append(hls_entry)
        for stream in body.get("streams", []):
            if isinstance(stream, dict):
                url = stream.get("url") or stream.get("streamUrl") or ""
                if url and ".m3u8" in url:
                    all_m3u8.append(url)

    # Also check API results
    for ar in api_results:
        body = ar.get("result", {})
        for hls_entry in body.get("hls", []):
            if isinstance(hls_entry, dict):
                url = hls_entry.get("url") or hls_entry.get("streamUrl") or ""
                if url:
                    all_m3u8.append(url)
            elif isinstance(hls_entry, str):
                all_m3u8.append(hls_entry)

    print(f"\n[parse] Found {len(all_m3u8)} unique m3u8 URLs. Parsing master playlists...", file=sys.stderr)
    for url in list(set(all_m3u8)):
        parsed = parse_hls_master(url)
        parsed_playlists.append(parsed)

    output = {
        "detailPath": args.detail_path,
        "subjectId": subject_id,
        "extracted_at": int(time.time()),
        "playResponses": pw_result["playResponses"],
        "apiResults": api_results,
        "m3u8Urls": list(set(all_m3u8)),
        "parsedPlaylists": parsed_playlists,
        "shareUnlockCalls": pw_result["shareUnlockCalls"],
        "allApiCalls": pw_result["allApiCalls"],
        "pageErrors": pw_result["pageErrors"],
        "finalUrl": pw_result["finalUrl"],
    }

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n=== RESULT ===", file=sys.stderr)
    print(f"m3u8 URLs: {len(output['m3u8Urls'])}", file=sys.stderr)
    print(f"Play API responses: {len(output['playResponses'])}", file=sys.stderr)
    print(f"Share-unlock calls: {len(output['shareUnlockCalls'])}", file=sys.stderr)
    print(f"Saved to: {args.output}", file=sys.stderr)

    if output["m3u8Urls"]:
        print(f"\n=== STREAM URLS ===", file=sys.stderr)
        for u in output["m3u8Urls"]:
            print(f"  {u}", file=sys.stderr)


if __name__ == "__main__":
    main()
