#!/usr/bin/env python3
"""
AniChan m3u8 Scraper
====================

Get HLS m3u8 stream URLs from anichan.net for any anime.

Usage:
    python3 anichan.py "<search_query>" [episode] [--dub]

Examples:
    python3 anichan.py "one piece" 1           # One Piece E1 sub → m3u8
    python3 anichan.py "one piece" 1 --dub     # One Piece E1 dub
    python3 anichan.py "naruto" 50             # Naruto E50
    python3 anichan.py "death note" 5          # Death Note E5

Output: m3u8 URL to stdout (everything else to stderr).
"""
import argparse
import json
import re
import sys
from html import unescape
from typing import Dict, List, Optional
from urllib.parse import quote_plus

from curl_cffi import requests as CfRequests

SITE = "https://anichan.net"
API = "https://anichan.to"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"


class AniChan:
    def __init__(self):
        self.s = CfRequests.Session()
        self.s.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})

    def _create_session(self):
        """POST /api/watch/session → get anichan_ws cookie."""
        r = self.s.post(f"{API}/api/watch/session", impersonate="chrome120", timeout=15,
            headers={"Content-Type": "application/json", "Referer": f"{SITE}/"},
            json={"token": ""})
        return r.status_code == 200

    def search(self, query: str) -> List[Dict]:
        """Search via /search?q= (SSR page with anime links)."""
        r = self.s.get(f"{SITE}/search?q={quote_plus(query)}", impersonate="chrome120", timeout=15,
            headers={"Accept": "text/html", "Referer": f"{SITE}/"})
        if r.status_code != 200:
            return []
        results = []
        seen = set()
        for m in re.finditer(r'href="(/anime/(\d+)/([^"]+))"', r.text):
            href, aid, slug = m.group(1), m.group(2), m.group(3)
            if aid not in seen:
                results.append({"id": aid, "slug": slug, "url": f"{SITE}{href}"})
                seen.add(aid)
        # Sort: shortest slug first (main series)
        ql = query.lower().replace(" ", "-")
        results.sort(key=lambda r: (0 if r["slug"] == ql else 1, len(r["slug"])))
        return results

    def get_servers(self, anilist_id: str, episode: int, category: str = "sub") -> List[Dict]:
        """GET /api/watch/servers → returns server list with m3u8 URLs."""
        # Ensure we have a session
        if not self.s.cookies.get("anichan_ws"):
            if not self._create_session():
                return []

        r = self.s.get(f"{API}/api/watch/servers?anilistId={anilist_id}&ep={episode}&category={category}",
            impersonate="chrome120", timeout=15,
            headers={"Accept": "application/json", "Referer": f"{SITE}/"})
        if r.status_code == 401:
            # Session expired — re-create
            if not self._create_session():
                return []
            r = self.s.get(f"{API}/api/watch/servers?anilistId={anilist_id}&ep={episode}&category={category}",
                impersonate="chrome120", timeout=15,
                headers={"Accept": "application/json", "Referer": f"{SITE}/"})
        if r.status_code != 200:
            return []
        data = r.json()
        servers = data.get("servers", [])
        # Resolve relative stream URLs
        for srv in servers:
            stream = srv.get("stream", "")
            if stream.startswith("/"):
                srv["stream"] = f"{API}{stream}"
            for sub in srv.get("subtitles", []):
                url = sub.get("url", "")
                if url.startswith("/"):
                    sub["url"] = f"{API}{url}"
        return servers


def get_m3u8_url(query: str, episode: int, category: str = "sub") -> str:
    """Get the first available m3u8 URL for an anime episode."""
    client = AniChan()

    # Search
    results = client.search(query)
    if not results:
        raise RuntimeError(f"No results for '{query}'")
    anime = results[0]
    print(f"[✓] Found: {anime['slug']} (id={anime['id']})", file=sys.stderr)

    # Get servers
    servers = client.get_servers(anime["id"], episode, category)
    if not servers:
        raise RuntimeError(f"No servers for {anime['slug']} E{episode} {category}")
    print(f"[✓] {len(servers)} server(s) available", file=sys.stderr)

    # Pick first server with a stream URL
    for srv in servers:
        stream = srv.get("stream", "")
        if stream:
            print(f"[✓] Server: {srv.get('name')} → {stream[:80]}...", file=sys.stderr)
            return stream

    raise RuntimeError("No stream URL found in any server")


def main():
    ap = argparse.ArgumentParser(description="Get m3u8 from anichan.net")
    ap.add_argument("query", help='Anime title (e.g. "one piece")')
    ap.add_argument("episode", type=int, nargs="?", default=1, help="Episode (default: 1)")
    ap.add_argument("--dub", action="store_true", help="Use dub instead of sub")
    args = ap.parse_args()

    category = "dub" if args.dub else "sub"
    try:
        url = get_m3u8_url(args.query, args.episode, category)
        print(url)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
