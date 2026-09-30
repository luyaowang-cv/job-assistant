# F-046 Implementation Plan

## Architecture approach

**发信 = 通用 SMTP + 一个永不抛错的发送函数。** 新增 `server/lib/mailer.ts`，惰性创建 nodemailer transporter（首次调用才读环境变量，避免构建期无 SMTP 配置就报错），`sendMail()` 内部吞掉所有异常只返回结果对象——因为 better-auth 的 `sendOnSignUp` 会让注册请求同步等待发信，SMTP 抖动绝不能让注册接口 500。选 nodemailer 而非某家 SDK，是为了让代码服务商无关（换服务商只改环境变量）。

**邮箱验证不设门禁。** `requireEmailVerification: false`，改用软提醒：`middleware/auth.ts` 把 session 自带的 `emailVerified` 注入 `event.context.user`（零额外查询），前端在顶栏显示提醒条。这样现有账号（含所有者）一个都不会被锁。

**限流从内存改为数据库。** better-auth 在生产环境默认已开启限流，但 `storage` 默认是 `memory`——在本项目的 `node-cluster` 多进程预设下每个 worker 各存一份、重启清零，等于没有。改为 `storage: 'database'` 需要新增一张 `RateLimit` 表。同时必须配 `advanced.ipAddress.trustedProxies`：Caddy 的 `reverse_proxy` 是**追加**而非覆盖 `X-Forwarded-For`，不配信任网段时，一个伪造的 XFF 头就能让所有人都落进同一个限流桶，导致全站登录被锁。

**收信 = 地址即身份，Cloudflare 只做转发不做解析。** 每个用户一条 `InboundAddress`（`userId @unique`，与 `FeishuConnection` 同款设计），地址形如 `u-<32位hex>@inbox.offerscoming.cn`。Cloudflare Email Worker 只做三件事——读邮件头、读原始 MIME 并截断、签名后 POST 到站点——**MIME 解析放在服务端**：免费版 Worker 的 CPU 限额只有 10ms，边缘解析不可靠；服务端解析好调试，改解析逻辑也不用重新部署 Worker。

**webhook 走独立前缀 `/api/inbound/email`，靠 HMAC 自鉴权。** 故意不放 `/api/v1/` 下——那里有强制会话守卫，而外部系统不可能带会话。签名串是 `${timestamp}.${rawBody}`，**先验签再解析**，配 5 分钟时间戳窗口与 `timingSafeEqual` 定长比较；重放由 `(userId, messageId)` 唯一约束兜底。

**邮件 HTML 一律在空 sandbox iframe 中渲染。** 只要知道收件地址，任何人都能往收件箱投递 HTML，因此禁止 `v-html` 直出。

## Contract changes

- `specs/contracts/api-conventions.md`：新增 F-046 段，覆盖邮件认证端点、`429` 限流语义、`/api/v1/email/health`、收件箱用户侧接口清单、`/api/inbound/email` 的 HMAC 鉴权与状态返回约定。
- `specs/contracts/domain-model.md`：新增四张表的约束说明；修订 F-042 段末尾"不包含邮箱验证、找回密码、限流"的表述（自 F-046 起已实现）；沿用既有约定——任何接口、日志、前端状态不得出现明文凭据，本功能新增的 SMTP 密码与 webhook secret 同样适用。

## Implementation sequence

1. **契约先行**：修订上述两份契约文档。
2. **阶段 1 基础设施**：加 `nodemailer` 依赖并同步 lock；`RateLimit` model + 迁移；`mailer.ts`、`email-templates.ts` 及单测。
3. **阶段 1 接线**：`auth.ts` 全量配置（验证钩子、重置钩子、限流规则、可信代理、后台任务）；`middleware/auth.ts` 页面白名单改集合 + 注入 `emailVerified`；`current-user.ts` 同步字段。
4. **阶段 1 前端**：三个公开页面 + 登录页入口 + `use-session.ts` 扩展 + 顶栏软提醒。
5. **阶段 1 运维**：管理员 SMTP 健康检查端点；`auth-bootstrap.ts` 补验证标记；环境变量文档；**补生产数据库迁移流程**（`db:migrate:deploy` 脚本 + db 回环端口 + SSH 隧道，写进 `docs/deploy.md`）。
6. **阶段 2 数据与服务**：三个新 model + 迁移；`inbound-signature.ts`；`inbound-address.service.ts`；`inbound-email.service.ts`；zod schema。
7. **阶段 2 接口**：`/api/inbound/email` webhook；`/api/v1/inbox/**` 六个路由（一律用 `findFirst({ where: { id, userId } })` 从查询层杜绝越权）；每日清理 plugin。
8. **阶段 2 前端与运维**：收件箱列表页与详情页；导航与面包屑（`currentMeta` 需改前缀匹配）；本地模拟投递脚本；Cloudflare 子域名 + Worker + catch-all 配置。
9. **验证与文档**：跑全套质量检查，逐条核对验收标准并回写 spec；更新 `README.md`。

## Risks and mitigations

- **SMTP 故障连坐注册**：`sendMail()` 永不抛错 + 用 `advanced.backgroundTasks.handler` 把发信挪到后台，注册响应不被 SMTP 延迟拖慢。
- **限流桶被伪造头污染**：配 `trustedProxies`，并在验收时检查限流记录的 key 不出现 `no-trusted-ip`。
- **邮件打爆 2G 内存**：三层截断（Worker 出网前 → 路由层读 body 前判 content-length → 字段级字符上限），附件只存元数据，`NODE_OPTIONS` 限制 node 堆。
- **`node-cluster` 下重复执行**：mailer 的每进程单例是**设计意图**（每 worker 一个 SMTP 连接池）；清理 plugin 用 `globalThis` 单例守卫；`deleteMany` 天然幂等，重复执行无害。
- **Cloudflare 可能接管主域名 MX**：已确认主域名当前无 MX；改完立刻比对 DNS，兜底方案是换独立域名。
- **webhook secret 两处副本易失配**：写进运维文档作为部署检查项，这是"邮件不进来但服务器无日志"这类最难查故障的唯一成因。
- **在途验证链接失效**：验证 token 是无状态 JWT，换 `BETTER_AUTH_SECRET` 会使已发链接作废；有效期 1 小时，运维文档注明。

## Verification strategy

- 单测：`sendMail` 在假 transport 抛错时返回失败态而**不抛异常**；邮件模板纯函数产出；签名模块在篡改一字节 / 时间戳过期 / 缺头时的三种分支；地址 token 生成与解析往返一致；投递服务的幂等、截断、未知收件人与停用态分支。
- 无需外部依赖的端到端：本地以 `MAIL_DEV_LOG_ONLY=true` 跑通注册 → 验证 → 找回密码全链路；用模拟脚本覆盖 webhook 的正常、伪造签名、过期时间戳、超大 body 四类请求。
- 需要真实环境的：Gmail 与 QQ 双端收信检查 SPF/DKIM/DMARC；Cloudflare 子域名启用后比对主域名 MX 未变；真实邮件经转发后进列表。
- 安全核对：跨用户越权返回 404；邮件 HTML 内的脚本与顶层跳转均不执行。
- 质量门：现有测试套件 + `pnpm typecheck` / `pnpm lint` / `pnpm build` 全绿。
