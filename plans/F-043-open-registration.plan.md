# F-043 Implementation Plan

## Architecture approach

**开放注册 = 一个环境变量。** `server/utils/auth.ts` 把 `disableSignUp: true` 改为 `process.env.ALLOW_PUBLIC_SIGNUP !== 'true'`（未设置即关闭，安全默认）。better-auth 的 `/api/auth/sign-up/email` 接口本身已内置，无需新写注册逻辑。

**独立登录页 = 新布局 + 页面声明。** 现有 `login.vue` 未声明布局，默认套了工作台 `layouts/default.vue`（侧边菜单 + 顶栏）。新建 `layouts/auth.vue`（居中、无侧边菜单，复用工作台的配色 / logo / 字体），`login.vue` 加 `definePageMeta({ layout: 'auth' })` 切过去，并在同一页增加"登录 / 注册"模式切换。

**管理员 = `ADMIN_EMAILS` 环境变量（逗号分隔邮箱）。** `middleware/auth.ts` 解析会话后算 `isAdmin = adminEmails.includes(session.user.email)` 注入 `event.context.user`；`current-user.ts` 的 `CurrentUser` 加 `isAdmin`，新增 `requireAdmin()`（`getCurrentUser()` 后非管理员抛 403 `FORBIDDEN`）。守卫加在 4 个 HTTP 写端点，不放 service 函数，避免破坏飞书后台同步直接调 service 的路径。

**前端开关来源 = 公开只读接口。** 新增 `server/api/signup-config.get.ts`（路径 `/api/signup-config`，不在 `/api/v1` 也不在 `/api/auth`，天然公开）返回 `{ enabled }`，登录页据此决定是否显示"注册"入口。管理员身份经新增鉴权接口 `GET /api/v1/me` 返回 `{ user: { id, email, displayName, isAdmin } }`，岗位库页据此隐藏管理员操作。

## Contract changes

- `specs/contracts/api-conventions.md`：新增 `/api/auth/sign-up/email`（公开注册）、`/api/signup-config`、`/api/v1/me` 三接口说明；岗位库写接口（下线/删除/导入）的 `403 FORBIDDEN` 非管理员语义；修订 F-042 Auth API 段"本次不开放公开注册"的表述。
- `specs/contracts/domain-model.md`：更新"MVP 用户边界"段——自 F-043 起允许多账号自助注册（仍无邮箱验证）；确认 Job/Company 为全局共享、Application 按 userId 隔离；说明"管理员"标记用环境变量 `ADMIN_EMAILS`（User 表无需新增字段）。

## Implementation sequence

1. 修订上述两份契约文档。
2. 后端：`disableSignUp` 接 `ALLOW_PUBLIC_SIGNUP`；`CurrentUser` 加 `isAdmin`、新增 `requireAdmin()`；`middleware/auth.ts` 注入 isAdmin。
3. 后端：4 个岗位库写端点加 `requireAdmin()`；新增 `/api/signup-config` 与 `/api/v1/me`；更新 `.env.example`。
4. 前端：`layouts/auth.vue` + `login.vue` 布局切换与注册模式；`use-session.ts` 加 `signup()`。
5. 前端：`jobs/index.vue` 按 isAdmin 隐藏下线/删除/导入。
6. 补测试，跑 typecheck/lint/build，按验收标准手动验收并在 spec 记录结果。

## Risks and mitigations

- **`ADMIN_EMAILS` 忘配 → 无人能写岗位库**：fail-closed 但会锁死；`.env.example` 写清注释，`.env` 需显式配置所有者邮箱。
- **better-auth 注册后是否自动登录**：不依赖默认行为——注册后统一 `fetchSession()`，拿不到会话再 `login()` 兜底。
- **新用户空数据态报错**：逐页检查空态（画像 null、列表空），必要时补空态提示。
- **全局岗位写权限语义变更**：仅 4 个端点加守卫；`createApplicationFromJob` 与飞书后台同步路径不动。
- **`/api/auth/**` catch-all**：开关接口必须放 `/api/signup-config`，不能塞进 `/api/auth`。

## Verification strategy

- 单测：`requireAdmin` 403 / 放行；`signup-config` 开关读取。
- 现有测试套件 + `pnpm typecheck` / `pnpm lint` / `pnpm build` 全绿。
- 手动验收（对照 F-043 七条验收标准）：开关开启可注册并自动登录、关闭被拒且老用户不受影响；登录页独立无菜单、风格一致；新用户空工作台不报错；共享岗位库可见但投递隔离；未验证邮箱可用；接口不泄露密钥；普通用户写岗位库返回 403、管理员正常。
