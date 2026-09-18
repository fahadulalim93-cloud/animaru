-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "animeId" TEXT NOT NULL,
    "animeName" TEXT NOT NULL,
    "thumbnail" TEXT,
    "score" DOUBLE PRECISION,
    "type" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchHistory" (
    "id" TEXT NOT NULL,
    "animeId" TEXT NOT NULL,
    "animeName" TEXT NOT NULL,
    "thumbnail" TEXT,
    "episodeNum" DOUBLE PRECISION NOT NULL,
    "episodeTitle" TEXT,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "animeId" TEXT NOT NULL,
    "episode" DOUBLE PRECISION,
    "username" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "rating" INTEGER,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MangaView" (
    "id" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MangaView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MangaRating" (
    "id" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MangaRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MangaFollow" (
    "id" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MangaFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MangaChapterComment" (
    "id" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "chapterNum" DOUBLE PRECISION NOT NULL,
    "username" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MangaChapterComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MangaChapterCommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MangaChapterCommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MangaVibeReview" (
    "id" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "vibe" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MangaVibeReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KvStore" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "KvStore_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "KvHash" (
    "hash" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "KvHash_pkey" PRIMARY KEY ("hash","field")
);

-- CreateTable
CREATE TABLE "KvSortedSet" (
    "key" TEXT NOT NULL,
    "member" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "KvSortedSet_pkey" PRIMARY KEY ("key","member")
);

-- CreateTable
CREATE TABLE "KvHll" (
    "key" TEXT NOT NULL,
    "member" TEXT NOT NULL,

    CONSTRAINT "KvHll_pkey" PRIMARY KEY ("key","member")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
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
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_animeId_key" ON "Bookmark"("animeId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchHistory_animeId_episodeNum_key" ON "WatchHistory"("animeId", "episodeNum");

-- CreateIndex
CREATE UNIQUE INDEX "CommentLike_commentId_username_key" ON "CommentLike"("commentId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "MangaView_mangaId_key" ON "MangaView"("mangaId");

-- CreateIndex
CREATE UNIQUE INDEX "MangaRating_mangaId_username_key" ON "MangaRating"("mangaId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "MangaFollow_mangaId_username_key" ON "MangaFollow"("mangaId", "username");

-- CreateIndex
CREATE INDEX "MangaChapterComment_mangaId_chapterId_idx" ON "MangaChapterComment"("mangaId", "chapterId");

-- CreateIndex
CREATE INDEX "MangaChapterComment_mangaId_chapterId_likes_idx" ON "MangaChapterComment"("mangaId", "chapterId", "likes" DESC);

-- CreateIndex
CREATE INDEX "MangaChapterComment_mangaId_chapterId_createdAt_idx" ON "MangaChapterComment"("mangaId", "chapterId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MangaChapterCommentLike_commentId_username_key" ON "MangaChapterCommentLike"("commentId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "MangaVibeReview_mangaId_username_key" ON "MangaVibeReview"("mangaId", "username");

-- CreateIndex
CREATE INDEX "KvHash_hash_idx" ON "KvHash"("hash");

-- CreateIndex
CREATE INDEX "KvSortedSet_key_idx" ON "KvSortedSet"("key");

-- CreateIndex
CREATE INDEX "KvSortedSet_key_score_idx" ON "KvSortedSet"("key", "score");

-- CreateIndex
CREATE INDEX "KvHll_key_idx" ON "KvHll"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE INDEX "AuditLog_actorUsername_idx" ON "AuditLog"("actorUsername");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_token_key" ON "AdminSession"("token");

-- CreateIndex
CREATE INDEX "AdminSession_userId_idx" ON "AdminSession"("userId");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MangaRating" ADD CONSTRAINT "MangaRating_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "MangaView"("mangaId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MangaChapterCommentLike" ADD CONSTRAINT "MangaChapterCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "MangaChapterComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

