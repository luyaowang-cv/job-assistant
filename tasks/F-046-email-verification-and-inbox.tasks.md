# F-046 Tasks

> 任务按依赖顺序排列，一次只进行一项。T-001 ~ T-010 为阶段 1（认证基建），T-011 起为阶段 2（收信管道）；T-011 依赖 T-010 完成。

## 阶段 1：认证基建（邮箱验证 + 找回密码 + 限流）

- [x] T-001: 修订契约：`api-conventions.md` 新增 F-046 段（邮件认证端点、`429` 限流语义、`/api/v1/email/health`、收件箱接口清单、`/api/inbound/email` 鉴权与返回语义）；`domain-model.md` 新增四张表约束并修订 F-042 段末尾"不包含邮箱验证、找回密码、限流"的表述。 Verify: 契约覆盖 F-046 全部验收条件，无与 F-042/F-043 的冲突。
- [x] T-002: 加 `nodemailer@^7` 与 `@types/nodemailer@^7`，`pnpm install` 同步 `web/pnpm-lock.yaml`（CI 用 `--frozen-lockfile`，不同步会直接失败）。 Verify: `pnpm typecheck` 通过；`git status` 显示 lock 已变更。
- [x] T-003: 新增 `server/lib/mailer.ts`（惰性单例 transporter、`sendMail()` 永不抛错、`verifySmtpConnection()`、测试注入点）与 `server/lib/email-templates.ts`（纯函数 `renderAuthMail`，模板内联为 TS 字符串而非文件——生产镜像只 COPY `.output`，靠 fs 读的文件会丢），附 `node:test` 单测。 Verify: 测试断言假 transport 抛错时 `sendMail` 返回失败态而**不抛异常**、未配置时返回未配置态、`MAIL_DEV_LOG_ONLY` 时打日志不发信。
- [x] T-004: `schema.prisma` 新增 `RateLimit` model（`key` 唯一、`count` Int、`lastRequest` BigInt 并加索引；model 名与字段名必须与 better-auth 内部约定一致），跑 `db:generate` 与 `db:migrate` 生成迁移文件。 Verify: 迁移 SQL 落在 `prisma/migrations/`；数据库里 `lastRequest` 是 bigint 类型。
- [x] T-005: 改造 `server/utils/auth.ts`：接入 `emailVerification.sendVerificationEmail`（`sendOnSignUp: true`，1 小时有效）与 `emailAndPassword.sendResetPassword`（含 `revokeSessionsOnPasswordReset`、`minPasswordLength`）；配置 `rateLimit`（数据库存储 + 按路径额度，热路径豁免）与 `advanced.ipAddress.trustedProxies`；用后台任务把发信挪出请求链路。 Verify: 本地注册后终端出现验证链接；连续超限请求返回 `429`；limiter 记录的 key 是真实 IP 而非 `no-trusted-ip`。
- [x] T-006: `server/middleware/auth.ts` 把页面白名单从单路径判断改为集合（加入三个新公开页面），并把 session 自带的 `emailVerified` 注入 `event.context.user`；`app/middleware/auth.global.ts` 同步放行；`services/current-user.ts` 的 `CurrentUser` 加字段。 Verify: 未登录访问三个新页面返回 200 而非 302；`GET /api/v1/me` 返回 `emailVerified`。
- [x] T-007: 新增 `app/pages/forgot-password.vue`、`reset-password.vue`、`verify-email.vue`（均用 `layout: 'auth'`）；`login.vue` 增加"忘记密码"入口（需拆开现有依赖注册开关的分支）与注册后提示；`use-session.ts` 加 `emailVerified` 与重发验证方法；`layouts/default.vue` 顶栏加未验证软提醒与重发按钮。 Verify: 全流程走通——注册收信、点链接验证、顶栏提醒消失、退出后原密码仍可登录（证明确实不强制）；未验证用户能正常使用；找回密码后可登录且旧密码失效。
- [x] T-008: 新增管理员专用的 `server/api/v1/email/health.get.ts`（返回 SMTP 连通性，**不返回任何凭据**）；`scripts/auth-bootstrap.ts` 建号后置 `emailVerified: true`。 Verify: 非管理员调用返回 403；管理员返回 `{ configured, ok }`；bootstrap 重跑后账号已标记验证。
- [x] T-009: 补生产数据库迁移流程：`package.json` 加 `db:migrate:deploy`；`docker-compose.prod.yml` 的 db 服务加回环端口；`docs/deploy.md` 新增"数据库迁移"一节（备份 → SSH 隧道 → 迁移 → 重启）；`.env.example` 与 compose 同步新增 SMTP 变量。 Verify: 在服务器上按文档跑通一次迁移且可重复执行；`.env.example` 与 compose 的变量清单一致无遗漏。
- [x] T-010: 跑阶段 1 质量检查，对照验收标准逐条核对并回写 spec 的 Verification 段。 Verify: 全部测试、`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；阶段 1 九条验收标准逐条通过。

## 阶段 2：收信管道（专属地址 → Cloudflare → 收件箱）

- [ ] T-011: `schema.prisma` 新增 `InboundAddress`（`userId` 唯一、`token` 唯一、启用开关、接收统计）、`InboundEmail`（含 `@@unique([userId, messageId])` 幂等键与列表分页索引）、`InboundAttachment`（仅元数据），`User` 加两个反向关系；跑 `db:generate` 与 `db:migrate`。 Verify: 复合唯一约束与分页索引均按预期建出。
- [ ] T-012: 新增 `server/lib/inbound-signature.ts`（签名串规范化、HMAC-SHA256、时间戳窗口、`timingSafeEqual` 定长比较）及单测。 Verify: 正确签名通过；正文改一字节返回签名错误；时间戳过期返回陈旧；缺头返回缺失。
- [ ] T-013: 新增 `server/services/inbound-address.service.ts`（128 位熵 token 的生成与解析、按 token 反查用户、重置、启停、投递计数）与 `server/schemas/inbound-email.ts`（webhook 入参、地址启停、列表查询三组 schema）。 Verify: 地址生成与解析往返一致；重置后旧 token 查不到；zod 边界用例（超长、附件超量、未知字段）按预期拒绝。
- [ ] T-014: 新增 `server/services/inbound-email.service.ts`（投递落库含幂等与截断、列表查询只返回预览、详情、删除、按 token 定位、每日清理）。 Verify: 同 Message-ID 灌两次只入库一次；不同用户相同 Message-ID 互不影响；超长正文被截断并标记；未知 token 与停用态分别返回对应状态；清理函数可删除超期与超量记录。
- [ ] T-015: 新增 webhook 路由 `server/api/inbound/email.post.ts`（读 body 前先判 content-length、先验签后解析、失败不打印正文）与本地模拟投递脚本。 Verify: 模拟脚本覆盖正常、伪造签名、过期时间戳、超大 body 四类请求并返回预期状态码；未知收件人返回 200 而非 5xx（避免上游重试放大）。
- [ ] T-016: 新增 `/api/v1/inbox/**` 六个路由（地址读取 / 重置 / 启停、邮件列表 / 详情 / 删除），查询一律带 `userId` 过滤。 Verify: 未登录返回 401；用 A 的会话请求 B 的邮件 ID 返回 404。
- [ ] T-017: 新增每日清理 plugin（照 `plugins/feishu-auto-sync.ts` 的 `globalThis` 单例守卫模式，防 node-cluster 下每个 worker 各起一个定时器）。 Verify: 手动触发清理可删除超期记录；plugin 日志只出现一次。
- [ ] T-018: 新增 `app/pages/inbox/index.vue`（地址卡片 + 复制 + 启停 + 重置二次确认 + 三步转发指引 + 邮件列表 + 空态引导）与 `app/pages/inbox/[id].vue`（元信息 + 正文切换 + 折叠原文 + 附件元数据，HTML 走空 sandbox iframe）；`layouts/default.vue` 加导航入口与 `routeMeta` 并**把面包屑改成前缀匹配**。 Verify: `/inbox/<id>` 的面包屑显示正确而非默认值；正文内的脚本与顶层跳转均不执行。
- [ ] T-019: Cloudflare 侧配置（人工）：确认主域名邮箱现状为基线 → 给子域名启用 Email Routing → 创建 Email Worker 并配置与服务器一致的 webhook secret → 启用 catch-all 指向 Worker → 用真实邮箱验证端到端。 Verify: 主域名 MX 与基线一致；真实邮件经转发出现在收件箱列表。
- [ ] T-020: 跑阶段 2 质量检查，更新 `README.md`（技术栈表与「后续规划」）与 `docs/deploy.md`（收信架构与 secret 双副本的检查项），对照验收标准逐条核对并回写 spec 的 Verification 段。 Verify: 全部测试、`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；阶段 2 八条验收标准逐条通过。
