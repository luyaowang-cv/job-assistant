-- CreateEnum
CREATE TYPE "InterviewRound" AS ENUM ('FIRST', 'SECOND', 'HR', 'FINAL');

-- CreateEnum
CREATE TYPE "InterviewResult" AS ENUM ('UNDECIDED', 'PASSED', 'FAILED', 'WITHDRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentMutationType" ADD VALUE 'INTERVIEW_RECORD_SAVED';
ALTER TYPE "DocumentMutationType" ADD VALUE 'INTERVIEW_RECORD_REVIEW_SAVED';

-- CreateTable
CREATE TABLE "interview_record" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "resumeVersionId" TEXT,
    "companyName" TEXT,
    "jobTitle" TEXT,
    "jdText" TEXT,
    "round" "InterviewRound",
    "interviewAt" TIMESTAMP(3),
    "methodAndAddress" TEXT,
    "briefNote" TEXT,
    "prepSections" JSONB NOT NULL DEFAULT '[]',
    "prepNotes" TEXT,
    "result" "InterviewResult",
    "review" JSONB NOT NULL DEFAULT '[]',
    "provider" TEXT NOT NULL DEFAULT 'MANUAL',
    "model" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_record_userId_updatedAt_idx" ON "interview_record"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "interview_record_applicationId_idx" ON "interview_record"("applicationId");

-- CreateIndex
CREATE INDEX "interview_record_resumeVersionId_idx" ON "interview_record"("resumeVersionId");

-- AddForeignKey
ALTER TABLE "interview_record" ADD CONSTRAINT "interview_record_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_record" ADD CONSTRAINT "interview_record_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_record" ADD CONSTRAINT "interview_record_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
