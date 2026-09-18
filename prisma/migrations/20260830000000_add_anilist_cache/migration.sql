-- CreateTable
CREATE TABLE "AniListCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "anilistId" INTEGER,
    "operation" TEXT,
    "response" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'anilist',
    "hits" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AniListCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AniListCache_cacheKey_key" ON "AniListCache"("cacheKey");

-- CreateIndex
CREATE INDEX "AniListCache_anilistId_idx" ON "AniListCache"("anilistId");

-- CreateIndex
CREATE INDEX "AniListCache_operation_idx" ON "AniListCache"("operation");

-- CreateIndex
CREATE INDEX "AniListCache_updatedAt_idx" ON "AniListCache"("updatedAt");

-- CreateIndex
CREATE INDEX "AniListCache_hits_idx" ON "AniListCache"("hits");
