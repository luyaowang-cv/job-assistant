# Agent 工具契约（v0）

## F-025 真实简历 Provider

- 岗位评估仅发送公司/岗位名、JD、求职偏好和当次简历文本；材料与整份优化仅发送 JD、简历文本及可选评估结果。
- 卡片改写仅发送用户本次选择的 card/variant、对应 facts 与 JD。所有流程禁止发送照片、证件号码、Cookie、DOM、页面已有值和未选素材。
- 当前目标由 AI 设置的 baseUrl/model 决定；API Key 只在共享服务端 Adapter 内使用。结构、网络或鉴权失败不得回退 Mock。
- Provider 只能返回经 Zod 校验的预览；保存材料、简历版本或新 variant 仍需用户显式确认。

## F-024 Agent boundary

- 简历润色 Provider 仅接收本次请求明确列出的 card/variant、对应 facts 和一个已保存岗位 JD；不得读取未选素材、页面 DOM、Cookie、照片二进制或其他应用记录。
- Agent 只返回候选文案、证据引用和风险警告。它无权上传照片、确认 variant、保存 ResumeVersion 或导出 PDF；这些动作必须由用户明确触发。
- F-025 起，用户已明确授权把当次所选卡片、对应 facts 与已保存 JD 发送到 AI 设置中的 OpenAI-compatible baseUrl。Provider 不得扩大读取范围，且失败时不得回退为本地排序器或 Mock。

## F-025 真实 Provider 边界

- 岗位评估只发送公司/岗位名、JD、求职偏好和当次 resumeText；投递材料与整份优化只发送生成所必需的 JD、简历文本及可选评估结果。
- 卡片定向改写只发送请求明确列出的 card/variant、对应 facts 与 JD。所有工作流禁止发送照片、证件号码、Cookie、DOM、页面已有值和未选素材。
- Provider 只返回经 Zod 验证的结构化预览。任何数据库保存、卡片 variant 创建或 PDF 导出仍由用户显式操作触发。
- API Key 只由共享服务端 Adapter 读取并用于 Authorization；不得进入 Agent state、输入输出、日志或 Prisma。

## 允许的工具

| Tool | Side effect | Confirmation |
|---|---|---|
| searchApplications | none | no |
| getApplication | none | no |
| getDashboardMetrics | none | no |
| createApplicationDraft | draft only | no |
| createReminder | creates record | confirm when ambiguous |
| updateApplicationStatus | updates record | confirm if multiple matches or status is terminal |
| getJobPreference | none | no |
| updateJobPreference | updates current user's preference | no |
| runJobEvaluation | creates AgentRun only | no |
| generateGreeting | creates AgentRun | no |
| generateApplicationMaterialsPreview | none | no |
| saveApplicationMaterials | creates ApplicationMaterial | explicit user confirmation |
| previewResumeOptimization | none | no |
| saveResumeVersion | creates ResumeVersion | explicit user confirmation |

所有工具必须以 Zod schema 定义输入输出，并通过 `userId` 做服务端数据隔离。Agent 不可直接访问 Prisma Client、SQL、环境变量或第三方账号凭据。

F-009 后，真实 Provider Adapter（不是 Agent 工具）可通过受限的服务端设置服务读取当前用户的非敏感 provider 元数据和服务端 `OPENAI_API_KEY`；该 Key 仍不得出现在任何 Agent 工具输入、输出或日志中。

F-010 的 FormFillProvider Adapter 接收已验证的、无页面值的字段 descriptors 与用户主动选择的结构化档案，只能输出限定 fieldId 的建议文本和未解决 id。它不得读取 Prisma、页面、浏览器状态或 Key；外部网络调用仅在 Adapter 内通过 F-009 设置服务完成。

## F-011 工具约束

- FormFillProvider 接收的 AI context 必须由服务端从用户明确保存的完整候选人资料生成；其中不得有页面既有值、Cookie 或浏览器状态。
- 本地确定性填充不是 Agent 工具：它只使用扩展当次取得的 `localFacts` 和页面标签，且不得将资料写入扩展存储或日志。
- Agent 只可使用主档案中已有的证件号码、紧急联系人等事实，不能猜测、衍生或编造任何个人资料。

## F-002 工具约束

- `runJobEvaluation` 输入为 applicationId、当次 resumeText 与 JobPreference；resumeText 仅在运行内存中使用，持久化前必须转换为不可还原摘要。
- 工具读取范围仅限当前用户未软删除的 Application、关联 Job/Company 和当前用户偏好。
- 输出必须为结构化的 JobEvaluationResult：requirements、evidence、gaps、matchScore、priority、preparationAdvice。
- `JobEvaluationProvider` 通过共享 OpenAI-compatible Adapter 调用当前配置模型；业务工作流不得直接读取 Key、Prisma 或外部 MCP/Plugin。
- 工具不得创建 Application、修改 Application 状态、更新 Job、发送消息或生成话术。

## F-003 工具约束

- `generateApplicationMaterialsPreview` 输入为 applicationId 和本次 resumeText；只读当前用户的岗位/JD、可选成功岗位评估与临时简历文本，返回材料初稿但不写数据库。
- 输出固定含简历修改建议、可复制改写段落、短版/标准版/技术亮点版打招呼话术；每项都必须附带可识别的 JD 或简历事实依据。
- `saveApplicationMaterials` 只能由用户点击保存后调用；输入为经 Zod 验证的 AI 初稿与用户确认内容，写入 ApplicationMaterial，不修改 Application、Job、简历文件或外部消息。
- Provider 仅可经共享 Adapter 发起已授权模型请求；完整 resumeText 仅存在于生成调用内存中。

## F-004 工具约束

- `previewResumeOptimization` 只读用户已明确保存的基础简历、指定岗位 JD 和可选岗位评估，返回完整定制草稿、修改摘要与事实依据，不创建 ResumeVersion。
- `saveResumeVersion` 必须来自用户明确点击；只创建新的不可变版本，不能更新或覆盖 BASE/历史版本，也不修改 Application。
- Agent 不得自动保存完整简历、上传文件、导出文件或发送消息；真实 Provider 仅在内存中处理已授权的基础简历和 JD。

- 基础简历的直接替换属于用户明确的站内保存操作，不属于 Agent 自动动作；TARGETED 历史版本仍不得覆盖。

## F-023 工具约束

- 第一阶段不新增 Agent 写工具。素材 CRUD、版本保存、迁移确认、批量同步和导出均为用户显式站内操作。
- 未来只读工具只能接收用户在当次操作明确授权的 cardId/variantId，并通过服务层验证归属；不得枚举未授权卡片。
- Agent 不得创建/修改卡片或 variant，不得选版本、修改 composition、保存/同步/导出，也不得推断或编造候选人事实。
- 候选文案只能作为未保存预览并保留事实依据；保存仍需用户明确确认并创建 immutable variant/event。
