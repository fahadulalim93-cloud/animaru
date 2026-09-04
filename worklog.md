---
Task ID: 1
Agent: main
Task: Migrate admin panel KV store from Upstash Redis to PostgreSQL for Coolify deployment

Work Log:
- Explored full admin panel architecture: auth, moderation, announcements, analytics, mod panel
- Identified all 20+ files using KV pipe() calls for Redis operations
- Discovered that ALL admin data (tokens, users, bans, reports, warns, logs, announcements, analytics) was stored in Redis/KV
- Without Redis on Coolify, the in-memory fallback doesn't persist across container restarts
- Added 4 Prisma models (KvStore, KvHash, KvSortedSet, KvHll) to emulate Redis data structures in PostgreSQL
- Rewrote src/lib/kv.ts with 3-tier backend: Redis (priority 1) → PostgreSQL (priority 2) → in-memory (priority 3)
- Fixed kvEnabled flag to reflect Redis OR PostgreSQL availability (was Redis-only)
- Updated nixpacks.toml to run prisma db push on both build and start for auto-migration
- Fixed stale SQLite comments in auth-local.ts
- Updated .env.example with PostgreSQL KV fallback documentation
- Verified Prisma client generation succeeds with all models
- Verified Next.js build succeeds with no errors
- Committed and pushed to main

Stage Summary:
- Admin panel now fully works on Coolify with PostgreSQL (no Redis needed)
- All existing API routes unchanged — transparent migration via kv.ts pipe() adapter
- Admin login: username "aznayeem", password "fahadtasin" (hardcoded in admin-auth.ts)
- Key files changed: prisma/schema.prisma, src/lib/kv.ts, nixpacks.toml, .env.example, src/lib/auth-local.ts
---
Task ID: 2
Agent: main
Task: Massive SEO overhaul for anime streaming site

Work Log:
- Identified CRITICAL issue: hash-based SPA routing meant Google saw ZERO content pages
- Created 8 new server-rendered route pages with generateMetadata
- /anime/[id] with TVSeries/Movie JSON-LD, BreadcrumbList, keyword-rich titles
- /watch/[id]/[episode] with VideoObject + TVEpisode JSON-LD
- /hindi-dub, /tamil-dub, /telugu-dub language hub pages with FAQPage schema
- /dubbed-anime all-language hub, /browse genre directory
- /genre/[slug] 18 pre-rendered genre pages with ItemList schema
- Rewrote root metadata with 40+ targeted keywords (hindi dub, tamil dub, etc.)
- Added hreflang tags for en/hi/ta/te/bn/ja + x-default
- Created OG image (1200x630) for social sharing
- Rewrote sitemap.ts with real SSR URLs (no hash fragments) + top 100 anime
- Merged robots.ts, removed conflicting static robots.txt
- Fixed SearchAction URL template from hash route to /browse?q=
- All pages use ISR with 1-hour revalidate
- Build succeeded with all new routes visible

Stage Summary:
- 13 files changed, 2269 insertions, 92 deletions
- Google can now crawl /anime/123, /watch/123/1, /hindi-dub, etc.
- FAQPage schema enables rich results for language hub pages
- VideoObject schema enables video rich results for watch pages
- All pages redirect to SPA hash routes for interactive experience
