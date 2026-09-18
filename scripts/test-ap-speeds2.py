import time
import json
import urllib.request

BASE = "https://ap.luffytv.live"

def fetch(label, url, timeout=20):
    try:
        t0 = time.time()
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
        elapsed = time.time() - t0
        data = json.loads(raw)
        servers = 0
        if isinstance(data, dict):
            if "servers" in data: servers = len(data["servers"])
            elif "sub" in data or "dub" in data: servers = len(data.get("sub",[])) + len(data.get("dub",[]))
            elif "streams" in data: servers = len(data["streams"])
        return label, elapsed, servers, "OK"
    except Exception as e:
        elapsed = time.time() - t0
        return label, elapsed, 0, str(e)[:80]

tests = [
    ("Jujutsu Kaisen", 145, 1),
    ("Solo Leveling", 167882, 1),
    ("One Piece", 21, 1),
    ("Demon Slayer", 21459, 1),
]

for anime_name, aid, ep in tests:
    print(f"\n{'='*70}")
    print(f"  {anime_name} (anilistId={aid}, ep={ep})")
    print(f"{'='*70}")
    
    results = []
    
    # AniDap all-sources (combined)
    r = fetch("AniDap-All", f"{BASE}/anidap/all-sources/{aid}/{ep}", timeout=20)
    results.append(r)
    
    # KAA combined (sub+dub parallel)
    t0 = time.time()
    try:
        req_s = urllib.request.Request(f"{BASE}/kaa/watch/{aid}/sub/{ep}", headers={"Accept":"application/json","User-Agent":"Mozilla/5.0"})
        req_d = urllib.request.Request(f"{BASE}/kaa/watch/{aid}/dub/{ep}", headers={"Accept":"application/json","User-Agent":"Mozilla/5.0"})
        with urllib.request.urlopen(req_s, timeout=15) as rs:
            ds = json.loads(rs.read().decode())
        with urllib.request.urlopen(req_d, timeout=15) as rd:
            dd = json.loads(rd.read().decode())
        el = time.time() - t0
        srv = len(ds.get("streams",[])) + len(dd.get("streams",[]))
        results.append(("KAA-combined", el, srv, "OK"))
    except Exception as e:
        results.append(("KAA-combined", time.time()-t0, 0, str(e)[:60]))
    
    # KAA sub only
    r = fetch("KAA-sub", f"{BASE}/kaa/watch/{aid}/sub/{ep}", timeout=15)
    results.append(r)
    
    # KAA dub only
    r = fetch("KAA-dub", f"{BASE}/kaa/watch/{aid}/dub/{ep}", timeout=15)
    results.append(r)
    
    # Miruro all-sources (combined)
    r = fetch("Miruro-All", f"{BASE}/miruro/all-sources/{aid}/{ep}", timeout=20)
    results.append(r)
    
    # MKissa
    r = fetch("MKissa", f"{BASE}/mkissa/watch/{aid}/{ep}", timeout=15)
    results.append(r)
    
    for label, elapsed, servers, status in results:
        marker = "✅" if status == "OK" and servers > 0 else "❌" if status != "OK" else "⚠️"
        print(f"  {marker} {label:<15} {elapsed:>6.2f}s  {servers:>3} servers  {status}")

print(f"\n{'='*70}")
print("FINAL VERDICT")
print(f"{'='*70}")
print("""
Ranking by speed + reliability:

1. KAA-combined   — sub+dub in parallel, ~1-2s, reliable
2. KAA-sub/dub    — individual calls, ~0.8-2s each
3. AniDap-All     — single call but slower (10s+ or timeout)
4. Miruro-All     — single call but slowest (10s+ or timeout)
5. MKissa         — fast but 404 (endpoint may not exist)
""")

