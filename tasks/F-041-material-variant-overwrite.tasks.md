# F-041 Tasks

- [x] T-001: 更新功能、API 与领域契约，说明显式覆盖及引用影响。 Verify: 契约覆盖所有验收条件。
- [x] T-002: 扩展素材版本输入与服务层 create/conflict/overwrite 行为。 Verify: `pnpm test:materials` 通过。
- [x] T-003: 更新 variants API 路由，返回稳定的冲突或覆盖结果。 Verify: typecheck 通过。
- [x] T-004: 在素材库加入同名确认、覆盖提交与明确成功提示。 Verify: lint 通过。
- [x] T-005: 运行质量检查并记录结果。 Verify: typecheck、lint、build 均通过。
