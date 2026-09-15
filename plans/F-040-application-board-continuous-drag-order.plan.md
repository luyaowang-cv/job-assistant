# F-040 Implementation Plan

## Architecture approach

复用现有 Application 列表 API，通过显式 `view=kanban` 使服务端在相同筛选条件下省略 `skip` / `take`，返回完整的未删除投递集合。列表视图继续使用分页请求；看板状态单独保存在前端，避免切换看板时仍受当前页的 20 条数据限制。

拖拽时先创建不变的本地数组快照，再将待移动卡片从完整看板集合移除并插到目标状态的首位。服务端状态更新成功后，用返回记录替换该乐观卡片；失败则还原快照。排序不用新增数据库字段，继续利用状态更新触发的 `updatedAt`。

## Contract changes

- `listApplicationsQuerySchema` 接受可选 `view`，取值为 `list`（默认）或 `kanban`。
- `GET /api/v1/applications?view=kanban` 返回完整匹配集合，并返回 `page=1`、`pageSize=items.length`、`total`。

## Implementation sequence

1. 更新 F-040 feature、API/领域契约和可验证任务清单。
2. 扩展 Application 查询 Zod schema 与服务层的看板查询分支，并添加 schema 单测。
3. 拆分投递页面的列表/看板读取、视图切换与分页显示。
4. 实现看板拖拽的目标列顶部乐观排序、成功回填和失败回滚。
5. 运行应用测试、类型检查、lint 与生产构建，记录结果。

## Risks and mitigations

- 完整看板读取在超大数据量下可能变慢：这是本地单用户的当前需求；后续若需要扩展，应采用按状态游标加载，不能恢复为对列表页数据的拖拽。
- 并发更新可能使本地乐观顺序过时：成功响应回填服务端记录，后续搜索、筛选或切换视图始终重新读取服务器结果。
- 失败回滚不能只恢复状态字段：保留整个数组快照以恢复列内顺序。

## Verification strategy

- 单测验证普通列表默认分页、看板查询模式和非法 `view` 的 Zod 边界。
- 运行 `pnpm test:applications`、`pnpm typecheck`、`pnpm lint`、`pnpm build`。
