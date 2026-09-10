#!/usr/bin/env python3
"""Fetch all 6 yumezone /p/ URLs through a real browser that solved CF challenge."""
import json, os, sys, time
from playwright.sync_api import sync_playwright

URLS = [
    "https://yumezone.live/p/LWWREeWwSHCpDHhP0gFsDUpXIbIhLqu5DgDrRC9MkOhzabn1Ka74asONEl67_PhiFPXHYARyAuxNHJYBDOR-_jFxuARnYfvtpi1DJqBZxyRMIqkOr0wKlYKcboNNgpuz1yrDNoIQLj6baIyI5V-ZsVGQRbjnWk_fUbouYHqQASF39L6IsHAb2uA9WuaNMLDvFrZCVokyMUBhzut4luqJjqnabrMhLomNzZF1ohCug6NLwXTZV7DTyzdsC9k4-SjCCIHOMoCHWm0_V3LLgHOy0V0xig0hOU1RKgf8QJ2OFyZ7",
    "https://yumezone.live/p/XFm28VCQVA4WT35VHdPzrQhsFwjOhPajdrg85UUmzP5jyid9Iw7-M2xiISsODq-Hy1UmR4WMTg1OWBAEhMk-HIJcgnS8Tzkb45whGLxUL80YDz35l8Las6HCvAbqgHVnL3agyoAsqygjSkXd1ppj6xD-HFKBgRXf2lMMN_bPCtE3vKC074bsWXDs65t-3vE3fgJZTduq5LCCgyhGxBsJYPMRafxUR-21F_yybKhe0x4g_GCWF5b0UtVkLKRyQxebH_-m_lU8HlgIb-4p9wt9_vZxxVCdBfpa6N8TeDRwOAO0",
    "https://yumezone.live/p/r2V9kPVRJPL_EbVAA4fw4bTr3jQ9Ie9YiFDN7OcmIp6kBtnwdiZVNWFDj0XS4U_fG_QOmodUqcpSg7YS2u7hnWOcaAJTvFlJZg8EeAuxFQtx_syXRwMyuc7X1v5Gz5wJ8A3LxzSrXz_fpI97T0jUQzI3P_RtaFRy7GxthpnXi54BU-t93THyE_6DsQWP_JQVToJ-3Keh_oSFdehCq3aBYvrrPpPruzjt5sOsjtd7UnlB_-eYtfnqCd8ZDxaZo227FhJCB-KQHcxLEmen-ZV8oTzIondhwZK3P0K9ax94w-",
    "https://yumezone.live/p/DY8Kmdw3SqsxF69GMvG4rpFweZG6NRjtQH1_sefrUDceiDiJNpfFlCTlxJ8hb5hrBi2NNbTd2rxpFTlf_SgZnHDqkMpqlVmtsHvDrZzi_z4rnJBASWAmEtix9Egg9e5peZ035XsdApX-jvTnLm8CDV60HCo4dlPPZVZw7Y-uVpZvoI77DNaKkjhAFInjKCHHeL7o9ik6_EqqvqP21vJll5gbwRcfcU67z4KlZgeuRvM8mzXlogD8IZc3bD16_sw3KjPYW2A_MmVfRRx34jO43HW23MLaFX4HW62wqP2YycMM",
    "https://yumezone.live/p/V4iuv35F7QOhxBeD1MEdBAI6kraPk-28K0Fw1OFQIUWKRZlXNebLJNEHW2QZWblYUwnb9H8yes8zNoL9jjhJF8XAFszYd2cVn1iq1uBx0z7UY_NoYN4Nx4Ds_rvGbyt2xCnFQBvSJrjh_LbpjGo9VNjlPWlYPuQhgdUpm6x6VCFYL5Lwu-RrqxaTmqLiyZpX3J22yyR-aQDxuRT1FdZUqqNwDUod7XlD6dlZSg3bLNIPVyvpi3vDGoLD6z9PL-RWL6WdAuuJeSR_fLn4fVS2ROcH4bMwI1TGlGr8TbOQ9fPP",
    "https://yumezone.live/p/MnQDY3nzqay6CBo7QalOgqKvwW0Feii9VtktM_TPY-DCEOg9E4m3F0RjYo6nu_HcsukXpYiREbCGGsCGpxywmsfaQF2DfndU6n-ILf6ncDkWNNVPwx8T5PCSNuGqqLR77i3Xtq3KRR2uqrdleu7bYWefscsz9FvqnY8k-Chux0fTmyptvTcDuTFUhjcQTw1PgZ2orgjislrCU-miiwgVJfxDf6GxvC19uGnF1lq1QwazIi2mF9AhWPjcUzjvnqBd80zuO09Yk6pnIUMXC3Oes3sTPeC_JXyjsNWqS_innUJo",
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox","--disable-blink-features=AutomationControlled"])
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        viewport={"width":1440,"height":900}, locale="en-US",
        extra_http_headers={"Accept-Language":"en-US,en;q=0.9"})
    context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
    page = context.new_page()

    # First load yumezone homepage to solve CF challenge + get cf_clearance cookie
    print("=== Solving CF challenge on yumezone.live ===", file=sys.stderr)
    try:
        page.goto("https://yumezone.live/", wait_until="domcontentloaded", timeout=30000)
    except: pass
    for i in range(30):
        time.sleep(2)
        title = page.title()
        if "Just a moment" not in title and "Checking" not in title:
            print(f"  CF cleared at {i*2}s — title: {title!r}", file=sys.stderr)
            break
    else:
        print(f"  CF didn't clear. Final: {page.title()!r}", file=sys.stderr)
    time.sleep(3)

    # Now fetch each URL through page.request (carries cf_clearance cookie)
    print(f"\n=== Fetching all 6 /p/ URLs ===", file=sys.stderr)
    results = []
    for i, url in enumerate(URLS, 1):
        try:
            r = page.request.get(url, headers={
                "Accept": "*/*",
                "Accept-Encoding": "gzip, deflate, br",
                "Range": "bytes=0-4096",
                "Referer": "https://yumezone.live/",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
            })
            ct = r.headers.get("content-type","?")
            cl = r.headers.get("content-length","?")
            cr = r.headers.get("content-range","")
            cache = r.headers.get("cache-control","")
            acrh = r.headers.get("access-control-allow-origin","")
            ar = r.headers.get("accept-ranges","")
            body = r.body()[:500]
            # Identify
            kind = "unknown"
            preview = ""
            if r.status in (200, 206):
                if body[:7] == b"#EXTM3U":
                    kind = "HLS M3U8 PLAYLIST"
                    preview = body[:400].decode('utf-8', errors='replace')
                elif body[:4] == b"\x89PNG":
                    kind = "PNG image"
                elif body[4:8] == b"ftyp":
                    kind = "MP4 (init segment)"
                elif body[:1] == b"\x47" and len(body) >= 188:
                    kind = "MPEG-TS segment (.ts)"
                elif b"WEBVTT" in body[:30]:
                    kind = "WebVTT subtitle"
                elif body[:2] == b"\xff\xd8":
                    kind = "JPEG image"
                elif body[:3] == b"ID3":
                    kind = "MP3 audio"
                else:
                    preview = f"hex: {body[:80].hex()}"
            else:
                preview = r.text()[:200]
            results.append({
                "n": i, "url": url[:80], "status": r.status,
                "content_type": ct, "content_length": cl, "content_range": cr,
                "cache_control": cache, "cors": acrh, "accept_ranges": ar,
                "kind": kind, "preview": preview[:400],
            })
            print(f"\n--- URL #{i} ---", file=sys.stderr)
            print(f"  Status: {r.status}  Content-Type: {ct}", file=sys.stderr)
            print(f"  Length: {cl}  Range: {cr}", file=sys.stderr)
            print(f"  Cache: {cache}  CORS: {acrh}  Accept-Ranges: {ar}", file=sys.stderr)
            print(f"  KIND: {kind}", file=sys.stderr)
            if preview:
                print(f"  Preview: {preview[:300]}", file=sys.stderr)
        except Exception as e:
            print(f"\n--- URL #{i} ERROR: {str(e)[:100]} ---", file=sys.stderr)
            results.append({"n": i, "error": str(e)[:200]})

    with open("/home/z/my-project/download/yumezone-research/url-analysis.json", "w") as f:
        json.dump(results, f, indent=2)

    browser.close()
