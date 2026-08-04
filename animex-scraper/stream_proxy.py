"""
AnimeX Scraper — HLS/Stream Proxy
===================================

Proxies video streams with correct headers per provider.
Handles:
  - m3u8 manifest rewriting (all URLs → proxy URLs)
  - PNG wrapper stripping (mimi segments)
  - TS disguised as .jpg detection (yuki segments)
  - MP4 passthrough (mochi/neko)
  - Per-provider Referer/Origin/User-Agent headers
"""

from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urlencode, quote

import httpx

try:
    from .config import PROVIDERS, UPSTREAM_HEADERS
except ImportError:
    from config import PROVIDERS, UPSTREAM_HEADERS

# PNG header signature for detection and stripping (mimi)
PNG_MAGIC = bytes([0x89, 0x50, 0x4E, 0x47])
MAX_PNG_HEADER = 200

# Default UA for segment fetching
DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/53736"


class StreamProxy:
    """Async stream proxy with per-provider header injection and m3u8 rewriting."""

    def __init__(self, proxy_base_url: str = "/api/animex/proxy", timeout: float = 15.0):
        self._proxy_base = proxy_base_url
        self._timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                follow_redirects=True,
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    def get_provider_headers(self, provider_id: str) -> dict:
        """Get the required headers for a specific provider."""
        config = PROVIDERS.get(provider_id)
        if config:
            return {**config.headers}
        return {}

    def build_proxy_url(self, target_url: str, provider: str, stream_type: str) -> str:
        """Build a proxy URL for a given target URL."""
        return f"{self._proxy_base}?url={quote(target_url, safe='')}&provider={provider}&type={stream_type}"

    async def fetch_manifest(self, url: str, provider_id: str) -> tuple[str, dict]:
        """
        Fetch and rewrite an m3u8 manifest.
        
        All URLs in the manifest are rewritten to go through our proxy
        with the correct provider headers.
        
        Returns:
            (rewritten_m3u8_content, response_headers)
        """
        client = await self._get_client()
        headers = {
            "User-Agent": DEFAULT_UA,
            **self.get_provider_headers(provider_id),
        }

        resp = await client.get(url, headers=headers)
        resp.raise_for_status()

        content = resp.text

        # Check for HTML error page
        if "<!DOCTYPE" in content or "<html" in content:
            raise ValueError("Got HTML instead of m3u8 — upstream blocked")

        # Check if it's actually HLS content
        stripped = content.lstrip()
        if not stripped.startswith("#EXTM3U") and "#EXT-X-" not in content:
            raise ValueError("Not a valid HLS manifest")

        # Rewrite URLs
        rewritten = self._rewrite_m3u8(content, provider_id, url)

        response_headers = {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "public, max-age=5",
            "Access-Control-Allow-Origin": "*",
        }

        return rewritten, response_headers

    async def fetch_segment(self, url: str, provider_id: str) -> tuple[bytes, str, dict]:
        """
        Fetch a TS/MP4 segment with correct provider headers.
        
        Handles:
          - PNG wrapper stripping (mimi)
          - TS disguised as .jpg detection (yuki)
          - MP4 passthrough (mochi/neko)
        
        Returns:
            (segment_data, content_type, response_headers)
        """
        client = await self._get_client()
        headers = {
            "User-Agent": DEFAULT_UA,
            **self.get_provider_headers(provider_id),
        }

        resp = await client.get(url, headers=headers)
        resp.raise_for_status()

        data = resp.content
        upstream_ct = resp.headers.get("content-type", "")

        # ── Mimi: Strip PNG wrapper from TS segments ────────────────────
        if provider_id == "mimi" and len(data) > 100:
            if data[:4] == PNG_MAGIC:
                data = self._strip_png_wrapper(data)

        # ── Yuki: Detect TS disguised as .jpg ───────────────────────────
        content_type = upstream_ct
        if provider_id == "yuki" and len(data) > 4 and data[0] == 0x47:
            content_type = "video/mp2t"

        # ── Detect MP4 ──────────────────────────────────────────────────
        is_mp4 = (
            "mp4" in upstream_ct
            or ".mp4" in url
            or (len(data) > 8 and data[4:8] == b"ftyp")
        )
        if is_mp4:
            content_type = "video/mp4"
        elif "mpegurl" in content_type or "mpeg" in content_type:
            content_type = "video/mp2t"
        elif content_type not in ("video/mp4", "video/mp2t", "video/mpeg"):
            # Default to TS if ambiguous
            content_type = "video/mp2t"

        response_headers = {
            "Content-Type": content_type,
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
        }
        if is_mp4:
            response_headers["Accept-Ranges"] = "bytes"

        return data, content_type, response_headers

    # ─── M3U8 Rewriting ────────────────────────────────────────────────────

    def _rewrite_m3u8(self, content: str, provider: str, base_url: str) -> str:
        """Rewrite all URLs in an m3u8 manifest to go through our proxy."""
        lines = content.split("\n")
        rewritten = []

        for line in lines:
            trimmed = line.strip()

            # Comment or empty line
            if trimmed.startswith("#") or trimmed == "":
                # Rewrite URI= attributes in EXT-X-MAP and EXT-X-MEDIA tags
                if 'URI="' in trimmed:
                    def replace_uri(match):
                        original = match.group(1)
                        resolved = self._resolve_url(original, base_url)
                        proxied = self.build_proxy_url(resolved, provider, "manifest")
                        return f'URI="{proxied}"'
                    trimmed = re.sub(r'URI="([^"]+)"', replace_uri, trimmed)
                rewritten.append(trimmed if line == trimmed else line)
                continue

            # URL line (segment or sub-playlist)
            resolved = self._resolve_url(trimmed, base_url)

            # Detect sub-playlists:
            #   - .m3u8 extension
            #   - .txt extension (miku uses .txt for sub-playlists)
            #   - URLs without known segment extensions
            is_playlist = (
                ".m3u8" in resolved
                or "m3u8" in resolved
                or ".txt" in resolved   # miku sub-playlists
                or (
                    not any(ext in resolved for ext in (".ts", ".mp4", ".jpg", ".png", ".m4s", ".vtt"))
                )
            )
            stream_type = "manifest" if is_playlist else "segment"
            proxied = self.build_proxy_url(resolved, provider, stream_type)
            rewritten.append(proxied)

        return "\n".join(rewritten)

    @staticmethod
    def _resolve_url(url: str, base_url: str) -> str:
        """Resolve a relative URL against a base URL."""
        if url.startswith("http://") or url.startswith("https://"):
            return url
        try:
            from urllib.parse import urljoin
            return urljoin(base_url, url)
        except Exception:
            return url

    @staticmethod
    def _strip_png_wrapper(data: bytes) -> bytes:
        """Strip PNG header wrapper from TS segment data (mimi provider)."""
        for i in range(8, min(len(data), MAX_PNG_HEADER + 100)):
            if data[i] == 0x47 and i + 3 < len(data):
                pid = ((data[i + 1] & 0x1F) << 8) | data[i + 2]
                if pid < 0x1FFF:
                    return data[i:]
        return data


# ─── Singleton ──────────────────────────────────────────────────────────────────

stream_proxy = StreamProxy()
