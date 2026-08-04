"""
AnimePahe Scraper API — deployed on Render
Bypasses Cloudflare using cloudscraper.

Endpoints:
  GET /search?q=                    → search anime
  GET /anime/<session>/episodes     → episode list
  GET /play/<session>/<ep_session>  → m3u8 + qualities + subtitles
  GET /health                       → status check
"""

import cloudscraper
from flask import Flask, jsonify, request
from flask_cors import CORS
import re
import json
import base64
from urllib.parse import quote

app = Flask(__name__)
CORS(app)

# Create a cloudscraper instance (bypasses CF JS challenge)
scraper = cloudscraper.create_scraper(
    browser={'browser': 'chrome', 'platform': 'windows', 'mobile': False}
)

ANIMEPAHE_BASE = "https://animepahe.pw"


@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "animepahe-scraper"})


@app.route("/search")
def search():
    """Search anime by title. Returns list of {title, session, id, poster}."""
    q = request.args.get("q", "")
    if not q:
        return jsonify({"error": "q parameter required"}), 400

    try:
        resp = scraper.get(
            f"{ANIMEPAHE_BASE}/api?m=search&q={quote(q)}&l=1",
            timeout=15
        )
        if resp.status_code != 200:
            return jsonify({"error": f"animepahe returned {resp.status_code}"}), 502

        data = resp.json()
        results = []
        for item in (data.get("data") or []):
            results.append({
                "title": item.get("title", ""),
                "session": item.get("session", ""),
                "id": item.get("id", 0),
                "poster": item.get("poster", ""),
                "episodes": item.get("episodes", 0),
                "status": item.get("status", ""),
                "season": item.get("season", ""),
                "year": item.get("year", 0),
                "score": item.get("score", ""),
            })
        return jsonify({"results": results, "total": data.get("total", len(results))})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/anime/<session>/episodes")
def episodes(session):
    """Get episode list for an anime. session is the anime session UUID."""
    page = request.args.get("page", "1")
    try:
        resp = scraper.get(
            f"{ANIMEPAHE_BASE}/api?m=release&id={session}&sort=episode_asc&page={page}",
            timeout=15
        )
        if resp.status_code != 200:
            return jsonify({"error": f"animepahe returned {resp.status_code}"}), 502

        data = resp.json()
        results = []
        for ep in (data.get("data") or []):
            results.append({
                "episode": ep.get("episode", 0),
                "session": ep.get("session", ""),
                "title": ep.get("title", ""),
                "thumbnail": ep.get("snapshot", ""),
                "duration": ep.get("duration", ""),
                "audio": ep.get("audio", ""),
            })
        return jsonify({
            "episodes": results,
            "total": data.get("total", len(results)),
            "page": data.get("current_page", int(page)),
            "last_page": data.get("last_page", 1),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/play/<session>/<ep_session>")
def play(session, ep_session):
    """Get playable streams for an episode.
    
    session = anime session UUID
    ep_session = episode session (hex string)
    
    Returns m3u8 URLs at different qualities + subtitle tracks.
    """
    try:
        # Step 1: Get the episode links page
        resp = scraper.get(
            f"{ANIMEPAHE_BASE}/api?m=links&id={session}&p={ep_session}",
            timeout=15
        )
        if resp.status_code != 200:
            return jsonify({"error": f"links API returned {resp.status_code}"}), 502

        links_data = resp.json()
        qualities = links_data.get("data", [])

        if not qualities:
            return jsonify({"error": "No quality options found"}), 404

        all_sources = []
        all_subs = []

        # Step 2: For each quality, get the kwik link
        for q in qualities:
            quality = q.get("quality", "auto")
            kwik_url = q.get("kwik", "")
            audio = q.get("audio", "jpn")

            if not kwik_url:
                continue

            # Step 3: Scrape the kwik page to get the m3u8 URL
            try:
                kwik_resp = scraper.get(kwik_url, timeout=15)
                if kwik_resp.status_code != 200:
                    continue

                # Extract m3u8 URL from kwik page
                # The URL is embedded in a JavaScript variable
                m3u8_match = re.search(
                    r'sources:\s*\[\{file:\s*["\']([^"\']+\.m3u8[^"\']*)["\']',
                    kwik_resp.text
                )
                if not m3u8_match:
                    # Try alternative pattern
                    m3u8_match = re.search(
                        r'(https://[a-zA-Z0-9.-]+/[a-zA-Z0-9/_.-]+\.m3u8[^"\'\s]*)',
                        kwik_resp.text
                    )

                if m3u8_match:
                    m3u8_url = m3u8_match.group(1)
                    all_sources.append({
                        "url": m3u8_url,
                        "quality": f"{quality}p" if quality.isdigit() else quality,
                        "audio": audio,
                        "kwik_url": kwik_url,
                    })

                # Extract subtitle tracks from kwik page
                # Pattern: tracks: [{file: "url", label: "English", kind: "captions"}]
                sub_matches = re.findall(
                    r'\{file:\s*["\']([^"\']+(?:\.vtt|\.srt)[^"\']*)["\']\s*,\s*label:\s*["\']([^"\']+)["\']',
                    kwik_resp.text
                )
                for sub_url, sub_label in sub_matches:
                    all_subs.append({
                        "url": sub_url,
                        "label": sub_label,
                        "lang": sub_label.lower().split("(")[0].strip(),
                    })

            except Exception:
                continue

        if not all_sources:
            return jsonify({"error": "Could not extract any m3u8 streams"}), 404

        return jsonify({
            "sources": all_sources,
            "subtitles": all_subs,
            "anime_session": session,
            "ep_session": ep_session,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(__import__("os").environ.get("PORT", 10000)))
