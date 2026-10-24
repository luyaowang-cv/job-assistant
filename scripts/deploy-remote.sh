#!/usr/bin/env bash
# 生产服务器端的部署脚本。GitHub Actions 用一把受限 SSH key 触发它：
#   ~/.ssh/authorized_keys 里那一行是
#   restrict,command=/root/deploy.sh ssh-ed25519 AAAA...
# 所以这把 key 除了跑这个脚本什么都做不了。
#
# 安装（服务器上）：
#   scp scripts/deploy-remote.sh root@43.108.107.79:/root/deploy.sh   # 本机执行
#   ssh root@43.108.107.79 'chmod +x /root/deploy.sh'
#
# 注意：这个文件改了要重新 scp 一次才生效（服务器跑的是 /root/deploy.sh，不是仓库里的副本）。
set -euo pipefail

REPO_DIR=/root/job-assistant
COMPOSE=docker-compose.prod.yml

cd "$REPO_DIR"

echo "== 1/3 git pull（分支 $(git branch --show-current)） =="
git pull --ff-only

echo "== 2/3 拉新镜像 =="
docker compose -f "$COMPOSE" pull web

echo "== 3/3 重建 web 容器 =="
# 必须 force-recreate：compose 判断"要不要重建"看的是 service 配置哈希和镜像引用字符串，
# 而这里永远是同一个 `:latest`；tag 背后指向的 image ID 变了它不管，只打印
# "Container ... Running" 却没换镜像。--no-deps 保证不动 db / caddy。
docker compose -f "$COMPOSE" up -d --no-deps --force-recreate web

docker compose -f "$COMPOSE" ps
echo "web 容器现在跑的镜像：$(docker inspect --format '{{.Image}}' job-assistant-web)"

# 内存上限是拿一次整机宕机换来的，重建后顺手确认它还在
echo "== mem_limit / workers 自检 =="
grep -nE 'NITRO_CLUSTER_WORKERS|mem_limit' "$COMPOSE" | sed 's/^/   /'
