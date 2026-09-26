ALTER TYPE "DocumentMutationType" ADD VALUE 'JOB_LIBRARY_SYNCED';

CREATE TYPE "FeishuJobSyncSourceType" AS ENUM ('BITABLE', 'SHEET_EXPORT');

CREATE TABLE "FeishuJobSyncSource" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceDocId" TEXT NOT NULL,
  "sourceType" "FeishuJobSyncSourceType" NOT NULL,
  "shareUrl" TEXT NOT NULL,
  "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "lastAutomaticSyncAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "syncStartedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FeishuJobSyncSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeishuJobSyncSource_userId_sourceDocId_key" ON "FeishuJobSyncSource"("userId", "sourceDocId");
CREATE INDEX "FeishuJobSyncSource_autoSyncEnabled_lastAutomaticSyncAt_idx" ON "FeishuJobSyncSource"("autoSyncEnabled", "lastAutomaticSyncAt");
CREATE INDEX "FeishuJobSyncSource_syncStartedAt_idx" ON "FeishuJobSyncSource"("syncStartedAt");

ALTER TABLE "FeishuJobSyncSource"
  ADD CONSTRAINT "FeishuJobSyncSource_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
