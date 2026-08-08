#!/usr/bin/env python3
"""
Fast DesiDubAnime scraper - Phase 2: Get episodes + cloud streams
Reads the full anime list, scrapes episode pages for gdmirrorbot.nl embeds
Saves progress every 20 anime
"""
import json, re, time, os, urllib.request, urllib.error

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
ANIME_LIST = "/home/z/my-project/download/desidubanime-full-list.json"
OUTPUT = "/home/z/my-project/download/desidubanime-scrape.json"
PROGRESS = "/home/z/my-project/download/desidubanime-progress2.json"

def fetch_html(url, retries=2):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.read().decode('utf-8', errors='replace')
        except:
            if attempt < retries - 1: time.sleep(1)
    return None

def get_episodes_and_streams(anime_url):
    """Get episode links from anime page, then cloud stream from each"""
    html = fetch_html(anime_url)
    if not html:
        return []
    
    # Find episode links
    ep_links = re.findall(r'href=["\'](https?://www\.desidubanime\.me/watch/[^"\']+)["\']', html)
    seen = set()
    unique = []
    for e in ep_links:
        if e not in seen:
            seen.add(e)
            unique.append(e)
    
    if not unique:
        # Check if anime page itself has the embed (movies)
        gd = re.search(r'(https?://gdmirrorbot\.nl/embed/[a-z0-9]+)', html)
        if gd:
            slug = anime_url.rstrip('/').split('/')[-1]
            return [{'title': slug.replace('-',' ').title(), 'url': anime_url, 'cloud_stream': gd.group(1)}]
        return []
    
    episodes = []
    for ep_url in unique:
        ep_html = fetch_html(ep_url)
        cloud = None
        if ep_html:
            gd = re.search(r'(https?://gdmirrorbot\.nl/embed/[a-z0-9]+)', ep_html)
            if gd:
                cloud = gd.group(1)
            else:
                # fallback: any streaming iframe
                iframe = re.search(r'<iframe[^>]+src=["\'](https?://[^"\']+(?:embed|stream|player)[^"\']*)["\']', ep_html, re.I)
                if iframe:
                    cloud = iframe.group(1)
        
        slug = ep_url.rstrip('/').split('/')[-1]
        episodes.append({
            'title': slug.replace('-',' ').title(),
            'url': ep_url,
            'cloud_stream': cloud,
        })
        time.sleep(0.15)
    
    return episodes

def main():
    # Load anime list
    with open(ANIME_LIST) as f:
        all_anime = json.load(f)
    print(f"📋 Loaded {len(all_anime)} anime")
    
    # Load progress
    results = []
    done_ids = set()
    if os.path.exists(PROGRESS):
        with open(PROGRESS) as f:
            results = json.load(f).get('results', [])
            done_ids = {r['id'] for r in results}
            print(f"📦 Resuming: {len(results)} done")
    
    remaining = [a for a in all_anime if a['id'] not in done_ids]
    print(f"🔄 {len(remaining)} remaining\n")
    
    for idx, anime in enumerate(remaining):
        total = len(results) + idx + 1
        print(f"[{total}/{len(all_anime)}] {anime['title'][:55]}", end='', flush=True)
        
        eps = get_episodes_and_streams(anime['url'])
        cloud_count = sum(1 for e in eps if e.get('cloud_stream'))
        print(f" → {len(eps)} eps, {cloud_count} cloud")
        
        results.append({
            'id': anime['id'],
            'title': anime['title'],
            'slug': anime['slug'],
            'url': anime['url'],
            'episodes': eps,
        })
        
        # Save progress every 20
        if (idx + 1) % 20 == 0:
            with open(PROGRESS, 'w') as f:
                json.dump({'results': results}, f, ensure_ascii=False)
            print(f"  💾 Saved progress ({len(results)} anime)")
        
        time.sleep(0.2)
    
    # Final save
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    with open(PROGRESS, 'w') as f:
        json.dump({'results': results}, f, ensure_ascii=False)
    
    total_eps = sum(len(a['episodes']) for a in results)
    total_cloud = sum(sum(1 for e in a['episodes'] if e.get('cloud_stream')) for a in results)
    with_cloud = sum(1 for a in results if any(e.get('cloud_stream') for e in a['episodes']))
    
    print(f"\n{'='*50}")
    print(f"📊 DONE! {len(results)} anime | {total_eps} episodes | {total_cloud} cloud streams | {with_cloud} anime with cloud")
    print(f"💾 {OUTPUT}")

if __name__ == '__main__':
    main()
