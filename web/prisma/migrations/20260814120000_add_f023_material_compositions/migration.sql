CREATE TYPE "MaterialCardType" AS ENUM ('PROJECT', 'WORK', 'CAMPUS', 'AWARD', 'SKILL', 'SELF_EVALUATION', 'CUSTOM_ANSWER');
CREATE TYPE "DocumentMutationType" AS ENUM ('MATERIAL_CREATED', 'MATERIAL_UPDATED', 'MATERIAL_VARIANT_CREATED', 'MATERIAL_ARCHIVED', 'PROFILE_VERSION_CREATED', 'RESUME_VERSION_CREATED', 'MATERIAL_MIGRATED', 'DOCUMENT_SYNCED');

CREATE TABLE "ApplicationProfileVersion" (
  "id" TEXT NOT NULL,
  "applicationProfileId" TEXT NOT NULL,
  "blocks" JSONB NOT NULL DEFAULT '{}',
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationProfileVersion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ApplicationProfile" ADD COLUMN "currentVersionId" TEXT;

CREATE TABLE "MaterialCard" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "MaterialCardType" NOT NULL,
  "title" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "facts" JSONB NOT NULL DEFAULT '{}',
  "archivedAt" TIMESTAMP(3),
  "legacySourceKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaterialCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialCardVariant" (
  "id" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialCardVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentComposition" (
  "id" TEXT NOT NULL,
  "resumeVersionId" TEXT,
  "applicationProfileVersionId" TEXT,
  "fieldVisibility" JSONB NOT NULL DEFAULT '{}',
  "config" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentComposition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentComposition_exactly_one_owner" CHECK (
    ("resumeVersionId" IS NOT NULL AND "applicationProfileVersionId" IS NULL)
    OR ("resumeVersionId" IS NULL AND "applicationProfileVersionId" IS NOT NULL)
  )
);

CREATE TABLE "DocumentCardReference" (
  "id" TEXT NOT NULL,
  "compositionId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "fieldKey" TEXT,
  "sortOrder" INTEGER NOT NULL,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "renderRules" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "DocumentCardReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentMutationEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "DocumentMutationType" NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'USER',
  "idempotencyKey" TEXT,
  "payload" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentMutationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationProfile_currentVersionId_key" ON "ApplicationProfile"("currentVersionId");
CREATE INDEX "ApplicationProfile_currentVersionId_idx" ON "ApplicationProfile"("currentVersionId");
CREATE INDEX "ApplicationProfileVersion_applicationProfileId_createdAt_idx" ON "ApplicationProfileVersion"("applicationProfileId", "createdAt");
CREATE UNIQUE INDEX "MaterialCard_userId_legacySourceKey_key" ON "MaterialCard"("userId", "legacySourceKey");
CREATE INDEX "MaterialCard_userId_archivedAt_updatedAt_idx" ON "MaterialCard"("userId", "archivedAt", "updatedAt");
CREATE INDEX "MaterialCard_userId_type_idx" ON "MaterialCard"("userId", "type");
CREATE UNIQUE INDEX "MaterialCardVariant_cardId_name_key" ON "MaterialCardVariant"("cardId", "name");
CREATE INDEX "MaterialCardVariant_cardId_createdAt_idx" ON "MaterialCardVariant"("cardId", "createdAt");
CREATE UNIQUE INDEX "DocumentComposition_resumeVersionId_key" ON "DocumentComposition"("resumeVersionId");
CREATE UNIQUE INDEX "DocumentComposition_applicationProfileVersionId_key" ON "DocumentComposition"("applicationProfileVersionId");
CREATE UNIQUE INDEX "DocumentCardReference_compositionId_section_sortOrder_key" ON "DocumentCardReference"("compositionId", "section", "sortOrder");
CREATE INDEX "DocumentCardReference_cardId_idx" ON "DocumentCardReference"("cardId");
CREATE INDEX "DocumentCardReference_variantId_idx" ON "DocumentCardReference"("variantId");
CREATE UNIQUE INDEX "DocumentMutationEvent_userId_idempotencyKey_key" ON "DocumentMutationEvent"("userId", "idempotencyKey");
CREATE INDEX "DocumentMutationEvent_userId_occurredAt_idx" ON "DocumentMutationEvent"("userId", "occurredAt");
CREATE INDEX "DocumentMutationEvent_entityType_entityId_idx" ON "DocumentMutationEvent"("entityType", "entityId");

ALTER TABLE "ApplicationProfileVersion" ADD CONSTRAINT "ApplicationProfileVersion_applicationProfileId_fkey" FOREIGN KEY ("applicationProfileId") REFERENCES "ApplicationProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApplicationProfile" ADD CONSTRAINT "ApplicationProfile_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ApplicationProfileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialCard" ADD CONSTRAINT "MaterialCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialCardVariant" ADD CONSTRAINT "MaterialCardVariant_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "MaterialCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentComposition" ADD CONSTRAINT "DocumentComposition_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentComposition" ADD CONSTRAINT "DocumentComposition_applicationProfileVersionId_fkey" FOREIGN KEY ("applicationProfileVersionId") REFERENCES "ApplicationProfileVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentCardReference" ADD CONSTRAINT "DocumentCardReference_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "DocumentComposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentCardReference" ADD CONSTRAINT "DocumentCardReference_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "MaterialCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentCardReference" ADD CONSTRAINT "DocumentCardReference_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MaterialCardVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentMutationEvent" ADD CONSTRAINT "DocumentMutationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
