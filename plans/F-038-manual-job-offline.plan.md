# F-038 Implementation Plan

## Architecture approach

使用独立的 `Job.manualOfflineAt` 保存用户判断，不复用会被飞书同步清空的 `offlineAt`。手动下线服务在数据库事务中更新岗位并写入通用变更审计事件。岗位查询默认要求两个下线字段均为空；显示下线时移除此限制。前端操作列使用统一按钮容器和相同的 `small` 尺寸保证等高，岗位操作按钮按文案自适应宽度且不复用投递看板的固定宽度，并通过停止事件冒泡隔离行点击。

## Contract changes

- 新增 `POST /api/v1/jobs/:id/offline`，无请求体，成功返回更新后的岗位下线字段。
- `GET /api/v1/jobs` 的岗位项增加 `manualOfflineAt`。
- Prisma 增加 `Job.manualOfflineAt` 与 `DocumentMutationType.JOB_MANUALLY_OFFLINED`。

## Implementation sequence

1. 更新 API 契约、Prisma Schema 和迁移。
2. 实现事务性手动下线服务及 API。
3. 更新岗位默认查询和筛选候选数据范围。
4. 重组岗位操作列，仅接入下线、加入面板交互；详情继续通过行点击打开。
5. 生成 Prisma Client、执行迁移并完成测试、检查、构建与服务验证。

## Risks and mitigations

- 同步覆盖用户判断：使用独立字段，导入 Upsert 不写该字段。
- 下线最后一页最后一条导致空页：操作成功后按新总数修正当前页。
- 重复下线：服务只接受尚未手动下线的岗位；已下线记录返回当前状态，保持幂等。

## Verification strategy

- 验证 Prisma Schema 与迁移可应用。
- 运行岗位 Schema/导入测试、typecheck、lint 和生产构建。
- 通过 API 验证默认隐藏、`includeOffline=true` 可见；验证地点“北京”仍为包含匹配。
- 按用户要求不使用浏览器自动化。
