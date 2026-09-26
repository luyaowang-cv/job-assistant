# F-043 Tasks

> 任务按依赖顺序排列，一次只进行一项（T-002 依赖 T-001，T-003 依赖 T-002，以此类推）。

- [x] T-001: 修订契约：`api-conventions.md` 新增 `/api/auth/sign-up/email`、`/api/signup-config`、`/api/v1/me` 与岗位库写接口 403 语义；`domain-model.md` 更新"MVP 用户边界"段为多账号自助注册、Job/Company 全局共享、管理员标记用 `ADMIN_EMAILS`。 Verify: 契约覆盖 F-043 全部验收条件，无与 F-042/F-009 的冲突。
- [x] T-002: 后端注册开关与管理员基础设施：`disableSignUp` 接 `ALLOW_PUBLIC_SIGNUP`；`CurrentUser` 加 `isAdmin`；新增 `requireAdmin()`；`middleware/auth.ts` 注入 isAdmin。 Verify: 开关关闭时 `/api/auth/sign-up/email` 拒绝；`requireAdmin` 对非管理员抛 403、管理员放行。
- [x] T-003: 4 个岗位库写端点加 `requireAdmin()`；新增 `/api/signup-config`（公开）与 `/api/v1/me`（鉴权、含 isAdmin）；更新 `.env.example`。 Verify: 普通用户调下线/删除/导入返回 403 且数据不变，管理员正常；`me` 返回 isAdmin；`signup-config` 返回开关状态。
- [x] T-004: 前端独立登录页与注册：`layouts/auth.vue` + `login.vue` 布局切换 + 登录/注册模式 + `use-session.ts` 加 `signup()`。 Verify: 登录页独立无菜单、风格一致；`ALLOW_PUBLIC_SIGNUP=true` 时可注册并自动登录。
- [x] T-005: `jobs/index.vue` 读取 `/api/v1/me` 的 isAdmin，非管理员隐藏下线/删除/导入。 Verify: 非管理员看不到写操作，管理员可见。
- [x] T-006: 补测试并运行质量检查，逐条核对 F-043 验收标准，在 spec 记录结果。 Verify: 全部测试、typecheck、lint、build 通过；七条验收标准逐条通过。
