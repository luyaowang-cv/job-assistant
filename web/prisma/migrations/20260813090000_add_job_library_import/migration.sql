ALTER TABLE "Job"
  ADD COLUMN "recruitmentType" TEXT,
  ADD COLUMN "announcementUrl" TEXT,
  ADD COLUMN "hasWrittenTest" BOOLEAN,
  ADD COLUMN "sourceDocId" TEXT,
  ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "syncedAt" TIMESTAMP(3),
  ADD COLUMN "offlineAt" TIMESTAMP(3);

CREATE INDEX "Job_sourceDocId_idx" ON "Job"("sourceDocId");
CREATE INDEX "Job_offlineAt_idx" ON "Job"("offlineAt");
