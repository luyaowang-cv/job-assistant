# F-037 Implementation Plan

## Architecture approach

在投递看板页面维护 `page` 和服务端返回的 `total`，每页条数固定为 20。列表请求显式传递分页参数，Element Plus 分页组件只展示上一页、页码和下一页并重新请求服务端。筛选和排序通过统一入口回到第一页；删除后根据新总数提前修正页码。

## Contract changes

- 无。复用既有 `GET /api/v1/applications?page=&pageSize=` 契约。

## Implementation sequence

1. 增加分页状态与统一的第一页刷新、页码切换方法。
2. 将分页参数接入投递列表请求及筛选、排序、创建、删除流程。
3. 在列表/看板内容下方增加分页组件。
4. 验证 API 各页数据、类型、Lint、构建并重启服务。

## Risks and mitigations

- 删除最后一页最后一条后请求空页：删除成功后先按 `total - 1` 计算有效末页，再发起刷新。
- 过滤结果页数减少：所有筛选入口先将页码设为 1。

## Verification strategy

- 直接请求 Application API 的第 1、2、3 页，核对 items 数量、page、pageSize 与 total。
- 运行 `pnpm typecheck`、`pnpm lint` 和 `pnpm build`。
- 检查生产服务健康状态；按用户要求不使用浏览器自动化。
