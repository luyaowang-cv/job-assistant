# 部署与运维手册

本文记录「秋招求职工作台」的生产部署架构与日常运维流程，便于后续功能迭代与故障排查。

## 架构总览

| 项 | 值 |
|---|---|
| 网站 | `https://offerscoming.cn`（Caddy + Let's Encrypt 证书） |
| 服务器 | 香港 VPS（2 核 2G），IP `114.134.185.94`，Ubuntu 22.04 |
| 部署方式 | Docker Compose（`db` + `web` + `caddy` 三个容器） |
| 镜像构建 | GitHub Actions CI → 推送到 `ghcr.io/luyaowang-cv/job-assistant-web` |
| 数据库 | PostgreSQL 16，Docker volume 持久化 |
| 备份 | 每天 3:17 自动备份（本地 + GitHub 私有仓库） |

### 为什么不用 Cloudflare 代理（2026-09-24 变更）

Cloudflare **免费版没有中国大陆节点**，实测大陆用户（电脑走宽带 IPv4、手机走移动 IPv6，两条完全不同的线路）都被路由到**美西**（`colo=LAX` / `colo=SJC`）。请求路径因此变成「中国 → 洛杉矶 → 香港」，比直连香港慢 3 倍以上，且间歇性超时（实测约 40% 的请求要等 8~20 秒才失败）。

香港本身就是离大陆最近的机房（实测 RTT 约 50ms），**任何没有大陆节点的 CDN 都不如直连**。所以改为：

- **Cloudflare DNS 只做解析（灰云 / DNS Only）**，不再代理流量
- **Caddy 在源站终结 HTTPS**，自动向 Let's Encrypt 申请并续期证书
- 代价：失去 CDN 缓存和 DDoS 防护，源站 IP 暴露

如果以后要换回 Cloudflare 代理：把 A 记录点回橙色云，把 `docker-compose.prod.yml` 的 `web` 服务改回 `ports: - "80:3000"` 并删掉 `caddy` 服务，然后 `up -d`。

## 更新上线流程（改完功能后）

1. 本机提交并推送：

   ```bash
   git add <具体文件> && git commit -m "feat/fix: ..." && git push origin codex/unified-career-agent
   ```

   > 不要用 `git add -A` / `git add .`。仓库根目录曾出现过 5MB 的数据库导出 `deploy-data.sql`，
   > 一次全量 add 就会把它推进公开仓库。`.gitignore` 里已补 `*-data.sql` 兜底，但显式列文件更稳。

2. GitHub Actions 自动构建镜像（去 Actions 页等绿勾，或调 API 查）：
   `https://api.github.com/repos/luyaowang-cv/job-assistant/actions/runs?per_page=1`

3. 服务器更新（SSH 登录后）：

   ```bash
   cd ~/job-assistant && git pull && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
   ```

> 注意：只改 `docker-compose.prod.yml` / `Caddyfile` / 环境变量时不用等 CI，直接 `git pull` + `up -d` 即可。改 `web/` 下的代码才需要 CI 重新构建镜像。
>
> 改 `.env` 后必须 `up -d` 重建容器，`restart` 不会重新读取环境变量。

## 数据库迁移

**生产镜像只含 `.output`**——容器里既没有 Prisma CLI 也没有 schema；`db` 服务只绑回环地址，公网连不上。所以迁移要在**本机**通过 SSH 隧道对着服务器上的库执行。

```bash
# 1) 先备份。迁移可能不可逆，这是唯一的退路。
ssh root@114.134.185.94 'bash /root/backup.sh'

# 2) 建隧道：把服务器的 5432 映射到本机 5433（保持这个终端不关）
ssh -N -L 5433:127.0.0.1:5432 root@114.134.185.94

# 3) 另开终端，在仓库的 web/ 目录下应用迁移。
#    密码取自服务器 ~/job-assistant/.env 里的 POSTGRES_PASSWORD。
cd web
DATABASE_URL='postgresql://job_assistant:<POSTGRES_PASSWORD>@127.0.0.1:5433/job_assistant?schema=public' \
  pnpm db:migrate:deploy

# 4) 重启 web 容器，让它用上新的表结构
ssh root@114.134.185.94 'cd ~/job-assistant && docker compose -f docker-compose.prod.yml up -d web'
```

要点：

- 用 `pnpm db:migrate:deploy`（`prisma migrate deploy`）而**不是** `pnpm db:migrate`：后者是 `migrate dev`，会检测 drift、开 shadow database、并交互式询问迁移名，在无人值守场景直接失败。
- `migrate deploy` 幂等，已应用过的迁移会被跳过，可以安全重跑。
- **顺序是先迁移、后上代码**：新代码可能依赖新列，反过来的话会有一小段时间接口报错。

## 备份与恢复

- 备份脚本：`/root/backup.sh`（每天 3:17 cron 自动跑）
- 本地备份：`/data/backups/`（数据盘，保留最近 7 天）
- 异地备份：GitHub 私有仓库 `luyaowang-cv/job-assistant-backup`（`/data/backup-repo`）
- 手动立即备份：`bash /root/backup.sh`

## 关键环境变量

服务器 `~/job-assistant/.env`（不提交 git，需手动维护）：

- `POSTGRES_PASSWORD` / `BETTER_AUTH_SECRET` / `AI_KEY_ENCRYPTION_KEY`（密钥）
- `ALLOW_PUBLIC_SIGNUP=true`（开放注册总开关）
- `ADMIN_EMAILS`（管理员邮箱，逗号分隔）
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM`（邮件发信，见 `web/.env.example` 的注释）
- `MAIL_DEV_LOG_ONLY`（仅本地开发用，生产必须为 `false`）

> **换 `BETTER_AUTH_SECRET` 会让已发出的邮箱验证链接立即作废**——验证用的是无状态令牌，不落库。有效期只有 1 小时，影响面有限，但轮换密钥时要知道这一点。

## 常见问题

- **注册失败**：确认 `BETTER_AUTH_URL=https://offerscoming.cn` 已配置（better-auth 需要知道公网地址）；确认 `ALLOW_PUBLIC_SIGNUP=true`。
- **HTTPS 证书签不出来**：`docker logs job-assistant-caddy`。常见原因是 Cloudflare 的 A 记录还是橙色云（代理状态），导致 Let's Encrypt 的 80 端口验证走不到源站；也可能是安全组没放行 80/443。
- **全站 `ERR_TOO_MANY_REDIRECTS`（死循环）**：典型成因是 **Cloudflare 的 SSL 模式是 `Flexible`，而源站 Caddy 强制 HTTPS 跳转**——Cloudflare 用 HTTP 回源、源站要求 HTTPS，一来一回就无限重定向。修法：Cloudflare → SSL/TLS → 概述，把加密模式改成 **`Full`**（我们的证书是 Let's Encrypt 签的，Full/Full-strict 都可用）。
  - **诊断方法**：用 `curl -sIL --resolve "offerscoming.cn:443:<Cloudflare的IP>" https://offerscoming.cn/` 绕过 DNS 强制走 Cloudflare，看跳转次数；再对比多个 DNS 的解析结果（`nslookup` vs 公共 DoH），判断是否 DNS 传播未完成。
- **网站间歇性超时、SSH 却正常**：先确认 `https://www.cloudflare.com/cdn-cgi/trace` 的 `colo=` 是不是被路由到了 HKG/NRT/SIN 这类亚洲节点。如果 A 记录已经是灰云还出现超时，问题在线路而非服务器。
- **整站打不开、SSH 却进得去（浏览器一直转圈或 `ERR_CONNECTION_TIMED_OUT`）**：先去服务器确认是不是内存被吃穿。典型现场是 `systemctl status systemd-journald` 报 **`Watchdog timeout (limit 3min)`**、`journalctl` 提示 **`Failed to start Journal Service`**，紧跟着一条 **`Failed to start Snap Daemon`**。
  - **为什么是 journald**：它被 systemd 看门狗 SIGABRT 之后会撞上启动频率限制，于是报「Failed to start」。snapd 的 unit 里有 `After=systemd-journald.socket`，**它是被连累的，跟故障本身无关**——不用管 snap，也不要以为是谁装了什么东西。
  - **根因几乎总是内存，不是磁盘**。2026-10-12 那次的实测：`/` 只用了 21%、`dmesg` 里一条 OOM-kill 记录都没有，但 `free -h` 的 **available 只剩 52Mi**（整机 1.7G），`docker stats` 显示 `job-assistant-web` 一个容器独占 **1.26GiB**。系统不停换页 → journald 连续 3 分钟拿不到 CPU → 被看门狗杀掉 → 整站不可用约 25 分钟，而**三个容器一个都没重启**：`restart: unless-stopped` 保护的是容器，没有任何东西保护宿主机。
  - **为什么会涨到 1.26G**：`node-cluster` 按 CPU 核数起 worker（这台 2 核 = 2 个 Node 进程），从上次部署算起 11 天一路涨上去。**每次部署重建容器等于给内存按一次重置键**，所以平时根本感觉不到。修法见 `docker-compose.prod.yml` 里的 `NITRO_CLUSTER_WORKERS` 和 `mem_limit`。
  - **排查顺序**：`free -h`（available 是不是只剩几十兆）→ `docker stats --no-stream`（哪个容器在吃）→ `dmesg -T | grep -iE "blocked for more than|killed process"` → `docker logs -t job-assistant-web | ...`（**注意 `-t` 的时间戳是 UTC，北京时间要减 8 小时**）。
  - **别一上来怀疑磁盘或备份**：备份 cron 在 03:17 且只是 `pg_dump | gzip`，`/data/backups` 实测才 12M，跟上午的故障对不上。
- **简历 PDF 导出**：服务器未装 Chrome，需设 `RESUME_CHROMIUM_PATH` 指向浏览器。
- **飞书同步/登录**：OAuth 回调需改成线上域名 `https://offerscoming.cn/api/v1/integrations/feishu/callback`。
- **浏览器插件**：连 `https://offerscoming.cn`（`extension/wxt.config.ts` 与 `popup/main.ts`）；打包用 `pnpm zip`。
  - **改插件不需要部署。** 开发者模式加载的是 `extension/.output/chrome-mv3`，`pnpm build` 重写该目录后 Chrome 会自动重载扩展。只有改 `web/` 的服务端代码（含 `/api/v1/**` 接口）才需要走上面的 pull + `up -d`。判断依据很简单：改动落在 `extension/` 还是 `web/`。
