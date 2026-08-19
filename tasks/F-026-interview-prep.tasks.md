# F-026 Tasks

- [x] T-001: Prisma 新增 InterviewPrepDocument 模型与 DocumentMutationType 新值，执行迁移与 generate。 Verify: 通过（迁移 `20260819075527_add_interview_prep` 已应用，`pnpm db:generate` 通过）
- [x] T-002: 新增 interview-prep Zod schema 与测试。 Verify: `pnpm test:interview-prep` 5/5 通过
- [x] T-003: Markdown 构建纯函数与测试。 Verify: 通过
- [x] T-004: interviewPrepProvider（生成/复盘提取）与 mock 测试。 Verify: 通过
- [x] T-005: 服务层（查询/生成预览/保存/复盘/导出）与事件记录。 Verify: 通过 build 与测试
- [x] T-006: 六个 API 路由。 Verify: 路由已实现并进入 build 产物
- [x] T-007: 页面与导航入口。 Verify: 页面构建通过，导航“面试准备”入口已加入
- [x] T-008: 验证 gate（lint/typecheck/build）并更新 spec 执行记录。 Verify: eslint/typecheck/build 全部通过

执行记录（2026-08-19）：

- Prisma 迁移 `20260819075527_add_interview_prep` 已应用；`InterviewPrepDocument` 表已建（11 列，sections/reflection 为 JSONB）。
- 新增 interview-prep schema、Provider、Markdown 构建、服务层、6 个 API 路由、页面与导航；`pnpm test:interview-prep` 5/5 通过；改动文件 eslint 通过；`pnpm typecheck` 通过；`pnpm build` 通过。
- `web/.env` 已放开 `DATABASE_URL`（指向 docker PostgreSQL）。
- 简化实现：生成/复盘提取为 preview 不落库；保存与复盘确认写库并记录 `DocumentMutationEvent`（`INTERVIEW_PREP_SAVED` / `INTERVIEW_REFLECTION_MERGED`）。