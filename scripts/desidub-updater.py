#!/usr/bin/env python3
"""
DesiDubAnime Auto-Updater Scraper
- Checks for new anime & episodes on desidubanime.me
- Only fetches what's changed (incremental)
- Auto-commits & pushes to GitHub if changes found
- Designed to run on a schedule (cron / GitHub Actions)
"""
import json, re, time, os, sys, subprocess, urllib.request, urllib.error
from datetime import datetime

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
API = "https://www.desidubanime.me/wp-json/wp/v2/anime"
PROJECT = "/home/z/my-project"
DATA_FILE = f"{PROJECT}/src/data/desidub-anime.json"
LOG_FILE = f"{PROJECT}/download/desidub-updater.log"

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, 'a') as f:
        f.write(line + "\n")

def fetch_json(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(3 * (attempt + 1)); continue
            return None
        except:
            if attempt < retries - 1: time.sleep(1)
    return None

def fetch_html(url, retries=2):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.read().decode('utf-8', errors='replace')
        except:
            if attempt < retries - 1: time.sleep(1)
    return None

def clean_title(raw):
    t = raw.replace("&#8211;", "-").replace("&#8217;", "'").replace("&#8220;", '"').replace("&#8221;", '"')
    return re.sub(r'<[^>]+>', '', t).strip()

def get_all_anime_ids_list():
    """Fetch all anime IDs + slugs from WP API (fast, no content)"""
    all_anime = []
    page = 1
    while True:
        data = fetch_json(f"{API}?per_page=100&page={page}&_fields=id,title,link,slug,modified")
        if not data: break
        for p in data:
            all_anime.append({
                'id': p['id'],
                'title': clean_title(p.get('title',{}).get('rendered','')),
                'slug': p.get('slug',''),
                'url': p.get('link',''),
                'modified': p.get('modified',''),
            })
        log(f"  API page {page}: {len(data)} anime (total: {len(all_anime)})")
        page += 1
        if len(data) < 100: break
        time.sleep(0.3)
    return all_anime

def get_episode_links(anime_url):
    """Get episode links from anime page"""
    html = fetch_html(anime_url)
    if not html: return []
    links = re.findall(r'href=["\'](https?://www\.desidubanime\.me/watch/[^"\']+)["\']', html)
    seen = set(); unique = []
    for l in links:
        if l not in seen: seen.add(l); unique.append(l)
    return unique

def get_all_servers(episode_url):
    """Get ALL server embed URLs from episode page via data-embed-id attributes."""
    import base64
    html = fetch_html(episode_url)
    if not html: return {}, None
    
    servers = {}
    cloud_stream = None
    
    # Parse data-embed-id attributes (base64_name:base64_url)
    for match in re.findall(r'data-embed-id="([^"]+)"', html):
        try:
            parts = match.split(':')
            if len(parts) != 2: continue
            name_b64, url_b64 = parts
            name_b64 += '=' * (4 - len(name_b64) % 4)
            url_b64 += '=' * (4 - len(url_b64) % 4)
            name = base64.b64decode(name_b64).decode('utf-8')
            url = base64.b64decode(url_b64).decode('utf-8')
            servers[name] = url
            # Mirrordub is the cloud/no-ads server (gdmirrorbot.nl)
            if name == 'Mirrordub':
                cloud_stream = url
        except:
            continue
    
    # Fallback: try regex if no data-embed-id found
    if not servers:
        gd = re.search(r'(https?://gdmirrorbot\.nl/embed/[a-z0-9]+)', html)
        if gd:
            cloud_stream = gd.group(1)
            servers['Mirrordub'] = cloud_stream
    
    return servers, cloud_stream

def git_commit_push(msg):
    """Auto-commit and push changes"""
    log(f"  Git commit: {msg}")
    try:
        subprocess.run(['git', 'add', DATA_FILE], cwd=PROJECT, capture_output=True, timeout=10)
        result = subprocess.run(['git', 'commit', '-m', msg], cwd=PROJECT, capture_output=True, timeout=10)
        if result.returncode != 0:
            log("  No changes to commit")
            return False
        push = subprocess.run(['git', 'push', 'origin', 'main'], cwd=PROJECT, capture_output=True, timeout=30)
        if push.returncode == 0:
            log("  ✅ Pushed to GitHub! Vercel will auto-deploy.")
            return True
        else:
            log(f"  ❌ Push failed: {push.stderr.decode()[:200]}")
            return False
    except Exception as e:
        log(f"  ❌ Git error: {e}")
        return False

def main():
    log("═══ DesiDubAnime Auto-Updater ═══")
    
    # Load existing data
    existing = {}
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE) as f:
            old_data = json.load(f)
            existing = {a['id']: a for a in old_data}
        log(f"📦 Existing: {len(existing)} anime")
    
    # Step 1: Get current anime list from API
    log("🔄 Fetching current anime list from API...")
    remote_anime = get_all_anime_id_list()
    if not remote_anime:
        log("❌ Could not fetch anime list")
        return
    log(f"📡 Remote: {len(remote_anime)} anime")
    
    # Step 2: Find what's new or modified
    new_ids = [a for a in remote_anime if a['id'] not in existing]
    modified_ids = [a for a in remote_anime if a['id'] in existing and a.get('modified','') > existing[a['id']].get('modified','')]
    
    log(f"🆕 New anime: {len(new_ids)}")
    log(f"✏️  Modified: {len(modified_ids)}")
    
    if not new_ids and not modified_ids:
        log("✅ Everything up to date! No changes needed.")
        return
    
    # Step 3: Process new + modified anime
    to_process = new_ids + modified_ids
    updated_count = 0
    new_cloud_count = 0
    
    for idx, anime in enumerate(to_process):
        log(f"  [{idx+1}/{len(to_process)}] {anime['title'][:50]}...")
        
        # Get episode links
        ep_links = get_episode_links(anime['url'])
        episodes = []
        
        if not ep_links:
            # Maybe movie/single ep on anime page itself
            servers, cloud = get_all_servers(anime['url'])
            if cloud or servers:
                slug = anime['slug'].replace('-',' ').title()
                ep_data = {'title': slug, 'url': anime['url']}
                if cloud: ep_data['cloud_stream'] = cloud
                if servers: ep_data['servers'] = servers
                episodes.append(ep_data)
        else:
            for ep_url in ep_links:
                servers, cloud = get_all_servers(ep_url)
                slug = ep_url.rstrip('/').split('/')[-1].replace('-',' ').title()
                ep_data = {'title': slug, 'url': ep_url}
                if cloud: ep_data['cloud_stream'] = cloud
                if servers: ep_data['servers'] = servers
                episodes.append(ep_data)
                time.sleep(0.15)
        
        cloud_count = sum(1 for e in episodes if e.get('cloud_stream'))
        server_count = sum(len(e.get('servers', {})) for e in episodes)
        new_cloud_count += cloud_count
        
        # Update or add entry
        entry = {
            'id': anime['id'],
            'title': anime['title'],
            'slug': anime['slug'],
            'url': anime['url'],
            'modified': anime.get('modified',''),
            'episodes': episodes,
        }
        existing[anime['id']] = entry
        updated_count += 1
        log(f"    → {len(episodes)} eps, {cloud_count} cloud, {server_count} total servers")
        time.sleep(0.2)
    
    # Step 4: Save updated data
    all_data = sorted(existing.values(), key=lambda x: x['id'])
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)
    
    # Step 5: Auto-commit & push
    total_anime = len(all_data)
    total_eps = sum(len(a['episodes']) for a in all_data)
    total_cloud = sum(sum(1 for e in a['episodes'] if e.get('cloud_stream')) for a in all_data)
    total_servers = sum(sum(len(e.get('servers', {})) for e in a['episodes']) for a in all_data)
    
    commit_msg = f"scraper: desidubanime auto-update — {updated_count} new/updated, {total_servers} total servers ({total_anime} anime, {total_cloud} cloud)"
    pushed = git_commit_push(commit_msg)
    
    log(f"═══ Update Complete ═══")
    log(f"  Total: {total_anime} anime | {total_eps} episodes | {total_cloud} cloud streams")
    log(f"  Updated: {updated_count} | New cloud: {new_cloud_count}")
    log(f"  Pushed: {'Yes ✅' if pushed else 'No'}")

if __name__ == '__main__':
    main()
