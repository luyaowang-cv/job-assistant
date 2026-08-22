ALTER TYPE "DocumentMutationType" ADD VALUE 'JOB_MANUALLY_OFFLINED';

ALTER TABLE "Job"
  ADD COLUMN "manualOfflineAt" TIMESTAMP(3);

CREATE INDEX "Job_manualOfflineAt_idx" ON "Job"("manualOfflineAt");
