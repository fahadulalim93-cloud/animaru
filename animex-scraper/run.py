#!/usr/bin/env python3
"""
AnimeX Scraper — Entry Point
==============================

Run the FastAPI scraper server.

Usage:
  python run.py                    # Start on port 8000
  python run.py --port 8001        # Custom port
  python run.py --host 0.0.0.0     # Custom host
"""

import argparse
import uvicorn


def main():
    parser = argparse.ArgumentParser(description="AnimeX Scraper API")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    args = parser.parse_args()

    uvicorn.run(
        "animex_scraper.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
