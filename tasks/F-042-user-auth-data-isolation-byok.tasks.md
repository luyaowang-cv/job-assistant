# F-042 Tasks

> 任务按依赖顺序排列，一次只进行一项（T-002 依赖 T-001，T-003 依赖 T-002，以此类推）。

- [x] T-001: 修订领域/API 契约：User 认证字段与 Session/Account/Verification 表、`AiProviderSetting` 加密 apiKey、401 语义与 auth 接口；更新 F-009"不得保存 API Key"为"可保存服务端加密的用户自带 Key"。 Verify: 契约覆盖 F-042 全部验收条件，且 F-009 冲突已消除。
- [x] T-002: 加 `better-auth` 依赖；改 Prisma schema（User 认证字段、Session/Account/Verification、`AiProviderSetting.apiKeyEnc`）并生成增量 migration 与 Prisma client。 Verify: `pnpm db:generate` 通过，migration 只加表/列、不删既有数据。
- [x] T-003: 实现 better-auth 服务端 handler（`/api/auth/**`）、会话解析与 AsyncLocalStorage 用户上下文，新增 `getCurrentUser()`。 Verify: 能注册/登录拿到会话 cookie，`getCurrentUser()` 读到当前用户，未登录抛 401。
- [x] T-004: 加 `/api/v1/**` 鉴权中间件（401 守卫）；auth 位于 `/api/auth/**`，天然不受守卫。 Verify: 未登录访问任意业务 API 返回 `401 UNAUTHENTICATED`，auth 接口正常。
- [x] T-005: 将全部 `getLocalUser()` 替换为 `getCurrentUser()`，并确保每个数据查询按 `userId` 隔离。 Verify: 全库无 `getLocalUser` 残留；关键读写路径测试通过；两个账号数据互不可见。
- [x] T-006: 写 `auth:bootstrap` 命令：读 `OWNER_EMAIL`/`OWNER_PASSWORD` → 建所有者账号 → 单事务迁移 local user 数据 → 删 local user；执行前强制 `pg_dump` 备份。 Verify: 迁移后数据条数与迁移前一致且归属新账号；重复执行幂等。
- [x] T-007: BYOK：`AiProviderSetting` 加密 apiKey 读写、`apiKey()` 回退逻辑、设置接口只返回 `apiKeyConfigured`。 Verify: 加密往返单测通过；接口不返回明文；AI 功能优先用用户 key。
- [x] T-008: 前端：登录/退出页、会话状态、401 跳转、AI 设置页填 Key。 Verify: `pnpm typecheck` 通过；手动可登录/退出/保存 Key。
- [x] T-009: 运行质量检查并在 spec 记录验收结果。 Verify: 全部测试、typecheck、lint、build 通过，逐条核对 F-042 验收标准。
