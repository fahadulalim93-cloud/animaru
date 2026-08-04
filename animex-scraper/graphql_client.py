"""
AnimeX Scraper — GraphQL Client
================================

Handles AniList ID → Internal Slug mapping and anime metadata lookup.

GraphQL Endpoint: https://graphql.animex.one/graphql

Key Queries:
  - anime(anilistId: Int)       → slug + metadata
  - searchAnime(query: String)  → quick search
  - catalogAnime(filter: ...)   → full catalog with filtering
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional

import httpx

try:
    from .config import GRAPHQL_URL, UPSTREAM_HEADERS
except ImportError:
    from config import GRAPHQL_URL, UPSTREAM_HEADERS


# ─── GraphQL Queries ────────────────────────────────────────────────────────────

ANIME_QUERY = """
query($id: Int) {
  anime(anilistId: $id) {
    id
    anilistId
    malId
    tmdbId
    thetvdbId
    titleRomaji
    titleEnglish
    titles
    coverImage
    bannerImage
    backdropUrl
    description
    episodeCount
    status
    genres
    source
    format
    seasonYear
    season
    averageScore
    popularity
    nextAiringAt
    nextAiringEpisode
    subCount
    dubCount
    relations { animeId anilistId title relation relationType image coverImage }
    recommendations { animeId anilistId title image coverImage type }
    characters
    studios
    seasons { animeId anilistId title relation image coverImage }
    logos { src iso3166_1 }
  }
}
"""

SEARCH_QUERY = """
query($query: String!, $limit: Int, $includeAdult: Boolean) {
  searchAnime(query: $query, limit: $limit, includeAdult: $includeAdult) {
    items {
      id
      anilistId
      malId
      titleRomaji
      titleEnglish
      coverImage
      format
      status
      episodeCount
      seasonYear
      season
      color
      genres
    }
  }
}
"""

CATALOG_QUERY = """
query($filter: AnimeCatalogFilterInput, $sort: [AnimeSortInput!], $limit: Int, $offset: Int) {
  catalogAnime(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
    items {
      id
      anilistId
      malId
      titleRomaji
      titleEnglish
      coverImage
      bannerImage
      description
      status
      format
      averageScore
      popularity
      episodeCount
      seasonYear
      season
      color
      genres
      subCount
      dubCount
    }
    totalCount
    limit
    offset
    currentPage
    totalPages
    hasNextPage
    hasPreviousPage
  }
}
"""

RECENT_QUERY = """
query {
  recentAiring(page: 1) {
    id
    anilistId
    titleRomaji
    titleEnglish
    coverImage
    episodeNumber
    airingAt
  }
}
"""


# ─── In-Memory Cache ────────────────────────────────────────────────────────────

_slug_cache: dict[int, Optional[dict]] = {}
_neg_cache: dict[int, float] = {}  # anilistId → expire timestamp
_NEG_CACHE_TTL = 5 * 60  # 5 minutes


class GraphQLClient:
    """Async GraphQL client for animex.one."""

    def __init__(self, timeout: float = 10.0):
        self._timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={**UPSTREAM_HEADERS, "Content-Type": "application/json"},
                follow_redirects=True,
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def _query(self, query: str, variables: dict | None = None) -> dict | None:
        """Execute a GraphQL query."""
        client = await self._get_client()
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        try:
            resp = await client.post(GRAPHQL_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()
            if "errors" in data:
                return None
            return data.get("data")
        except (httpx.HTTPError, Exception) as e:
            return None

    # ─── Anime Lookup (AniList ID → Internal Slug) ────────────────────────

    async def get_anime(self, anilist_id: int) -> Optional[dict]:
        """
        Resolve AniList ID → AnimeX internal slug + full metadata.
        
        This is the CRITICAL mapping step:
          URL uses:  {slug}-{anilistId}  (e.g., "one-piece-21")
          API needs: {slug}-{5charCode}  (e.g., "one-piece-p8k27")
          
        The GraphQL query returns the internal ID (slug with 5-char code)
        which is used for all pp.animex.one REST API calls.
        """
        import time
        
        anilist_id = int(anilist_id)

        # Check positive cache
        if anilist_id in _slug_cache:
            return _slug_cache[anilist_id]

        # Check negative cache
        if anilist_id in _neg_cache:
            if time.time() < _neg_cache[anilist_id]:
                return None
            del _neg_cache[anilist_id]

        data = await self._query(ANIME_QUERY, {"id": anilist_id})
        if not data or not data.get("anime") or not data["anime"].get("id"):
            # Negative cache on failure
            _neg_cache[anilist_id] = time.time() + _NEG_CACHE_TTL
            _slug_cache[anilist_id] = None
            return None

        anime = data["anime"]
        
        # Parse cover image
        cover_image = anime.get("coverImage", {})
        if isinstance(cover_image, str):
            import json
            try:
                cover_image = json.loads(cover_image)
            except:
                cover_image = {}

        result = {
            "slug": anime["id"],           # Internal slug: "one-piece-p8k27"
            "anilist_id": anime.get("anilistId", anilist_id),
            "mal_id": anime.get("malId"),
            "tmdb_id": anime.get("tmdbId"),
            "title_romaji": anime.get("titleRomaji", ""),
            "title_english": anime.get("titleEnglish", ""),
            "cover_image": cover_image.get("large") or cover_image.get("extraLarge") or "",
            "banner_image": anime.get("bannerImage", ""),
            "description": anime.get("description", ""),
            "episode_count": anime.get("episodeCount", 0),
            "status": anime.get("status", ""),
            "genres": anime.get("genres", []),
            "format": anime.get("format", ""),
            "season_year": anime.get("seasonYear"),
            "season": anime.get("season", ""),
            "average_score": anime.get("averageScore"),
            "popularity": anime.get("popularity"),
            "sub_count": anime.get("subCount", 0),
            "dub_count": anime.get("dubCount", 0),
            "relations": anime.get("relations", []),
            "recommendations": anime.get("recommendations", []),
            "seasons": anime.get("seasons", []),
        }

        _slug_cache[anilist_id] = result
        return result

    # ─── Search ────────────────────────────────────────────────────────────

    async def search(self, query: str, limit: int = 10, include_adult: bool = False) -> list[dict]:
        """Search anime by title."""
        data = await self._query(SEARCH_QUERY, {
            "query": query,
            "limit": limit,
            "includeAdult": include_adult,
        })
        if not data or not data.get("searchAnime"):
            return []
        
        items = data["searchAnime"].get("items", [])
        results = []
        for item in items:
            cover = item.get("coverImage", {})
            if isinstance(cover, str):
                import json
                try: cover = json.loads(cover)
                except: cover = {}
            results.append({
                "slug": item.get("id", ""),
                "anilist_id": item.get("anilistId"),
                "title_romaji": item.get("titleRomaji", ""),
                "title_english": item.get("titleEnglish", ""),
                "cover_image": cover.get("large") or cover.get("medium") or "",
                "format": item.get("format", ""),
                "status": item.get("status", ""),
                "episode_count": item.get("episodeCount", 0),
                "season_year": item.get("seasonYear"),
                "genres": item.get("genres", []),
            })
        return results

    # ─── Catalog ───────────────────────────────────────────────────────────

    async def catalog(
        self,
        query: str | None = None,
        genres: list[str] | None = None,
        status: list[str] | None = None,
        format: list[str] | None = None,
        season_year_min: int | None = None,
        season_year_max: int | None = None,
        sort_field: str = "POPULARITY",
        sort_direction: str = "DESC",
        limit: int = 20,
        offset: int = 0,
    ) -> dict:
        """Browse anime catalog with filtering and pagination."""
        filter_input: dict[str, Any] = {}
        if query:
            filter_input["query"] = query
        if genres:
            filter_input["genres"] = genres
        if status:
            filter_input["statusIn"] = status
        if format:
            filter_input["formatIn"] = format
        if season_year_min:
            filter_input["seasonYearMin"] = season_year_min
        if season_year_max:
            filter_input["seasonYearMax"] = season_year_max

        variables = {
            "filter": filter_input,
            "sort": [{"field": sort_field, "direction": sort_direction}],
            "limit": limit,
            "offset": offset,
        }

        data = await self._query(CATALOG_QUERY, variables)
        if not data or not data.get("catalogAnime"):
            return {"items": [], "total_count": 0, "has_next_page": False}

        catalog = data["catalogAnime"]
        items = []
        for item in catalog.get("items", []):
            cover = item.get("coverImage", {})
            if isinstance(cover, str):
                import json
                try: cover = json.loads(cover)
                except: cover = {}
            items.append({
                "slug": item.get("id", ""),
                "anilist_id": item.get("anilistId"),
                "title_romaji": item.get("titleRomaji", ""),
                "title_english": item.get("titleEnglish", ""),
                "cover_image": cover.get("large") or cover.get("medium") or "",
                "status": item.get("status", ""),
                "format": item.get("format", ""),
                "average_score": item.get("averageScore"),
                "episode_count": item.get("episodeCount", 0),
                "season_year": item.get("seasonYear"),
                "genres": item.get("genres", []),
                "sub_count": item.get("subCount", 0),
                "dub_count": item.get("dubCount", 0),
            })

        return {
            "items": items,
            "total_count": catalog.get("totalCount", 0),
            "current_page": catalog.get("currentPage", 1),
            "total_pages": catalog.get("totalPages", 1),
            "has_next_page": catalog.get("hasNextPage", False),
        }

    # ─── Recent ────────────────────────────────────────────────────────────

    async def recent(self, page: int = 1) -> list[dict]:
        """Get recently aired episodes."""
        client = await self._get_client()
        try:
            resp = await client.get(f"https://graphql.animex.one/api/recent?page={page}")
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return []


# ─── Singleton ──────────────────────────────────────────────────────────────────

graphql_client = GraphQLClient()
