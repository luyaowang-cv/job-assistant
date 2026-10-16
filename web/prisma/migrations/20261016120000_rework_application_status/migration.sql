-- 投递状态机重做（2026-10-16）：
--   删掉 PREPARING（准备中），新增 ASSESSMENT（测评中）和 AI_INTERVIEW（AI面试）；
--   枚举顺序同时改成招聘流程顺序 —— Prisma 生成的新类型会按 schema 里的顺序建，
--   所以两边要一致（见 web/shared/application-status.ts，那边是界面和校验的唯一来源）。
--
-- 【顺序很重要】先搬数据，再换列类型。
--   下面 `USING ("status"::text::"ApplicationStatus_new")` 这一步遇到枚举里不存在的值会直接
--   报错（invalid input value for enum "ApplicationStatus_new": "PREPARING"），
--   而 Prisma 生成的 SQL 里**没有**数据搬迁这一步。库里还剩 PREPARING 的话，这个迁移必挂。
--
--   搬迁放在 BEGIN 外面是刻意的：SAVED 在旧类型和新类型里都存在，
--   所以这条即使单独提交、后面的事务回滚了也是安全的。

-- ① 存量数据：「准备中」归到「收藏」——语义就是"收藏着、还没投出去"
UPDATE "Application" SET "status" = 'SAVED' WHERE "status" = 'PREPARING';

-- ② 以下为 Prisma 生成的枚举重建（原样保留，别手改）
-- AlterEnum
BEGIN;
CREATE TYPE "ApplicationStatus_new" AS ENUM ('SAVED', 'APPLIED', 'ASSESSMENT', 'AI_INTERVIEW', 'WRITTEN_TEST', 'INTERVIEWING', 'OFFERED', 'REJECTED', 'WITHDRAWN');
ALTER TABLE "Application" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Application" ALTER COLUMN "status" TYPE "ApplicationStatus_new" USING ("status"::text::"ApplicationStatus_new");
ALTER TYPE "ApplicationStatus" RENAME TO "ApplicationStatus_old";
ALTER TYPE "ApplicationStatus_new" RENAME TO "ApplicationStatus";
DROP TYPE "ApplicationStatus_old";
ALTER TABLE "Application" ALTER COLUMN "status" SET DEFAULT 'SAVED';
COMMIT;
