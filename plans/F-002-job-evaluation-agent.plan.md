# F-002：岗位评估与投递准备 Agent — Implementation Plan

## 1. Architecture approach

F-002 在 F-001 的 Application 详情中增加一个受控、可追溯的评估闭环。Web 页面只提交简历文本和偏好编辑；Nuxt Server Route 调用服务层创建 AgentRun；服务层将完整简历文本保留在内存中，生成不可还原摘要后交给 Provider Adapter。MVP Provider 是本地 Mock，实现稳定结构化结果且不产生网络调用。

```text
Application Detail + resumeText + JobPreference
→ Zod validation
→ create RUNNING AgentRun (resumeDigest only)
→ LangGraph job-evaluation graph
   → parse JD → compare preference → map resume evidence
   → identify gaps → decide priority → prepare advice
→ Mock JobEvaluationProvider
→ persist SUCCEEDED / FAILED AgentRun
→ return latest result and display history
```

LangGraph 图的节点、状态和 Provider 接口从第一版即保持真实 LLM 可替换性；Mock Provider 仅替代最后的模型推理，不改变输入输出契约。

## 2. Contract changes

- Prisma 新增 JobPreference、AgentRun，并为 Application 增加 AgentRun 关系及索引。
- 增加 JobPreference、JobEvaluationResult、AgentRun、运行请求与响应的 Zod Schema。
- 落地 `JobEvaluationProvider` 接口和 `MockJobEvaluationProvider`；Provider 由服务端依赖注入，不接受客户端指定。
- 实现偏好读取/更新、启动岗位评估、读取评估历史四个 API。
- 更新 Application 详情响应或新增前端查询，使评估历史独立按需加载。

## 3. Implementation sequence

1. 按领域契约补充 Prisma Schema、migration 与默认 JobPreference seed。
2. 定义 Zod 输入/输出和结构化评估结果；实现 resumeDigest，确认无完整 resumeText 入库。
3. 实现 AgentRun 与 JobPreference 服务层、事务、归属校验和历史查询。
4. 定义 LangGraph 状态和六个受控节点；实现 Mock Provider 与确定性测试数据。
5. 实现 F-002 API，并覆盖无 JD、无简历、已删除岗位、跨用户和 Provider 失败路径。
6. 在 Application 详情抽屉添加偏好编辑、简历粘贴、运行状态、最新结果和历史记录 UI。
7. 加入测试与 Mock 验收；文档化后续 OpenAI Provider Adapter 替换点，但不加入 Key、不调用外部网络。

## 4. Risks and mitigations

| Risk | Mitigation |
|---|---|
| 将完整简历持久化到 AgentRun | 服务层只接受内存中的 resumeText；持久化前调用摘要函数，测试断言数据库输出不包含原文。 |
| Mock 结果误导为真实 AI | UI 显示“Mock 演示结果”，结果和 AgentRun 标明 MOCK provider。 |
| 后续接入真实 LLM 时重写业务逻辑 | 以固定 Provider Adapter 与 JobEvaluationResult 契约隔离 LangGraph 和服务层。 |
| 模型虚构用户经历 | F-002 结果 schema 要求证据来源；Mock 仅基于词项交集；真实 Provider 后续加入事实校验节点。 |
| Agent 越权写业务数据 | 图只拥有只读岗位、偏好和本次简历输入；禁止写 Application 与外部调用。 |

## 5. Verification strategy

- Migration：空 PostgreSQL 可创建 JobPreference 和 AgentRun；重复 seed 不重复创建默认偏好。
- 服务层：完整简历不出现在 AgentRun 任何持久化字段；同岗位运行两次产生两条记录。
- API：Zod 拒绝空简历、无 JD、无效偏好和已删除岗位；历史按时间倒序且只返回当前 local user 数据。
- Graph/Provider：Mock 输出满足 JobEvaluationResult schema，六类结果完整，provider=MOCK 且测试不发出网络请求。
- UI：详情中能编辑偏好、提交评估、看见 Mock 标识、最新结果和两次历史；失败可重试。
- 工程：lint、typecheck、生产 build 通过；为现有 Zod ErrorDetail 类型问题单独修复并回归 F-001。
