CREATE TABLE "PersonalProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "basics" JSONB NOT NULL DEFAULT '{}',
  "educations" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PersonalProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PersonalProfile_userId_key" ON "PersonalProfile"("userId");
ALTER TABLE "PersonalProfile" ADD CONSTRAINT "PersonalProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
