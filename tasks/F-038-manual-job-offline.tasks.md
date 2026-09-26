# F-038 Tasks

- [x] T-001: 增加手动下线字段、事件类型和迁移。Verify: Prisma validate/generate/migrate 通过
- [x] T-002: 实现事务性手动下线服务与 API。Verify: Job 更新与审计事件在同一事务中写入
- [x] T-003: 默认查询排除两类下线岗位且保留地点包含匹配。Verify: 北京筛选返回记录的不匹配数为 0，默认结果无下线项
- [x] T-004: 操作列仅保留依次排列的下线、加入面板按钮。Verify: 两个按钮使用相同 `small` 高度、按文案自适应宽度、保持单行且阻止行点击冒泡
- [x] T-005: 完成测试、静态检查、构建和服务验证。Verify: jobs tests、typecheck、lint、build 与健康检查通过

## Verification

- Prisma format、validate、generate、migrate deploy: passed
- `pnpm test:jobs`: 6 passed, 0 failed
- `pnpm typecheck`、`pnpm lint`、`pnpm build`: passed
- 岗位库操作列无“查看”按钮，按钮顺序为“下线 → 加入面板”；高度一致、宽度按文案自适应且文字不溢出
- `location=北京`: total 556，前 100 条中不包含“北京”的记录为 0
- 默认岗位查询前 100 条中来源/手动下线记录为 0
- 新增下线端点对不存在 Job 返回 404；未改动真实岗位数据
- 生产服务已重启并监听 `http://localhost:3000`
- 按用户要求未使用浏览器自动化
