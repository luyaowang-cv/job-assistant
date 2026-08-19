-- CreateTable
CREATE TABLE "ApplicationMaterial" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "evaluationRunId" TEXT,
    "resumeDigest" JSONB NOT NULL,
    "aiDraft" JSONB NOT NULL,
    "content" JSONB NOT NULL,
    "wasEdited" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationMaterial_userId_applicationId_createdAt_idx" ON "ApplicationMaterial"("userId", "applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationMaterial_applicationId_createdAt_idx" ON "ApplicationMaterial"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationMaterial_evaluationRunId_idx" ON "ApplicationMaterial"("evaluationRunId");

-- AddForeignKey
ALTER TABLE "ApplicationMaterial" ADD CONSTRAINT "ApplicationMaterial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationMaterial" ADD CONSTRAINT "ApplicationMaterial_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationMaterial" ADD CONSTRAINT "ApplicationMaterial_evaluationRunId_fkey" FOREIGN KEY ("evaluationRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
