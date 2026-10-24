#!/usr/bin/env bash
# 生产服务器端的部署脚本。GitHub Actions 用一个受限的 SSH key 触发它：
#   ~/.ssh/authorized_keys 里那一行是
#   restrict,command="bash /root/deploy.sh" ssh-ed25519 AAAA...
# 所以这把 key 除了跑这个脚本什么都做不了，也不需要把 docker 命令暴露给 CI。
#
# 第一次部署前把它拷到服务器：
#   scp scripts/deploy-remote.sh root@43.108.107.79:/root/deploy.sh && ssh root@43.108.107.79 'chmod +x /root/deploy.sh'
#
# 注意：这个文件改了要重新 cp 一次才生效（服务器跑的是 /root/deploy.sh，不是仓库里的这份）。
set -euo pipefail

REPO_DIR=/root/job-assistant
COMPOSE="docker-compose.prod.yml"

cd "$REPO_DIR"

echo "== 1/3 git pull（分支 $(git branch --show-current)） =="
# 部署分支从 2026-10-14 起是 main；服务器上有本地改动时这里会失败，比悄悄合出一个 merge 提交好
git pull --ff-only

echo "== 2/3 拉新镜像 =="
docker compose -f "$COMPOSE" pull web

echo "== 3/3 重建 web 容器（db / caddy 不受影响） =="
docker compose -f "$COMPOSE" up -d

docker compose -f "$COMPOSE" ps

# 内存上限是拿一次整机宕机换来的，重建后顺手确认它还在
echo "== mem_limit / workers 自检 =="
grep -nE 'NITRO_CLUSTER_WORKERS|mem_limit' "$COMPOSE" | sed 's/^/   /'
