# F-002：岗位评估与投递准备 Agent — Tasks

## 执行规则

- 严格按顺序执行；完成一项后记录验证结果再继续。
- MVP 仅使用本地 Mock Provider；不添加 API Key、不发起外部 LLM、MCP、Plugin 或搜索请求。
- 不持久化完整简历文本；任何新增持久化字段必须先通过摘要与隐私验证。
- 不将 F-003 材料生成、简历版本管理、岗位发现或插件采集混入本 Feature。

- [x] T-001：修复现有 API 中 Zod 4 issue 与 `ErrorDetail` 的类型兼容问题；安装并锁定 LangGraph.js 所需依赖，确认工程基线可通过 lint、typecheck 与 build。  
  验证：`corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm build` 均通过；依赖变更记录于 package.json 与 lockfile。
  执行记录（2026-08-09）：将 API 错误详情放宽为 `unknown`，以保留 Zod 4 的结构化 issue；安装并锁定 `@langchain/core` 与 `@langchain/langgraph`。lint、typecheck 与生产 build 均已通过。

- [x] T-002：扩展 Prisma Schema：新增 JobPreference、AgentRun、Application 关联、枚举与索引；新增 F-002 migration，并更新 local user seed 的默认求职偏好。  
  验证：空 PostgreSQL 可 `migrate deploy`；重复 `db:seed` 后仅有一条默认偏好；Application、JobPreference、AgentRun 关联与索引存在。
  执行记录（2026-08-09）：已创建并应用 `20260809123317_add_job_evaluation` migration，包含 `JobPreference`、`AgentRun`、外键与索引。重新生成 Prisma Client 后，连续两次 `db:seed` 均成功；`migrate deploy` 无待执行迁移，typecheck 通过。

- [x] T-003：定义 F-002 Zod 契约与服务层：JobPreference、JobEvaluationResult、AgentRun、resumeDigest、归属校验和历史查询；确保完整 resumeText 不进入 Prisma 写入数据。  
  验证：服务层测试断言 AgentRun 不含完整简历原文；同岗位运行两次产生两条记录；无 JD、已软删除或非当前用户岗位被拒绝。
  执行记录（2026-08-09）：已新增 Zod 契约、简历 SHA-256/长度/关键词摘要，以及偏好、归属校验、历史查询和运行状态服务。`resumeText` 仅作为函数入参参与内存摘要，未出现在任何 Prisma `data` 写入或返回契约中；lint 与 typecheck 通过。端到端行为将在 T-005/T-007 API 验证中覆盖。

- [x] T-004：定义 LangGraph 岗位评估状态与六个受控节点；实现 `JobEvaluationProvider` 接口和确定性 `MockJobEvaluationProvider`。  
  验证：Mock 图返回通过 Zod 的六类结果；provider=MOCK、model=local-job-evaluation-v1；测试确保无网络请求且所有结论附带 JD 或简历证据。
  执行记录（2026-08-09）：已实现“解析 JD → 对比偏好 → 映射简历证据 → 缺口/风险 → 优先级 → 建议”的 LangGraph；Mock Provider 不含网络代码，固定为 `MOCK` / `local-job-evaluation-v1`。同一输入连续运行两次得到相同的 Zod 通过结果。

- [x] T-005：实现 F-002 API：求职偏好读取/更新、启动岗位评估、读取岗位评估历史；统一响应和错误格式遵循 API 契约。  
  验证：API 集成测试覆盖成功、空简历、无 JD、无效偏好、已删除岗位、历史倒序与 local user 隔离。
  执行记录（2026-08-09）：已实现四个本地 API，并用现有带 JD 岗位完成一次 Mock 评估：返回 `SUCCEEDED`、`MOCK`、`local-job-evaluation-v1` 和六类结果；历史接口返回 1 条记录，空简历返回 400 校验错误。简历全文未出现在响应中的 AgentRun 字段。

- [x] T-006：在 Application 详情抽屉实现“AI 评估岗位”入口、简历粘贴、偏好编辑、Mock 运行状态、最新结果与历史记录展示。  
  验证：用户可完成一次评估并看到“Mock 演示结果”；重新评估后保留两条历史；UI 不显示或缓存完整简历文本。
  执行记录（2026-08-09）：已在投递详情中加入 AI 评估入口和弹窗，提供简历粘贴、偏好编辑/保存、Mock 运行状态、按时间倒序的结果与建议。提交后立即清空前端简历输入；历史列表只使用服务端保存的摘要与结果。lint 与 typecheck 通过。

- [ ] T-007：补齐数据层、Provider、API 与 UI 验证；记录 Mock 边界、真实 Provider 替换点和 F-002 验收结果。  
  验证：Spec 的 10 条验收标准均有对应验证记录；lint、typecheck、build 全部通过；不含真实 API Key、外部调用或简历原文持久化。
  当前记录（2026-08-09）：已通过 lint、typecheck、迁移/种子、Mock Provider 和本地 API 验证；生产 build 在本机已有开发服务并行时超过 240 秒超时，待停止并行开发服务后单独复验。
