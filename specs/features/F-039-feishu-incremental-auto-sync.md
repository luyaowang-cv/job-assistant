# F-039: 飞书岗位增量自动同步

## Goal

让已同步的飞书岗位数据源每天北京时间 08:00 自动增量同步，只读取上次同步后修改的记录；同时确保用户手动下线的岗位永远不会因为来源同步重新上线。

## User scenarios

- 用户首次同步一份飞书多维表格后，系统保存该数据源并在每天早上 8 点自动检查更新。
- 用户再次点击同步时，系统只拉取上次成功同步后在飞书中修改的记录，而不是重新遍历整张表。
- 用户手动下线一个岗位后，即使该岗位之后被飞书来源更新，岗位仍保持手动下线。
- 服务在早上 8 点未运行、之后才启动时，当天会补跑一次自动增量同步。
- 飞书授权失效或同步失败时，岗位页面能显示最近一次失败原因，用户可以重新连接后等待下次同步或手动重试。

## In scope

- 在首次完整同步后持久化当前用户的飞书 Bitable 数据源、最后成功同步时间、自动同步状态和最近错误。
- 后续手动与自动同步使用 Bitable 记录的 `last_modified_time` 服务端筛选，并保留一分钟重叠窗口。
- 增量同步仅创建或更新返回的岗位；不得将未返回的旧岗位标记为来源下线。
- 在常驻服务内按 `Asia/Shanghai` 每日 08:00 调度，服务在 08:00 后启动时补跑当天一次。
- 在成功同步后记录一条岗位库同步审计事件，并在飞书连接状态接口暴露只读同步状态。
- 岗位页面展示自动同步时间、数据源数量和最近同步结果。

## Out of scope

- 不支持用户自定义自动同步时间、频率、时区或每个数据源的开关。
- 不为不支持 Bitable 增量查询的 Sheet 导出来源自动执行全量同步。
- 不通过增量同步判断来源删除；来源删除/下线的完整对账不在本功能中执行。
- 不发送桌面、邮件或飞书通知。

## Acceptance criteria

- 已存在 `manualOfflineAt` 的 Job 在任意完整或增量同步后仍保持非空，默认岗位列表继续隐藏它。
- 第一次同步一个 Bitable 数据源时执行完整导入并保存数据源配置；该数据源之后的同步请求使用 `records/search`、`automatic_fields=true` 和 `last_modified_time >= cutoff` 筛选。
- 增量同步只写入其返回岗位，`offlined` 始终为 0，且不读取整张飞书表。
- 每个已配置且可增量读取的数据源在北京时间每天 08:00 自动执行一次；服务器在当天 08:00 后启动且尚未运行当天任务时会补跑一次。
- 同一数据源不会被并发自动/手动同步重复执行；失败会持久化安全的错误摘要，不覆盖最后一次成功时间。
- 成功的手动或自动同步写入 `JOB_LIBRARY_SYNCED` 审计事件，事件不包含 OAuth token 或分享链接。
- 飞书连接状态返回自动同步状态；岗位页面展示该状态。Zod 校验、岗位测试、typecheck、lint 和 build 通过。

## Affected contracts

- `specs/contracts/domain-model.md`：新增 `FeishuJobSyncSource` 与 `JOB_LIBRARY_SYNCED` 审计事件语义。
- `specs/contracts/api-conventions.md`：扩展飞书同步返回值与飞书连接状态的自动同步只读字段。

## Risks and open questions

- 增量筛选依赖飞书 Bitable 的记录自动字段 `last_modified_time`；不支持该查询的 Sheet 导出来源不自动全量拉取，以避免恢复高耗时行为。
- 内嵌定时器要求常驻服务运行；启动补跑覆盖停机期间错过的当天 08:00，但无法在设备完全关机时执行。
- 一分钟重叠窗口可能重复读取极少量记录；本地岗位键的 upsert 使其无副作用，并避免临界时刻漏数。

## Verification

- 2026-08-27：已应用 `20260827080000_add_feishu_incremental_sync` 数据库迁移，并完成 Prisma client 生成。
- 2026-08-27：`pnpm test:jobs`（9 tests）、`pnpm typecheck`、`pnpm lint`、`pnpm build` 均通过。
- 2026-08-27：已重启本地常驻服务，并确认 `GET /api/v1/integrations/feishu` 返回 `autoSync.enabled=true`、`Asia/Shanghai`、`08:00`。
