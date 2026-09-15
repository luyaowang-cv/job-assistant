# F-040: 投递看板连续拖拽排序

## Goal

让投递看板独立于列表分页：所有符合当前搜索和筛选条件的投递都在同一组状态列中显示。拖入新阶段的卡片立即排到目标列顶部，并持久化状态，用户无需翻到第 4 页才能看到或推进较早的投递。

## User scenarios

1. 用户有 80 条投递记录时，列表仍按每页 20 条浏览；切换到看板后，80 条记录按状态连续显示，不显示页码。
2. 用户将原本位于列表第 4 页的一条投递拖到“面试中”，目标列立即把该卡片显示在最上方，且该状态刷新后仍保留。
3. 用户在看板搜索公司或按状态筛选时，只显示全部匹配条件的卡片；列表继续使用分页浏览同一筛选结果。
4. 状态保存失败时，看板恢复该卡片原来的阶段和顺序，并给出失败提示。

## In scope

- `GET /api/v1/applications` 新增经 Zod 校验的 `view=kanban` 查询模式；该模式返回当前用户所有未删除、匹配筛选条件的投递，不应用 `page` / `pageSize` 截断。
- `/applications` 分离列表和看板的数据读取：列表保留既有分页，看板切换时单独获取完整匹配集合。
- 看板拖拽采用乐观更新：卡片从原列移除并插入目标列首位；服务端成功后以返回的 Application 替换本地卡片，失败时恢复原数组。
- 看板模式不显示列表分页器；列表模式继续显示分页器和已有的页码修正规则。

## Out of scope

- 不增加数据库字段、持久化手动排序 rank，或支持同一状态列中的任意手动排序。
- 不改变状态流转 API、ApplicationEvent 审计或软删除规则。
- 不改变列表的每页 20 条默认值、排序控件或分页交互。

## Acceptance criteria

1. `GET /api/v1/applications?view=kanban` 经 Zod 校验后，返回当前用户全部未软删除且匹配 `search`、`status`、`channel` 的记录；响应仍使用 `{ items, page, pageSize, total }`。
2. 普通列表请求继续依 `page` 与 `pageSize` 分页，保留现有默认值和最大页大小约束。
3. 看板切换、搜索、状态筛选、创建、详情保存及删除后，显示完整的当前筛选结果且不展示页码。
4. 在看板拖入新阶段后，卡片立即从原列消失、出现在目标列顶部；请求成功后刷新页面仍属于目标阶段。
5. 保存状态失败时，卡片恢复到原阶段和原有排序，不丢失其他卡片。
6. `pnpm test:applications`、`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过。

## Affected contracts

- `specs/contracts/api-conventions.md`
- `specs/contracts/domain-model.md`

## Risks and open questions

- 看板模式读取完整匹配集合，适合本地单用户投递管理；未来若记录量达到性能阈值，应改为按状态的游标加载，而不是重新将看板绑定到列表分页。
- 因本次不持久化列内 rank，目标列顺序由 `Application.updatedAt` 降序决定；一次状态变更会自然让卡片在后续读取时保持顶部。

## Verification results

- 2026-08-27：`pnpm test:applications`（2 项）、`pnpm typecheck`、`pnpm lint`、`pnpm build` 全部通过。
- 已重启本地生产服务并验证 `GET /api/v1/applications?view=kanban` 返回 77 条记录，`page=1`、`pageSize=77`、`total=77`，确认看板不再受 20 条分页限制。
