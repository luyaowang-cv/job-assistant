# API 契约约定（v0）

## F-025 真实 AI 错误与标识

- 岗位评估、投递材料、简历优化和卡片建议返回当前实际 provider/model，不得返回 `MOCK`、`LOCAL_GROUNDED` 或 local 模型名。
- 统一错误码为 `AI_KEY_NOT_CONFIGURED`、`AI_PROVIDER_UNAVAILABLE`、`AI_PROVIDER_ERROR`、`AI_PROVIDER_INVALID_RESPONSE`；卡片事实保护可返回 `AI_UNGROUNDED_SUGGESTION`。
- 真实 AI 失败不产生候选保存，不自动重试，也不静默回退 Mock。

## F-024 Fixed A4 Resume API

| Method | Path | Contract |
|---|---|---|
| PUT/DELETE/GET | `/api/v1/personal-profile/photo` | 上传、删除或读取当前用户照片；multipart 最大 5MiB，读取返回原始图片。 |
| POST | `/api/v1/resumes/:id/a4-preview` | 输入 composition，返回只读 HTML 与 pageCount/overflow 诊断。 |
| GET | `/api/v1/resumes/:id/versions/:versionId/exports/pdf` | 从已保存版本返回 `application/pdf`；不存在、浏览器缺失或溢出时返回稳定错误。 |
| POST | `/api/v1/resumes/:id/variant-suggestions/preview` | 输入 applicationId 与所选引用；返回建议、证据、warnings、provider/model 和短期 previewToken，零写入。 |
| POST | `/api/v1/resumes/:id/variant-suggestions/confirm` | 输入 previewToken、selectedSuggestionIds、idempotencyKey；只创建选中的新 variants/events。 |

- PDF 和图片为二进制响应，不包裹通用 JSON envelope；错误仍使用通用 error envelope。
- AI preview 必须验证 Application、JD、card/variant 归属；confirm 必须验证签名、过期、归属、选择集合和幂等键。

## 边界

- 所有业务 API 位于 `/api/v1`。
- 所有输入使用 Zod 校验；不要相信插件或浏览器传入的字段。
- F-001 单用户本地模式下，服务端使用固定 local user；客户端不得指定 `userId`。
- 后续接入认证后，用户身份改由服务端会话取得，调用方仍不得指定 `userId`。

## 响应

成功：`{ "data": <payload>, "meta": { "requestId": "..." } }`

失败：`{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] }, "meta": { "requestId": "..." } }`

## 变更规则

- 破坏性字段变更必须先更新此契约并提供迁移方案。
- 插件使用与 Web 相同的 API 与授权机制。
- 创建、更新、删除状态必须在服务端生成 `ApplicationEvent`。
- Agent 工具调用 API 服务层，不绕过鉴权与事件记录。

## F-002 Job Evaluation API

| Method | Path | Input | Success data |
|---|---|---|---|
| GET | `/api/v1/job-preference` | 无 | 当前用户的 JobPreference |
| PATCH | `/api/v1/job-preference` | targetRoles、targetCities、companyTypes、technicalFocus | 更新后的 JobPreference |
| POST | `/api/v1/applications/:id/evaluations` | `resumeText` | 新建的 AgentRun 与 JobEvaluationResult |
| GET | `/api/v1/applications/:id/evaluations` | 路径 `id` | 当前用户该岗位的 AgentRun 历史，按创建时间倒序 |

- POST 必须验证 Application 属于当前 local user、未软删除且存在非空 JD；resumeText 非空且只用于当次运行。
- Mock 阶段响应中 provider 必须为 MOCK，且不得产生对第三方 API、Plugin 或 MCP 的网络调用。
- AgentRun 创建和状态变化由服务端管理；客户端不得传 userId、provider、model、output 或运行状态。

## F-003 Application Materials API

| Method | Path | Input | Success data |
|---|---|---|---|
| POST | `/api/v1/applications/:id/materials/preview` | `resumeText` | 不持久化的 `ApplicationMaterialsDraft`，含 aiDraft、resumeDigest、provider、model、evaluationRunId |
| POST | `/api/v1/applications/:id/materials` | `aiDraft`、`content`、`resumeDigest`、`evaluationRunId?` | 新建的 ApplicationMaterial |
| GET | `/api/v1/applications/:id/materials` | 路径 `id` | 当前用户该岗位的已保存 ApplicationMaterial 历史，按 createdAt 倒序 |

- 所有路径均验证 Application 属于当前 local user、未软删除且含非空 JD；preview 还要求非空 resumeText。
- preview 读取最近一次成功的 JOB_EVALUATION 作为可选上下文；不存在评估时仍返回材料初稿。
- `ApplicationMaterialsDraft` 固定包含：resumeSuggestions、rewrittenSections、greetings.short、greetings.standard、greetings.technicalHighlight；每项包含 JD 或简历事实依据。
- preview 绝不写入 ApplicationMaterial；POST 保存仅在用户点击保存时调用，服务端验证 aiDraft/content 的 Zod 结构并计算 wasEdited。
- 客户端不得传 userId、provider、model、createdAt 或 wasEdited；完整 resumeText 不得出现在保存 API 的输入或响应。

## F-004 Resume Optimization API

| Method | Path | Input | Success data |
|---|---|---|---|
| GET | `/api/v1/resumes` | 无 | 当前用户 Resume 与版本历史；无基础简历时返回 null |
| POST | `/api/v1/resumes/base` | `name`、`content` | 新建 Resume 与 BASE ResumeVersion |
| POST | `/api/v1/resumes/preview` | `applicationId` | 不持久化的完整定制草稿、修改摘要、事实依据、provider/model |
| POST | `/api/v1/resumes/versions` | `content`、`aiDraft`、`changeSummary`、`applicationId?` | 新建 TARGETED ResumeVersion |

- 服务端从当前 local user 获取 Resume；客户端不得传 userId、provider、model、wasEdited 或版本类型。
- 基础简历仅能创建一次；再次保存基础内容必须创建一个新的版本而非覆盖 BASE。
- preview 要求基础简历存在，且指定 Application 属于当前用户、未软删除并含非空 JD；preview 不创建 ResumeVersion。
- 保存定制版本时，来源 Application（如提供）必须属于当前用户且未软删除；服务端计算 wasEdited。

- `PUT /api/v1/resumes/base` 接受与创建基础简历相同的 `name`、`content`，仅在用户明确操作时替换当前 BASE 内容；不创建旧基础历史。

## F-005B Application Profile API

| Method | Path | Input | Success data |
|---|---|---|---|
| GET | `/api/v1/application-profiles` | 无 | 当前用户的 ApplicationProfile 列表 |
| POST | `/api/v1/application-profiles` | name、targetTags 与结构化资料字段 | 新建的 ApplicationProfile |
| PUT | `/api/v1/application-profiles/:id` | name、targetTags 与结构化资料字段 | 更新后的 ApplicationProfile |

- 服务端从当前 local user 获取归属；客户端不得传 userId、id、createdAt 或 updatedAt。同一用户的档案名称唯一。
- 所有数组、日期字符串和文本字段均经 Zod 限制；资料档案不接受完整简历、密码、验证码、证件号码、银行卡或页面表单内容。
- POST/PUT 仅在用户明确点击工作台“保存资料档案”后调用；后续插件只能读取此 API 的结果，并由用户选择其中一份用于当前一次填写。

- F-005B privacy response rule: list, create and update responses include only `id`, `name`, `targetTags` and structured fill fields. They exclude `userId`, `createdAt`, `updatedAt` and all other ownership/audit metadata.

## F-006 Personal Profile API

| Method | Path | Input | Success data |
|---|---|---|---|
| GET | `/api/v1/personal-profile` | none | current user's PersonalProfile, or null |
| PUT | `/api/v1/personal-profile` | common basics and education master records | updated PersonalProfile |

- Client never sends `userId`, ids, audit timestamps, document number, banking/security data or page form values.
- GET `/api/v1/application-profiles` and POST/PUT profile responses retain their existing public fields but return resolved basics and educations. They do not reveal whether a given resolved value originated in the common record or an override.
- An empty override field means inherit; a non-empty override field wins over the common value. An empty education override array means inherit the common education master records.

## F-009 AI Settings API

| Method | Path | Input | Success data |
|---|---|---|---|
| GET | `/api/v1/ai-settings` | none | provider、baseUrl、model、apiKeyConfigured |
| PUT | `/api/v1/ai-settings` | provider、baseUrl、model | updated safe settings DTO |

- API Key is configured only as a server environment variable: DeepSeek uses `DEEPSEEK_API_KEY`, other compatible providers use `OPENAI_API_KEY`, and `AI_API_KEY` is the optional generic fallback. Credentials named for one provider are not forwarded to another provider. These endpoints never accept, persist, reveal or log it.
- PUT accepts only `OPENAI_COMPATIBLE`, a HTTPS Base URL or a local `http://localhost`/`http://127.0.0.1` Base URL, and a non-empty model name. The client never sends `userId`, ids or audit timestamps.
- Saving this setting does not make an external network request and does not change any current Mock Agent execution.

## F-010 AI Form-fill Preview API

| Method | Path | Input | Success data |
|---|---|---|---|
| POST | `/api/v1/form-fill/preview` | profileId、无值字段 descriptors | fills、unresolvedIds、provider、model |

- 该 API 仅由扩展的一次明确“填写”点击调用，不持久化请求、模型建议或页面字段。
- 输入 descriptor 仅允许稳定 fieldId、标签、短上下文、属性名、占位符、控件类型和选项；不接受已有值、DOM/HTML、Cookie、密码/file/checkbox/radio 或任意额外字段。
- 服务端从当前用户读取选中 ApplicationProfile 和 F-009 Provider 设置；API Key 不出现在输入、输出、日志或 Prisma。
- `fills` 仅含输入已声明的 fieldId 和非空短文本；`unresolvedIds` 仅含输入已声明的 fieldId。未配置 Key、Provider 返回无效数据或网络错误均不自动重试。

## F-011 Candidate Profile API

| Method | Path | Input | Success data |
|---|---|---|---|
| GET/PUT | `/api/v1/personal-profile` | 个人主档案及教育主记录 | 当前用户的个人主档案 |
| GET/POST/PUT | `/api/v1/application-profiles` | 网申档案的策略字段和 `resumeVersionId?` | 已解析但不含审计字段的网申档案 |
| GET | `/api/v1/application-profiles/:id/fill-context` | 路径 `id` | `{ localFacts, aiContext, profileName }` |

- `fill-context` 仅允许扩展在用户显式点击填写后读取；`localFacts` 和 `aiContext` 均可含用户明确保存的完整主档案，但不得含页面已有值、DOM/HTML、Cookie 或浏览器状态。
- PersonalProfile 与 ApplicationProfile 的写入均由 Zod schema 约束。客户端不得传 `userId`、审计字段、页面 DOM/HTML、Cookie 或任意简历文本。
- ApplicationProfile 的 `resumeVersionId` 如存在，服务端必须校验其归属当前 User；跨用户或不存在的版本以验证错误拒绝。

## F-020 岗位库 API

| Method | Path | Input | Success data |
|---|---|---|---|
| GET | `/api/v1/jobs` | `page`, `pageSize`, `search`, `location`, `industry`, `companyType`, `recruitmentType`, `hasWrittenTest`, `includeOffline` | `{ items, page, pageSize, total, filters }` |
| POST | `/api/v1/jobs/imports/feishu` | `{ shareUrl }` | `{ created, updated, offlined, skipped, total }` |
| POST | `/api/v1/jobs/:id/application` | path `id` | `{ application, created }` |

- 所有输入均由 Zod 校验。浏览器仅提供飞书公开分享链接，不得传入来源行、userId、飞书凭据、时间戳或投递状态。
- 飞书凭据只存在于服务端环境变量。凭据缺失、来源无法读取或任一行校验失败时导入返回明确错误且不写入数据库。导入在一个最长三分钟的数据库事务内执行，保证失败时不留下半同步数据。
- 搜索匹配公司名称与岗位名称；筛选为精确值；`includeOffline` 默认 false；每次查询都返回分页元数据。
- 导入仅返回统计，不返回凭据或分享链接；只映射 F-020 明确字段，绝不持久化薪资列。
- 转投递检查当前 local user 并事务性创建投递/事件。已存在投递的重复请求幂等，返回 `created: false`。

## F-020 飞书 OAuth API

| Method | Path | Input | Success data |
|---|---|---|---|
| GET | `/api/v1/integrations/feishu` | 无 | `{ connected, expiresAt?, scopes }` |
| GET | `/api/v1/integrations/feishu/authorize` | 无 | 302 跳转至飞书授权页 |
| GET | `/api/v1/integrations/feishu/callback` | 飞书的 `code`、`state` | 持久化授权后 302 回 `/jobs?feishu=connected` |
| DELETE | `/api/v1/integrations/feishu` | 无 | `{ disconnected: true }` |

- 授权 scope 固定为 `bitable:app:readonly offline_access`。`bitable:app:readonly` 已覆盖多维表格、数据表与记录的查看/评论/导出读取能力；OAuth state 必须签名并限时校验，回调 code 只能在服务器端用 App Secret 交换。
- 岗位同步仅使用当前 local user 的有效 `user_access_token`；access token 到期时服务器用已加密的 refresh token 刷新并轮换保存。用户授权满 365 天或 refresh 失败时，返回重新连接指引。

## F-001 Application API

| Method | Path | Input | Success data |
|---|---|---|---|
| GET | `/api/v1/applications` | `page`、`pageSize`、`search`、`status`、`channel` | `{ items, page, pageSize, total }` |
| POST | `/api/v1/applications` | Company、Job 与 Application 创建字段；必须含 `companyName`、`jobTitle`、`status` | 含 Job 与 Company 的 Application |
| GET | `/api/v1/applications/:id` | 路径 `id` | 含 Job、Company、按时间倒序 Events 的 Application |
| PATCH | `/api/v1/applications/:id` | 可编辑的 Company、Job、Application 字段 | 更新后的 Application |
| PATCH | `/api/v1/applications/:id/status` | `status` 与交互来源 | 更新后的 Application |
| DELETE | `/api/v1/applications/:id` | 路径 `id` | `{ id, deletedAt }` |

- 默认列表、详情、更新、状态变更与删除均只作用于 local user 且 `deletedAt` 为 null 的 Application。
- 分页默认 `page=1`、`pageSize=20`，最大 `pageSize=100`。
- 查询关键词匹配公司名称和岗位名称；状态、渠道筛选使用单个枚举值。
- `PATCH /:id/status` 允许用户主动在任意非删除状态之间迁移；写入 `STATUS_CHANGED` 事件，其中 payload 包含 fromStatus、toStatus、source。
- 普通 PATCH 写入 `UPDATE` 事件；DELETE 设置 `deletedAt` 并写入 `DELETE` 事件。

## F-023 Material and composed-document API

所有 F-023 请求与响应均由 strict Zod schema 校验；客户端不得传 userId、ownerId、审计时间或事件字段。

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/v1/material-cards` | 分页搜索/筛选；创建 card 与首个 variant |
| GET/PATCH | `/api/v1/material-cards/:id` | 读取；更新 title/tags/facts |
| POST | `/api/v1/material-cards/:id/variants` | 创建不可变命名 variant |
| POST | `/api/v1/material-cards/:id/archive` | 归档 card |
| POST | `/api/v1/material-migrations/application-profiles/:id/preview` | 只读生成 legacy 候选 |
| POST | `/api/v1/material-migrations/application-profiles/:id/confirm` | 导入明确选中的 sourceKey |
| GET/POST | `/api/v1/resumes/:id/composed-versions` | 读取/创建不可变简历组合版本 |
| GET/POST | `/api/v1/application-profiles/:id/versions` | 列表/创建不可变网申版本 |
| GET | `/api/v1/application-profiles/:id/versions/:versionId/resolved` | 读取 resolved version |
| POST | `/api/v1/material-cards/:id/impact-preview` | 只读影响范围与 diff |
| POST | `/api/v1/material-cards/:id/sync` | preview token 与幂等键确认同步 |
| GET | `/api/v1/resumes/:id/versions/:versionId/exports/markdown` | 只读导出已保存版本 |
| GET | `/api/v1/document-export-capabilities` | MARKDOWN available，PDF/DOCX planned |

- 列表 page 默认 1、pageSize 默认 20 且最大 100；search 匹配 title/variant content，type 精确匹配，tags 采用全部命中。默认不返回归档卡片。
- 素材类型包含独立的 `INTERNSHIP` 与 `WORK`。创建/更新时 `facts.startDate`、`facts.endDate` 为可选月份文本（`YYYY-MM` 或结束值 `至今`）；类型化经历还可提交非空 `facts.role`、`facts.organization` 和最多 20 项的 `facts.techStack[]`。客户端产品界面使用明确控件组装 facts，不暴露原始 JSON 编辑器。tags 可选且不进入简历正文。
- 新引用必须使用当前用户未归档 card 的既有 variant。跨用户、不存在、card/variant 不匹配必须拒绝；历史解析允许已归档引用。
- preview API 数据库零写入。confirm 使用服务端签名且限时的 previewToken；同步还要求非空 idempotencyKey，最多 50 个 targetIds。
- 同步确认时重新验证 current version。响应逐目标返回 created、skipped 或 failed 及稳定 reason code；同幂等键重试不得重复创建版本。
- 字符数按 Unicode code point 返回 count、limit、overLimit，超限不截断。
- Markdown 只接受已持久化且归属当前用户的 ResumeVersion，不创建/更新 version 或 event。PDF/DOCX 未实现时不得伪造下载。
- F-023 新建/更新 ApplicationProfile 不接受 basics、educations 或经历 JSON；存量字段省略时不得清空。fill-context 优先 current ApplicationProfileVersion，无新版本时回退 legacy adapter。

## F-026 面试准备 API

- `GET /api/v1/interview-preps?resumeVersionId=` 查询指定简历版本的面试资料；不存在返回 `data: null`。
- `POST /api/v1/interview-preps/generate` body `{ resumeVersionId, jdText?, extraText? }` → `{ sections, provider, model }`，预览不落库。
- `POST /api/v1/interview-preps/save` body `{ resumeVersionId, jdText, extraText, sections }` → 保存/更新，按 resumeVersionId 幂等 upsert，并写事件。
- `POST /api/v1/interview-preps/reflection/preview` body `{ resumeVersionId, recordText }` → `{ extracted, provider, model }`。
- `POST /api/v1/interview-preps/reflection/confirm` body `{ resumeVersionId, recordText, extracted }` → 按服务器日期追加复盘并写事件。
- `GET /api/v1/interview-preps/[id]/export` → `text/markdown; charset=utf-8` 附件下载，包含全部 sections 与复盘。
- 请求均经 Zod 校验；客户端不传 userId；AI 失败沿用 `AI_KEY_NOT_CONFIGURED`、`AI_PROVIDER_UNAVAILABLE`、`AI_PROVIDER_ERROR`、`AI_PROVIDER_INVALID_RESPONSE` 错误码。
## F-029 删除 API

- `DELETE /api/v1/material-cards/[id]`：硬删除素材卡片及其变体与引用，写 `MATERIAL_DELETED` 事件；不存在或不属于当前用户返回 404。
- `DELETE /api/v1/application-profiles/[id]`：硬删除网申档案及其版本与组合文档，写 `APPLICATION_PROFILE_DELETED` 事件；不存在或不属于当前用户返回 404。
- 删除为幂等语义：已删除记录再次请求返回 404；客户端不传 userId。
## F-030 简历版本删除 API

- `DELETE /api/v1/resumes/[id]/versions/[versionId]`：硬删除 TARGETED 简历版本及其组合文档与引用，写 `RESUME_VERSION_DELETED` 事件；不存在、不属于当前用户或为 BASE 版本时返回 404。
- 客户端不传 userId；删除不可恢复。
## F-031 面试记录 API

| Method | Path | Input | Success data |
|---|---|---|---|
| GET | `/api/v1/interview-records` | `id?` 或 `applicationId?` | 单条记录或该投递下的记录列表（倒序）；单条不存在返回 `data: null` |
| POST | `/api/v1/interview-records` | 元数据与准备/复盘字段 | 新建的 `InterviewRecord` |
| PATCH | `/api/v1/interview-records/[id]` | 部分可编辑字段 | 更新后的 `InterviewRecord` |
| POST | `/api/v1/interview-records/generate` | `applicationId?`/`resumeVersionId?`/`jdText?`/`materialCardIds?` | 不落库候选 `{ blocks, provider, model }` |
| POST | `/api/v1/interview-records/[id]/review/preview` | `transcript`（录音文字内容，≤50,000 字符） | 不落库 `{ extracted, provider, model }` |
| POST | `/api/v1/interview-records/[id]/review/confirm` | `transcript` + `extracted` | 更新后的 `InterviewRecord` |
| GET | `/api/v1/interview-records/[id]/export` | 路径 `id` | `text/markdown; charset=utf-8` 附件 |

- 全部输入经 Zod 校验；客户端不传 userId/provider/model/事件字段。
- 创建/更新时若提供 `applicationId`，服务端校验其归属当前用户且未软删除；`resumeVersionId` 校验归属当前用户。
- 生成与复盘提取为 preview 零写库；保存与复盘确认写库并创建 `DocumentMutationEvent`（`INTERVIEW_RECORD_SAVED` / `INTERVIEW_RECORD_REVIEW_SAVED`）。
- 保存/更新时面试结果发生变更且绑定投递记录，服务端按映射同步 `Application.status` 并写 `STATUS_CHANGED` 事件（source=INTERVIEW_RECORD）。
- 复盘分析仅接受用户提供的录音文字内容（`transcript`，≤50,000 字符），产品不做音频文件上传或转写。
- 导出 Markdown 仅接受已持久化且归属当前用户的 `InterviewRecord`，不创建/更新记录或事件。
- AI 失败沿用 `AI_KEY_NOT_CONFIGURED` / `AI_PROVIDER_UNAVAILABLE` / `AI_PROVIDER_ERROR` / `AI_PROVIDER_INVALID_RESPONSE`。
