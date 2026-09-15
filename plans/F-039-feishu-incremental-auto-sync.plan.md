# F-039 Implementation Plan

## Architecture approach

首次手动同步仍通过完整 Bitable 读取建立本地基线，并按 `userId + sourceDocId` 保存 `FeishuJobSyncSource`。后续同步调用飞书 `records/search`，请求自动字段并以持久化的最近成功时间减一分钟为下界，仅导入修改过的记录。导入器显式区分 FULL 与 INCREMENTAL：只有 FULL 可以对未见来源记录写入 `offlineAt`；两种模式都不接触 `manualOfflineAt`。

一个 Nitro server plugin 根据固定的 `Asia/Shanghai` 08:00 计算下一次执行时间。它在启动时检查是否错过当天的时点，并对已配置的 Bitable 数据源补跑一次。数据库中的同步占用字段避免定时器与用户点击并发执行同一来源。

## Contract changes

- 增加 `FeishuJobSyncSource`，保存来源标识、展示链接、来源类型、最近成功/自动同步/尝试时间、错误和同步占用状态；不保存令牌。
- 增加 `DocumentMutationType.JOB_LIBRARY_SYNCED`，记录每次成功同步的统计和触发来源。
- `POST /api/v1/jobs/imports/feishu` 的成功数据增加 `mode` 与 `cutoffAt?`；`GET /api/v1/integrations/feishu` 增加 `autoSync` 只读状态。

## Implementation sequence

1. 更新 feature、领域和 API 契约及可验证任务清单。
2. 添加 Prisma schema/migration，生成 Prisma client。
3. 重构飞书读取/导入服务，支持完整与基于 Bitable 自动更新时间的增量同步，持久化数据源与审计事件。
4. 添加每日 08:00 调度插件与启动补跑。
5. 扩展飞书状态 API 和岗位页同步反馈。
6. 添加纯逻辑测试，运行全量质量检查；移除 Windows Node SSR 服务不需要的根路径静态预渲染，避免其阻断常驻服务构建。

## Risks and mitigations

- 飞书时间筛选的临界写入：使用一分钟回看窗口和幂等本地更新。
- 授权过期：记录不含敏感数据的错误摘要，保留上次成功时间，并在页面提示重新授权。
- 多个执行入口：使用来源级数据库占用；超时占用允许后续任务恢复。
- 服务停止：启动后检查当天是否漏跑，避免等到次日。

## Verification strategy

- 单元测试时区调度计算、增量筛选请求体、回看窗口和增量禁止来源下线的规则。
- 在现有岗位 schema 测试中验证新输入/输出的 Zod 边界。
- 运行 Prisma client 生成、岗位测试、typecheck、lint 和生产 build。
