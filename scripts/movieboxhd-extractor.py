#!/usr/bin/env python3
"""
MovieBoxHD Stream Extractor
============================

Extracts direct MP4 stream URLs (all qualities: 360p/480p/720p/1080p) and
SRT subtitle files (all languages) for any movie or TV episode on movieboxhd.net.

KEY INSIGHT (learned from walterwhite-69/Moviebox-API):
  The subject/play API MUST be called on the PLAYER DOMAIN (mzfi.me),
  NOT on h5-api.aoneroom.com. The player domain is returned by
  /media-player/get-domain. The request must include a Referer header
  matching the player page URL pattern:
    {player_domain}/spa/videoPlayPage/movies/{detailPath}?id={subjectId}&type=/movie/detail&detailSe={se}&detailEp={ep}&lang=en

  Subtitles are fetched from /subject/caption using the stream ID.

Usage:
    python3 movieboxhd-extractor.py <detailPath> [--se N] [--ep N]
    python3 movieboxhd-extractor.py beauty-in-black-E6NEe5Ha927 --se 1 --ep 1
"""
import argparse
import hashlib
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional

import requests

# ============================================================
# Config
# ============================================================
SITE = "https://movieboxhd.net"
API_BASE = "https://h5-api.aoneroom.com/wefeed-h5api-bff"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def make_client_token() -> str:
    """X-Client-Token = '{ts},{md5(reverse(ts))}'."""
    ts = int(time.time())
    return f"{ts},{hashlib.md5(str(ts)[::-1].encode()).hexdigest()}"


class MovieBoxStreamExtractor:
    """Extract direct stream URLs + subtitles from MovieBoxHD."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": UA,
            "Origin": SITE,
            "Referer": f"{SITE}/",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Client-Info": json.dumps({"timezone": "UTC"}),
            "X-Request-Lang": "en",
            "X-Vip-Restrict": "1",
            "X-No-High-Risk-Restrict": "0",
        })
        self.jwt: Optional[str] = None
        self.player_domain: Optional[str] = None

    def _ensure_auth(self):
        """Get guest JWT + player domain."""
        if self.jwt and self.player_domain:
            return
        # Get guest JWT
        self.session.headers["X-Client-Token"] = make_client_token()
        r = self.session.get(f"{API_BASE}/country-code", timeout=15)
        x_user = r.headers.get("x-user", "{}")
        self.jwt = json.loads(x_user).get("token", "")
        self.session.headers["Authorization"] = f"Bearer {self.jwt}"
        del self.session.headers["X-Client-Token"]
        # Get player domain
        r = self.session.get(f"{API_BASE}/media-player/get-domain", timeout=15)
        self.player_domain = r.json().get("data", "https://mzfi.me").rstrip("/")
        print(f"[extractor] JWT acquired, player domain: {self.player_domain}", file=sys.stderr)

    def search(self, keyword: str, limit: int = 10) -> List[Dict]:
        """Search for titles. Returns list of {title, subjectId, detailPath}."""
        self._ensure_auth()
        # Try search-suggest first (works with guest token)
        r = self.session.post(f"{API_BASE}/subject/search-suggest",
                              json={"keyword": keyword, "perPage": limit}, timeout=15)
        items = r.json().get("data", {}).get("items", [])
        results = []
        for it in items:
            sub = it.get("subject") or {}
            if sub.get("subjectId"):
                results.append({
                    "title": sub.get("title") or it.get("word", ""),
                    "subjectId": sub["subjectId"],
                    "detailPath": sub.get("detailPath", ""),
                    "subjectType": sub.get("subjectType", 0),
                    "hasResource": sub.get("hasResource", False),
                })
        return results

    def get_detail(self, detail_path: str) -> Dict[str, Any]:
        """Get subject detail including dubs list."""
        self._ensure_auth()
        # Fetch SSR HTML to extract NUXT_DATA (contains dub subjects)
        r = self.session.get(f"{SITE}/moviedetail/{detail_path}", timeout=20)
        html = r.text
        import re
        # Extract __NUXT_DATA__
        m = re.search(r'<script type="application/json"[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>',
                      html, re.DOTALL)
        nuxt = json.loads(m.group(1)) if m else []

        # Find subjectId + dubs from NUXT array
        subject_id = ""
        dubs = []
        for i, item in enumerate(nuxt):
            if isinstance(item, str) and re.match(r"^\d{15,}$", item):
                if not subject_id:
                    subject_id = item
            if isinstance(item, str) and (
                item.endswith(" dub") or item.endswith(" sub") or item == "Original Audio"
            ):
                if i + 2 < len(nuxt):
                    sid = nuxt[i + 1]
                    dp = nuxt[i + 2]
                    if isinstance(sid, str) and isinstance(dp, str) and re.match(r"^\d{15,}$", sid):
                        dubs.append({"label": item, "subjectId": sid, "detailPath": dp})

        # Also find trailer URL
        trailer = ""
        for m in re.finditer(r'https://[a-z0-9]+\.aoneroom\.com/[^"\']+\.(?:mp4|m3u8|mpd)[^"\']*', html):
            trailer = m.group()
            break

        return {
            "detailPath": detail_path,
            "subjectId": subject_id,
            "dubs": dubs,
            "trailerUrl": trailer,
        }

    def get_streams(self, subject_id: str, detail_path: str, se: int = 1, ep: int = 1) -> Dict[str, Any]:
        """
        Get direct stream URLs for a subject.

        Returns:
            {
                "subjectId": "...",
                "se": 1, "ep": 1,
                "hasResource": True,
                "streams": [
                    {
                        "id": "...",
                        "format": "MP4",
                        "resolution": "1080p",
                        "url": "https://bcdnxw.hakunaymatata.com/...",
                        "size": 876259008,
                        "duration": 2634,
                        "codec": "h264",
                        "vipLocked": False
                    },
                    ...
                ],
                "hls": [...],
                "dash": [...],
                "subtitles": [...],
                "playConfig": {"adFree": False, "maxResolution": 480}
            }
        """
        self._ensure_auth()

        # Build player referer (THE KEY)
        player_referer = (
            f"{self.player_domain}/spa/videoPlayPage/movies/{detail_path}"
            f"?id={subject_id}&type=/movie/detail&detailSe={se}&detailEp={ep}&lang=en"
        )
        play_url = (
            f"{self.player_domain}/wefeed-h5api-bff/subject/play"
            f"?subjectId={subject_id}&se={se}&ep={ep}&detailPath={detail_path}"
        )

        player_headers = {
            "User-Agent": UA,
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "X-Client-Info": json.dumps({"timezone": "UTC"}),
            "Authorization": f"Bearer {self.jwt}",
            "Referer": player_referer,
            "Origin": self.player_domain,
        }

        r = requests.get(play_url, headers=player_headers, timeout=20)
        r.raise_for_status()
        data = r.json().get("data", {})

        # Format streams
        streams = []
        for s in data.get("streams", []):
            streams.append({
                "id": s.get("id", ""),
                "format": s.get("format", "MP4"),
                "resolution": f"{s.get('resolutions', '?')}p",
                "url": s.get("url", ""),
                "size": int(s.get("size", 0)),
                "sizeMB": round(int(s.get("size", 0)) / 1024 / 1024, 1),
                "duration": s.get("duration", 0),
                "codec": s.get("codecName", ""),
                "vipLocked": s.get("vipLocked", False),
            })

        # Sort by resolution descending (1080p first)
        streams.sort(key=lambda x: int(x["resolution"].replace("p", "")) if x["resolution"].replace("p", "").isdigit() else 0, reverse=True)

        # Get subtitles for the highest quality stream
        subtitles = []
        if streams:
            subtitles = self._get_subtitles(streams[0]["id"], streams[0]["format"],
                                              subject_id, detail_path, player_headers)

        return {
            "subjectId": subject_id,
            "detailPath": detail_path,
            "se": se,
            "ep": ep,
            "hasResource": data.get("hasResource", False),
            "limited": data.get("limited", False),
            "limitedCode": data.get("limitedCode", ""),
            "vipLocked": data.get("vipLocked", False),
            "shareUnlocked": data.get("shareUnlocked", False),
            "playConfig": data.get("playConfig", {}),
            "streams": streams,
            "hls": data.get("hls", []),
            "dash": data.get("dash", []),
            "subtitles": subtitles,
        }

    def _get_subtitles(self, stream_id: str, stream_format: str, subject_id: str,
                       detail_path: str, player_headers: dict) -> List[Dict]:
        """Get subtitle tracks for a stream."""
        cap_url = (
            f"{self.player_domain}/wefeed-h5api-bff/subject/caption"
            f"?format={stream_format}&id={stream_id}&subjectId={subject_id}&detailPath={detail_path}"
        )
        try:
            r = requests.get(cap_url, headers=player_headers, timeout=15)
            r.raise_for_status()
            caps = r.json().get("data", {}).get("captions", [])
            return [
                {
                    "id": c.get("id", ""),
                    "language": c.get("lan", ""),
                    "languageName": c.get("lanName", ""),
                    "url": c.get("url", ""),
                    "format": "SRT",
                    "size": int(c.get("size", 0)),
                    "delay": c.get("delay", 0),
                }
                for c in caps
            ]
        except Exception as e:
            print(f"[extractor] Subtitle fetch error: {e}", file=sys.stderr)
            return []


def main():
    ap = argparse.ArgumentParser(description="MovieBoxHD stream + subtitle extractor")
    ap.add_argument("detail_path", help="Detail path slug (e.g. beauty-in-black-E6NEe5Ha927)")
    ap.add_argument("--subject-id", help="Subject ID (auto-discovered if omitted)")
    ap.add_argument("--se", type=int, default=1, help="Season number (default: 1)")
    ap.add_argument("--ep", type=int, default=1, help="Episode number (default: 1)")
    ap.add_argument("--search", help="Search for a title instead of providing detail_path")
    ap.add_argument("--output", default="/home/z/my-project/download/movieboxhd-streams.json")
    ap.add_argument("--all-dubs", action="store_true", help="Extract streams for all available dubs")
    args = ap.parse_args()

    extractor = MovieBoxStreamExtractor()

    # Search mode
    if args.search:
        print(f"\n=== Searching for: {args.search} ===", file=sys.stderr)
        results = extractor.search(args.search)
        for i, r in enumerate(results):
            print(f"  [{i}] {r['title']} | {r['subjectId']} | {r['detailPath']}", file=sys.stderr)
        if results:
            print(f"\nUse: python3 {sys.argv[0]} {results[0]['detailPath']}", file=sys.stderr)
        return

    # Get detail (subjectId + dubs)
    detail = extractor.get_detail(args.detail_path)
    subject_id = args.subject_id or detail["subjectId"]
    if not subject_id:
        print(f"ERROR: Could not determine subjectId for {args.detail_path}", file=sys.stderr)
        sys.exit(1)

    print(f"\n=== {args.detail_path} ===", file=sys.stderr)
    print(f"Subject ID: {subject_id}", file=sys.stderr)
    print(f"Dubs available: {len(detail['dubs'])}", file=sys.stderr)
    for d in detail["dubs"]:
        print(f"  - {d['label']} ({d['subjectId']})", file=sys.stderr)

    # Extract streams for main subject
    all_results = []
    print(f"\n=== Extracting streams: S{args.se}E{args.ep} ===", file=sys.stderr)
    result = extractor.get_streams(subject_id, args.detail_path, se=args.se, ep=args.ep)
    all_results.append({"label": "Original", **result})

    if result["streams"]:
        print(f"\n✓ Found {len(result['streams'])} streams:", file=sys.stderr)
        for s in result["streams"]:
            print(f"  {s['resolution']:>6s} | {s['sizeMB']:>8.1f}MB | {s['codec']} | {s['url'][:80]}...", file=sys.stderr)
        print(f"\n✓ Found {len(result['subtitles'])} subtitle tracks:", file=sys.stderr)
        for sub in result["subtitles"]:
            print(f"  {sub['language']:>4s} | {sub['languageName'][:20]:<20s} | {sub['url'][:80]}...", file=sys.stderr)
    else:
        print(f"\n✗ No streams found (hasResource={result['hasResource']})", file=sys.stderr)

    # Extract for all dubs if requested
    if args.all_dubs:
        for dub in detail["dubs"]:
            print(f"\n=== Extracting: {dub['label']} S{args.se}E{args.ep} ===", file=sys.stderr)
            try:
                dub_result = extractor.get_streams(dub["subjectId"], dub["detailPath"],
                                                    se=args.se, ep=args.ep)
                if dub_result["streams"]:
                    print(f"  ✓ {len(dub_result['streams'])} streams, {len(dub_result['subtitles'])} subs", file=sys.stderr)
                all_results.append({"label": dub["label"], **dub_result})
            except Exception as e:
                print(f"  ✗ Error: {e}", file=sys.stderr)

    # Save output
    output = {
        "extracted_at": int(time.time()),
        "detailPath": args.detail_path,
        "subjectId": subject_id,
        "se": args.se,
        "ep": args.ep,
        "trailerUrl": detail.get("trailerUrl", ""),
        "playerDomain": extractor.player_domain,
        "results": all_results,
    }
    with open(args.output, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n=== SAVED ===", file=sys.stderr)
    print(f"File: {args.output}", file=sys.stderr)
    total_streams = sum(len(r.get("streams", [])) for r in all_results)
    total_subs = sum(len(r.get("subtitles", [])) for r in all_results)
    print(f"Total streams: {total_streams}", file=sys.stderr)
    print(f"Total subtitles: {total_subs}", file=sys.stderr)


if __name__ == "__main__":
    main()
