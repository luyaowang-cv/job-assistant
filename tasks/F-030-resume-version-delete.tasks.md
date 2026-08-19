# F-030 Tasks

- [x] T-001: Prisma 枚举新增 `RESUME_VERSION_DELETED`，执行迁移与 generate。 Verify: 通过（迁移 `20260819102112_add_resume_version_deleted_event` 已应用，`pnpm db:generate` 通过）
- [x] T-002: 服务层实现 `deleteResumeVersion`（仅 TARGETED，事务删除 composition + version，写事件）。 Verify: eslint / typecheck 通过
- [x] T-003: 新增 `DELETE /api/v1/resumes/[id]/versions/[versionId]` 路由。 Verify: 路由存在；`pnpm prepare` 后 $fetch 类型允许 DELETE
- [x] T-004: 简历页版本历史为 TARGETED 行增加删除按钮与二次确认。 Verify: 页面渲染正确，BASE 无删除入口
- [x] T-005: 验证 gate（`pnpm prepare` / eslint / typecheck）并更新执行记录。 Verify: 命令全部通过

执行记录（2026-08-19）：

- 实现硬删除：`deleteResumeVersion` 仅允许 TARGETED；事务内先删 `DocumentComposition`（引用级联）再删 `ResumeVersion`（`InterviewPrepDocument` 级联、`ApplicationProfile.resumeVersionId` 置空），写 `RESUME_VERSION_DELETED` 事件。
- 简历页版本历史表格为 TARGETED 行新增“删除”按钮 + 二次确认；BASE 行不显示删除入口。
- 验证：`pnpm prepare` 重新生成 Nuxt 路由类型后，eslint 与全量 typecheck 均通过。
- 未跑 production build（按用户要求）；页面冒烟待用户验证。