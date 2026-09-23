# 部署与运维手册

本文记录「秋招求职工作台」的生产部署架构与日常运维流程，便于后续功能迭代与故障排查。

## 架构总览

| 项 | 值 |
|---|---|
| 网站 | `https://offerscoming.cn`（Cloudflare CDN + HTTPS） |
| 服务器 | 香港 VPS（2 核 2G），IP `114.134.185.94`，Ubuntu 22.04 |
| 部署方式 | Docker Compose（`postgres` + `web` 两个容器） |
| 镜像构建 | GitHub Actions CI → 推送到 `ghcr.io/luyaowang-cv/job-assistant-web` |
| 数据库 | PostgreSQL 16，Docker volume 持久化 |
| 备份 | 每天 3:17 自动备份（本地 + GitHub 私有仓库） |

## 更新上线流程（改完功能后）

1. 本机提交并推送：

   ```bash
   git add -A && git commit -m "feat/fix: ..." && git push origin codex/unified-career-agent
   ```

2. GitHub Actions 自动构建镜像（去 Actions 页等绿勾）。

3. 服务器更新（SSH 登录后）：

   ```bash
   cd ~/job-assistant && git pull && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
   ```

> 注意：只改 `docker-compose.prod.yml`（环境变量/端口）时不用等 CI，直接 `git pull` + `up -d` 即可。改 `web/` 下的代码才需要 CI 重新构建镜像。

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
- **访问 521/522**：Cloudflare SSL 模式应设为 `Flexible`（源服务器是 HTTP）；确认云安全组放行 80 端口。
- **简历 PDF 导出**：服务器未装 Chrome，需设 `RESUME_CHROMIUM_PATH` 指向浏览器。
- **飞书同步/登录**：OAuth 回调需改成线上域名 `https://offerscoming.cn/api/v1/integrations/feishu/callback`。
- **浏览器插件**：连 `https://offerscoming.cn`（`extension/wxt.config.ts` 与 `popup/main.ts`）；打包用 `pnpm zip`。
