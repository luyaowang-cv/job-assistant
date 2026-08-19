-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentMutationType" ADD VALUE 'INTERVIEW_PREP_SAVED';
ALTER TYPE "DocumentMutationType" ADD VALUE 'INTERVIEW_REFLECTION_MERGED';

-- CreateTable
CREATE TABLE "InterviewPrepDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeVersionId" TEXT NOT NULL,
    "jdText" TEXT NOT NULL,
    "extraText" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "reflection" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewPrepDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewPrepDocument_resumeVersionId_key" ON "InterviewPrepDocument"("resumeVersionId");

-- CreateIndex
CREATE INDEX "InterviewPrepDocument_userId_idx" ON "InterviewPrepDocument"("userId");

-- AddForeignKey
ALTER TABLE "InterviewPrepDocument" ADD CONSTRAINT "InterviewPrepDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPrepDocument" ADD CONSTRAINT "InterviewPrepDocument_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
