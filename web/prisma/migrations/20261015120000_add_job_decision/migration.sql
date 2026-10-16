-- CreateEnum
CREATE TYPE "JobDecisionStatus" AS ENUM ('NOT_SUITABLE');

-- CreateTable
CREATE TABLE "JobDecision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "JobDecisionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobDecision_userId_status_idx" ON "JobDecision"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JobDecision_userId_jobId_key" ON "JobDecision"("userId", "jobId");

-- AddForeignKey
ALTER TABLE "JobDecision" ADD CONSTRAINT "JobDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDecision" ADD CONSTRAINT "JobDecision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 回填存量数据：旧的 "manualOfflineAt" 是全局判断，记录不出是哪位用户标的，
-- 归给最早的（owner）用户。没有用户时 CROSS JOIN 出空集，直接不插。
INSERT INTO "JobDecision" ("id", "userId", "jobId", "status", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    owner."id",
    "Job"."id",
    'NOT_SUITABLE',
    "Job"."manualOfflineAt",
    CURRENT_TIMESTAMP
FROM "Job"
CROSS JOIN (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1) AS owner
WHERE "Job"."manualOfflineAt" IS NOT NULL;

-- "Job"."manualOfflineAt" 与它的索引刻意保留：个人判断已经迁到 JobDecision，
-- 这个字段只为回滚保留，新代码不再读写。

-- 审计事件类型：标记「不合适」和撤销标记各一种。
-- 放在文件最后：ALTER TYPE ADD VALUE 之后同一事务内不能立刻使用新值。
ALTER TYPE "DocumentMutationType" ADD VALUE 'JOB_MARKED_NOT_SUITABLE';
ALTER TYPE "DocumentMutationType" ADD VALUE 'JOB_DECISION_CLEARED';
