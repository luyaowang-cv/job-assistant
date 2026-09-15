# F-042: 用户认证、数据隔离与 BYOK

## Goal

让工作台从"写死单用户"升级为"真实账号登录"，把你现有的全部数据安全迁移到你的登录账号名下，并让 AI 密钥改为用户自带（BYOK）。本次是第一个里程碑，只服务"你自己登录"，不开放公开注册。

## User scenarios

- 你首次打开工作台，看到登录页，用邮箱 + 密码创建并登录你的账号。
- 登录后，你之前的投递、简历、素材、面试记录等全部数据仍然都在（自动挂到你的新账号名下）。
- 未登录时访问任何数据接口返回 401，前端跳转到登录页。
- 你在"AI 设置"里填入自己的 API key，之后 AI 功能（岗位评估、简历优化、面试准备等）使用你自己的 key，而不是服务器环境变量。
- 退出登录后，浏览器无法再访问你的数据。

## In scope

- 邮箱 + 密码认证：登录、退出、会话（httpOnly cookie）。本次不做邮箱验证。
- 用"当前登录用户"替换所有写死的 `getLocalUser()`；所有数据读写按 `userId` 隔离。
- 未登录访问受保护 API 返回 401；仅登录/会话等少数接口公开。
- 一次性数据迁移：把 `local@job-assistant.local` 名下所有数据挂到你的新账号，幂等执行、不丢数据。
- BYOK：`AiProviderSetting` 增加加密的 apiKey 字段；设置页可填写并保存；AI 调用优先用用户自己的 key，其次回退服务器环境变量。

## Out of scope

- 面向陌生人的公开注册入口（本次只提供所有者账号的引导式创建与登录）。
- 邮箱验证、找回密码、第三方 OAuth 登录。
- 限流、配额、防滥用。
- 部署上线（仍用 Tailscale 本地访问）。
- 飞书多用户化（本次仅确保单用户飞书同步不受影响）。

## 后续工作（未纳入本次）

以下能力在本次明确不做，留作后续独立 Feature，启动前仍遵循 Spec → Contracts → Plan → Tasks 流程：

- **开放注册**：面向陌生人的公开注册入口（本次仅所有者账号）。
- **邮箱验证 / 找回密码**：注册校验与忘记密码流程，需接入发信服务。
- **限流与防滥用**：登录接口与 AI 接口的限流、配额。
- **飞书多用户化**：每日定时同步按用户遍历，而非取首个所有者用户。
- **部署上线**：从本地 / Tailscale 访问走向公网（HTTPS、数据库备份策略、Linux 进程守护；需处理 PDF 导出的 Chromium 路径等平台差异）。

## Acceptance criteria

- 能登录、退出；未登录访问受保护 API 返回 401，登录后正常访问；不存在面向陌生人的注册入口。
- 首次登录后，原有数据（投递/简历/素材/面试记录等）条数与改造前一致，且归属新账号。
- 两个不同账号之间的数据互不可见（用第二个账号验证隔离逻辑）。
- AI 设置页能保存 apiKey，存储为加密形态、接口不返回明文；AI 功能使用用户自己的 key。
- 所有现有测试、typecheck、lint、build 通过。

## Affected contracts

- `specs/contracts/domain-model.md`：User 增加认证/会话相关字段（或新增凭证与会话表）；`AiProviderSetting` 增加加密 apiKey。
- `specs/contracts/api-conventions.md`：新增 auth 接口（登录/退出/当前会话）、401 语义、BYOK 设置接口与"不返回明文密钥"约定。

## Verification

- 2026-09-15：已应用 `20260915102546_add_auth_and_byok` 增量迁移（新增 Session/Account/Verification 表、User.emailVerified/image、AiProviderSetting.apiKeyEnc）。
- 2026-09-15：`pnpm typecheck`、`pnpm lint`、`pnpm build`、全量测试（12 个 test 脚本）均通过。
- 2026-09-15：本地起服务冒烟验证——未登录访问 `/api/v1/**` 返回 401；`GET /api/auth/get-session` 返回 null；临时账号登录后访问受保护接口返回 200 且正确返回用户数据。

## Risks and open questions

- better-auth 是复用现有 User 表还是新建独立表，需在 plan 阶段确定，避免字段冲突。
- apiKey 的加密密钥存储与轮换方式需明确（复用现有 `FEISHU_TOKEN_ENCRYPTION_KEY` 还是新增专用密钥）。
- 所有者账号的创建方式（引导式首登 vs 环境变量预置）需在 plan 阶段确定。
- 数据迁移需原子且幂等，避免半迁移导致数据"看不到"。
- 40+ 处 `getLocalUser()` 替换存在遗漏风险，需用测试覆盖关键读写路径。
