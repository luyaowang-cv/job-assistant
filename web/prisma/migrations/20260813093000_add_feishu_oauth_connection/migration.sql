CREATE TABLE "FeishuConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "encryptedAccessToken" TEXT NOT NULL,
  "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "encryptedRefreshToken" TEXT NOT NULL,
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FeishuConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeishuConnection_userId_key" ON "FeishuConnection"("userId");
ALTER TABLE "FeishuConnection" ADD CONSTRAINT "FeishuConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
