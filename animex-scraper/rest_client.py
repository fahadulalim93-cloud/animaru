"""
AnimeX Scraper — REST API Client
=================================

Handles episodes, servers, and stream source retrieval from pp.animex.one.

REST API Base: https://pp.animex.one/rest/api

Endpoints:
  GET /episodes?id={internalId}                          → episode list
  GET /servers?id={internalId}&epNum={episodeNumber}     → sub/dub providers
  GET /sources?id={internalId}&epNum={epNum}&type={sub|dub}&providerId={id}  → stream URLs
  GET /download?q={encodedUrl}                            → download info
"""

from __future__ import annotations

from typing import Any, Optional

import httpx

try:
    from .config import REST_BASE, UPSTREAM_HEADERS, PROVIDERS, PROVIDER_PRIORITY
except ImportError:
    from config import REST_BASE, UPSTREAM_HEADERS, PROVIDERS, PROVIDER_PRIORITY


# ─── In-Memory Cache ────────────────────────────────────────────────────────────

_episodes_cache: dict[str, list] = {}
_servers_cache: dict[str, dict] = {}


class RESTClient:
    """Async REST client for pp.animex.one API."""

    def __init__(self, timeout: float = 10.0):
        self._timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers=UPSTREAM_HEADERS,
                follow_redirects=True,
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ─── Episodes ──────────────────────────────────────────────────────────

    async def episodes(self, internal_id: str) -> list[dict]:
        """
        Fetch episode list for an anime.
        
        Args:
            internal_id: AnimeX internal slug (e.g., "one-piece-p8k27")
            
        Returns:
            List of episode dicts with:
              - number: Episode number
              - title: Episode title (English or romaji)
              - isFiller: Whether it's a filler episode
              - hasSub: Whether sub is available
              - hasDub: Whether dub is available
              - description: Episode description
              - rating: Episode rating
              - length: Duration in minutes
              - airDateUtc: Airing date
              - img: Episode thumbnail
        """
        if internal_id in _episodes_cache:
            return _episodes_cache[internal_id]

        client = await self._get_client()
        try:
            resp = await client.get(
                f"{REST_BASE}/episodes",
                params={"id": internal_id},
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return []

        # Handle different response formats
        raw_eps = []
        if isinstance(data, list):
            raw_eps = data
        elif isinstance(data, dict):
            if "data" in data and isinstance(data["data"], list):
                raw_eps = data["data"]
            elif "episodes" in data and isinstance(data["episodes"], list):
                raw_eps = data["episodes"]

        episodes = []
        for ep in raw_eps:
            titles = ep.get("titles", {})
            title = (
                titles.get("en", "")
                or titles.get("x-jat", "")
                or titles.get("romaji", "")
                or ep.get("title", "")
            )
            episodes.append({
                "number": ep.get("number", 0),
                "title": title,
                "isFiller": ep.get("isFiller", False),
                "hasSub": ep.get("hasSub", False),
                "hasDub": ep.get("hasDub", False),
                "description": ep.get("description", ""),
                "rating": ep.get("rating", ""),
                "length": ep.get("length", 0),
                "airDateUtc": ep.get("airDateUtc", ""),
                "img": ep.get("img", ""),
            })

        _episodes_cache[internal_id] = episodes
        return episodes

    # ─── Servers (Addlist / Provider Mapping) ──────────────────────────────

    async def servers(self, internal_id: str, ep_num: int) -> dict:
        """
        Fetch available servers/providers for a specific episode.
        
        This is the "addlist" mapping — it tells you which content providers
        (CB) are available for sub and dub for this specific episode.
        
        Args:
            internal_id: AnimeX internal slug
            ep_num: Episode number
            
        Returns:
            {
                "subProviders": [
                    {"id": "beep", "default": true, "tip": "Hard sub, Fast"},
                    {"id": "miku", "default": false, "tip": "Hard sub, Best Quality"},
                    ...
                ],
                "dubProviders": [
                    {"id": "mimi", "default": true, "tip": "Hard sub, Fastest"},
                    ...
                ]
            }
        """
        cache_key = f"{internal_id}:{ep_num}"
        if cache_key in _servers_cache:
            return _servers_cache[cache_key]

        client = await self._get_client()
        try:
            resp = await client.get(
                f"{REST_BASE}/servers",
                params={"id": internal_id, "epNum": ep_num},
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return {"subProviders": [], "dubProviders": []}

        result = {
            "subProviders": data.get("subProviders", []),
            "dubProviders": data.get("dubProviders", []),
        }

        _servers_cache[cache_key] = result
        return result

    # ─── Sources (Stream URLs + Headers) ──────────────────────────────────

    async def sources(
        self,
        internal_id: str,
        ep_num: int,
        stream_type: str = "sub",
        provider_id: str = "miku",
    ) -> Optional[dict]:
        """
        Fetch stream sources for a specific episode and provider.
        
        Args:
            internal_id: AnimeX internal slug
            ep_num: Episode number
            stream_type: "sub" or "dub"
            provider_id: Provider ID (e.g., "miku", "yuki", "mimi")
            
        Returns:
            {
                "sources": [
                    {
                        "url": "https://...",
                        "quality": "1080p",
                        "type": "video/mpegurl",
                        "format": "hls",           # detected format
                        "isM3U8": true,
                        "isMP4": false,
                        "needsProxy": true,        # ALWAYS true for AnimeX
                    }
                ],
                "headers": {                        # Required headers for stream
                    "Referer": "https://...",
                },
                "provider": "miku",
                "providerName": "Miku",
                "tracks": [                         # Subtitles/thumbnails
                    {"url": "...", "lang": "en", "kind": "captions"},
                ],
                "intro": {"start": 97, "end": 182},
                "outro": {"start": 1320, "end": 1420},
                "chapters": [...],
            }
        """
        client = await self._get_client()
        try:
            resp = await client.get(
                f"{REST_BASE}/sources",
                params={
                    "id": internal_id,
                    "epNum": ep_num,
                    "type": stream_type,
                    "providerId": provider_id,
                },
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return None

        if data.get("error") or not data.get("sources"):
            return None

        # Get provider config for headers and display name
        provider_config = PROVIDERS.get(provider_id)
        provider_name = provider_config.name if provider_config else provider_id.capitalize()

        # Enrich sources with format detection and proxy requirement
        enriched_sources = []
        for s in data.get("sources", []):
            url = s.get("url", "")
            stream_type_raw = s.get("type", "")
            
            # Detect format
            fmt = detect_format(stream_type_raw, url)
            is_m3u8 = fmt == "m3u8" or ".m3u8" in url or (".txt" in url and "mpegurl" in stream_type_raw)
            is_mp4 = fmt == "mp4" or ".mp4" in url
            is_dash = fmt == "mpd" or ".mpd" in url

            enriched_sources.append({
                "url": url,
                "quality": s.get("quality", "auto"),
                "type": stream_type_raw,
                "format": fmt,
                "isM3U8": is_m3u8,
                "isMP4": is_mp4,
                "isDASH": is_dash,
                "needsProxy": True,  # ALL AnimeX sources need proxy
                "providerHeaders": provider_config.headers if provider_config else {},
            })

        # Enrich tracks
        tracks = []
        for t in data.get("tracks", []):
            tracks.append({
                "url": t.get("url", ""),
                "lang": t.get("lang", ""),
                "label": t.get("label", t.get("lang", "")),
                "kind": t.get("kind", ""),
                "default": t.get("default", False),
            })

        return {
            "sources": enriched_sources,
            "headers": data.get("headers", {}),
            "providerHeaders": provider_config.headers if provider_config else {},
            "provider": provider_id,
            "providerName": provider_name,
            "tracks": tracks,
            "intro": data.get("intro"),
            "outro": data.get("outro"),
            "chapters": data.get("chapters", []),
            "audio": data.get("audio"),
        }

    # ─── Watch (Auto-Race Providers) ──────────────────────────────────────

    async def watch(
        self,
        anilist_id: int,
        episode_num: int,
        translation_type: str = "sub",
        requested_provider: str | None = None,
    ) -> dict:
        """
        Complete watch flow: AniList ID → slug → episodes → servers → sources.
        
        Auto-races providers in priority order until a working source is found.
        
        Args:
            anilist_id: AniList anime ID
            episode_num: Episode number
            translation_type: "sub" or "dub"
            requested_provider: Optional specific provider to try first
            
        Returns:
            {
                "anime": {...},
                "sources": [...],
                "subtitles": [...],
                "intro": {...},
                "outro": {...},
                "provider": "miku",
                "providerName": "Miku",
                "triedProviders": ["miku", "yuki", ...],
                "allProviders": [...],
            }
        """
        try:
            from .graphql_client import graphql_client
        except ImportError:
            from graphql_client import graphql_client

        # Step 1: Resolve AniList ID → internal slug
        anime_info = await graphql_client.get_anime(anilist_id)
        if not anime_info:
            return {
                "anime": None,
                "sources": [],
                "subtitles": [],
                "provider": requested_provider or "",
                "triedProviders": [],
                "allProviders": [],
            }

        internal_id = anime_info["slug"]

        # Step 2: Get available servers for this episode
        servers = await self.servers(internal_id, episode_num)
        providers = (
            servers["dubProviders"]
            if translation_type == "dub"
            else servers["subProviders"]
        )

        if not providers:
            return {
                "anime": anime_info,
                "sources": [],
                "subtitles": [],
                "provider": "",
                "triedProviders": [],
                "allProviders": [],
            }

        # Step 3: Build provider priority list
        available_ids = [p["id"] for p in providers]
        providers_to_try = []

        # Requested provider first
        if requested_provider and requested_provider in available_ids:
            providers_to_try.append(requested_provider)

        # Then by priority
        for p in PROVIDER_PRIORITY:
            if p in available_ids and p not in providers_to_try:
                providers_to_try.append(p)

        # Then any remaining
        for p in available_ids:
            if p not in providers_to_try:
                providers_to_try.append(p)

        # Step 4: Try providers sequentially (avoid rate limiting)
        for provider_id in providers_to_try:
            source_data = await self.sources(
                internal_id, episode_num, translation_type, provider_id
            )
            if not source_data or not source_data.get("sources"):
                continue

            # Filter out DASH (we don't have DASH player)
            working_sources = [
                s for s in source_data["sources"] if not s.get("isDASH")
            ]
            if not working_sources:
                continue

            # Build subtitles from tracks
            subtitles = []
            for t in source_data.get("tracks", []):
                if t["kind"] in ("captions", "subtitles"):
                    subtitles.append({
                        "url": t["url"],
                        "lang": t.get("lang", "en"),
                        "language": t.get("label", t.get("lang", "English")),
                    })

            return {
                "anime": anime_info,
                "sources": working_sources,
                "subtitles": subtitles,
                "intro": source_data.get("intro"),
                "outro": source_data.get("outro"),
                "provider": provider_id,
                "providerName": source_data.get("providerName", provider_id),
                "triedProviders": providers_to_try[: providers_to_try.index(provider_id) + 1],
                "allProviders": providers_to_try,
            }

        return {
            "anime": anime_info,
            "sources": [],
            "subtitles": [],
            "provider": requested_provider or "",
            "triedProviders": providers_to_try,
            "allProviders": providers_to_try,
        }

    # ─── Download ──────────────────────────────────────────────────────────

    async def download(self, url: str | None = None, internal_id: str | None = None) -> Optional[dict]:
        """Fetch download info."""
        client = await self._get_client()
        try:
            params = {}
            if url:
                params["q"] = url
            elif internal_id:
                params["id"] = internal_id
            else:
                return None

            resp = await client.get(f"{REST_BASE}/download", params=params)
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return None


# ─── Helper Functions ────────────────────────────────────────────────────────────

def detect_format(stream_type: str, url: str) -> str:
    """Detect stream format from content type and URL."""
    if "mpegurl" in stream_type or ".m3u8" in url:
        return "m3u8"
    if "dash" in stream_type or ".mpd" in url:
        return "mpd"
    if "mp4" in stream_type or ".mp4" in url:
        return "mp4"
    return stream_type.split("/")[-1] if "/" in stream_type else "unknown"


# ─── Singleton ──────────────────────────────────────────────────────────────────

rest_client = RESTClient()
