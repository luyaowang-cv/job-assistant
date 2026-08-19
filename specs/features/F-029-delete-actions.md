# F-029: 素材卡片与网申档案删除

## Goal

为素材卡片与网申档案补充“删除”操作：误添加的数据可以一键移除。删除采用硬删除（不保留历史引用），操作前有二次确认；优先保证实现简单、快速可用。

## User scenarios

1. 误添加了素材卡片 → 点“删除”→ 二次确认 → 卡片及其变体、引用从素材库与文档中移除。
2. 误创建了网申档案 → 点“删除”→ 二次确认 → 档案及其版本、组合文档从工作台移除。

## In scope

- `DELETE /api/v1/material-cards/[id]`：硬删除卡片（先删引用与变体，再删卡片），写 `MATERIAL_DELETED` 事件。
- `DELETE /api/v1/application-profiles/[id]`：硬删除档案（先删组合文档与版本，再删档案），写 `APPLICATION_PROFILE_DELETED` 事件。
- 两个页面提供“删除”按钮与二次确认框。
- `DocumentMutationType` 枚举新增两个值；Zod/类型检查通过。

## Out of scope

- 软删除、回收站、恢复。
- 删除时的引用影响分析/提示（用户明确选择不保留历史）。
- 批量删除、导出、扩展侧删除。

## Acceptance criteria

- AC1 删除素材卡片后：列表/详情不再返回；其变体与所有 `DocumentCardReference` 一并删除；事件 `MATERIAL_DELETED` 已记录。
- AC2 删除网申档案后：列表/填表上下文不再返回；其版本与关联组合文档一并删除；事件 `APPLICATION_PROFILE_DELETED` 已记录。
- AC3 页面删除按钮在确认前不执行任何删除；取消不产生副作用。
- AC4 不存在或不属于当前用户时返回 404；lint/typecheck 通过。

## Affected contracts

- `specs/contracts/domain-model.md`：新增删除语义与事件类型。
- `specs/contracts/api-conventions.md`：新增两个 DELETE 端点。

## Risks and open questions

- 硬删除会连带移除已保存文档中的引用（用户确认不保留历史）。
- `MaterialCardVariant`/`DocumentComposition` 的“不可变”契约仅针对编辑操作，删除属于用户显式操作，契约同步更新说明。
## 执行记录（2026-08-19）

- 实现完成：两个 DELETE 路由、两个删除服务函数（事务内按外键顺序删除 + 事件）、两个页面删除按钮与二次确认。
- 迁移 `20260819090740_add_delete_event_types` 已应用（仅新增两个事件枚举值，无表结构变化）。
- 验证：eslint 通过、`pnpm typecheck` 全量通过（需先 `pnpm prepare` 重新生成 Nuxt 路由类型）。
- 按用户要求未运行 production build；删除流程的页面冒烟待用户验证。