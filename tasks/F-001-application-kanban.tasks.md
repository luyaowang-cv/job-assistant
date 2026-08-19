# F-001：投递看板核心 — Tasks

## 执行规则

- 严格按顺序执行；完成一项后记录验证结果再进行下一项。
- 不将 F-002 插件、F-003 Agent、简历优化或面试模块混入本 Feature。
- 每项代码改动必须保留上游来源或本地变更说明。

- [x] T-001：导入官方 Element Plus Nuxt Starter 到 web/，保留上游许可证并记录锁定 commit。  
  验证：已导入提交 `6ecb01e7a0ba3df15f61029df9c51ea31edcce81`；`web/LICENSE` 为 MIT；`docs/research/upstream-provenance.md` 已记录来源。`package.json` 已确认 `pnpm dev` 入口；实际启动验证随 T-002 的依赖安装执行。

- [ ] T-002：确定 Node、pnpm、Nuxt、Element Plus 版本；配置环境变量模板、PostgreSQL Docker 服务和 Prisma 基础依赖。  
  验证：空环境按文档可启动 PostgreSQL；web/ 的 lint、类型检查和 build 通过。

- [ ] T-003：实现 Prisma schema、初始迁移与 local user seed。  
  验证：空数据库迁移成功；重复 seed 后只有一个 local user；核心表存在。

- [ ] T-004：实现 Application Zod Schema、local user 解析和 Application 服务层。  
  验证：服务层可创建 Company、Job、Application；创建操作生成 CREATE 事件；无效输入被拒绝。

- [ ] T-005：实现 Application REST API：列表、创建、详情、编辑、状态更新和软删除。  
  验证：API 集成测试覆盖成功路径、无效输入、状态更新、deletedAt 过滤和 DELETE 事件。

- [ ] T-006：从上游 UI 模式实现默认 Layout、投递列表、空状态和新增投递表单。  
  验证：通过 UI 创建记录后刷新仍存在；列表搜索与状态、公司、渠道筛选正确。

- [ ] T-007：实现 8 列 Kanban、跨列拖拽和状态持久化。  
  验证：拖动后 API 返回新状态；刷新保持；失败请求时卡片回滚并显示错误提示。

- [ ] T-008：实现详情抽屉、字段编辑、ApplicationEvent 时间线和删除确认。  
  验证：编辑后刷新字段不丢失；删除后默认列表不出现，时间线保留 DELETE 事件。

- [ ] T-009：补齐单元、API、UI 验证、错误与加载状态，并回写实际依赖和实现边界到文档。  
  验证：测试、lint、类型检查、生产 build 全部通过；F-001 每条验收标准有对应验证记录。

## 执行记录（2026-08-08）

- T-002：已完成 Node 24.9.0、Corepack pnpm 10.14.0、Nuxt 4、Element Plus、Prisma 7、PostgreSQL 16 Compose 与 `.env.example` 配置。`lint`、`typecheck`、Prisma 引擎与临时开发服务（HTTP 200）已验证。Docker Desktop 未安装，数据库容器待用户安装后实测。
- T-003：已完成 5 张核心表的 Schema、锁定的初始 migration、local user seed 与 Prisma Client 生成；Schema 与客户端生成已验证。真实 `migrate deploy` 和重复 seed 待 PostgreSQL 容器可用后执行。
- T-004：已完成 Zod Application 输入契约、local user 解析及服务层；静态检查通过。服务层事务/事件的数据库集成测试待 T-009。
- T-005：已完成 6 个 Application REST API 路由及成功/失败响应封装；静态检查通过。API 集成测试待 PostgreSQL 容器可用后执行。
- T-006：已完成工作台布局、列表、筛选、空状态和新增投递弹窗；静态检查通过。
- T-007：已完成 8 列看板和原生跨列拖拽的乐观更新/失败回滚逻辑；真实持久化待 API 集成测试。
