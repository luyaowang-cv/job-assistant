# F-030 Implementation Plan

## Architecture approach

- 硬删除：仅允许 TARGETED；事务内先删 `DocumentComposition`（引用级联），再删 `ResumeVersion`（`InterviewPrepDocument` 级联、`ApplicationProfile.resumeVersionId` 置空）。
- 复用现有版本历史表格，TARGETED 行加“删除”按钮 + `ElMessageBox.confirm`。

## Contract changes

- `domain-model.md`：TARGETED 版本可硬删除、BASE 不可删除、事件类型。
- `api-conventions.md`：DELETE 端点。

## Implementation sequence

1. Prisma 枚举新增 `RESUME_VERSION_DELETED`，迁移 + generate。
2. 服务层 `deleteResumeVersion`（校验归属与 TARGETED，事务删除 + 事件）。
3. 路由 `resumes/[id]/versions/[versionId]/index.delete.ts`。
4. 简历页版本历史加删除按钮与二次确认。
5. 验证：`pnpm prepare`、eslint、typecheck。

## Risks and mitigations

- BASE 误删：服务端 type 校验 + UI 不渲染删除入口。
- 外键顺序：先删 composition 再删 version。