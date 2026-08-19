-- CreateTable
CREATE TABLE "ApplicationProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "basics" JSONB NOT NULL DEFAULT '{}',
    "educations" JSONB NOT NULL DEFAULT '[]',
    "workExperiences" JSONB NOT NULL DEFAULT '[]',
    "projects" JSONB NOT NULL DEFAULT '[]',
    "skills" JSONB NOT NULL DEFAULT '[]',
    "languages" JSONB NOT NULL DEFAULT '[]',
    "certificates" JSONB NOT NULL DEFAULT '[]',
    "campusExperiences" JSONB NOT NULL DEFAULT '[]',
    "awards" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationProfile_userId_name_key" ON "ApplicationProfile"("userId", "name");
CREATE INDEX "ApplicationProfile_userId_updatedAt_idx" ON "ApplicationProfile"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ApplicationProfile" ADD CONSTRAINT "ApplicationProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
