---
Task ID: 1
Agent: Super Z (main)
Task: Rebuild admin panel with black theme, PostgreSQL, and server-side auth

Work Log:
- Analyzed reference screenshot: dark (#0a0a0a) theme, sidebar nav, stat cards, infrastructure/diagnostics panels, audit trail
- Cataloged old admin code: monolithic 1,257-line admin-app.tsx, client-side djb2 hash auth, KV-backed data, /aznayeem route
- Updated Prisma schema from SQLite to PostgreSQL provider
- Added AdminUser, AuditLog, AdminSession models with bcrypt passwords and HTTP-only cookie sessions
- Installed bcryptjs for production-grade password hashing
- Deleted old admin files: admin-app.tsx, admin-auth.ts, /aznayeem/page.tsx, /admin/page.tsx (old redirect)
- Created admin-token-server.ts compatibility shim for legacy API routes
- Built new server-side auth library (admin-auth-server.ts): bcrypt, session tokens, cookie helpers, adminGuard()
- Created 10 new API routes: /api/admin/{login,logout,me,overview,moderation,announcements,audit-logs,cache,seed}
- Built new AdminLayout component with collapsible sidebar, nav groups, user profile, role badges
- Created admin UI primitives (admin-ui.tsx): Card, StatCard, PanelHeader, Badge, Table, Button, StatusDot, ProgressBar
- Built 11 admin pages: Overview, Users Control, Data Inspector, Reports Queue, System Logs, Cache Purger, Announcements, SEO Config, Audience, Content, Settings
- Login page with show/hide password, error handling, violet gradient branding
- Overview page matches reference design: user stats grid, content stats, infrastructure nodes, diagnostics, audit trail
- Updated .env for PostgreSQL connection string
- Build verified successfully (npx next build passes)

Stage Summary:
- Complete admin panel rebuild with black theme matching reference screenshot
- PostgreSQL schema with 3 new models (AdminUser, AuditLog, AdminSession)
- Server-side auth with bcrypt + HTTP-only cookies replaces client-side djb2 hash
- All existing features preserved: users, moderation, reports, announcements, SEO, analytics, cache management
- Legacy API routes (mod, donate) still work via compatibility shim
- New admin accessible at /admin (login at /admin/login)

---
Task ID: admin-views-xp
Agent: Super Z (main)
Task: Add Views Today/Week/Month to admin Overview + new User XP admin page + fix missing User/SiteVisitor Prisma models

Work Log:
- Discovered the codebase referenced prisma.user / prisma.userSession / prisma.userProgress / prisma.siteVisitor but NONE of those models existed in prisma/schema.prisma or in the init migration — every signup/login/profile/visitor-track call was silently 500-ing
- Added 4 new models to prisma/schema.prisma: User (with avatar/banner/xp/level/profile fields), UserSession, UserProgress, SiteVisitor
- Added ensureUserTables() to src/lib/admin-migrate.ts as a separate auto-migration path (independent of the admin-table migrationChecked flag) so existing deployments get the new tables on next user-auth/visitor-track call
- Wired ensureUserTables() into /api/users/register, /api/users/login, /api/visitors/track, /api/admin/users, /api/admin/overview
- Created migration 20260828000001_add_user_models for fresh DBs (idempotent CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS + ADD CONSTRAINT IF NOT EXISTS)
- Wired /api/visitors/track POST call into trackPageview() in src/lib/analytics.ts (was previously defined but never called — so no view data ever recorded)
- Fixed /api/admin/visitors to use DISTINCT visitorKey groupBy for week/month/all-time counts (was previously counting rows = visitor-days, so a daily returning user counted 7x for the week)
- Updated /api/admin/overview to also return `views: { today, week, month, allTime }` plus real user counts from the User table (max'd with KV-based counts for backward compat)
- Added 4 new stat cards to admin Overview: "Views Today", "Views This Week", "Views This Month", "All-Time Visitors"
- Created new admin page /admin/user-xp with the trophy icon: lists every registered user with ID, username, email, XP, level, watchCount, episodeCount, bookmarkCount, joined date, last login, active status. Sort by XP/Level/WatchCount/Episodes/Newest. Search by username/email/name/ID. Includes summary cards: total users, total XP, avg level, total watch count, total episode views
- Added "User XP & Profiles" nav item to admin sidebar (admin-layout.tsx) under MODERATION group
- Ran prisma generate successfully (Prisma client v6.19.3)
- TypeScript type-check: all my changed files compile cleanly (only pre-existing unrelated errors remain)
- Committed and pushed to origin/main (rebased on top of remote, dropped stale bun.lock)

Stage Summary:
- Admin Overview now shows 4 real view-stat cards: Views Today / This Week / This Month / All-Time Visitors
- New admin page at /admin/user-xp shows every registered user with full ID + XP + level + watch stats
- CRITICAL fix: added User / UserSession / UserProgress / SiteVisitor models + migration + auto-migrate, fixing every previously-crashing signup/login/profile/visitor-track endpoint
- Visitor tracking now actually fires from the client (trackPageview also POSTs to /api/visitors/track)
- Week/month view counts are now DISTINCT visitor counts (not visitor-days)
