# F-031 Implementation Plan

## Architecture approach

**数据层**：新增 `InterviewRecord` 模型（映射表 `interview_record`），`applicationId` / `resumeVersionId` 可选外键（onDelete: SetNull），全部业务字段可空；新增 `InterviewRound` / `InterviewResult` 枚举；`DocumentMutationType` 新增 `INTERVIEW_RECORD_SAVED` / `INTERVIEW_RECORD_REVIEW_SAVED`。`prepSections`、`review` 用 JSONB，由服务端 Zod 约束。

**服务端**（沿用现有分层，复用既有服务）：
- `server/schemas/interview-record.ts`：创建/更新/生成/复盘/查询入参与 `prepSections`、`review` 归一化。
- `server/services/interview-record.service.ts`：CRUD、生成预览、复盘预览/确认、结果→投递状态同步、Markdown 导出。
- `server/services/interview-record-provider.ts`：AI 生成准备内容（JD + 简历版本 + 素材卡片摘要 → KNOWLEDGE/QUESTION_ASK/ROLE_POINT 候选）与复盘提取（问题/亮点/改进）；Mock 实现无外部调用。
- `server/services/interview-record-markdown.ts`：纯函数 Markdown 构建（JD、AI 准备内容、本场笔记、复盘）。
- 复盘分析仅接受用户提供的录音文字内容（`transcript`），不做音频文件上传或转写。
- API 路由 `server/api/v1/interview-records/**`。
- 复用：`getLocalUser`、`getAiProviderSetting`、`callStructuredAi`、`application.service.getApplication/updateApplicationStatus`、`material-card.service.listMaterialCards`。

**客户端**：
- 重写 `web/app/pages/interview-prep/index.vue`：顶部全局操作栏（保存 / AI生成面试材料 / 导出Markdown，靠右）；左侧固定元数据栏（来源绑定区 + 面试信息紧凑表单）；右侧独立滚动区 + el-tabs 双 Tab（Tab1 面试准备默认打开，Tab2 面试复盘手动切换）。
- `web/app/pages/applications/index.vue`：详情抽屉头部新增【面试准备】按钮 → `navigateTo('' /interview-prep?applicationId=<id>'')`；页面读取 query 自动回填。

## Contract changes

- `specs/contracts/domain-model.md`：F-031 面试记录持久化约束（已更新）。
- `specs/contracts/api-conventions.md`：F-031 面试记录 API 表与约束（已更新）。

## Implementation sequence

1. Prisma schema + migration + `prisma generate`。
2. Zod schemas + 单测。
3. Markdown 构建器 + 单测。
4. AI Provider（生成/提取）+ Mock + 单测。
5. `interview-record.service`（CRUD、结果同步、导出）。
6. 复盘提取 preview/confirm API 与事件接入（仅 transcript 文字）。
7. `interview-records` API 路由组。
8. 页面重构（布局 / 双 Tab / AI 弹窗 / 复盘文字分析）。
9. 投递台账入口与自动回填。
10. 全量验证并回写 Spec 执行记录。

## Risks and mitigations

- **面试结果→投递状态映射语义**：默认映射集中在服务端常量：待定→`INTERVIEWING`；通过且轮次为终面/HR面→`OFFERED`，否则→`INTERVIEWING`；未通过→`REJECTED`；放弃→`WITHDRAWN`。规格 AC7 覆盖，映射可调整。
- **复盘输入为文字**：用户粘贴/上传录音文字内容，产品不做音频转写；`transcript` 随 review 保存，仅用于用户显式触发的分析。
- **新旧数据并存**：保留 F-026 `InterviewPrepDocument` 与旧接口，页面切换至新模型，不做数据迁移。
- **文字长度限制**：`transcript` 上限 50,000 字符，超限由 Zod 拒绝。
- **工具链沙箱故障**：apply_patch 对已有文件读取失败时，改用 PowerShell 以 UTF-8 无 BOM 做机械追加/插入并验证。

## Verification strategy

- 新增 `pnpm test:interview-record`，覆盖 schema / markdown / provider / service 纯逻辑。
- 改动文件过 `pnpm eslint`；`pnpm typecheck` 与 `pnpm build` 全量通过。
- 手工浏览器链路：
  1. 台账 →【面试准备】→ 自动回填 → AI 生成预览 → 确认 → 保存 → 导出 MD。
  2. 切 Tab2 → 粘贴/上传录音文字内容 → 提取预览 → 确认 → 选结果 → 台账状态同步。
- 逐条对照 AC1-AC10 记录通过/失败/未验证及原因，并回写 Spec 执行记录。
