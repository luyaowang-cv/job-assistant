# F-029 Tasks

- [x] T-001: Prisma 枚举新增 `MATERIAL_DELETED` / `APPLICATION_PROFILE_DELETED`，执行迁移与 generate。 Verify: 通过（迁移 `20260819090740_add_delete_event_types` 已应用，`pnpm db:generate` 通过）
- [x] T-002: 服务层实现 `deleteMaterialCard` / `deleteApplicationProfile`（事务内按外键顺序删除 + 事件）。 Verify: eslint / typecheck 通过
- [x] T-003: 新增 `DELETE /api/v1/material-cards/[id]`、`DELETE /api/v1/application-profiles/[id]` 路由。 Verify: 路由存在；`pnpm prepare` 后 $fetch 类型允许 DELETE
- [x] T-004: 素材库与网申档案页面增加删除按钮与二次确认。 Verify: 页面代码已加入，lint 通过
- [x] T-005: 验证 gate（eslint/typecheck）并更新 spec/tasks 执行记录。 Verify: 命令全部通过

执行记录（2026-08-19）：

- 实现硬删除：素材卡片删除时先删 `DocumentCardReference` 与 `MaterialCardVariant` 再删卡片，写 `MATERIAL_DELETED`；网申档案删除时先删版本的组合文档与版本再删档案，写 `APPLICATION_PROFILE_DELETED`。
- 两个页面均已加“删除”按钮与 `ElMessageBox.confirm` 二次确认。
- 验证：改动文件 eslint 通过；`pnpm prepare` 重新生成 Nuxt 类型后 `pnpm typecheck` 全量通过。
- 未跑 production build（按用户要求）；手动冒烟删除流程待用户在页面上验证。