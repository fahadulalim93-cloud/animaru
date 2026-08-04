#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════
 COMIX.TO FULL SCRAPER — Standalone Python
 ══════════════════════════════════════════════════════════════════
 Scrapes: Home, Trending, Top Rated, Most Followed, Search,
          Detail (full metadata + chapters), Chapter Pages (images),
          Filter Options (genres, types, demographics, etc.)

 Usage:
   python comix_scraper.py home          → latest updates (28 items)
   python comix_scraper.py trending      → most viewed 7 days
   python comix_scraper.py top-rated     → highest rated
   python comix_scraper.py followed      → most followed
   python comix_scraper.py recent        → recently added
   python comix_scraper.py search "one piece"  → search by query
   python comix_scraper.py detail 55kgm  → full manga detail + chapters
   python comix_scraper.py chapters 55kgm → chapter list only
   python comix_scraper.py pages 55kgm 1 → chapter 1 image URLs
   python comix_scraper.py filters       → all filter options
   python comix_scraper.py all           → home + trending + top rated + followed
 ══════════════════════════════════════════════════════════════════
"""

import sys
import json
import re
import time
import os
from urllib.request import Request, urlopen
from urllib.parse import urlencode, quote
from urllib.error import URLError, HTTPError

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "comix_data")
COMIX_BASE = "https://comix.to"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

def fetch_html(path: str) -> str:
    """Fetch raw HTML from comix.to. Falls back to z-ai CLI on CF block."""
    url = f"{COMIX_BASE}{path}"
    print(f"  Fetching: {url}")

    # Step 1: Direct fetch — only accept if page has real content (>20KB)
    try:
        req = Request(url, headers=HEADERS)
        with urlopen(req, timeout=12) as resp:
            html = resp.read().decode("utf-8", errors="replace")
            if resp.status == 200 and len(html) > 20000 and "initial-data" in html:
                print(f"  Direct fetch OK ({len(html)} chars)")
                return html
            else:
                print(f"  Direct fetch returned {len(html)} chars (likely CF challenge)")
    except (HTTPError, URLError, Exception) as e:
        print(f"  Direct fetch failed: {e}")

    # Step 2: z-ai page_reader (bypasses CF)
    try:
        import subprocess, tempfile
        tmp_file = tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w")
        tmp_path = tmp_file.name
        tmp_file.close()
        result = subprocess.run(
            ["z-ai", "function", "-n", "page_reader",
             "-a", json.dumps({"url": url}),
             "-o", tmp_path],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and os.path.exists(tmp_path):
            with open(tmp_path, "r") as f:
                raw = f.read()
            os.unlink(tmp_path)
            if raw.strip():
                data = json.loads(raw)
                # z-ai CLI output wraps in {data: {html: "..."}}
                html = ""
                if isinstance(data, dict):
                    html = data.get("data", {}).get("html", "") or data.get("html", "")
                if html:
                    print(f"  Got via z-ai proxy ({len(html)} chars)")
                    return html
        elif os.path.exists(tmp_path):
            os.unlink(tmp_path)
    except Exception as e:
        print(f"  z-ai proxy failed: {e}")

    return ""

def extract_initial_data(html: str) -> dict | None:
    """Extract #initial-data JSON from comix.to page."""
    match = re.search(
        r'<script type="application/json" id="initial-data">(.*?)</script>',
        html, re.DOTALL
    )
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None

def parse_browse_html(html: str) -> list:
    """Parse manga entries from browse/trending list HTML."""
    results = []

    # Full card pattern with metadata
    pattern = re.compile(
        r'<a\s+class="lrow__poster"\s+href="/title/([a-z0-9]+)-([a-z0-9-]+)"\s+aria-label="([^"]+)"'
        r'[\s\S]*?<img[^>]*src="(https://static\.comix\.to/[^"]+)"'
        r'[\s\S]*?<span\s+class="lrow__type">([^<]+)<'
        r'[\s\S]*?<span\s+class="lrow__year">(\d+)<'
        r'[\s\S]*?<span\s+class="lrow__status[^"]*">([^<]+)<'
        r'[\s\S]*?<span\s+class="lrow__ch">CH\.(\d+)<',
        re.DOTALL
    )

    for match in pattern.finditer(html):
        hid = match.group(1)
        slug = match.group(2)
        title = match.group(3)
        poster_thumb = match.group(4)
        poster = poster_thumb.replace("@280.jpg", ".jpg").replace("@280.png", ".png")
        type_ = match.group(5).strip().lower()
        year = int(match.group(6))
        status = match.group(7).strip().lower().replace(" ", "_")
        chapters = int(match.group(8))

        results.append({
            "id": f"cx:{hid}",
            "hid": hid,
            "slug": slug,
            "title": title,
            "poster": poster,
            "posterThumb": poster_thumb,
            "type": type_,
            "year": year,
            "status": status,
            "chapters": chapters,
            "url": f"{COMIX_BASE}/title/{hid}-{slug}",
        })

    # If full regex failed, try simpler
    if not results:
        simple = re.compile(
            r'<a\s+class="lrow__poster"\s+href="/title/([a-z0-9]+)-([a-z0-9-]+)"\s+aria-label="([^"]+)"'
            r'[\s\S]*?<img[^>]*src="(https://static\.comix\.to/[^"]+)"',
            re.DOTALL
        )
        seen = set()
        for match in simple.finditer(html):
            hid = match.group(1)
            if hid in seen:
                continue
            seen.add(hid)
            slug = match.group(2)
            title = match.group(3)
            poster_thumb = match.group(4)
            poster = poster_thumb.replace("@280.jpg", ".jpg")
            results.append({
                "id": f"cx:{hid}",
                "hid": hid,
                "slug": slug,
                "title": title,
                "poster": poster,
                "posterThumb": poster_thumb,
                "type": "manga",
                "year": 0,
                "status": "",
                "chapters": 0,
                "url": f"{COMIX_BASE}/title/{hid}-{slug}",
            })

    return results

def parse_filter_options(html: str) -> dict:
    """Extract filter options (genres, types, etc.) from browse page."""
    data = extract_initial_data(html)
    if not data:
        return {}
    options = data.get("list", {}).get("options", {})
    return {
        "genres": options.get("genres", []),
        "types": options.get("types", []),
        "demographics": options.get("demographics", []),
        "statuses": options.get("statuses", []),
        "sorts": options.get("sorts", []),
        "formats": options.get("formats", []),
        "years": options.get("years", []),
    }

def parse_detail(html: str, hid: str) -> dict:
    """Parse full manga detail from title page."""
    data = extract_initial_data(html)
    if not data:
        return {"error": "No initial-data found"}

    detail = None
    scan_groups = []
    recommended = []

    queries = data.get("queries", {})
    for key, val in queries.items():
        try:
            parsed_key = json.loads(key)
            if isinstance(parsed_key, list):
                # Detail: ["manga","detail","{hid}"]
                if parsed_key[0] == "manga" and parsed_key[1] == "detail":
                    detail = val
                # Groups: ["manga","groups","{hid}"]
                if parsed_key[0] == "manga" and parsed_key[1] == "groups" and isinstance(val, list):
                    scan_groups = [{"id": g["id"], "name": g["name"], "slug": g["slug"]} for g in val]
                # Recommended: ["manga","recommended","{hid}",1]
                if parsed_key[0] == "manga" and parsed_key[1] == "recommended":
                    items = val.get("items", [])
                    for item in items:
                        if item.get("hid"):
                            recommended.append({
                                "id": f"cx:{item['hid']}",
                                "hid": item["hid"],
                                "title": item.get("title", ""),
                                "poster": item.get("poster", {}).get("large", ""),
                                "type": item.get("type", ""),
                                "ratedAvg": item.get("ratedAvg"),
                            })
        except (json.JSONDecodeError, TypeError):
            if isinstance(val, dict) and val.get("hid") == hid:
                detail = val

    if not detail:
        return {"error": "Detail not found in queries"}

    # Extract chapter links from HTML
    chapter_regex = re.compile(
        rf"/title/{hid}[^\s\"']*?/(\d+)-chapter-(\d+(?:\.\d+)?)",
        re.IGNORECASE
    )
    chapter_links = []
    seen_numbers = set()
    for m in chapter_regex.finditer(html):
        num = float(m.group(2))
        if num not in seen_numbers:
            seen_numbers.add(num)
            chapter_links.append({
                "dbId": m.group(1),
                "number": num,
            })

    # Sort chapters ascending
    chapter_links.sort(key=lambda c: c["number"])

    # Build chapter list
    chapters = []
    for link in chapter_links:
        if scan_groups and len(scan_groups) > 1:
            for group in scan_groups:
                chapters.append({
                    "id": f"cx_{link['dbId']}_{group['id']}",
                    "title": f"Chapter {link['number']}",
                    "number": link['number'],
                    "dbId": link['dbId'],
                    "scanGroup": group["name"],
                    "lang": "en",
                })
        else:
            chapters.append({
                "id": f"cx_{link['dbId']}",
                "title": f"Chapter {link['number']}",
                "number": link['number'],
                "dbId": link['dbId'],
                "scanGroup": scan_groups[0]["name"] if scan_groups else None,
                "lang": "en",
            })

    poster = detail.get("poster", {})
    poster_large = poster.get("large", "")
    poster_medium = poster.get("medium", poster_large)

    result = {
        "id": f"cx:{hid}",
        "hid": detail.get("hid", hid),
        "title": detail.get("title", ""),
        "altTitles": detail.get("altTitles", []),
        "type": detail.get("type", ""),
        "status": detail.get("status", ""),
        "originalLanguage": detail.get("originalLanguage", ""),
        "poster": poster_medium,
        "posterLarge": poster_large,
        "synopsis": detail.get("synopsis", ""),
        "year": detail.get("year"),
        "rank": detail.get("rank"),
        "ratedAvg": detail.get("ratedAvg"),
        "ratedCount": detail.get("ratedCount"),
        "followsTotal": detail.get("followsTotal"),
        "contentRating": detail.get("contentRating", ""),
        "genres": detail.get("genres", []),
        "tags": detail.get("tags", []),
        "demographics": detail.get("demographics", []),
        "formats": detail.get("formats", []),
        "authors": detail.get("authors", []),
        "artists": detail.get("artists", []),
        "publishers": detail.get("publishers", []),
        "links": detail.get("links", {}),
        "firstChapterUrl": detail.get("firstChapterUrl", ""),
        "latestChapterUrl": detail.get("latestChapterUrl", ""),
        "latestChapter": detail.get("latestChapter"),
        "chapters": chapters,
        "totalChapters": len(chapters),
        "scanGroups": scan_groups,
        "recommended": recommended,
        "chapterUpdatedAt": detail.get("chapterUpdatedAtFormatted", ""),
        "url": f"{COMIX_BASE}/title/{hid}",
    }

    return result

def parse_chapter_pages(html: str) -> list:
    """Extract page image URLs from chapter reading page."""
    # Try initial-data first
    data = extract_initial_data(html)
    if data and data.get("queries"):
        for key, val in data.get("queries", {}).items():
            if isinstance(val, dict):
                images = val.get("images") or val.get("pages")
                if isinstance(images, list) and images:
                    pages = []
                    for i, img in enumerate(images):
                        url = img if isinstance(img, str) else (img.get("url") or img.get("src") or "")
                        if url:
                            pages.append({"index": i, "url": url})
                    if pages:
                        return pages

    # Fallback: extract from HTML
    img_regex = re.compile(r'https://static\.comix\.to/[^\s"<>]+\.(?:jpg|png|webp)')
    matches = img_regex.findall(html)

    # Filter out thumbnails
    page_images = [u for u in matches if "@280" not in u and "@180" not in u]

    # Deduplicate
    seen = set()
    pages = []
    for url in page_images:
        if url not in seen:
            seen.add(url)
            pages.append({"index": len(pages), "url": url})

    return pages

def save_json(name: str, data: dict | list):
    """Save data to comix_data directory."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filepath = os.path.join(OUTPUT_DIR, f"{name}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Saved: {filepath} ({len(json.dumps(data))} bytes)")
    return filepath


# ═══════════════════════════════════════════════════════════
#  COMMANDS
# ═══════════════════════════════════════════════════════════

def cmd_home(page=1):
    html = fetch_html(f"/browse?page={page}")
    if not html:
        return []
    items = parse_browse_html(html)
    save_json("home", items)
    return items

def cmd_trending(page=1):
    html = fetch_html(f"/browse?sort=views_7d:desc&page={page}")
    if not html:
        return []
    items = parse_browse_html(html)
    save_json("trending_7d", items)
    return items

def cmd_top_rated(page=1):
    html = fetch_html(f"/browse?sort=score:desc&page={page}")
    if not html:
        return []
    items = parse_browse_html(html)
    save_json("top_rated", items)
    return items

def cmd_followed(page=1):
    html = fetch_html(f"/browse?sort=follows_total:desc&page={page}")
    if not html:
        return []
    items = parse_browse_html(html)
    save_json("most_followed", items)
    return items

def cmd_recent(page=1):
    html = fetch_html(f"/browse?sort=created_at:desc&page={page}")
    if not html:
        return []
    items = parse_browse_html(html)
    save_json("recently_added", items)
    return items

def cmd_search(query: str, page=1):
    html = fetch_html(f"/browse?q={quote(query)}&page={page}")
    if not html:
        return []
    items = parse_browse_html(html)
    save_json(f"search_{query.replace(' ', '_')}", items)
    return items

def cmd_detail(hid: str):
    html = fetch_html(f"/title/{hid}")
    if not html:
        return {"error": "Failed to fetch"}
    detail = parse_detail(html, hid)
    save_json(f"detail_{hid}", detail)
    return detail

def cmd_chapters(hid: str):
    html = fetch_html(f"/title/{hid}")
    if not html:
        return []
    detail = parse_detail(html, hid)
    chapters = detail.get("chapters", [])
    save_json(f"chapters_{hid}", chapters)
    return chapters

def cmd_pages(hid: str, chapter_number: str):
    # Step 1: Get title page to find chapter URL
    title_html = fetch_html(f"/title/{hid}")
    if not title_html:
        return []

    # Find chapter link
    pattern = re.compile(
        rf"/title/{hid}[^\s\"']*?/(\d+)-chapter-{re.escape(chapter_number)}",
        re.IGNORECASE
    )
    match = pattern.search(title_html)
    if not match:
        print(f"  Chapter {chapter_number} not found for {hid}")
        return []

    chapter_db_id = match.group(1)
    # Find slug
    slug_match = re.search(rf"/title/{hid}-([a-z0-9-]+)", title_html)
    slug = slug_match.group(1) if slug_match else ""

    chapter_path = f"/title/{hid}-{slug}/{chapter_db_id}-chapter-{chapter_number}"

    # Step 2: Fetch chapter page
    chapter_html = fetch_html(chapter_path)
    if not chapter_html:
        return []

    pages = parse_chapter_pages(chapter_html)
    save_json(f"pages_{hid}_ch{chapter_number}", pages)
    return pages

def cmd_filters():
    html = fetch_html("/browse")
    if not html:
        return {}
    filters = parse_filter_options(html)
    save_json("filters", filters)
    return filters

def cmd_all():
    """Fetch all sections at once."""
    print("=== Scraping all comix.to sections ===")
    all_data = {}

    print("\n[1/5] Home (latest updates)")
    all_data["home"] = cmd_home(1)

    print("\n[2/5] Trending (7d)")
    all_data["trending"] = cmd_trending(1)

    print("\n[3/5] Top Rated")
    all_data["top_rated"] = cmd_top_rated(1)

    print("\n[4/5] Most Followed")
    all_data["most_followed"] = cmd_followed(1)

    print("\n[5/5] Filters")
    all_data["filters"] = cmd_filters()

    save_json("all", all_data)
    print(f"\n✅ Done! {len(all_data)} sections scraped.")
    return all_data


# ═══════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    command = sys.argv[1].lower()

    if command == "home":
        page = int(sys.argv[2]) if len(sys.argv) > 2 else 1
        items = cmd_home(page)
        print(f"\n✅ {len(items)} manga fetched")

    elif command == "trending":
        page = int(sys.argv[2]) if len(sys.argv) > 2 else 1
        items = cmd_trending(page)
        print(f"\n✅ {len(items)} trending manga fetched")

    elif command == "top-rated":
        page = int(sys.argv[2]) if len(sys.argv) > 2 else 1
        items = cmd_top_rated(page)
        print(f"\n✅ {len(items)} top rated manga fetched")

    elif command == "followed":
        page = int(sys.argv[2]) if len(sys.argv) > 2 else 1
        items = cmd_followed(page)
        print(f"\n✅ {len(items)} most followed manga fetched")

    elif command == "recent":
        page = int(sys.argv[2]) if len(sys.argv) > 2 else 1
        items = cmd_recent(page)
        print(f"\n✅ {len(items)} recently added manga fetched")

    elif command == "search":
        if len(sys.argv) < 3:
            print("Usage: python comix_scraper.py search \"query\"")
            sys.exit(1)
        query = sys.argv[2]
        page = int(sys.argv[3]) if len(sys.argv) > 3 else 1
        items = cmd_search(query, page)
        print(f"\n✅ {len(items)} search results for '{query}'")

    elif command == "detail":
        if len(sys.argv) < 3:
            print("Usage: python comix_scraper.py detail <hid>")
            print("Example: python comix_scraper.py detail 55kgm")
            sys.exit(1)
        hid = sys.argv[2]
        detail = cmd_detail(hid)
        if "error" in detail:
            print(f"\n❌ {detail['error']}")
        else:
            print(f"\n✅ Detail: {detail['title']} | {detail['totalChapters']} chapters | rating {detail.get('ratedAvg')}")

    elif command == "chapters":
        if len(sys.argv) < 3:
            print("Usage: python comix_scraper.py chapters <hid>")
            sys.exit(1)
        hid = sys.argv[2]
        chapters = cmd_chapters(hid)
        print(f"\n✅ {len(chapters)} chapters fetched")

    elif command == "pages":
        if len(sys.argv) < 4:
            print("Usage: python comix_scraper.py pages <hid> <chapter_number>")
            print("Example: python comix_scraper.py pages 55kgm 1")
            sys.exit(1)
        hid = sys.argv[2]
        ch_num = sys.argv[3]
        pages = cmd_pages(hid, ch_num)
        print(f"\n✅ {len(pages)} page images fetched for chapter {ch_num}")

    elif command == "filters":
        filters = cmd_filters()
        genres = filters.get("genres", [])
        print(f"\n✅ {len(genres)} genres, {len(filters.get('types',[]))} types, {len(filters.get('sorts',[]))} sorts")

    elif command == "all":
        cmd_all()

    else:
        print(f"Unknown command: {command}")
        print(__doc__)
