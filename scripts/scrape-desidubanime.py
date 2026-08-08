#!/usr/bin/env python3
"""
Scrape desidubanime.me for all Hindi dubbed anime + cloud server episode links.
- Uses WordPress REST API for anime list (494 anime)
- Scrapes episode pages for gdmirrorbot.nl (cloud/no-ads) embed links
- Fast: parallel fetching, saves progress incrementally
"""

import json
import urllib.request
import urllib.error
import re
import time
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

API_BASE = "https://www.desidubanime.me/wp-json/wp/v2"
OUTPUT = "/home/z/my-project/download/desidubanime-scrape.json"
PROGRESS = "/home/z/my-project/download/desidubanime-progress.json"

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

def clean_title(raw):
    t = raw.replace("&#8211;", "-").replace("&#8217;", "'").replace("&#8220;", '"').replace("&#8221;", '"')
    t = re.sub(r'<[^>]+>', '', t)
    return t.strip()

def fetch_json(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read()), dict(resp.headers)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(3 * (attempt + 1))
                continue
            return None, {}
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1)
            continue
    return None, {}

def fetch_html(url, retries=2):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.read().decode('utf-8', errors='replace')
        except:
            if attempt < retries - 1:
                time.sleep(1)
    return None

def get_all_anime():
    """Fetch all anime from WP REST API"""
    print("📋 Fetching anime list from WP API...")
    all_anime = []
    page = 1
    
    while True:
        url = f"{API_BASE}/anime?per_page=100&page={page}&_fields=id,title,link,slug"
        data, headers = fetch_json(url)
        if not data:
            break
        
        for post in data:
            all_anime.append({
                'id': post['id'],
                'title': clean_title(post.get('title', {}).get('rendered', '')),
                'slug': post.get('slug', ''),
                'url': post.get('link', ''),
                'episodes': [],
            })
        
        total_pages = headers.get('X-WP-TotalPages', '0')
        print(f"  Page {page}: {len(data)} anime (total so far: {len(all_anime)})")
        page += 1
        
        # Stop if no more results or past total pages
        if len(data) == 0:
            break
        if total_pages.isdigit() and page > int(total_pages):
            break
        if page > 10:  # safety limit: 10 pages * 100 = 1000
            break
        time.sleep(0.3)
    
    return all_anime

def get_episode_list(anime_url):
    """Get episode links from an anime page"""
    html = fetch_html(anime_url)
    if not html:
        return []
    
    # Find episode links
    ep_links = re.findall(r'href=["\'](https?://www\.desidubanime\.me/watch/[^"\']+)["\']', html)
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for e in ep_links:
        if e not in seen:
            seen.add(e)
            unique.append(e)
    return unique

def get_episode_stream(episode_url):
    """Get cloud server embed from an episode page"""
    html = fetch_html(episode_url)
    if not html:
        return None
    
    # Find gdmirrorbot embed (cloud/no-ads server)
    gd_match = re.search(r'(https?://gdmirrorbot\.nl/embed/[a-z0-9]+)', html)
    if gd_match:
        return gd_match.group(1)
    
    # Fallback: find any iframe that looks like a stream
    iframe_match = re.search(r'<iframe[^>]+src=["\'](https?://[^"\']+(?:embed|stream|player)[^"\']*)["\']', html, re.I)
    if iframe_match:
        return iframe_match.group(1)
    
    return None

def extract_ep_title_from_url(url):
    """Extract episode title from URL slug"""
    slug = url.rstrip('/').split('/')[-1]
    # Convert slug to readable title
    title = slug.replace('-', ' ').title()
    return title

def process_anime(anime, idx, total):
    """Process one anime: get episodes + stream links"""
    result = dict(anime)
    
    # Get episode list from anime page
    ep_links = get_episode_list(anime['url'])
    
    if not ep_links:
        # Maybe the anime page itself has the embed (single episode movies)
        stream = get_episode_stream(anime['url'])
        if stream:
            ep_title = extract_ep_title_from_url(anime['url'])
            result['episodes'] = [{'title': ep_title, 'url': anime['url'], 'cloud_stream': stream}]
        return result
    
    # Get cloud stream for each episode
    episodes = []
    for ep_url in ep_links:
        ep_title = extract_ep_title_from_url(ep_url)
        cloud_stream = get_episode_stream(ep_url)
        episodes.append({
            'title': ep_title,
            'url': ep_url,
            'cloud_stream': cloud_stream,
        })
        time.sleep(0.2)  # polite
    
    result['episodes'] = episodes
    return result

def main():
    print("=== DesiDubAnime Scraper ===")
    print("Target: Cloud/No-Ads server (gdmirrorbot.nl)")
    print()
    
    # Step 1: Get all anime
    all_anime = get_all_anime()
    if not all_anime:
        print("❌ No anime found!")
        return
    
    print(f"\n✅ Found {len(all_anime)} anime")
    
    # Step 2: Process each anime (with progress saving)
    results = []
    
    # Load progress if exists
    completed_ids = set()
    if os.path.exists(PROGRESS):
        with open(PROGRESS) as f:
            progress = json.load(f)
            results = progress.get('results', [])
            completed_ids = {r['id'] for r in results}
            print(f"📦 Resuming from progress: {len(results)} already done")
    
    remaining = [a for a in all_anime if a['id'] not in completed_ids]
    print(f"🔄 Processing {len(remaining)} remaining anime...")
    
    for idx, anime in enumerate(remaining):
        total_done = len(results) + idx
        print(f"  [{total_done+1}/{len(all_anime)}] {anime['title'][:60]}...", end=' ', flush=True)
        
        result = process_anime(anime, idx, len(remaining))
        ep_count = len(result['episodes'])
        cloud_count = sum(1 for e in result['episodes'] if e.get('cloud_stream'))
        print(f"{ep_count} eps, {cloud_count} cloud")
        
        results.append(result)
        
        # Save progress every 10 anime
        if (idx + 1) % 10 == 0:
            with open(PROGRESS, 'w') as f:
                json.dump({'results': results}, f, ensure_ascii=False)
        
        time.sleep(0.3)
    
    # Step 3: Save final results
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    # Also save as progress
    with open(PROGRESS, 'w') as f:
        json.dump({'results': results}, f, ensure_ascii=False)
    
    # Summary
    total_eps = sum(len(a['episodes']) for a in results)
    total_cloud = sum(sum(1 for e in a['episodes'] if e.get('cloud_stream')) for a in results)
    with_cloud = sum(1 for a in results if any(e.get('cloud_stream') for e in a['episodes']))
    
    print(f"\n{'='*50}")
    print(f"📊 FINAL RESULTS:")
    print(f"  Total anime: {len(results)}")
    print(f"  Total episodes: {total_eps}")
    print(f"  Cloud streams found: {total_cloud}")
    print(f"  Anime with cloud: {with_cloud}")
    print(f"\n💾 Saved to: {OUTPUT}")
    
    # Print sample
    print(f"\n🎬 Sample entries:")
    for a in results[:5]:
        print(f"  {a['title'][:50]} — {len(a['episodes'])} eps")
        for e in a['episodes'][:2]:
            stream = e.get('cloud_stream', 'NONE')
            print(f"    {e['title'][:40]} → {stream[:60] if stream else 'NONE'}")

if __name__ == '__main__':
    main()
