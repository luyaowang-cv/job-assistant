CREATE TABLE "CareerAgentConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "resumeVersionId" TEXT,
    "title" TEXT NOT NULL DEFAULT '新对话',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CareerAgentConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareerAgentMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "error" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CareerAgentMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CareerAgentConversation_userId_updatedAt_idx" ON "CareerAgentConversation"("userId", "updatedAt");
CREATE INDEX "CareerAgentConversation_applicationId_idx" ON "CareerAgentConversation"("applicationId");
CREATE INDEX "CareerAgentConversation_resumeVersionId_idx" ON "CareerAgentConversation"("resumeVersionId");
CREATE INDEX "CareerAgentMessage_conversationId_createdAt_idx" ON "CareerAgentMessage"("conversationId", "createdAt");

ALTER TABLE "CareerAgentConversation" ADD CONSTRAINT "CareerAgentConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareerAgentConversation" ADD CONSTRAINT "CareerAgentConversation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareerAgentConversation" ADD CONSTRAINT "CareerAgentConversation_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareerAgentMessage" ADD CONSTRAINT "CareerAgentMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CareerAgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
