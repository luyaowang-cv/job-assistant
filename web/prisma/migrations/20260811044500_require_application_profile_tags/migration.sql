-- Align the database column with the required Prisma field while preserving
-- the empty-array default for newly created application profiles.
UPDATE "ApplicationProfile"
SET "targetTags" = ARRAY[]::TEXT[]
WHERE "targetTags" IS NULL;

ALTER TABLE "ApplicationProfile"
ALTER COLUMN "targetTags" SET NOT NULL;
