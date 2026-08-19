ALTER TABLE "PersonalProfile"
ADD COLUMN "photoMimeType" TEXT,
ADD COLUMN "photoData" BYTEA,
ADD COLUMN "photoUpdatedAt" TIMESTAMP(3);
