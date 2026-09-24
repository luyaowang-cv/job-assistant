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

## 常见问题

- **注册失败**：确认 `BETTER_AUTH_URL=https://offerscoming.cn` 已配置（better-auth 需要知道公网地址）；确认 `ALLOW_PUBLIC_SIGNUP=true`。
- **HTTPS 证书签不出来**：`docker logs job-assistant-caddy`。常见原因是 Cloudflare 的 A 记录还是橙色云（代理状态），导致 Let's Encrypt 的 80 端口验证走不到源站；也可能是安全组没放行 80/443。
- **网站间歇性超时、SSH 却正常**：先确认 `https://www.cloudflare.com/cdn-cgi/trace` 的 `colo=` 是不是被路由到了 HKG/NRT/SIN 这类亚洲节点。如果 A 记录已经是灰云还出现超时，问题在线路而非服务器。
- **简历 PDF 导出**：服务器未装 Chrome，需设 `RESUME_CHROMIUM_PATH` 指向浏览器。
- **飞书同步/登录**：OAuth 回调需改成线上域名 `https://offerscoming.cn/api/v1/integrations/feishu/callback`。
- **浏览器插件**：连 `https://offerscoming.cn`（`extension/wxt.config.ts` 与 `popup/main.ts`）；打包用 `pnpm zip`。
