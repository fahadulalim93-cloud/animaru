"""
AnimeX Scraper — Configuration & Provider Mapping
===================================================

Target: https://animex.one

API Architecture:
  - GraphQL: https://graphql.animex.one/graphql  (anime metadata, search, catalog)
  - REST:    https://pp.animex.one/rest/api      (episodes, servers, sources)
  - Auth:    https://auth.animex.one/api          (comments, forums — not used by scraper)

ID Systems:
  - URL IDs:     {slug}-{anilistId}         e.g., "one-piece-21"       (public URLs)
  - Internal IDs: {slug}-{5charCode}         e.g., "one-piece-p8k27"   (API calls)
  - Mapping:      GraphQL anime(anilistId:...) → internal ID

Provider System (CB = Content Backend):
  Each provider serves streams from a different CDN with different headers.
  Sub/Dub availability varies per provider.
"""

from __future__ import annotations

# ─── API Endpoints ──────────────────────────────────────────────────────────────

GRAPHQL_URL = "https://graphql.animex.one/graphql"
REST_BASE = "https://pp.animex.one/rest/api"
RECENT_URL = "https://graphql.animex.one/api/recent"

# ─── Upstream Headers (for all requests to animex.one APIs) ────────────────────

UPSTREAM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://animex.one",
    "Referer": "https://animex.one/",
}

# ─── Provider Configuration ─────────────────────────────────────────────────────
# Complete mapping of ALL providers with their:
#   - display name
#   - sub/dub support
#   - sub type (hard/soft)
#   - stream format (hls/dash/mp4)
#   - CDN domain pattern
#   - required headers for stream access
#   - segment handling notes

class ProviderConfig:
    """Configuration for a single streaming provider."""
    def __init__(
        self,
        id: str,
        name: str,
        supports_sub: bool,
        supports_dub: bool,
        sub_type: str,          # "hard" or "soft"
        stream_format: str,     # "hls", "dash", "mp4"
        cdn_pattern: str,       # domain pattern for CDN
        headers: dict,          # required headers for stream access
        default_sub: bool = False,
        default_dub: bool = False,
        tip: str = "",
        notes: str = "",
    ):
        self.id = id
        self.name = name
        self.supports_sub = supports_sub
        self.supports_dub = supports_dub
        self.sub_type = sub_type
        self.stream_format = stream_format
        self.cdn_pattern = cdn_pattern
        self.headers = headers
        self.default_sub = default_sub
        self.default_dub = default_dub
        self.tip = tip
        self.notes = notes


# ─── ALL PROVIDERS (Complete Mapping) ──────────────────────────────────────────

PROVIDERS: dict[str, ProviderConfig] = {

    # ── beep ────────────────────────────────────────────────────────────────
    # Default sub provider. Hard sub, fast. CDN: bd.24stream.xyz
    # Multi-quality HLS (1080p/720p/480p/360p)
    # Headers: None special (direct access works from server-side)
    "beep": ProviderConfig(
        id="beep",
        name="Beep",
        supports_sub=True,
        supports_dub=False,
        sub_type="hard",
        stream_format="hls",
        cdn_pattern="bd.24stream.xyz",
        headers={},
        default_sub=True,
        tip="Hard sub, Fast",
        notes="Default sub provider. Multi-quality HLS. Often Cloudflare-blocked from server-side.",
    ),

    # ── mimi ────────────────────────────────────────────────────────────────
    # Hard sub, Fastest, High quality. CDN: hawk.24stream.xyz
    # Segments are PNG-wrapped TS — need PNG stripping
    # Headers: Origin + Referer: animex.one
    "mimi": ProviderConfig(
        id="mimi",
        name="Mimi",
        supports_sub=True,
        supports_dub=True,
        sub_type="hard",
        stream_format="hls",
        cdn_pattern="hawk.24stream.xyz",
        headers={
            "Origin": "https://animex.one",
            "Referer": "https://animex.one/",
        },
        default_sub=False,
        default_dub=True,
        tip="Hard sub, Fastest, High quality",
        notes="PNG-wrapped TS segments. Need Referer: animex.one. Often Cloudflare-blocked from server.",
    ),

    # ── vee ─────────────────────────────────────────────────────────────────
    # Soft sub, Fast. CDN: cdn.animeonsen.xyz
    # DASH (.mpd) format — needs DASH player
    # Headers: Referer: animeonsen.xyz
    "vee": ProviderConfig(
        id="vee",
        name="Vee",
        supports_sub=True,
        supports_dub=False,
        sub_type="soft",
        stream_format="dash",
        cdn_pattern="cdn.animeonsen.xyz",
        headers={
            "Referer": "https://www.animeonsen.xyz/",
        },
        tip="Soft sub, Fast",
        notes="DASH format (.mpd). Requires DASH player. Referer: animeonsen.xyz",
    ),

    # ── yuki ────────────────────────────────────────────────────────────────
    # Soft sub, Good, Multi quality. CDN: s2.cinewave2.site
    # HLS with multi-quality. TS segments disguised as .jpg
    # Headers: Referer: megaplay.buzz
    "yuki": ProviderConfig(
        id="yuki",
        name="Yuki",
        supports_sub=True,
        supports_dub=True,
        sub_type="soft",
        stream_format="hls",
        cdn_pattern="s2.cinewave2.site",
        headers={
            "Referer": "https://megaplay.buzz/",
        },
        tip="Soft sub, Good, Multi quality",
        notes="TS disguised as .jpg segments. Referer: megaplay.buzz. Cloudflare bypass.",
    ),

    # ── miku ────────────────────────────────────────────────────────────────
    # Hard sub, Fast, Best Quality. CDN: sxic.oceancrestdigital.shop
    # HLS — sub-playlists use .txt extension, not .m3u8
    # Headers: Referer: allanime.uns.bio + Mobile User-Agent
    "miku": ProviderConfig(
        id="miku",
        name="Miku",
        supports_sub=True,
        supports_dub=True,
        sub_type="hard",
        stream_format="hls",
        cdn_pattern="sxic.oceancrestdigital.shop",
        headers={
            "Referer": "https://allanime.uns.bio",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        },
        tip="Hard sub, Fast, Best Quality",
        notes="Sub-playlists use .txt extension. Needs mobile User-Agent. Referer: allanime.uns.bio",
    ),

    # ── neko ────────────────────────────────────────────────────────────────
    # Hard sub, Fast, High quality. CDN: neko.yokai.cfd
    # Direct MP4 format
    # Headers: Referer: animeverse.to + Firefox User-Agent
    "neko": ProviderConfig(
        id="neko",
        name="Neko",
        supports_sub=True,
        supports_dub=False,
        sub_type="hard",
        stream_format="mp4",
        cdn_pattern="neko.yokai.cfd",
        headers={
            "Referer": "https://animeverse.to/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
        },
        tip="Hard sub, Fast, High quality",
        notes="Direct MP4. Needs Firefox UA + Referer: animeverse.to",
    ),

    # ── huzz ────────────────────────────────────────────────────────────────
    # Hard sub, Fast. CDN: s2.vidhosters.com
    # HLS (.m3u8) format
    # Headers: Origin + Referer: kem.clvd.xyz + Firefox User-Agent
    "huzz": ProviderConfig(
        id="huzz",
        name="Huzz",
        supports_sub=True,
        supports_dub=False,
        sub_type="hard",
        stream_format="hls",
        cdn_pattern="s2.vidhosters.com",
        headers={
            "Origin": "https://kem.clvd.xyz",
            "Referer": "https://kem.clvd.xyz/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
        },
        tip="Hard sub, Fast",
        notes="Needs Firefox UA + Origin/Referer: kem.clvd.xyz",
    ),

    # ── mochi ───────────────────────────────────────────────────────────────
    # Hard sub, Fastest, High quality. CDN: tools.fast4speed.rsvp
    # Direct MP4 with auth token in URL (expires quickly)
    # Headers: Referer: animex.one
    "mochi": ProviderConfig(
        id="mochi",
        name="Mochi",
        supports_sub=True,
        supports_dub=True,
        sub_type="hard",
        stream_format="mp4",
        cdn_pattern="tools.fast4speed.rsvp",
        headers={
            "Referer": "https://animex.one",
        },
        tip="Hard sub, Fastest, High quality",
        notes="MP4 with expiring auth token. Referer: animex.one. Token expires in ~1 hour.",
    ),

    # ── uwu ─────────────────────────────────────────────────────────────────
    # Hard sub, Fast, High quality. CDN: sxic.oceancrestdigital.shop (same as miku)
    # HLS — .txt disguised sub-playlists
    # Headers: Referer: allanime.uns.bio + Mobile User-Agent
    "uwu": ProviderConfig(
        id="uwu",
        name="Uwu",
        supports_sub=True,
        supports_dub=True,
        sub_type="hard",
        stream_format="hls",
        cdn_pattern="sxic.oceancrestdigital.shop",
        headers={
            "Referer": "https://allanime.uns.bio",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        },
        tip="Hard sub, Fast, High quality",
        notes="Same CDN as miku. Sub-playlists use .txt. Needs mobile UA + Referer: allanime.uns.bio",
    ),

    # ── koto ────────────────────────────────────────────────────────────────
    # Hard sub. CDN: sxic.oceancrestdigital.shop (same as miku/uwu)
    # HLS — .txt disguised sub-playlists
    # Headers: Referer: allanime.uns.bio + Mobile User-Agent
    "koto": ProviderConfig(
        id="koto",
        name="Koto",
        supports_sub=True,
        supports_dub=False,
        sub_type="hard",
        stream_format="hls",
        cdn_pattern="sxic.oceancrestdigital.shop",
        headers={
            "Referer": "https://allanime.uns.bio",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        },
        tip="Hard sub",
        notes="Same CDN as miku/uwu. Rare provider. Needs mobile UA + Referer: allanime.uns.bio",
    ),

    # ── kiwi ────────────────────────────────────────────────────────────────
    # Hard sub, High quality. CDN: varies (Cloudflare protected)
    # HLS format
    # Headers: Origin + Referer: anidb.app
    "kiwi": ProviderConfig(
        id="kiwi",
        name="Kiwi",
        supports_sub=True,
        supports_dub=True,
        sub_type="hard",
        stream_format="hls",
        cdn_pattern="anidb.app",
        headers={
            "Origin": "https://anidb.app",
            "Referer": "https://anidb.app/",
        },
        tip="Hard sub, High quality",
        notes="Cloudflare protected. Often blocked from server-side. Origin/Referer: anidb.app",
    ),

    # ── kami ────────────────────────────────────────────────────────────────
    # Alt provider. Headers: Origin + Referer: animex.one
    "kami": ProviderConfig(
        id="kami",
        name="Kami",
        supports_sub=True,
        supports_dub=False,
        sub_type="hard",
        stream_format="hls",
        cdn_pattern="unknown",
        headers={
            "Origin": "https://animex.one",
            "Referer": "https://animex.one/",
        },
        tip="Alt provider",
        notes="Rare provider. Referer: animex.one",
    ),
}

# ─── Provider Priority (for auto-race) ─────────────────────────────────────────
# Ordered by reliability and quality. DASH providers deprioritized (need DASH player).

PROVIDER_PRIORITY = [
    "miku",   # Works reliably, multi-quality HLS
    "yuki",   # Works reliably, multi-quality HLS + subs
    "beep",   # Default sub, multi-quality
    "mimi",   # Default dub, high quality (often CF-blocked)
    "vee",    # DASH (needs player support)
    "mochi",  # MP4, token expires
    "neko",   # MP4, direct
    "huzz",   # HLS, works
    "uwu",    # Same CDN as miku
    "koto",   # Same CDN as miku
    "kiwi",   # CF-protected
    "kami",   # Rare/alt
]

# ─── Slug Generation ────────────────────────────────────────────────────────────
# Pattern: {title-lower-dashed}-{anilistId}
# Example: "One Piece" → "one-piece-21"

def generate_slug(title: str, anilist_id: int) -> str:
    """Generate URL slug from anime title and AniList ID."""
    import re
    slug = title.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = re.sub(r'^-+|-+$', '', slug)
    return f"{slug}-{anilist_id}"

# ─── CORS & Rate Limits ────────────────────────────────────────────────────────

# pp.animex.one rate limits
RATE_LIMIT = 300  # requests per window
CACHE_TTL = 3600  # 1 hour for API responses

# CORS headers returned by upstream APIs
# graphql.animex.one: Access-Control-Allow-Origin: https://animex.one
# pp.animex.one:      Access-Control-Allow-Origin: https://animex.one
# No auth required for server-side requests (CORS only enforced at browser level)
