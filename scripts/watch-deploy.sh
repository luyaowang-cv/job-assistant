#!/usr/bin/env bash
# 服务器端的自动部署：定时检查 ghcr 上有没有新镜像，有就拉下来重建 web 容器。
#
# 为什么是"服务器来拉"而不是"GitHub 推过来"：推的方式需要在公开仓库里放一把能登服务器的
# 私钥、还要配 host/user 三个 secret，任何一处不对都会变成一句看不出来的
# `Permission denied (publickey)`。改成轮询之后，CI 只负责构建镜像，服务器只负责"看到新的就用"，
# 中间不需要任何凭据，也天然解决了"镜像还没构建完就去拉"的时序问题。
#
# 安装（服务器上）：
#   scp scripts/watch-deploy.sh root@43.108.107.79:/root/watch-deploy.sh   # 本机执行
#   ssh root@43.108.107.79 'chmod +x /root/watch-deploy.sh'
#   (crontab -l 2>/dev/null; echo '*/2 * * * * flock -n /tmp/job-deploy.lock /root/watch-deploy.sh >> /var/log/job-assistant-deploy.log 2>&1') | crontab -
#
# 注意：这个文件改了要重新 scp 一次，服务器跑的是 /root/watch-deploy.sh。
set -uo pipefail

REPO_DIR=/root/job-assistant
COMPOSE=docker-compose.prod.yml
IMAGE=ghcr.io/luyaowang-cv/job-assistant-web:latest
LOG=/var/log/job-assistant-deploy.log

cd "$REPO_DIR" || exit 1

# 日志被别人（cron 的重定向）写；这里只负责别让它无限长大
if [ -f "$LOG" ] && [ "$(stat -c '%s' "$LOG")" -gt 1048576 ]; then
  : > "$LOG"
fi

say() { echo "[$(date '+%F %T')] $*"; }

if ! git fetch origin main -q 2>/dev/null; then
  say "git fetch 失败（网络或凭据），跳过本轮"
  exit 0
fi

# 带数据库迁移的提交不自动上线：生产镜像里没有 Prisma CLI，新代码先上会撞旧表结构。
# 按 docs/deploy.md 的方案在本机跑完迁移后，把 migrations 提交一起推上去，下一轮就会正常部署。
if git diff --name-only HEAD origin/main 2>/dev/null | grep -q '^web/prisma/migrations/'; then
  say "origin/main 里有未应用的数据库迁移，暂停自动部署（先在本机跑迁移，见 docs/deploy.md）"
  exit 0
fi

old_id=$(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null || echo none)
docker compose -f "$COMPOSE" pull --quiet web >/dev/null 2>&1
new_id=$(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null || echo none)

if [ "$old_id" = "$new_id" ]; then
  exit 0 # 镜像没变，什么都不做（这是绝大多数轮次的情况）
fi

say "发现新镜像 ${new_id:0:19}，开始部署"
git pull --ff-only -q || { say "git pull 失败（服务器上有本地改动？）"; exit 1; }
docker compose -f "$COMPOSE" up -d || { say "up -d 失败"; exit 1; }
say "完成，当前提交 $(git rev-parse --short HEAD)"
docker compose -f "$COMPOSE" ps | sed 's/^/    /'
