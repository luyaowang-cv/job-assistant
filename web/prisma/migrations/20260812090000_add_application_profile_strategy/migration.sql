ALTER TABLE "ApplicationProfile"
  ADD COLUMN "strategy" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "resumeVersionId" TEXT;

CREATE INDEX "ApplicationProfile_resumeVersionId_idx" ON "ApplicationProfile"("resumeVersionId");

ALTER TABLE "ApplicationProfile"
  ADD CONSTRAINT "ApplicationProfile_resumeVersionId_fkey"
  FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
