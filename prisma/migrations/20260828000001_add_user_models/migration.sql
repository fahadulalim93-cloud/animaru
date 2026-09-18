-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
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

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key1" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX IF NOT EXISTS "User_xp_idx" ON "User"("xp" DESC);
CREATE INDEX IF NOT EXISTS "User_level_idx" ON "User"("level");

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserSession_token_key" ON "UserSession"("token");
CREATE INDEX IF NOT EXISTS "UserSession_userId_idx" ON "UserSession"("userId");
CREATE INDEX IF NOT EXISTS "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateTable
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

    CONSTRAINT "UserProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserProgress_userId_animeId_key" ON "UserProgress"("userId", "animeId");
CREATE INDEX IF NOT EXISTS "UserProgress_userId_idx" ON "UserProgress"("userId");
CREATE INDEX IF NOT EXISTS "UserProgress_lastWatchedAt_idx" ON "UserProgress"("lastWatchedAt" DESC);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SiteVisitor" (
    "id" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "userId" TEXT,
    "page" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteVisitor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SiteVisitor_visitorKey_date_key" ON "SiteVisitor"("visitorKey", "date");
CREATE INDEX IF NOT EXISTS "SiteVisitor_date_idx" ON "SiteVisitor"("date");
CREATE INDEX IF NOT EXISTS "SiteVisitor_userId_idx" ON "SiteVisitor"("userId");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT IF NOT EXISTS "UserSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserProgress" ADD CONSTRAINT IF NOT EXISTS "UserProgress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
