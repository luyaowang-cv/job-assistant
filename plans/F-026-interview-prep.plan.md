# F-026 Implementation Plan

## Architecture approach

- 复用 `callStructuredAi` 统一 Provider（当前 DeepSeek）；新增 `interviewPrepProvider`（生成/复盘提取）。
- 新增 `InterviewPrepDocument`（resumeVersionId 唯一），服务层负责归属校验、upsert、复盘追加、事件与 Markdown 构建。
- 页面为单页工作台：版本选择 + 输入 + 生成/保存/导出 + 复盘区。

## Contract changes

- `domain-model.md`：InterviewPrepDocument 实体与持久化约束。
- `api-conventions.md`：六个端点约定。
- `DocumentMutationType` 枚举新增 `INTERVIEW_PREP_SAVED`、`INTERVIEW_REFLECTION_MERGED`。

## Implementation sequence

1. Prisma schema + migration。
2. Zod schema + 测试。
3. Markdown 构建纯函数 + 测试。
4. Provider + 测试（mock fetcher）。
5. 服务层（归属校验、upsert、复盘、事件、导出）。
6. API 路由。
7. 页面 + 导航。
8. 验证（test/lint/typecheck/build）。

## Risks and mitigations

- 长输出超时：生成超时 120s、限制 section 数量与单段长度、错误可重试。
- Prisma JSON 类型：统一用 `Prisma.InputJsonValue` 转换后写入。
- 页面版本选择：复用 `GET /api/v1/resumes` 的 versions。

## Verification strategy

- `pnpm test:interview-prep`
- eslint 改动文件
- `vue-tsc --noEmit`
- `pnpm build`
- 手动冒烟：生成 → 保存 → 导出 → 复盘提取与确认。