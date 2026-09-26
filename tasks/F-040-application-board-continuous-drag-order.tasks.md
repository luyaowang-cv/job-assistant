# F-040 Tasks

- [x] T-001: 更新功能、API 与领域契约，明确列表分页和完整看板查询的边界。 Verify: 契约覆盖全部验收条件。
- [x] T-002: 扩展 Application 查询 schema 和服务层，支持 `view=kanban` 完整读取。 Verify: `pnpm test:applications` 通过。
- [x] T-003: 拆分投递页的列表与看板数据加载，并仅在列表展示分页控件。 Verify: typecheck 通过。
- [x] T-004: 实现拖拽目标列首位乐观排序、成功回填与失败回滚。 Verify: lint 通过且实现满足拖拽验收条件。
- [x] T-005: 运行完整质量检查并记录结果。 Verify: typecheck、lint、build 均通过。
