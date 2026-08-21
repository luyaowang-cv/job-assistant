# 领域模型契约（v0）

## F-025 真实 AI 与教育扩展

- AgentRun、ApplicationMaterial 与 TARGETED ResumeVersion 使用当前实际 provider/model；完整临时简历不进入 AgentRun 或 ApplicationMaterial。
- `PersonalProfile.educations` 可选保存 `gpa`、`gpaScale`、`ranking`、`campusRole`，结束时间允许“至今”；这些事实不得由模型推断。
- F-002/F-003/F-004 中原 Mock 标识约束由 F-025 取代。AI 预览不写库，用户确认后的既有不可变版本规则保持不变。

## F-024 固定 A4 简历约束

- `PersonalProfile` 可保存一份可空证件照：`photoMimeType`、`photoData`、`photoUpdatedAt`。照片属于基础档案，不复制到卡片或 ResumeVersion；公共档案 DTO 只暴露是否存在、mime 和更新时间。
- `DocumentComposition.config.templateId` 固定为 `A4_DENSE_V1`。版式引用随 ResumeVersion 不可变，卡片内容只读取已固定 variantId。
- AI 建议不是事实来源。preview 不持久化；confirm 只新建 `MaterialCardVariant` 与 `DocumentMutationEvent`，不更新既有 variant、facts 或 ResumeVersion。
- A4 渲染与 PDF 导出均为只读派生物，不创建文件记录、版本或事件。

## 核心实体

| Entity | Responsibility | Key fields |
|---|---|---|
| User | 数据隔离与身份 | id, email, displayName |
| Company | 公司主数据 | id, name, website, industry, companyType, tags |
| Job | 外部岗位事实 | id, companyId, title, department, location, salaryMin, salaryMax, source, url, description, deadlineAt |
| Application | 用户对岗位的求职过程 | id, userId, jobId, status, channel, appliedAt, nextAction, nextActionAt, notes, deletedAt |
| ApplicationEvent | 不可变过程时间线 | id, applicationId, type, occurredAt, payload |
| JobPreference | 用户的岗位评估偏好 | id, userId, targetRoles, targetCities, companyTypes, technicalFocus, updatedAt |
| Resume | 一份简历的身份 | id, userId, name, direction |
| ResumeVersion | 可追溯简历版本 | id, resumeId, content, format, source, createdAt |
| ApplicationProfile | 用户确认的结构化网申资料版本 | id, userId, name, targetTags, basics, educations, workExperiences, projects, skills, languages, certificates, campusExperiences, awards, createdAt, updatedAt |
| PersonalProfile | 用户唯一的通用个人资料与教育主记录 | id, userId, basics, educations, createdAt, updatedAt |
| AiProviderSetting | 用户选择的非敏感 OpenAI 兼容 Provider 元数据 | id, userId, provider, baseUrl, model, createdAt, updatedAt |
| Interview | 一次笔试或面试 | id, applicationId, stage, scheduledAt, result, reflection |
| InterviewRecord | 一次面试的准备与复盘记录 | id, userId, applicationId?, resumeVersionId?, companyName?, jobTitle?, jdText?, round?, interviewAt?, methodAndAddress?, briefNote?, prepSections, prepNotes?, result?, review, provider, model |
| AgentRun | 一次 AI 工作流运行 | id, userId, applicationId, type, status, preferenceSnapshot, resumeDigest, output, provider, model, startedAt, completedAt, errorMessage |
| Reminder | 用户待办与提醒 | id, userId, applicationId, title, dueAt, status |

## MVP 用户边界

F-001 采用单用户本地模式。服务端固定使用一个初始化的 local user；客户端不传 userId，也不提供注册、登录、多用户切换。保留 User 与 userId 关系是为了后续加入鉴权时不重构业务数据。

## 删除与审计

Application 使用 deletedAt 软删除。默认业务查询必须排除 deletedAt 非空的记录；删除行为写入 DELETE 类型的 ApplicationEvent。F-001 不提供回收站或恢复 API。

## ApplicationStatus

SAVED | PREPARING | APPLIED | WRITTEN_TEST | INTERVIEWING | OFFERED | REJECTED | WITHDRAWN

Application 是用户的状态与决策记录；Job 是岗位事实。不得把两者合并为单一状态表。

## F-001 持久化约束

- F-001 只落地 User、Company、Job、Application、ApplicationEvent 五张核心表；简历、面试、Agent 和提醒实体由各自 Feature 再迁移，避免空表抢跑。
- User.email 与 Company.name 全局唯一；Application 在同一 user 与 job 的组合下唯一。
- Job 是 Company 的多对一事实记录；Application 是 Job 的一对多用户过程记录，单用户创建流程当前只创建一条 Application。
- Company.tags 使用 PostgreSQL 字符串数组；ApplicationEvent.payload 使用 JSONB，可为空。
- 薪资以人民币“元/月”的整数保存；前端展示时负责格式化为 `25k-40k` 等可读文本。
- F-001 枚举：ApplicationChannel 为 OFFICIAL_SITE、BOSS、NIUKE、REFERRAL、OTHER；JobSource 为 OFFICIAL_SITE、BOSS、NIUKE、MANUAL、OTHER；事件类型为 CREATE、UPDATE、STATUS_CHANGED、DELETE。

## F-020 岗位库导入持久化约束

- `Job` 独立保存外部岗位事实，不与 `Application` 合并。除已有字段外，新增 `recruitmentType?`、`announcementUrl?`、`hasWrittenTest?`、`sourceDocId?`、`sourceUpdatedAt?`、`syncedAt?` 与 `offlineAt?`。
- `Company.industry?` 与 `Company.companyType?` 保存来源分类。导入器不映射或持久化来源文档中的薪资列。
- 同步使用 `sourceDocId + 公司名称 + 岗位名称` 识别同一来源岗位。后续来源行更新记录并清空 `offlineAt`；同一来源一次完整同步中缺失的记录保留并写入 `offlineAt`。
- 从岗位库创建投递沿用 `Application(userId, jobId)` 唯一约束。首次转换创建 `SAVED` 状态的 `Application` 与不可变 `CREATE` ApplicationEvent；重复转换返回既有 Application，不额外创建事件。
- `FeishuConnection` 一对一归属 `User`，仅保存经服务端加密的 OAuth access/refresh token、其到期时间和已授权 scope；绝不向客户端返回 token、App Secret 或加密密钥。用户可显式断开连接以删除该本地授权记录。

## F-002 持久化约束

- JobPreference 一对一归属 User；四类偏好 targetRoles、targetCities、companyTypes、technicalFocus 以字符串数组保存。
- AgentRun 归属 User 与 Application；type 为 JOB_EVALUATION，status 为 PENDING、RUNNING、SUCCEEDED、FAILED。
- AgentRun.preferenceSnapshot、resumeDigest、output 使用 JSONB。resumeDigest 仅允许保存长度、哈希、提取关键词等不可还原摘要，禁止保存完整简历原文。
- AgentRun.output 保存结构化岗位要求、匹配证据、缺口/风险、匹配分、优先级与准备建议；每次运行创建新记录，不覆盖历史。
- F-002 Mock Provider 必须标识 provider=MOCK、model=local-job-evaluation-v1；不得产生任何外部网络调用或费用。

## F-003 持久化约束

- ApplicationMaterial 仅在用户明确点击保存后创建；一次“生成预览”不创建数据库记录。
- ApplicationMaterial 归属 User 与未软删除的 Application，可选关联本岗位最近一次成功的 AgentRun；同一岗位允许多条独立材料历史。
- 字段至少包含：id、userId、applicationId、evaluationRunId、resumeDigest、aiDraft、content、wasEdited、provider、model、createdAt、updatedAt。
- aiDraft 与 content 使用 JSONB：前者为当次 AI 初稿，后者为用户确认后的内容；wasEdited 由两者结构比较后在服务端计算。
- resumeDigest 只能保存哈希、长度和不可还原的关键词摘要；禁止保存完整 resumeText。ApplicationMaterial 不存文件、PDF、HTML 或完整简历版本。
- F-003 Mock Provider 必须标识 provider=MOCK、model=local-application-materials-v1，且不发起外部网络请求。

## F-004 简历版本持久化约束

- Resume 一对一归属 User；userId 全局唯一，代表当前用户主动保存的唯一基础简历资产。
- ResumeVersion 归属 Resume，类型为 BASE 或 TARGETED；BASE 只能作为该 Resume 的首个版本创建一次，TARGETED 可选关联未软删除的来源 Application。
- ResumeVersion 保存 aiDraft、content、changeSummary、wasEdited、provider、model、createdAt；content 为用户明确保存的完整纯文本简历，历史版本不可原地更新。
- 用户每次编辑或定制后只能创建新的 ResumeVersion；基础版本与既有定制版本永不覆盖。
- 只有 F-004 的显式“保存基础简历/另存版本”动作允许持久化完整简历文本；F-002/F-003 继续禁止持久化 resumeText。
- F-004 Mock Provider 必须标识 provider=MOCK、model=local-resume-optimization-v1，不发起外部网络请求。

### 基础简历替换规则（2026-08-11 确认）

- BASE ResumeVersion 是唯一的当前基础内容；用户明确重新保存时直接更新该记录的 name/content，不保留旧基础副本。
- TARGETED ResumeVersion 仍为不可变历史，基础内容替换不修改、不删除任何定制版本。

## F-005B 网申资料档案持久化约束

- ApplicationProfile 一对多归属 User；每份档案必须有用户可识别的 name，同一用户内 name 唯一，并可用 targetTags 标记前端、AI 前端、Agent、国央企或大厂等使用方向。
- 分类字段使用 JSONB 保存，结构由服务端 Zod 契约限定；不得接受或保存 userId、页面 DOM、Cookie、浏览历史、完整简历原文、密码、验证码、证件号或银行卡号。
- basics 仅允许姓名、手机号、邮箱和所在城市；教育、工作、项目及其他经历只包含用户显式填写的结构化字段。
- 档案仅由工作台显式保存 API 创建或更新；插件不得直接绕过 API 写入。

## F-006 通用个人资料与继承约束

- PersonalProfile 一对一归属 User，`userId` 唯一；其 `basics` 与 `educations` 使用 Zod 约束的 JSONB 存储。
- 通用 basics 允许 fullName、countryRegion、gender、email、birthDate、wechatId、targetCities、documentType、phone、politicalStatus；禁止 documentNumber、bankCard、password、verificationCode、pageFormValues 和完整简历正文。
- ApplicationProfile.basics 是基础信息的可选覆盖 patch；resolvedBasics 由 PersonalProfile.basics 与非空覆盖字段合成。ApplicationProfile.educations 非空时是整组覆盖，为空时继承 PersonalProfile.educations。
- 现有 ApplicationProfile 记录不迁移或删除；既有 basics/educations 保持为覆盖数据。所有读取与填写使用 resolved 数据，所有更新仅由用户显式保存触发。

## F-009 AI Provider 设置约束

- AiProviderSetting 一对一归属 User，仅保存 provider、baseUrl 与 model；不得保存 API Key、完整简历、页面 DOM 或表单值。
- Provider Key 只来自服务端环境变量：DeepSeek 使用 `DEEPSEEK_API_KEY`，其他兼容服务使用 `OPENAI_API_KEY`，可选通用回退为 `AI_API_KEY`；禁止把一个具名 Provider 的凭据转发给另一个 Provider。它们永远不进入 Prisma、HTTP 请求/响应、前端状态、扩展或日志。
- 现阶段所有 Agent Provider 仍为 Mock；真实 Adapter 只能从服务端设置服务读取元数据和环境变量 Key，不能从 Agent 输入读取凭据。

## F-011 候选人资料层次约束

- `PersonalProfile` 是每个 User 唯一的个人主档案，保存稳定事实、教育主记录、证件资料和紧急联系人；该资料不等同于 Resume，也不按求职方向复制。
- `ApplicationProfile` 在产品中展示为“网申档案”，只保存投递策略（方向、地点、薪资、到岗时间、招聘来源、内推码）和可选 `resumeVersionId`。它不再是个人固定资料或完整经历的副本。
- `ResumeVersion` 是对外展示的简历版本；一个网申档案最多关联一个默认 ResumeVersion，该版本必须归属当前 User 的 Resume。缺少默认版本不影响网申档案保存。
- 用于表单填写的 resolved view 同时提供 `localFacts` 与 `aiContext`，两者均基于用户明确保存的完整主档案、网申策略和默认简历版本；任何视图均不含页面已有输入、Cookie 或其他浏览器状态。
- 旧 ApplicationProfile 的 basics、educations 和经历 JSON 作为兼容覆盖数据保留，迁移不得删除或推断性重写它们。

## F-023 素材库与组合文档约束

- `PersonalProfile.basics` 与 `PersonalProfile.educations` 是基础事实唯一可写来源。教育记录显式允许可选 `gpa`；不得从简历或经历文本推断 GPA。F-006 的 ApplicationProfile basics/educations 覆盖与 F-004 BASE 原地替换仅用于读取存量数据，F-023 新写入不得再创建覆盖值或原地更新历史版本。
- `MaterialCard` 一对多归属 User，字段包含 type、title、tags、facts、archivedAt、legacySourceKey、createdAt、updatedAt。type 为 PROJECT、INTERNSHIP、WORK、CAMPUS、AWARD、SKILL、SELF_EVALUATION、CUSTOM_ANSWER；实习与正式工作不得共用同一类型。
- 经历类卡片的可选时间存入 `facts.startDate` / `facts.endDate`（`YYYY-MM`，在职/在读可用 `至今`）。`facts` 是系统结构化存储，不要求用户编辑 JSON。`tags` 仅用于搜索、岗位匹配和影响范围筛选，默认不渲染到简历正文。
- 类型化经历还可保存 `facts.role`、`facts.organization` 与 `facts.techStack[]`。项目/实习/工作模板按“标题；角色 | 组织 | 时间；技术栈；成果要点”渲染；冒号前的短成果标签可确定性加粗，旧卡缺少字段时安全省略。
- `MaterialCardVariant` 归属一张 MaterialCard，包含 name、content、createdAt；variant 创建后不可更新或删除。修改文案必须创建新 variant。归档卡片不进入新引用候选，但历史引用仍可读取。
- `ApplicationProfile` 是档案身份与策略容器；`ApplicationProfileVersion` 保存不可变的结构化区块与创建时间。ApplicationProfile.currentVersionId 指向当前版本；切换当前版本不得修改历史版本。
- 每个 F-023 `ResumeVersion` 或 `ApplicationProfileVersion` 恰有一个 `DocumentComposition`。composition 保存基础字段 visibility 和渲染配置，不保存基础事实原值。
- `DocumentCardReference` 归属 composition，并固定 cardId、variantId、section、fieldKey、sortOrder、visible、renderRules。variant 必须属于 card；保存后的引用禁止 follow-current。
- `DocumentComposition` 通过 resumeVersionId/applicationProfileVersionId 两个可空外键表达 owner，数据库约束恰有一个非空。version、composition 和 reference 均不可原地更新。
- `ResumeVersion.content` 与旧 ApplicationProfile 分类 JSON 保留为 legacy snapshot；迁移不得删除、重写或据此自动创建卡片。无 composition 的记录由兼容 adapter 读取。
- `DocumentMutationEvent` 是用户可见素材/文档写入的不可变审计记录，包含 userId、type、entityType、entityId、source、idempotencyKey、payload、occurredAt。批量同步的 `(userId, idempotencyKey)` 唯一，重复确认返回既有结果。
- 影响预览、迁移预览、文档解析和导出均不得写数据库。同步确认只为选中的当前文档创建新版本，最多 50 个目标，逐目标返回 created/skipped/failed。

## F-026 面试准备持久化约束

- `InterviewPrepDocument` 一一对应 `ResumeVersion`（`resumeVersionId` 全局唯一），归属 User；只保存用户粘贴的 `jdText`/`extraText`、分部分 `sections`、复盘 `reflection`（均 JSONB，结构由 Zod 约束）与 provider/model；不得保存完整简历文本（从 `ResumeVersion.content` 读取）。
- `sections` 为数组：`{ id, title, content }`，固定覆盖自我介绍（含 30s/1min/2min 版本）、岗位与公司认知、高频问题与回答、项目与实习深挖、专业知识储备、压力题与反问准备。
- `reflection` 为数组：`{ id, date, recordText, extracted: { keyPoints, questions, weaknesses, nextFocus } }`；按日期追加，不覆盖历史复盘。
- 生成与复盘提取均为 preview，不写库；保存与复盘确认写库并创建 `DocumentMutationEvent`（`INTERVIEW_PREP_SAVED` / `INTERVIEW_REFLECTION_MERGED`，entityType=InterviewPrepDocument）。
- AI 输出不做逐条证据强校验；生成指令禁止虚构简历中不存在的经历、技能、公司或数据。
## F-027 教育背景字段扩展

- `PersonalProfile.educations` 新增可选字符串字段：`college`（学院）、`lab`（实验室）、`researchDirection`（领域方向）、`advisor`（导师）；`educationLevel` 即“学历类型”、`major` 即“专业”，保持既有语义。
- 新字段为可选自由文本，不迁移历史记录；写入仍经 Zod `.strict()` 约束，未知字段拒绝。
## F-029 删除操作（硬删除）

- 素材卡片与网申档案支持用户显式、经二次确认的硬删除；删除后数据不可恢复。
- 素材卡片删除：先删除其全部 `DocumentCardReference` 与 `MaterialCardVariant`，再删除卡片本体，并写 `MATERIAL_DELETED` 事件。
- 网申档案删除：先删除其版本的 `DocumentComposition`（引用随之级联删除）与 `ApplicationProfileVersion`，再删除档案本体，并写 `APPLICATION_PROFILE_DELETED` 事件。
- `MaterialCardVariant`/`DocumentComposition` 的“不可原地编辑”约束不变；硬删除属于用户显式移除操作，不受该约束限制。
## F-030 简历版本删除约束

- 仅 `TARGETED` 简历版本可由用户显式确认后硬删除；`BASE` 版本不可删除，仍只允许既有“重存基础简历”流程。
- 删除 TARGETED 版本时：先删除其 `DocumentComposition`（`DocumentCardReference` 随之级联删除），再删除版本本体；关联 `InterviewPrepDocument` 级联删除；`ApplicationProfile.resumeVersionId` 置空；写 `RESUME_VERSION_DELETED` 事件。
- 删除不可恢复；不提供回收站与恢复。
## F-031 面试记录持久化约束

- `InterviewRecord` 映射表 `interview_record`，一对多归属 User；`applicationId` 与 `resumeVersionId` 为可选外键（onDelete: SetNull），其余业务字段全部可空。
- 字段含义：`companyName`/`jobTitle`/`jdText` 为投递记录回填或手工维护的本场快照；`round` 取值 `FIRST`(一面)/`SECOND`(二面)/`HR`(HR面)/`FINAL`(终面)；`interviewAt` 为面试时间；`methodAndAddress` 为会议链接或线下地址；`briefNote` 为单行备注。
- `prepSections` 为 JSONB 数组：`{ id, kind, title, content }`，kind ∈ `KNOWLEDGE`(知识点复习)/`QUESTION_ASK`(提问面试官)/`ROLE_POINT`(岗位针对性准备要点)；`prepNotes` 为本场笔记（含项目问答）文本，两者构成 Tab1 复习内容。
- `review` 为 JSONB 数组：`{ id, date, transcript, extracted: { questionsAsked[], strengths[], improvements[] } }`，按确认时间追加，不覆盖历史复盘；`transcript` 为用户提供的录音文字内容，产品不保存或处理音频文件。
- 生成与复盘提取均为 preview，零写库；保存、复盘确认写库并创建 `DocumentMutationEvent`（`INTERVIEW_RECORD_SAVED` / `INTERVIEW_RECORD_REVIEW_SAVED`，entityType=InterviewRecord）。
- 面试结果取值 `UNDECIDED`(待定)/`PASSED`(通过)/`FAILED`(未通过)/`WITHDRAWN`(放弃)。绑定投递记录且结果发生变更时，服务端按映射常量同步 Application.status 并写 `STATUS_CHANGED` 事件；映射常量集中在服务端，客户端不得自行修改投递状态。
- AI 输入可包含 JD、简历版本 content 与素材卡片（facts/变体摘要），但 InterviewRecord 不得持久化完整简历原文或素材卡片原文，仅保存生成的 prepSections/review 与用户编辑文本。

## F-032 投递链接与插件 resolved context 约束

- `Job.url` 继续作为岗位的唯一投递链接；岗位库导入、插件创建与投递详情编辑均写入同一字段，Application 不增加重复 URL 字段。
- 投递列表的渠道来自 `Application.channel`，投递入口来自关联 `Job.url`。
- 插件 AI 填写上下文是读取时派生的 resolved view，不新增持久化副本：组合网申版本使用 PersonalProfile + blocks/references，legacy 档案使用其全部结构化经历字段、策略与可选 ResumeVersion。
- F-032 不产生新的数据写入类型；插件保存岗位继续由 Application API 创建 CREATE 事件，AI 表单 preview 与话术 preview 均保持零写库。

## F-033 到岗时间策略约束

- `ApplicationProfile.strategy.availableDate` 保持存储于 strategy JSON，不新增列；其语义是用户确认的“可到岗时间说明”，不是必须可解析的日历日期。
- 经 trim 后的空字符串或 null 表示未填写；非空值最多 80 字符。AI 不得从该说明推断用户未承诺的更早到岗时间。

## F-034 表单填写简历回退约束

- ApplicationProfile.resumeVersionId 仍表示显式默认版本且不被自动写入。fill-context 在其为空时可只读派生当前 User 的 BASE ResumeVersion 作为 AI 补充事实来源。
- BASE 回退不创建 ApplicationProfile/ResumeVersion/DocumentMutationEvent，也不改变文档版本关系；仅存在于用户本次明确点击填写所触发的 preview 上下文。
