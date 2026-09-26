# F-039 Tasks

- [x] T-001: 更新领域/API 契约，定义来源配置、同步事件及自动同步状态。 Verify: 契约覆盖所有 F-039 验收条件。
- [x] T-002: 新增 Prisma 来源配置和同步事件迁移，生成 client。 Verify: `pnpm db:generate` 通过。
- [x] T-003: 实现完整/增量飞书导入、来源占用和安全的同步状态持久化。 Verify: 增量逻辑单测通过，且增量不会标记来源下线。
- [x] T-004: 实现北京时间每日 08:00 调度与启动补跑。 Verify: 调度时间计算单测通过。
- [x] T-005: 在飞书连接 API 和岗位库页面呈现自动同步状态与增量结果。 Verify: `pnpm typecheck` 通过。
- [x] T-006: 运行质量检查并在 spec 中记录结果。 Verify: jobs test、lint、build 通过。
