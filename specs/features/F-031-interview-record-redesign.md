# F-031: 面试记录页重构（Interview Record Redesign）

## Goal

重新设计面试准备页面：**左侧固定维护本场面试全部基础元数据，滚动只发生在右侧**；右侧以【面试准备】/【面试复盘】双 Tab 切换，彻底隔离面试前复习内容与面试后复盘内容，解决内容混杂、页面超长滚动的痛点。

所有字段保存到新的 `interview_record` 面试记录表（`InterviewRecord`），不修改素材卡片。可绑定投递记录：选择投递记录后自动回填公司、岗位、JD 与绑定简历版本；面试结束后填写面试结果，自动同步投递台账对应投递状态。

## User scenarios

1. 从投递台账进入完整链路：投递台账记录 → 点击【面试准备】→ 自动填充左侧投递记录、简历版本，自动带入 JD → Tab1 写项目问答、本场笔记做面试复习（可 AI 生成）→ 面试结束手动切到 Tab2 写复盘、选择面试结果自动同步投递台账 → 需要时把踩坑问题沉淀到素材卡片（用户手动操作）。
2. 不绑定投递记录：直接新建一条面试记录，所有字段可以为空，手动维护公司/岗位/JD 与面试信息。
3. AI 生成面试材料：读取 JD + 当前简历素材卡片，生成面试问答候选 → 弹窗预览 → 用户确认后填入页面，**不覆盖现有编辑内容**。
4. 面试复盘：粘贴/上传录音文字内容（转写文本）→ AI 分析提取被问到的问题、发挥不错的地方、不足改进点；产品不处理音频文件，转写由用户在外部完成。
5. Markdown 导出：JD、AI 准备内容、项目问答/本场笔记、复盘内容一并导出。

## In scope

- Prisma：新增 `InterviewRecord` 模型（映射表 `interview_record`）、`InterviewRound` 与 `InterviewResult` 枚举，`DocumentMutationType` 新增 `INTERVIEW_RECORD_SAVED` / `INTERVIEW_RECORD_REVIEW_SAVED`。
- 页面布局：
  - 页面顶部全局操作栏（按钮靠右）：`保存` | `AI生成面试材料` | `导出Markdown`。
  - 左侧固定元数据栏（不随右侧滚动）：
    - 来源绑定区：投递记录下拉（可选）→ 选中后自动回填公司、岗位、JD、绑定简历版本。
    - 面试信息表单（紧凑纵向小表单）：面试轮次（一面/二面/HR面/终面）、面试时间（日期时间选择器）、面试方式&地址（会议链接/线下地址）、简短备注（单行输入框）。
  - 右侧主内容区（独立滚动），双 Tab：
    - Tab1 面试准备（默认打开，面试前复习）：AI 分析 JD 与简历版本描述，针对不同项目经历/实习经历生成知识点复习、要提问面试官的问题、岗位针对性准备要点；Tab 内提供 AI 分析按钮；另含本场笔记（项目问答）编辑区。
    - Tab2 面试复盘（仅面试结束后用户手动切换，不与复习内容混杂）：面试结果下拉；粘贴/上传录音文字内容（转写文本）与 AI 提取（问题/亮点/改进）。
- API（`/api/v1/interview-records`）：CRUD、AI 生成准备内容预览、复盘提取预览与确认、Markdown 导出。
- AI 生成逻辑：读取 JD + 当前简历素材卡片 + 简历版本 → 生成候选 → 弹窗预览 → 用户确认后合并填入，不覆盖现有编辑内容。
- 面试结果 → 投递状态同步（服务端映射常量 + `STATUS_CHANGED` 事件）。
- 投递台账新增【面试准备】入口，携带 `applicationId` 跳转并自动回填。
- Zod schema、纯函数/Provider 单测，`eslint`/`typecheck`/`build` 通过。

## Out of scope

- 删除或迁移旧 `InterviewPrepDocument` 与 F-026 `/api/v1/interview-preps` 接口（保留兼容，页面不再使用；旧数据不做迁移）。
- 将复盘踩坑问题自动写入素材卡片（本期仅由用户手动沉淀，不自动创建/修改卡片）。
- 多轮面试子表、笔试、提醒、日程等面试流程管理。
- 音频文件上传与语音转写：产品只分析用户提供的录音文字内容（transcript），不做音频文件存储或转写。
- 多用户鉴权、浏览器扩展集成。

## Acceptance criteria

- AC1 Prisma schema 含 `InterviewRecord`（表名 `interview_record`）与 `InterviewRound`/`InterviewResult` 枚举；全部业务字段可为空；migration 应用成功。
- AC2 选择投递记录后自动回填公司、岗位、JD、绑定简历版本（优先该投递关联的 TARGETED ResumeVersion；无关联时由用户手工选择）。
- AC3 页面左侧固定、右侧独立滚动；Tab1 面试准备默认打开，Tab2 面试复盘仅手动切换，两侧内容互相隔离。
- AC4 `POST /api/v1/interview-records/generate` 为预览不落库，返回候选与 provider/model；用户确认后按合并规则填入，不覆盖已编辑内容。
- AC5 创建/更新接口 upsert `InterviewRecord` 并写 `INTERVIEW_RECORD_SAVED` 事件；重复保存不产生重复记录。
- AC6 复盘提取接受录音文字内容（transcript，≤50,000 字符）：预览→确认后写入 `review` 并写 `INTERVIEW_RECORD_REVIEW_SAVED` 事件；空文本被拒。
- AC7 绑定投递记录时，保存变更后的面试结果自动同步投递状态（按映射表）并写 `STATUS_CHANGED` 事件。
- AC8 `GET /api/v1/interview-records/[id]/export` 返回 Markdown 附件，包含 JD、AI 准备内容、项目问答/本场笔记与全部复盘。
- AC9 投递台账 →【面试准备】跳转自动填充投递记录、简历版本与 JD。
- AC10 schema/markdown/provider 单测通过；`eslint`、`typecheck`、`build` 通过。

## Affected contracts

- `specs/contracts/domain-model.md`：新增 `InterviewRecord` 实体、`InterviewRound`/`InterviewResult` 枚举、`DocumentMutationType` 扩展、与 User/Application/ResumeVersion 的关系，以及结果同步约束。
- `specs/contracts/api-conventions.md`：新增 interview-records API 表、录音上传约束、错误码与事件规则。

## Risks and open questions

- **面试结果 → 投递状态映射**：默认映射为 待定→`INTERVIEWING`、通过（终面/HR面）→`OFFERED`、通过（一面/二面/未知轮次）→`INTERVIEWING`、未通过→`REJECTED`、放弃→`WITHDRAWN`。映射集中在服务端常量，可随时调整。
- **复盘输入为文字**：用户粘贴/上传录音文字内容，产品不做音频转写；`transcript` 随 review 保存，仅用于用户显式触发的分析。
- **新旧数据并存**：旧 InterviewPrepDocument 与新 InterviewRecord 并存，页面切换后旧数据仅通过旧接口访问，不迁移、不删除。
- **文字长度限制**：`transcript` 上限 50,000 字符，超限由 Zod 拒绝。

## 执行记录

- 2026-08-20 实现完成并验证：Prisma 迁移 `20260819163608_interview_record` 应用成功；`pnpm test:interview-record` 11/11 通过；改动文件 eslint、`pnpm typecheck`、`pnpm build` 全部通过。
- API 冒烟（临时数据已清理）：创建绑定投递的面试记录 → 一面+通过同步投递为 INTERVIEWING；结果改为未通过 → REJECTED；复盘确认追加条目；Markdown 导出含 JD/准备内容/笔记/复盘；非法输入返回 VALIDATION_ERROR。
- 实现细节：ResumeVersion 与 InterviewRecord 为一对多（同一简历版本可对应多场面试）；结果同步在创建（带结果时）与更新（结果变更时）触发；复盘仅接受录音文字内容 transcript。

- 2026-08-20：用户确认复盘分析输入为录音文字内容（transcript），不做音频文件上传/转写；spec / 合同 / 计划 / 任务已同步更新。
