# F-035 Tasks

- [x] T-001: 更新领域/API 契约与 Prisma migration。Verify: `pnpm exec prisma validate` 通过，migration 已应用
- [x] T-002: 扩展岗位导入 schema、字段映射和持久化。Verify: `pnpm test:jobs` 通过
- [x] T-002A: 接入第二个 Wiki 数据源并拆分企业名称中的更新时间。Verify: 单元测试覆盖 Wiki URL 与日期名称解析
- [x] T-003: 扩展 Application 创建/更新 schema 与服务。Verify: `pnpm typecheck` 通过且 UPDATE 事件沿用 changedFields
- [x] T-004: 重构岗位库筛选、列表和详情弹窗。Verify: Vue 类型检查与生产构建通过
- [x] T-005: 重构投递看板筛选、列表和详情抽屉。Verify: Vue 类型检查与生产构建通过
- [x] T-006: 完成代码级视觉、响应式与可访问性检查并记录验证结果。Verify: `pnpm lint`、`pnpm typecheck`、`pnpm build` 通过；按用户要求未使用浏览器自动化
- [x] T-007: 调整岗位库行交互、按钮语义色与侧边导航顺序。Verify: `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过
- [x] T-008: 调整岗位库加入状态文案与等宽样式。Verify: `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过

## Verification results

- `pnpm exec prisma validate`: passed
- `pnpm test:jobs`: 6 passed, 0 failed
- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm build`: passed（仅有既有 Browserslist 数据陈旧与依赖弃用警告）
- 飞书只读导出验证：成功读取工作簿“27秋招含提前批”，共 229 行，目标字段表头完整
- Browser automation: intentionally skipped per user request
