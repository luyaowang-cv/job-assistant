# F-037 Tasks

- [x] T-001: 投递列表请求接入 `page` 和 `pageSize`。Verify: API 请求参数与响应分页元数据一致
- [x] T-002: 分页组件只保留上一页、页码、下一页。Verify: 不渲染 total 与 sizes 组件，每页固定 20 条
- [x] T-003: 筛选、排序、创建和删除流程维护有效页码。Verify: 条件变化回到第 1 页，删除末页记录不落入空页
- [x] T-004: 完成静态检查、构建和服务验证。Verify: typecheck、lint、build 与分页 API 验证通过

## Verification

- 49 条投递记录分页结果：第 1 页 20 条、第 2 页 20 条、第 3 页 9 条
- 分页布局固定为 `prev, pager, next`，不包含 total、sizes 或 page-sizes
- `pnpm typecheck`、`pnpm lint`、`pnpm build`: passed
- 生产服务已重启并监听 `http://localhost:3000`
- 按用户要求未使用浏览器自动化
