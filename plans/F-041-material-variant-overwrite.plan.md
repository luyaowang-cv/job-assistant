# F-041 Implementation Plan

## Architecture approach

保留 `(cardId, name)` 唯一约束，并在既有 variant POST API 加入显式 `overwrite` 开关。服务层在事务中先按唯一键查找版本：不存在则创建；存在且未授权覆盖则返回冲突；存在且确认覆盖则更新原 variant 的正文，并创建不含正文的审计事件。

前端在调用 API 之前对已加载的卡片版本名称进行精确匹配。发现同名时显示 Element Plus 确认框，说明该操作会更新所有固定引用该版本 ID 的后续读取内容。只有确认后才携带 `overwrite: true` 提交。

## Contract changes

- `POST /api/v1/material-cards/:id/variants` body 从 `{ name, content }` 扩展为 `{ name, content, overwrite?: boolean }`。
- 默认 `overwrite=false` 维持 409 冲突语义；`overwrite=true` 更新同一 variant，并返回 `{ action: 'overwritten', variant, eventId }`。

## Implementation sequence

1. 更新 F-041 feature、API/领域契约及任务清单。
2. 扩展 variant 保存 schema 和服务层的 create/conflict/overwrite 分支，添加 Zod 单测。
3. 更新 variant POST handler，返回稳定状态与 HTTP 状态码。
4. 在素材库保存操作中加入同名确认、覆盖请求及成功反馈。
5. 执行测试、类型检查、lint、生产构建，并记录验证结果。

## Risks and mitigations

- 版本被引用时覆盖可能影响已保存文档的派生视图：确认框明确提示，且只在显式确认后执行。
- 前端数据可能过期：服务端仍以唯一键和 `overwrite` 为最终授权边界，默认拒绝未知的同名覆盖。
- 审计 payload 绝不写入用户文案全文，避免扩大敏感内容的副本。

## Verification strategy

- 单测验证默认冲突、显式覆盖开关以及非法额外字段的 Zod 边界。
- 运行 `pnpm test:materials`、`pnpm typecheck`、`pnpm lint`、`pnpm build`。
