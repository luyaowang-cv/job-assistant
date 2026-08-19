# F-003 Implementation Plan

## Architecture approach

Application Detail 的“投递材料”入口打开独立弹窗。用户临时粘贴 resumeText 后请求 preview API；服务端验证岗位归属与 JD，读取可选的最近成功 F-002 AgentRun，并通过 `ApplicationMaterialsProvider` 调用本地 Mock LangGraph。

预览结果仅保留在客户端状态。用户编辑后点击保存，客户端发送 Zod 合法的 AI 初稿和确认内容；服务端计算 `wasEdited` 并创建 ApplicationMaterial。材料历史从数据库倒序读取。resumeText 永不进入 preview 响应、保存请求或 Prisma data。

```text
Application detail + transient resumeText
  → validate / owned application + JD / optional evaluation
  → material graph (suggestions → rewrite → three greetings → evidence guard)
  → Mock draft preview (no persistence)
  → user edits + explicit Save
  → ApplicationMaterial history
```

## Contract changes

- Prisma: ApplicationMaterial、Application 关联、User 关联，以及可选 AgentRun 关联。
- Zod: MaterialDraft、MaterialContent、resumeDigest、preview/save request schemas。
- API: preview、save、history 三个 endpoints。
- Provider: `ApplicationMaterialsProvider`，初期仅有 deterministic Mock Adapter。

## Implementation sequence

1. 扩展 Prisma schema、迁移、生成客户端和本地种子验证。
2. 实现材料 Zod 契约、隐私摘要、归属/JD/可选评估查询、保存与历史服务。
3. 实现 LangGraph 材料状态节点和 Mock Provider；验证无网络调用及事实依据。
4. 实现 preview、save、history API 与错误处理。
5. 在 Application 详情加入“投递材料”入口、预览编辑与保存历史 UI。
6. 覆盖验证、记录 Mock 边界和真实 Provider 替换点。

## Risks and mitigations

- 简历事实虚构：结果 schema 强制 evidence 字段；Mock 仅从输入关键词生成；后续真实 Provider 加事实守卫。
- 预览误持久化：preview 服务不导入 Prisma 写入路径；保存是单独 endpoint。
- 客户端篡改初稿：保存端只接受 schema 合法内容，并明确保存为“用户确认版本”；不将其描述为可信 AI 原始事实。
- F-002 不存在：评估查询为 optional，工作流降级为 JD + 简历模式。

## Verification strategy

- migration deploy、重复 seed、Prisma 生成通过。
- 服务/API 验证空简历、无 JD、软删除/越权岗位、无评估降级、preview 无新增记录、保存两次生成两条历史、wasEdited 正确。
- Mock 测试验证五类输出、固定 provider/model、无网络调用、结果不含完整简历。
- UI 手工验证预览、编辑、保存、历史和中文提示；lint、typecheck、build 通过。
