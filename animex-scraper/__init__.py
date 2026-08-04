"""
AnimeX Scraper — Package Init
"""

from .config import PROVIDERS, PROVIDER_PRIORITY
from .graphql_client import graphql_client
from .rest_client import rest_client
from .stream_proxy import stream_proxy

__all__ = [
    "PROVIDERS",
    "PROVIDER_PRIORITY",
    "graphql_client",
    "rest_client",
    "stream_proxy",
]
