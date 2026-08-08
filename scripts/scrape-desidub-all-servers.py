#!/usr/bin/env python3
"""
Scrape ALL servers from DesiDubAnime episode pages.
Updates the existing desidub-anime.json with all server embed URLs.

Servers found on each episode page (data-embed-id attributes):
  1. Mirrordub  → gdmirrorbot.nl (cloud/no-ads)
  2. Streamp2pdub → desidubanime.p2pplay.pro
  3. Abyssdub   → play.abyssplayer.com
  4. VMolydub   → vidmoly.org
  5. CLOUD      → cloud.desidubanime.me

Usage:
  python3 scripts/scrape-desidub-all-servers.py [--limit N] [--offset N] [--force]
"""

import json
import sys
import os
import time
import base64
import re
import argparse
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

DATA_FILE = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'desidub-anime.json')
PROGRESS_FILE = os.path.join(os.path.dirname(__file__), '..', 'download', 'desidub-all-servers-progress.json')

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def fetch_url(url, retries=2):
    """Fetch URL with retry logic."""
    for attempt in range(retries + 1):
        try:
            req = Request(url, headers={'User-Agent': USER_AGENT})
            with urlopen(req, timeout=15) as resp:
                return resp.read().decode('utf-8', errors='replace')
        except (URLError, HTTPError) as e:
            if attempt < retries:
                time.sleep(2)
            else:
                return None
    return None

def extract_servers(html):
    """Extract all server data-embed-id attributes from episode page HTML."""
    if not html:
        return {}
    
    servers = {}
    # Find all data-embed-id attributes
    pattern = r'data-embed-id="([^"]+)"'
    matches = re.findall(pattern, html)
    
    for match in matches:
        try:
            parts = match.split(':')
            if len(parts) != 2:
                continue
            name_b64, url_b64 = parts
            # Add padding if needed
            name_b64 += '=' * (4 - len(name_b64) % 4)
            url_b64 += '=' * (4 - len(url_b64) % 4)
            name = base64.b64decode(name_b64).decode('utf-8')
            url = base64.b64decode(url_b64).decode('utf-8')
            servers[name] = url
        except Exception as e:
            continue
    
    return servers

def main():
    parser = argparse.ArgumentParser(description='Scrape all servers from DesiDubAnime')
    parser.add_argument('--limit', type=int, default=0, help='Limit number of anime to process')
    parser.add_argument('--offset', type=int, default=0, help='Start from this index')
    parser.add_argument('--force', action='store_true', help='Re-scrape even if already has servers')
    parser.add_argument('--episodes-only', action='store_true', help='Only scrape episodes that have no servers yet')
    args = parser.parse_args()
    
    # Load existing data
    print(f"Loading data from {DATA_FILE}...")
    with open(DATA_FILE, 'r') as f:
        anime_list = json.load(f)
    print(f"Loaded {len(anime_list)} anime")
    
    # Load progress
    progress = {}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r') as f:
            progress = json.load(f)
        print(f"Loaded progress: {len(progress)} anime processed")
    
    total_anime = len(anime_list)
    total_servers_found = 0
    total_episodes_scraped = 0
    total_new_servers = 0
    save_counter = 0
    
    start = args.offset
    end = total_anime if args.limit == 0 else min(start + args.limit, total_anime)
    
    for idx in range(start, end):
        anime = anime_list[idx]
        anime_id = anime['id']
        title = anime['title']
        episodes = anime.get('episodes', [])
        
        if not episodes:
            continue
        
        # Skip if already fully processed (unless force)
        if not args.force and str(anime_id) in progress and progress[str(anime_id)].get('done'):
            continue
        
        print(f"\n[{idx+1}/{end}] {title} ({len(episodes)} episodes)")
        anime_servers_count = 0
        
        for ep_idx, ep in enumerate(episodes):
            ep_url = ep.get('url', '')
            if not ep_url:
                continue
            
            # Skip if episode already has servers (unless force)
            existing_servers = ep.get('servers', {})
            if not args.force and not args.episodes_only and existing_servers:
                continue
            if args.episodes_only and existing_servers:
                continue
            
            # Fetch episode page
            html = fetch_url(ep_url)
            if not html:
                print(f"  Ep {ep_idx+1}: FAILED to fetch")
                time.sleep(1)
                continue
            
            # Extract servers
            servers = extract_servers(html)
            if servers:
                # Map cloud_stream to Mirrordub for backwards compat
                mirrordub_url = servers.get('Mirrordub')
                if mirrordub_url and not ep.get('cloud_stream'):
                    ep['cloud_stream'] = mirrordub_url
                
                # Store all servers
                ep['servers'] = servers
                anime_servers_count += len(servers)
                total_servers_found += len(servers)
                total_new_servers += len(servers) - len(existing_servers)
                
                server_names = ', '.join(servers.keys())
                print(f"  Ep {ep_idx+1}: {len(servers)} servers ({server_names})")
            else:
                print(f"  Ep {ep_idx+1}: No servers found")
            
            total_episodes_scraped += 1
            time.sleep(0.3)  # Rate limit
            
            # Save progress every 50 episodes
            save_counter += 1
            if save_counter >= 50:
                save_counter = 0
                with open(DATA_FILE, 'w') as f:
                    json.dump(anime_list, f, indent=2, ensure_ascii=False)
                progress[str(anime_id)] = {'done': False, 'servers': anime_servers_count}
                with open(PROGRESS_FILE, 'w') as f:
                    json.dump(progress, f, indent=2)
                print(f"  [Saved progress]")
        
        progress[str(anime_id)] = {'done': True, 'servers': anime_servers_count}
    
    # Final save
    print(f"\nSaving final data...")
    with open(DATA_FILE, 'w') as f:
        json.dump(anime_list, f, indent=2, ensure_ascii=False)
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f, indent=2)
    
    # Stats
    total_with_servers = sum(1 for a in anime_list for ep in a.get('episodes', []) if ep.get('servers'))
    total_eps = sum(len(a.get('episodes', [])) for a in anime_list)
    print(f"\n{'='*60}")
    print(f"COMPLETE!")
    print(f"  Episodes scraped: {total_episodes_scraped}")
    print(f"  Total servers found: {total_servers_found}")
    print(f"  New servers added: {total_new_servers}")
    print(f"  Episodes with servers: {total_with_servers}/{total_eps}")
    print(f"  Data saved to: {DATA_FILE}")
    
    # Show server type distribution
    server_counts = {}
    for a in anime_list:
        for ep in a.get('episodes', []):
            for name in ep.get('servers', {}).keys():
                server_counts[name] = server_counts.get(name, 0) + 1
    print(f"\n  Server distribution:")
    for name, count in sorted(server_counts.items(), key=lambda x: -x[1]):
        print(f"    {name}: {count}")

if __name__ == '__main__':
    main()
