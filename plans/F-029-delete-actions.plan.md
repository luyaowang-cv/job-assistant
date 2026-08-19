# F-029 Implementation Plan

## Architecture approach

- 硬删除：删除服务内按外键约束顺序先删引用/变体/组合/版本，再删主记录。
- 复用现有路由风格与 `DocumentMutationEvent` 审计；新增事件类型枚举。
- 前端在现有操作区加“删除”按钮 + `ElMessageBox.confirm` 二次确认。

## Contract changes

- `domain-model.md`：素材卡片/网申档案硬删除语义与事件类型。
- `api-conventions.md`：两个 DELETE 端点。

## Implementation sequence

1. Prisma 枚举新增 `MATERIAL_DELETED` / `APPLICATION_PROFILE_DELETED`，迁移 + generate。
2. 服务层：`deleteMaterialCard` / `deleteApplicationProfile`（事务内按序删除 + 事件）。
3. 路由：`material-cards/[id].delete.ts`、`application-profiles/[id].delete.ts`。
4. 页面：素材库与网申档案页删除按钮 + 二次确认。
5. 验证：eslint、typecheck、任务记录更新。

## Risks and mitigations

- 外键约束顺序错误会失败：按 references → variants → card；compositions → versions → profile 的顺序删除。
- 误删：二次确认文案说明不可恢复。