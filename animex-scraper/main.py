"""
AnimeX Scraper — FastAPI Application
=====================================

Complete scraper API for animex.one with:
  - GraphQL anime lookup (AniList ID → slug mapping)
  - REST API episode/server/source retrieval
  - Stream proxy with per-provider headers
  - Full provider documentation endpoints

Run:
  cd animex-scraper && uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse

from config import PROVIDERS, PROVIDER_PRIORITY, UPSTREAM_HEADERS
from graphql_client import graphql_client
from rest_client import rest_client
from stream_proxy import stream_proxy


# ─── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown — close HTTP clients
    await graphql_client.close()
    await rest_client.close()
    await stream_proxy.close()


# ─── App ─────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AnimeX Scraper API",
    description="Scraper for animex.one — anime IDs, m3u8 headers, content providers (CB), addlist IDs, servers, embeds",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════


# ─── Documentation ───────────────────────────────────────────────────────────────

@app.get("/", tags=["Docs"])
async def root():
    """API overview and documentation."""
    return {
        "name": "AnimeX Scraper API",
        "target": "https://animex.one",
        "api_architecture": {
            "graphql": "https://graphql.animex.one/graphql",
            "rest": "https://pp.animex.one/rest/api",
            "auth": "https://auth.animex.one/api (not used)",
        },
        "id_mapping": {
            "url_ids": "{slug}-{anilistId} (e.g., one-piece-21)",
            "internal_ids": "{slug}-{5charCode} (e.g., one-piece-p8k27)",
            "mapping_method": "GraphQL anime(anilistId: ...) → internal ID",
        },
        "endpoints": {
            "/providers": "All provider configs with headers",
            "/anime/{anilistId}": "Anime info + slug mapping",
            "/search": "Search anime",
            "/catalog": "Browse catalog with filters",
            "/episodes": "Episode list for an anime",
            "/servers": "Available sub/dub providers (addlist)",
            "/sources": "Stream URLs + headers for a provider",
            "/watch": "Complete watch flow (auto-race providers)",
            "/proxy": "Stream proxy with correct headers",
        },
    }


@app.get("/providers", tags=["Docs"])
async def list_providers():
    """
    Complete provider (CB) mapping with headers.
    
    Each provider is a content backend that serves streams from a different CDN
    with different required headers.
    """
    result = {}
    for pid, config in PROVIDERS.items():
        result[pid] = {
            "name": config.name,
            "supportsSub": config.supports_sub,
            "supportsDub": config.supports_dub,
            "subType": config.sub_type,
            "streamFormat": config.stream_format,
            "cdnPattern": config.cdn_pattern,
            "requiredHeaders": config.headers,
            "defaultSub": config.default_sub,
            "defaultDub": config.default_dub,
            "tip": config.tip,
            "notes": config.notes,
        }

    return {
        "providers": result,
        "priority": PROVIDER_PRIORITY,
        "total": len(result),
    }


@app.get("/headers-map", tags=["Docs"])
async def headers_map():
    """
    Complete headers mapping per provider.
    
    This is the critical reference for which headers each provider needs
    to access its stream URLs.
    """
    headers_map = {}
    for pid, config in PROVIDERS.items():
        headers_map[pid] = {
            "cdn": config.cdn_pattern,
            "streamFormat": config.stream_format,
            "headers": config.headers,
            "upstreamHeaders": {k: v for k, v in UPSTREAM_HEADERS.items()},
        }

    return {
        "description": "Required headers for each AnimeX provider's stream URLs",
        "providers": headers_map,
    }


# ─── Anime Lookup ────────────────────────────────────────────────────────────────

@app.get("/anime/{anilist_id}", tags=["Anime"])
async def get_anime(anilist_id: int):
    """
    Resolve AniList ID → AnimeX internal slug + metadata.
    
    This is the CRITICAL mapping step:
      URL uses:  {slug}-{anilistId}  (e.g., "one-piece-21")
      API needs: {slug}-{5charCode}  (e.g., "one-piece-p8k27")
    """
    result = await graphql_client.get_anime(anilist_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Anime not found for AniList ID {anilist_id}")
    return result


# ─── Search ──────────────────────────────────────────────────────────────────────

@app.get("/search", tags=["Anime"])
async def search(
    q: str = Query(..., description="Search query"),
    limit: int = Query(10, ge=1, le=50),
):
    """Search anime by title."""
    results = await graphql_client.search(q, limit=limit)
    return {"query": q, "results": results, "count": len(results)}


# ─── Catalog ─────────────────────────────────────────────────────────────────────

@app.get("/catalog", tags=["Anime"])
async def catalog(
    q: Optional[str] = Query(None, description="Filter by title"),
    genres: Optional[str] = Query(None, description="Comma-separated genres"),
    status: Optional[str] = Query(None, description="Comma-separated statuses"),
    format: Optional[str] = Query(None, description="Comma-separated formats"),
    sort: str = Query("POPULARITY", description="Sort field"),
    direction: str = Query("DESC", description="Sort direction"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    """Browse anime catalog with filtering and pagination."""
    genre_list = genres.split(",") if genres else None
    status_list = status.split(",") if status else None
    format_list = format.split(",") if format else None

    result = await graphql_client.catalog(
        query=q,
        genres=genre_list,
        status=status_list,
        format=format_list,
        sort_field=sort,
        sort_direction=direction,
        limit=limit,
        offset=offset,
    )
    return result


# ─── Episodes ────────────────────────────────────────────────────────────────────

@app.get("/episodes", tags=["Episodes"])
async def episodes(
    id: str = Query(..., description="AnimeX internal slug (e.g., one-piece-p8k27)"),
):
    """
    Get episode list for an anime.
    
    The 'id' parameter is the AnimeX internal slug, NOT the AniList ID.
    Use /anime/{anilistId} first to get the slug.
    """
    result = await rest_client.episodes(id)
    return {"id": id, "episodes": result, "count": len(result)}


@app.get("/episodes/by-anilist/{anilist_id}", tags=["Episodes"])
async def episodes_by_anilist(anilist_id: int):
    """Get episodes by AniList ID (resolves slug automatically)."""
    anime_info = await graphql_client.get_anime(anilist_id)
    if not anime_info:
        raise HTTPException(status_code=404, detail=f"Anime not found for AniList ID {anilist_id}")

    result = await rest_client.episodes(anime_info["slug"])
    return {
        "anime": anime_info,
        "episodes": result,
        "count": len(result),
    }


# ─── Servers (Addlist / Provider Mapping) ────────────────────────────────────────

@app.get("/servers", tags=["Servers"])
async def servers(
    id: str = Query(..., description="AnimeX internal slug"),
    epNum: int = Query(..., description="Episode number"),
):
    """
    Get available servers/providers (addlist) for a specific episode.
    
    This returns which content providers (CB) are available for sub and dub.
    Each provider entry includes:
      - id: Provider identifier (e.g., "miku", "yuki")
      - default: Whether it's the default provider
      - tip: Description of the provider's characteristics
    """
    result = await rest_client.servers(id, epNum)
    return {
        "id": id,
        "epNum": epNum,
        "subProviders": result.get("subProviders", []),
        "dubProviders": result.get("dubProviders", []),
    }


@app.get("/servers/by-anilist/{anilist_id}", tags=["Servers"])
async def servers_by_anilist(
    anilist_id: int,
    epNum: int = Query(1, description="Episode number"),
):
    """Get servers by AniList ID (resolves slug automatically)."""
    anime_info = await graphql_client.get_anime(anilist_id)
    if not anime_info:
        raise HTTPException(status_code=404, detail=f"Anime not found for AniList ID {anilist_id}")

    result = await rest_client.servers(anime_info["slug"], epNum)
    return {
        "anime": anime_info,
        "epNum": epNum,
        "subProviders": result.get("subProviders", []),
        "dubProviders": result.get("dubProviders", []),
    }


# ─── Sources (Stream URLs) ──────────────────────────────────────────────────────

@app.get("/sources", tags=["Sources"])
async def sources(
    id: str = Query(..., description="AnimeX internal slug"),
    epNum: int = Query(..., description="Episode number"),
    type: str = Query("sub", description="sub or dub"),
    provider: str = Query("miku", description="Provider ID"),
):
    """
    Get stream sources (m3u8/mp4 URLs + headers) for a specific episode and provider.
    
    Returns:
      - sources: Array of stream URLs with quality, format, and proxy requirements
      - headers: Required headers from the API response
      - providerHeaders: Required headers from our config (for proxy)
      - tracks: Subtitles and thumbnails
      - intro/outro: Skip timestamps
      - chapters: Chapter markers
    """
    result = await rest_client.sources(id, epNum, type, provider)
    if not result:
        raise HTTPException(status_code=404, detail="No sources found")
    return result


# ─── Watch (Auto-Race) ──────────────────────────────────────────────────────────

@app.get("/watch", tags=["Watch"])
async def watch(
    anilistId: int = Query(..., description="AniList anime ID"),
    episode: int = Query(1, description="Episode number"),
    type: str = Query("sub", description="sub or dub"),
    provider: Optional[str] = Query(None, description="Specific provider to try first"),
):
    """
    Complete watch flow: AniList ID → slug → servers → sources.
    
    Auto-races providers in priority order until a working source is found.
    This is the main endpoint for playing anime.
    
    Flow:
      1. AniList ID → GraphQL → internal slug
      2. Slug → REST API → servers (addlist)
      3. Servers → sources (stream URLs + headers)
      4. Sources → proxy URLs (with correct headers)
    """
    result = await rest_client.watch(anilistId, episode, type, provider)
    return result


# ─── Stream Proxy ────────────────────────────────────────────────────────────────

@app.get("/proxy", tags=["Proxy"])
async def proxy(
    url: str = Query(..., description="Target stream URL"),
    provider: str = Query("miku", description="Provider ID"),
    type: str = Query("manifest", description="manifest or segment"),
):
    """
    Stream proxy with per-provider headers.
    
    For m3u8 manifests: Rewrites all URLs to go through proxy
    For TS segments: Adds correct headers, strips PNG wrapper (mimi)
    For MP4: Adds correct headers, passthrough
    
    Provider headers:
      - miku:  Referer: allanime.uns.bio + Mobile UA
      - yuki:  Referer: megaplay.buzz
      - vee:   Referer: animeonsen.xyz
      - mimi:  Origin/Referer: animex.one (PNG-wrapped TS)
      - neko:  Referer: animeverse.to + Firefox UA
      - huzz:  Origin/Referer: kem.clvd.xyz + Firefox UA
      - mochi: Referer: animex.one (MP4 with token)
      - kiwi:  Origin/Referer: anidb.app
      - beep:  No special headers
    """
    try:
        if type == "manifest":
            content, headers = await stream_proxy.fetch_manifest(url, provider)
            return Response(content=content, headers=headers)
        else:
            data, content_type, headers = await stream_proxy.fetch_segment(url, provider)
            return Response(content=data, headers=headers)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")


# ─── Recent ──────────────────────────────────────────────────────────────────────

@app.get("/recent", tags=["Anime"])
async def recent(page: int = Query(1, ge=1)):
    """Get recently aired episodes."""
    result = await graphql_client.recent(page)
    return {"page": page, "results": result}


# ─── Health ──────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health():
    """Health check."""
    return {"status": "ok", "target": "animex.one"}
