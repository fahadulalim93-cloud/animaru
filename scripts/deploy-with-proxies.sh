#!/bin/bash
# Deploy script for LuffyTV with residential proxy support
# Run this after ensuring git credentials are set up

set -e
cd "$(dirname "$0")/.."

echo "=== LuffyTV Deploy: 321 Residential Proxies + AniDap Fallback ==="
echo ""
echo "Changes:"
echo "  - proxy-pool.ts: 321 residential HTTP proxies (round-robin rotation)"
echo "  - miruro-direct.ts: worker proxy → direct → residential proxy fallback"
echo "  - anidap-api.ts: uses shared proxy pool (321 proxies instead of 20)"  
echo "  - miruro-direct/episodes route: AniDap fallback when miruro blocked by CF"
echo "  - embed-servers.ts: 6 AniDap servers (Gecko, Hancox, Moria, Perona, etc.)"
echo ""

# Build first
echo "Building..."
npx next build || { echo "Build failed!"; exit 1; }

echo "Build succeeded!"
echo ""
echo "To deploy, push to GitHub:"
echo "  git push origin main"
echo ""
echo "Or deploy directly with Vercel CLI:"
echo "  vercel --prod"
echo ""
echo "The Vercel<->GitHub integration will auto-deploy on push."
