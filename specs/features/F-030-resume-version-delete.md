# F-030: 简历版本历史删除

## Goal

为简历版本历史提供“删除”操作：误创建的定制版（TARGETED）可以一键移除；基础版（BASE）作为简历身份来源不可删除。删除采用硬删除并记录事件。

## User scenarios

1. 误创建了某个岗位的定制简历版本 → 在版本历史中点“删除”→ 二次确认 → 该版本及其组合文档从工作台移除。
2. 基础版永远保留删除入口不可用，避免误删简历主资产。

## In scope

- `DELETE /api/v1/resumes/[id]/versions/[versionId]`：硬删除 TARGETED 版本（先删组合文档与引用，再删版本），写 `RESUME_VERSION_DELETED` 事件。
- 简历页版本历史为 TARGETED 行提供“删除”按钮与二次确认。
- `DocumentMutationType` 枚举新增 `RESUME_VERSION_DELETED`。

## Out of scope

- 基础版（BASE）删除与替换（BASE 仍只允许原有“重存基础简历”流程）。
- 软删除、回收站、恢复、批量删除。
- Interview 面试资料/复盘等历史版本管理。

## Acceptance criteria

- AC1 删除 TARGETED 版本后：版本历史不再返回；关联 `DocumentComposition` 与 `DocumentCardReference` 级联删除；关联 `InterviewPrepDocument` 级联删除；`ApplicationProfile.resumeVersionId` 置空；事件 `RESUME_VERSION_DELETED` 已记录。
- AC2 BASE 版本删除返回 404，UI 不显示删除入口。
- AC3 页面删除按钮确认前不执行删除；取消无副作用。
- AC4 不存在或不属于当前用户返回 404；lint/typecheck 通过。

## Affected contracts

- `specs/contracts/domain-model.md`：新增简历版本删除语义与事件类型。
- `specs/contracts/api-conventions.md`：新增 DELETE 端点。

## Risks and open questions

- 删除定制版会同时移除其组合文档与关联面试资料（用户确认不保留历史）。
- 被 ApplicationProfile 引用的版本删除后该档案的默认版本置空，需由用户重新选择。
## 执行记录（2026-08-19）

- 实现完成：`deleteResumeVersion`（仅 TARGETED）、`DELETE /api/v1/resumes/[id]/versions/[versionId]` 路由、简历页版本历史删除按钮与二次确认。
- 迁移 `20260819102112_add_resume_version_deleted_event` 已应用（新增事件枚举值）。
- 验证：`pnpm prepare` 后 eslint 与全量 typecheck 通过；未运行 production build（按用户要求）。
- 删除 TARGETED 版本会级联移除其组合文档与关联面试资料，`ApplicationProfile.resumeVersionId` 置空。