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
# 容器此刻实际在跑的镜像。单独看它，是因为上一次部署可能"以为重启了"其实没换
# （见下面 force-recreate 的注释），那种状态下 latest 和容器会长期不一致。
running_id=$(docker inspect --format '{{.Image}}' job-assistant-web 2>/dev/null || echo none)

if [ "$old_id" = "$new_id" ] && [ "$running_id" = "$new_id" ]; then
  exit 0 # 镜像没变、容器也在跑它，什么都不做（绝大多数轮次都走这里）
fi

say "开始部署（latest=${new_id:0:19} 容器=${running_id:0:19}）"
git pull --ff-only -q || { say "git pull 失败（服务器上有本地改动？）"; exit 1; }
# 必须 force-recreate：compose 判断"要不要重建"看的是 service 配置哈希和镜像引用字符串，
# 而这里是同一个 `:latest` 字符串，tag 背后换了 ID 它不管——实测只打印
# "Container ... Running" 却没换镜像，线上还是旧的。--no-deps 保证不动 db / caddy。
docker compose -f "$COMPOSE" up -d --no-deps --force-recreate web || { say "up -d 失败"; exit 1; }

now_id=$(docker inspect --format '{{.Image}}' job-assistant-web 2>/dev/null || echo none)
if [ "$now_id" != "$new_id" ]; then
  say "警告：容器现在跑的是 ${now_id:0:19}，不是最新的 ${new_id:0:19}"
else
  say "完成，容器已切到 ${now_id:0:19}，当前提交 $(git rev-parse --short HEAD)"
fi
docker compose -f "$COMPOSE" ps | sed 's/^/    /'
