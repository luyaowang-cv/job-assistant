# F-026: 面试准备（Interview Prep）

## Goal

让用户为每一份简历版本维护一份“面试资料”：粘贴 JD 与实习/知识补充后，AI 直接生成覆盖自我介绍、岗位认知、问题准备、知识储备等分部分材料；面试后粘贴记录，AI 摘抄关键信息并入复盘；整份资料可一键导出 Markdown。

## User scenarios

1. 选择一份简历版本（基础版/国央企版/大厂版），粘贴 JD 与实习内容 → 一键生成分部分面试资料。
2. 对结果不满意 → 修改输入重新生成，或手动编辑后保存。
3. 面试后粘贴记录文本 → AI 提取关键信息 → 确认后按日期追加到复盘部分。
4. 导出整份面试资料（含复盘）为 `.md` 文件本地保存。

## In scope

- `InterviewPrepDocument` 数据模型：每份 `ResumeVersion` 恰好一条，保存 jdText、extraText、sections、reflection 与 provider/model。
- 生成接口：读取 `ResumeVersion.content` + 用户粘贴的 JD/补充材料 → AI 输出分部分 JSON；预览不落库。
- 保存接口：upsert 面试资料并记录 `DocumentMutationEvent`。
- 复盘接口：AI 提取关键信息 → 确认后按日期追加并记录事件。
- Markdown 导出接口。
- 面试准备页面与导航入口。
- Zod schema 与纯函数/Provider 测试。

## Out of scope

- 面试/笔试实体、环节、结果、提醒等流程管理。
- 独立知识条目/知识库沉淀、公司调研、模拟面试。
- 事实来源强校验与逐条证据引用（用户明确要求弱化；生成指令仍禁止虚构简历经历与技能）。
- 多用户、浏览器扩展集成。

## Acceptance criteria

- AC1 每个 resumeVersionId 最多一条 `InterviewPrepDocument`；`GET /api/v1/interview-preps?resumeVersionId=` 返回该记录。
- AC2 `POST /api/v1/interview-preps/generate` 校验版本归属，返回 `{ sections, provider, model }` 且不写库；sections 至少包含自我介绍、岗位认知、问题准备、知识储备等部分。
- AC3 `POST /api/v1/interview-preps/save` upsert 记录并写 `INTERVIEW_PREP_SAVED` 事件；重复保存不产生重复记录。
- AC4 `POST /api/v1/interview-preps/reflection/preview` 返回 `{ extracted, provider, model }`；`confirm` 按服务器日期追加复盘条目并写 `INTERVIEW_REFLECTION_MERGED` 事件。
- AC5 `GET /api/v1/interview-preps/[id]/export` 返回 `text/markdown` 附件，包含全部 sections 与复盘。
- AC6 页面支持：选版本 → 填 JD/补充 → 生成 → 保存 → 导出 MD → 复盘提取与确认。
- AC7 schema、Markdown 纯函数与 Provider 测试通过；typecheck、eslint、Nuxt build 通过。

## Affected contracts

- `specs/contracts/domain-model.md`：新增 InterviewPrepDocument 实体与持久化约束。
- `specs/contracts/api-conventions.md`：新增 interview-preps 端点与错误码约定。

## Risks and open questions

- 长文本生成可能超时/截断：限制 section 数量与单段长度，生成超时 120s，失败可重试（复用稳定错误码）。
- 每简历版本一份 vs 多版本共享：本 Feature 固定“每 ResumeVersion 一份”，由页面版本选择承载国央企/大厂差异。
- AI 输出质量问题：生成指令明确章节结构与内容密度；不引入逐条证据校验。
- 数据库未启动或 Key 未配置：沿用 `AI_KEY_NOT_CONFIGURED` / `AI_PROVIDER_UNAVAILABLE` 错误映射。
## 执行记录（2026-08-19）

- 实现完成并验证：`pnpm test:interview-prep` 5/5、改动文件 eslint、`pnpm typecheck`、`pnpm build` 全部通过；迁移已应用。
- 实现细节：复盘确认端点为 `POST /api/v1/interview-preps/reflection/confirm`；sections 允许 3-12 部分；保存时 provider/model 取服务端当前 AI 设置；复盘日期由服务端在确认时生成。
- 交互范围：生成/复盘提取为预览不落库；保存与复盘确认写库并记录 DocumentMutationEvent。