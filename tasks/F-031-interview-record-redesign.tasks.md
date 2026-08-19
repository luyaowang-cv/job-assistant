# F-031 Tasks: 面试记录页重构（Interview Record Redesign）

- [x] T-001: Prisma schema 新增 `InterviewRound` / `InterviewResult` 枚举、`InterviewRecord` 模型（表名 `interview_record`）及 `DocumentMutationType` 两个新值；生成 migration 并执行 `prisma generate`。Verify: `cd web && pnpm prisma migrate dev --name interview_record --skip-generate && pnpm prisma generate` 通过，schema 含 `interview_record` 与新枚举。
- [x] T-002: 编写 `server/schemas/interview-record.ts`（创建/更新/生成/复盘/查询入参，`prepSections` 与 `review` 归一化与严格校验）及单测。Verify: `pnpm test:interview-record` 中 schema 测试通过（非法轮次/结果/超长字段被拒）。
- [x] T-003: 编写 `server/services/interview-record-markdown.ts` 纯函数（JD、AI 准备内容、项目问答/本场笔记、全部复盘）及单测。Verify: markdown 测试通过，导出含全部区块标题。
- [x] T-004: 编写 `server/services/interview-record-provider.ts`（生成 KNOWLEDGE/QUESTION_ASK/ROLE_POINT 候选；复盘提取 questionsAsked/strengths/improvements；Mock 实现 provider=MOCK 且零外部调用）及单测。Verify: provider 测试通过。
- [x] T-005: 复盘分析限定为文字输入：schema 仅接受 `transcript`（≤50,000 字符，空文本被拒），`review/preview` 与 `review/confirm` 冒烟通过（含错误路径）。Verify: `pnpm test:interview-record` 与接口冒烟通过；无音频文件上传/存储逻辑。
- [x] T-006: 编写 `server/services/interview-record.service.ts`：create/get/update/generatePreview/reviewPreview/reviewConfirm/export；归属校验；结果→投递状态同步（映射常量 + `STATUS_CHANGED` 事件 source=INTERVIEW_RECORD）；`INTERVIEW_RECORD_SAVED` / `INTERVIEW_RECORD_REVIEW_SAVED` 事件。Verify: 结果映射纯逻辑单测通过；保存/同步事务冒烟通过。
- [x] T-007: 实现 `server/api/v1/interview-records/**` 路由组（GET/POST/PATCH、generate、review/preview、review/confirm、[id]/export），接入 Zod 与 apiSuccess/apiError 约定。Verify: 各端点冒烟通过；错误码（校验错误、404、AI 错误）正确。
- [x] T-008: 重写 `web/app/pages/interview-prep/index.vue`：顶部操作栏（保存 / AI生成面试材料 / 导出Markdown，靠右）；左侧固定元数据栏（投递记录下拉回填公司/岗位/JD/简历版本，轮次/时间/方式地址/备注）；右侧双 Tab（Tab1 默认、Tab2 手动切换）；AI 生成弹窗预览→确认→不覆盖合并；复盘粘贴/上传录音文字内容分析。Verify: `pnpm typecheck` 通过；浏览器冒烟布局与交互符合 AC3/AC4/AC6。
- [x] T-009: `web/app/pages/applications/index.vue` 详情抽屉新增【面试准备】按钮跳转 `?applicationId=`，页面读取参数自动回填投递记录/简历版本/JD。Verify: 台账→面试准备链路冒烟通过（AC2/AC9）。
- [x] T-010: 全量验证：`pnpm test:interview-record`、`pnpm eslint`、`pnpm typecheck`、`pnpm build` 通过；逐条对照 AC1-AC10 记录结果并回写 Spec 执行记录。Verify: 全部命令成功且 Spec 执行记录已更新。
