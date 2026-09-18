import time
import json
import urllib.request
import urllib.error

BASE = "https://ap.luffytv.live"
ANILIST_ID = 21  # One Piece
EP = 1

def fetch(label, url, timeout=10):
    try:
        t0 = time.time()
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode())
        elapsed = time.time() - t0
        # count servers
        servers = 0
        if isinstance(data, dict):
            if "servers" in data:
                servers = len(data.get("servers", []))
            elif "sub" in data or "dub" in data:
                servers = len(data.get("sub", [])) + len(data.get("dub", []))
            elif "streams" in data:
                servers = len(data.get("streams", []))
            total = data.get("total", servers)
        return label, elapsed, servers, total, "OK"
    except Exception as e:
        elapsed = time.time() - t0
        return label, elapsed, 0, 0, str(e)[:60]

results = []

# ── 1. AniDap combined (all-sources) — single call ──
url = f"{BASE}/anidap/all-sources/{ANILIST_ID}/{EP}"
for i in range(3):
    r = fetch(f"AniDap-All run{i+1}", url)
    results.append(r)

# ── 2. KAA combined (sub + dub in parallel) ──
# Test sub and dub separately first
url_sub = f"{BASE}/kaa/watch/{ANILIST_ID}/sub/{EP}"
url_dub = f"{BASE}/kaa/watch/{ANILIST_ID}/dub/{EP}"

for i in range(3):
    r = fetch(f"KAA-sub run{i+1}", url_sub)
    results.append(r)
    r = fetch(f"KAA-dub run{i+1}", url_dub)
    results.append(r)

# KAA combined (parallel time = max of sub+dub)
for i in range(3):
    t0 = time.time()
    # simulate parallel
    try:
        req1 = urllib.request.Request(url_sub, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
        req2 = urllib.request.Request(url_dub, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req1, timeout=10) as resp1:
            d1 = json.loads(resp1.read().decode())
        with urllib.request.urlopen(req2, timeout=10) as resp2:
            d2 = json.loads(resp2.read().decode())
        elapsed = time.time() - t0
        s1 = len(d1.get("streams", []))
        s2 = len(d2.get("streams", []))
        results.append((f"KAA-combined run{i+1}", elapsed, s1+s2, s1+s2, "OK"))
    except Exception as e:
        elapsed = time.time() - t0
        results.append((f"KAA-combined run{i+1}", elapsed, 0, 0, str(e)[:60]))

# ── 3. Miruro all-sources ──
url_miruro = f"{BASE}/miruro/all-sources/{ANILIST_ID}/{EP}"
for i in range(3):
    r = fetch(f"Miruro-All run{i+1}", url_miruro)
    results.append(r)

# ── 4. MKissa ──
url_mkissa = f"{BASE}/mkissa/watch/{ANILIST_ID}/{EP}"
for i in range(3):
    r = fetch(f"MKissa run{i+1}", url_mkissa)
    results.append(r)

# Print results
print("\n" + "="*80)
print(f"SPEED COMPARISON — ap.luffytv.live (One Piece ep1, anilistId={ANILIST_ID})")
print("="*80)
print(f"{'Endpoint':<25} {'Time(s)':<10} {'Servers':<10} {'Status'}")
print("-"*80)

# Group and show averages
from collections import defaultdict
groups = defaultdict(list)
for label, elapsed, servers, total, status in results:
    base = label.rsplit(" run", 1)[0]
    groups[base].append((elapsed, servers, total, status))

for base, runs in groups.items():
    avg_time = sum(r[0] for r in runs) / len(runs)
    avg_servers = sum(r[1] for r in runs) / len(runs)
    best_time = min(r[0] for r in runs)
    status = runs[0][3]
    print(f"{base:<25} {avg_time:>6.2f}s (best:{best_time:.2f}s) {avg_servers:>5.0f} srv   {status}")

print("\n" + "="*80)
print("SUMMARY: AniDap vs Miruro vs KAA vs MKissa")
print("="*80)
for base in ["AniDap-All", "Miruro-All", "KAA-combined", "MKissa", "KAA-sub", "KAA-dub"]:
    if base in groups:
        runs = groups[base]
        avg = sum(r[0] for r in runs) / len(runs)
        best = min(r[0] for r in runs)
        srv = max(r[1] for r in runs)
        print(f"  {base:<20} avg={avg:.2f}s  best={best:.2f}s  servers={srv}")

