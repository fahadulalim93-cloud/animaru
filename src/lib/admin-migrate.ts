/**
 * Admin DB Auto-Migrate — ensures ALL required tables exist in PostgreSQL.
 * Called on first login attempt.
 *
 * Safety net for deployments where `prisma migrate deploy` wasn't run.
 * Uses raw SQL to create tables if missing.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let migrationChecked = false;
let userTablesChecked = false;

/**
 * Ensures the User/UserSession/UserProgress/SiteVisitor tables exist.
 * Called on user auth endpoints (signup, login, me) AND visitor tracking.
 * Separate from admin migration so it runs even when AdminUser already exists.
 */
export async function ensureUserTables(): Promise<boolean> {
  if (userTablesChecked) return true;

  try {
    await prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
    // Table exists — but we still need to add the anilistId / googleId
    // columns if they're missing (e.g. older deployments that predate
    // the OAuth login feature). Safe to run multiple times.
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "anilistId" INTEGER`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT`);
      try {
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_anilistId_key" ON "User"("anilistId") WHERE "anilistId" IS NOT NULL`);
      } catch { /* already exists */ }
      try {
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId") WHERE "googleId" IS NOT NULL`);
      } catch { /* already exists */ }
    } catch (e) {
      console.warn("[admin-migrate] anilistId/googleId column add skipped:", (e as Error).message);
    }
    userTablesChecked = true;
    return true;
  } catch {
    console.log("[admin-migrate] User table missing — auto-creating user/visitor tables...");
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT NOT NULL,
        "username" TEXT NOT NULL,
        "email" TEXT,
        "passwordHash" TEXT NOT NULL,
        "name" TEXT,
        "anilistId" INTEGER,
        "googleId" TEXT,
        "avatar" TEXT,
        "avatarColor" TEXT,
        "avatarEmoji" TEXT,
        "avatarImage" TEXT,
        "avatarFrame" TEXT,
        "banner" TEXT,
        "bannerImage" TEXT,
        "accentColor" TEXT,
        "tagline" TEXT,
        "bio" TEXT,
        "favorites" TEXT NOT NULL DEFAULT '[]',
        "xp" INTEGER NOT NULL DEFAULT 0,
        "level" INTEGER NOT NULL DEFAULT 1,
        "watchCount" INTEGER NOT NULL DEFAULT 0,
        "episodeCount" INTEGER NOT NULL DEFAULT 0,
        "commentCount" INTEGER NOT NULL DEFAULT 0,
        "bookmarkCount" INTEGER NOT NULL DEFAULT 0,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "lastLoginAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "User_username_key" UNIQUE ("username"),
        CONSTRAINT "User_email_key" UNIQUE ("email")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UserSession" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "token" TEXT NOT NULL,
        "ip" TEXT,
        "userAgent" TEXT,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "UserSession_token_key" UNIQUE ("token")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UserProgress" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "animeId" TEXT NOT NULL,
        "animeName" TEXT NOT NULL,
        "episodesWatched" INTEGER NOT NULL DEFAULT 0,
        "lastEpisodeNum" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "lastProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "xpEarned" INTEGER NOT NULL DEFAULT 0,
        "watchTime" INTEGER NOT NULL DEFAULT 0,
        "lastWatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UserProgress_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "UserProgress_userId_animeId_key" UNIQUE ("userId", "animeId")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SiteVisitor" (
        "id" TEXT NOT NULL,
        "visitorKey" TEXT NOT NULL,
        "date" TEXT NOT NULL,
        "userId" TEXT,
        "page" TEXT,
        "ip" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SiteVisitor_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "SiteVisitor_visitorKey_date_key" UNIQUE ("visitorKey", "date")
      )
    `);

    // Foreign keys
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `);
    } catch { /* already exists */ }
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "UserProgress" ADD CONSTRAINT "UserProgress_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `);
    } catch { /* already exists */ }

    // Indexes
    try {
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "User_xp_idx" ON "User"("xp" DESC)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "User_level_idx" ON "User"("level")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserSession_userId_idx" ON "UserSession"("userId")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserSession_expiresAt_idx" ON "UserSession"("expiresAt")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserProgress_userId_idx" ON "UserProgress"("userId")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserProgress_lastWatchedAt_idx" ON "UserProgress"("lastWatchedAt" DESC)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SiteVisitor_date_idx" ON "SiteVisitor"("date")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SiteVisitor_userId_idx" ON "SiteVisitor"("userId")`);
    } catch { /* indexes may already exist */ }

    // ── Add anilistId / googleId columns for OAuth login ──
    // ALTER TABLE ADD COLUMN IF NOT EXISTS so this is safe to run on
    // existing deployments that already have the User table.
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "anilistId" INTEGER`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT`);
      // Unique constraints — wrap in try/catch because the constraint may
      // already exist (would error on recreate).
      try {
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_anilistId_key" ON "User"("anilistId") WHERE "anilistId" IS NOT NULL`);
      } catch { /* already exists */ }
      try {
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId") WHERE "googleId" IS NOT NULL`);
      } catch { /* already exists */ }
    } catch (e) {
      console.warn("[admin-migrate] anilistId/googleId column add skipped:", (e as Error).message);
    }

    console.log("[admin-migrate] ✅ User/Visitor tables created successfully");
    userTablesChecked = true;
    return true;
  } catch (err: any) {
    console.error("[admin-migrate] ❌ Failed to create user tables:", err?.message || err);
    return false;
  }
}

export async function ensureAdminTables(): Promise<boolean> {
  if (migrationChecked) return true;

  try {
    // Quick check: does AdminUser table exist?
    await prisma.$queryRaw`SELECT 1 FROM "AdminUser" LIMIT 1`;
    migrationChecked = true;
    return true;
  } catch {
    // Table doesn't exist — create all tables
    console.log("[admin-migrate] AdminUser table missing — auto-creating all tables...");
  }

  try {
    // ── Admin tables ──
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminUser" (
        "id" TEXT NOT NULL,
        "username" TEXT NOT NULL,
        "passwordHash" TEXT NOT NULL,
        "displayName" TEXT,
        "avatarUrl" TEXT,
        "role" TEXT NOT NULL DEFAULT 'admin',
        "active" BOOLEAN NOT NULL DEFAULT true,
        "lastLoginAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "AdminUser_username_key" UNIQUE ("username")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminSession" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "token" TEXT NOT NULL,
        "ip" TEXT,
        "userAgent" TEXT,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "AdminSession_token_key" UNIQUE ("token")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AuditLog" (
        "id" TEXT NOT NULL,
        "actorId" TEXT,
        "actorUsername" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "targetType" TEXT,
        "targetId" TEXT,
        "details" TEXT,
        "ip" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
      )
    `);

    // ── KV tables (PostgreSQL-backed Redis replacement) ──
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "KvStore" (
        "key" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        CONSTRAINT "KvStore_pkey" PRIMARY KEY ("key")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "KvHash" (
        "hash" TEXT NOT NULL,
        "field" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        CONSTRAINT "KvHash_pkey" PRIMARY KEY ("hash", "field")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "KvSortedSet" (
        "key" TEXT NOT NULL,
        "member" TEXT NOT NULL,
        "score" DOUBLE PRECISION NOT NULL,
        CONSTRAINT "KvSortedSet_pkey" PRIMARY KEY ("key", "member")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "KvHll" (
        "key" TEXT NOT NULL,
        "member" TEXT NOT NULL,
        CONSTRAINT "KvHll_pkey" PRIMARY KEY ("key", "member")
      )
    `);

    // ── Content tables ──
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Bookmark" (
        "id" TEXT NOT NULL,
        "animeId" TEXT NOT NULL,
        "animeName" TEXT NOT NULL,
        "thumbnail" TEXT,
        "score" DOUBLE PRECISION,
        "type" TEXT,
        "status" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Bookmark_animeId_key" UNIQUE ("animeId")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WatchHistory" (
        "id" TEXT NOT NULL,
        "animeId" TEXT NOT NULL,
        "animeName" TEXT NOT NULL,
        "thumbnail" TEXT,
        "episodeNum" DOUBLE PRECISION NOT NULL,
        "episodeTitle" TEXT,
        "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WatchHistory_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "WatchHistory_animeId_episodeNum_key" UNIQUE ("animeId", "episodeNum")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Comment" (
        "id" TEXT NOT NULL,
        "animeId" TEXT NOT NULL,
        "episode" DOUBLE PRECISION,
        "username" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "parentId" TEXT,
        "rating" INTEGER,
        "likes" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CommentLike" (
        "id" TEXT NOT NULL,
        "commentId" TEXT NOT NULL,
        "username" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "CommentLike_commentId_username_key" UNIQUE ("commentId", "username")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MangaView" (
        "id" TEXT NOT NULL,
        "mangaId" TEXT NOT NULL,
        "views" INTEGER NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MangaView_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "MangaView_mangaId_key" UNIQUE ("mangaId")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MangaRating" (
        "id" TEXT NOT NULL,
        "mangaId" TEXT NOT NULL,
        "username" TEXT NOT NULL,
        "rating" DOUBLE PRECISION NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MangaRating_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "MangaRating_mangaId_username_key" UNIQUE ("mangaId", "username")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MangaFollow" (
        "id" TEXT NOT NULL,
        "mangaId" TEXT NOT NULL,
        "username" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MangaFollow_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "MangaFollow_mangaId_username_key" UNIQUE ("mangaId", "username")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MangaChapterComment" (
        "id" TEXT NOT NULL,
        "mangaId" TEXT NOT NULL,
        "chapterId" TEXT NOT NULL,
        "chapterNum" DOUBLE PRECISION NOT NULL,
        "username" TEXT NOT NULL,
        "text" TEXT NOT NULL,
        "likes" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MangaChapterComment_pkey" PRIMARY KEY ("id")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MangaChapterCommentLike" (
        "id" TEXT NOT NULL,
        "commentId" TEXT NOT NULL,
        "username" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MangaChapterCommentLike_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "MangaChapterCommentLike_commentId_username_key" UNIQUE ("commentId", "username")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MangaVibeReview" (
        "id" TEXT NOT NULL,
        "mangaId" TEXT NOT NULL,
        "username" TEXT NOT NULL,
        "vibe" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MangaVibeReview_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "MangaVibeReview_mangaId_username_key" UNIQUE ("mangaId", "username")
      )
    `);

    // ── Foreign keys (ignore if already exist) ──
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `);
    } catch { /* already exists */ }

    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey"
          FOREIGN KEY ("actorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE
      `);
    } catch { /* already exists */ }

    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_commentId_fkey"
          FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `);
    } catch { /* already exists */ }

    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "MangaRating" ADD CONSTRAINT "MangaRating_mangaId_fkey"
          FOREIGN KEY ("mangaId") REFERENCES "MangaView"("mangaId") ON DELETE CASCADE ON UPDATE CASCADE
      `);
    } catch { /* already exists */ }

    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "MangaChapterCommentLike" ADD CONSTRAINT "MangaChapterCommentLike_commentId_fkey"
          FOREIGN KEY ("commentId") REFERENCES "MangaChapterComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `);
    } catch { /* already exists */ }

    // ── Indexes ──
    try {
      // Admin indexes
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AdminSession_userId_idx" ON "AdminSession"("userId")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_actorUsername_idx" ON "AuditLog"("actorUsername")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC)`);

      // KV indexes
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KvHash_hash_idx" ON "KvHash"("hash")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KvSortedSet_key_idx" ON "KvSortedSet"("key")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KvSortedSet_key_score_idx" ON "KvSortedSet"("key", "score")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KvHll_key_idx" ON "KvHll"("key")`);

      // Content indexes
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MangaChapterComment_mangaId_chapterId_idx" ON "MangaChapterComment"("mangaId", "chapterId")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MangaChapterComment_mangaId_chapterId_likes_idx" ON "MangaChapterComment"("mangaId", "chapterId", "likes" DESC)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MangaChapterComment_mangaId_chapterId_createdAt_idx" ON "MangaChapterComment"("mangaId", "chapterId", "createdAt" DESC)`);
    } catch { /* indexes may already exist */ }

    console.log("[admin-migrate] ✅ All tables created successfully");
    migrationChecked = true;
    return true;
  } catch (err: any) {
    console.error("[admin-migrate] ❌ Failed to create tables:", err?.message || err);
    return false;
  }
}
