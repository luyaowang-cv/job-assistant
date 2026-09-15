# F-042 Implementation Plan

## Architecture approach

**认证层用 better-auth。** 复用现有 `User` 表（追加 better-auth 所需字段，如 `emailVerified` 与密码哈希），新增 `Session`/`Account`/`Verification` 三张标准表；不在 User 之外再建第二套用户表，避免与既有 13 个 `userId` 外键关系割裂。邮箱密码登录、会话 cookie（httpOnly）、密码哈希由 better-auth 内置完成；本次不做邮箱验证。

**当前用户传播用 AsyncLocalStorage。** 现有 40+ 处服务层调用无参的 `getLocalUser()`，为最小化改动，用一个 Nitro 中间件解析会话后把用户写入 AsyncLocalStorage，`getCurrentUser()`（无参）从中读取；未登录抛 401。服务层函数签名不变，只把 `getLocalUser()` 改为 `getCurrentUser()`。

**鉴权守卫。** Nitro 路由中间件覆盖 `/api/v1/**`：公开白名单仅 `/api/v1/auth/**`（better-auth 端点）与健康检查；其余请求无有效会话即返回 `401 UNAUTHENTICATED`。飞书自动同步等无 HTTP 会话的后台任务，改为从库中解析"所有者用户"而非 `getLocalUser()`。

**数据迁移（一次性、幂等、原子）。** 新增 `pnpm auth:bootstrap` 命令：读取 `OWNER_EMAIL`/`OWNER_PASSWORD` 环境变量 → 经 better-auth 创建所有者账号 → 在单事务内把 `local@job-assistant.local` 名下所有 `userId` 指向的数据改挂到新账号 → 删除旧 local user。迁移前强制要求先 `pg_dump` 备份。

**BYOK。** `AiProviderSetting` 增加加密 `apiKey` 字段（复用飞书 OAuth 的服务端 AES-GCM 加密方式，密钥用独立 `AI_KEY_ENCRYPTION_KEY`，缺省回退 `FEISHU_TOKEN_ENCRYPTION_KEY`）。`apiKey()` 改为：优先解密并返回用户自己的 key，为空时回退服务端环境变量。设置接口只返回 `apiKeyConfigured`，永不返回明文。

## Contract changes

- `specs/contracts/domain-model.md`：User 增加认证字段（emailVerified、密码哈希）与 Session/Account/Verification 表；`AiProviderSetting` 增加加密 apiKey；修订 F-009"不得保存 API Key"为"可保存服务端加密的用户自带 Key"；更新"MVP 用户边界"段，说明 F-001 单用户模式被本次鉴权取代。
- `specs/contracts/api-conventions.md`：新增 auth 接口表（登录/退出/当前会话）；新增 `401 UNAUTHENTICATED` 语义与公开接口白名单说明；更新"边界"段，用户身份改由服务端会话取得。

## Implementation sequence

1. 修订上述两份契约文档。
2. 加 `better-auth` 依赖；改 Prisma schema（User 认证字段、Session/Account/Verification、AiProviderSetting.apiKey），生成 migration 与 Prisma client。
3. 实现 better-auth 服务端 handler（`/api/auth/**`）、会话解析与 AsyncLocalStorage 用户上下文。
4. 加 `/api/v1/**` 鉴权中间件（401 守卫 + 公开白名单）。
5. 将全部 `getLocalUser()` 替换为 `getCurrentUser()`，并确保每个数据查询按 `userId` 隔离。
6. 写 `auth:bootstrap` 迁移命令（创建所有者账号 + 数据归属迁移 + 删除 local user），先备份后执行。
7. BYOK：加密字段读写、`apiKey()` 回退逻辑、设置接口与设置页填 Key。
8. 前端：登录/退出页、会话状态、401 跳转、AI 设置页 Key 填写。
9. 补测试，跑 typecheck/lint/build，按验收标准手动验收。

## Risks and mitigations

- **40+ 处替换遗漏**：全局 401 守卫兜底（即使某处漏改也拿不到他人数据）+ 关键读写路径测试覆盖 + 逐文件审查。
- **数据迁移半途失败**：单事务保证原子性；迁移前强制 `pg_dump` 备份；命令幂等（重复执行不重复改挂）。
- **SSR 请求的会话 cookie 转发**：前端数据请求以客户端为主；确需 SSR 透传时用 `useRequestHeaders(['cookie'])`。
- **后台任务无会话**：飞书自动同步等定时任务改为解析所有者用户，避免依赖请求上下文。
- **BYOK 密钥安全**：独立加密密钥、绝不入日志/响应；密钥缺省时清晰报错而非静默失败。

## Verification strategy

- 单元测试：会话解析与 401 守卫、BYOK 加密往返与回退逻辑、数据迁移幂等（用测试库）。
- 现有测试套件 + typecheck + lint + 生产 build 全部通过。
- 手动验收：注册/登录/退出；登录后原有数据条数一致且归属新账号；未登录访问数据接口 401；AI 设置保存 key 后接口不返回明文。
