# 部署与运维手册

本文记录「秋招求职工作台」的生产部署架构与日常运维流程，便于后续功能迭代与故障排查。

## 架构总览

| 项 | 值 |
|---|---|
| 网站 | `https://offerscoming.cn`（Caddy + Let's Encrypt 证书） |
| 服务器 | 阿里云 首尔（韩国），IP `43.108.107.79`，Ubuntu 22.04，2 核 2G / 40G 系统盘，时区 `Asia/Shanghai` |
| 部署方式 | Docker Compose（`db` + `web` + `caddy` 三个容器） |
| 镜像构建 | GitHub Actions CI → 推送到 `ghcr.io/luyaowang-cv/job-assistant-web`（**公开包，服务器无需登录即可拉取**） |
| 数据库 | PostgreSQL 16，Docker volume 持久化（`job-assistant_pgdata`） |
| 备份 | 每天 3:17（服务器本地时间）→ 本地 `/root/backups` + GitHub 私有仓库 `luyaowang-cv/job-assistant-backup` |
| 旧机 | 香港 VPS `114.134.185.94`，2026-10-14 迁出后**保留作回滚**，未拆 |

> **服务器在境外是这套部署的前提**：免备案、Let's Encrypt 能自动签发续期、CI 镜像能从 ghcr 直拉。
> 换到大陆机房这三条全都要换做法（备案接入、国内 CA 证书每 90 天续、镜像要另找仓库），
> 详细对比见「服务器迁移」一节。

> **这台没有独立数据盘**，所以数据库卷和本地备份在同一块 40G 系统盘上。系统盘挂了 = 数据和本地备份一起没，
> **真正保命的只有 GitHub 那个私仓**。所以下面「备份与恢复」里那几条推送失败的排查不能忽略。

### 为什么不用 Cloudflare 代理（2026-09-24 变更）

Cloudflare **免费版没有中国大陆节点**，实测大陆用户（电脑走宽带 IPv4、手机走移动 IPv6，两条完全不同的线路）都被路由到**美西**（`colo=LAX` / `colo=SJC`）。请求路径因此变成「中国 → 洛杉矶 → 香港」，比直连香港慢 3 倍以上，且间歇性超时（实测约 40% 的请求要等 8~20 秒才失败）。

当时源站在香港，本身就是离大陆最近的机房之一（实测 RTT 约 50ms），**任何没有大陆节点的 CDN 都不如直连**。所以改为：

- **Cloudflare DNS 只做解析（灰云 / DNS Only）**，不再代理流量
- **Caddy 在源站终结 HTTPS**，自动向 Let's Encrypt 申请并续期证书
- 代价：失去 CDN 缓存和 DDoS 防护，源站 IP 暴露

如果以后要换回 Cloudflare 代理：把 A 记录点回橙色云，把 `docker-compose.prod.yml` 的 `web` 服务改回 `ports: - "80:3000"` 并删掉 `caddy` 服务，然后 `up -d`。

> 2026-10-14 源站从香港迁到首尔后，这条结论**不变但理由弱了一点**：Cloudflare 免费版依然没有大陆节点，所以仍然不该开代理；但首尔离大陆比香港远，直连的延迟会高于原来的 50ms。
> 换机器时顺手实测一次，别沿用旧数字：`curl -o /dev/null -s -w '%{time_connect} %{time_total}\n' https://offerscoming.cn/`。

## 更新上线流程（改完功能后）

### 现在：推送即部署（2026-10-24 起）

`git push origin main` 之后不用再做任何事。`.github/workflows/deploy.yml` 有两个 job：

1. `build`：和以前一样构建镜像推到 ghcr（实测约 2 分钟）；
2. `deploy`：构建成功后用受限 SSH key 进服务器跑 `/root/deploy.sh`，也就是 `git pull --ff-only` + `compose pull web` + `up -d`，最后从 GitHub 的 runner 对 `https://offerscoming.cn/` 做一次健康检查（200/204/302，最多重试 60 秒）。

**一次性配置**（已经配过就跳过）。**密钥在服务器上生成、私钥用 base64 传**——多行 PEM 在终端和剪贴板里复制太容易丢换行（第一次配就是这么失败的），一行 base64 不会。

```bash
# ① 在服务器上跑：生成专用 key、把自己装进 authorized_keys 并限制成只能跑部署脚本
rm -f /root/gha_deploy /root/gha_deploy.pub
ssh-keygen -t ed25519 -f /root/gha_deploy -N '' -C gha-deploy -q
sed -i '/gha-deploy/d' /root/.ssh/authorized_keys
printf 'restrict,command=/root/deploy.sh %s\n' "$(cat /root/gha_deploy.pub)" >> /root/.ssh/authorized_keys
chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys
echo "=== 下面这一整行（只有一行）复制走，粘进 DEPLOY_SSH_KEY ==="
base64 -w0 /root/gha_deploy; echo

# ② 部署脚本
scp scripts/deploy-remote.sh root@43.108.107.79:/root/deploy.sh   # 本机执行
ssh root@43.108.107.79 'chmod +x /root/deploy.sh'
```

② 里的 `scripts/deploy-remote.sh` 是仓库里的副本，服务器上跑的是 `/root/deploy.sh`，改了要重新拷一次。

然后在 GitHub 仓库 → Settings → Secrets and variables → Actions 加三个 secret：`DEPLOY_SSH_KEY`（① 打出来的那行 base64）、`DEPLOY_HOST`（`43.108.107.79`）、`DEPLOY_USER`（`root`）。secret 保存后不可回读，改就是删掉重加。

workflow 同时兼容两种格式：内容是 base64 就解码，是完整 PEM 就直接用；解出来不是私钥会在那一步直接报错，不会拖到 ssh 变成一句看不懂的 `Permission denied`。

**secret 没配齐之前**，`deploy` job 会打一条 `::warning::` 然后跳过，这次运行仍然是绿的——也就是说代码推上去了、镜像也构建了，但不会自动上线，得手动部署。配齐之后那条 warning 就不该再出现，所以哪天它突然冒出来，多半是 secret 被删了。

**带数据库迁移的发布会自动停住**：`deploy` job 会先看这次推送有没有动 `web/prisma/migrations/`，动了就直接报错停下（镜像已经构建好，但没有上线）。流程是：本机按下面「数据库迁移」一节跑完迁移 → Actions 页 → 选 `build-and-push-web` → Run workflow → 勾上 `force` → 再部署一次。这是刻意做的：生产镜像里没有 Prisma CLI，新代码先上线就会撞上旧表结构。

**要不要更严一点**：现在 `ssh-keyscan` 自动接受主机指纹。想钉死的话，把服务器指纹存成 secret（`DEPLOY_KNOWN_HOSTS`）并改成写 `~/.ssh/known_hosts`，可以避免中间人。一个人的项目暂时没做。

### 手动部署（自动部署失败、或者要回滚时）

1. 本机提交并推送：

   ```bash
   git add <具体文件> && git commit -m "feat/fix: ..." && git push origin main
   ```

   > 不要用 `git add -A` / `git add .`。仓库根目录曾出现过 5MB 的数据库导出 `deploy-data.sql`，
   > 一次全量 add 就会把它推进公开仓库。`.gitignore` 里已补 `*-data.sql` 兜底，但显式列文件更稳。

   > **部署分支是 `main`**（2026-10-14 起）：`.github/workflows/deploy.yml` 触发的是
   > `branches: - main`，服务器上的 clone 也在这个分支上（`git branch --show-current` 应为 `main`）。
   >
   > 在那之前主线是 `codex/unified-career-agent`，`main` 只是个偶尔合并一次的镜像，于是它长期落后
   > ——迁移时就踩过：新机 `git clone` 默认落在 `main`，拿到的 `docker-compose.prod.yml` 少了内存
   > 上限那次修复（`NITRO_CLUSTER_WORKERS` / `mem_limit`）。现在 `main` 是唯一的主线，
   > 那个分支已冻结、只当备份留着，**别再往它推**（推它不会触发 CI）。

2. GitHub Actions 自动构建镜像（去 Actions 页等绿勾，或调 API 查）：
   `https://api.github.com/repos/luyaowang-cv/job-assistant/actions/runs?per_page=1`

3. 服务器更新（SSH 登录后）：

   ```bash
   cd ~/job-assistant
   git branch --show-current   # 必须是 main
   git pull
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   docker compose -f docker-compose.prod.yml ps
   ```

4. 确认内存上限还在（**别以为 compose 文件改过就永远生效**，这个值吃掉过一次整站）：

   ```bash
   grep -nE 'NITRO_CLUSTER_WORKERS|mem_limit' docker-compose.prod.yml
   docker stats --no-stream   # web 容器 MEM 应在 900MiB 以内
   ```

> 注意：只改 `docker-compose.prod.yml` / `Caddyfile` / 环境变量时不用等 CI，直接 `git pull` + `up -d` 即可。改 `web/` 下的代码才需要 CI 重新构建镜像。
>
> 改 `.env` 后必须 `up -d` 重建容器，`restart` 不会重新读取环境变量。

## 数据库迁移

**生产镜像只含 `.output`**——容器里既没有 Prisma CLI 也没有 schema；`db` 服务只绑回环地址，公网连不上。所以迁移要在**本机**通过 SSH 隧道对着服务器上的库执行。

```bash
# 1) 先备份。迁移可能不可逆，这是唯一的退路。
ssh root@43.108.107.79 'bash /root/backup.sh'

# 2) 建隧道：把服务器的 5432 映射到本机 5433（保持这个终端不关）
ssh -N -L 5433:127.0.0.1:5432 root@43.108.107.79

# 3) 另开终端，在仓库的 web/ 目录下应用迁移。
#    密码取自服务器 ~/job-assistant/.env 里的 POSTGRES_PASSWORD。
cd web
DATABASE_URL='postgresql://job_assistant:<POSTGRES_PASSWORD>@127.0.0.1:5433/job_assistant?schema=public' \
  pnpm db:migrate:deploy

# 4) 重启 web 容器，让它用上新的表结构
ssh root@43.108.107.79 'cd ~/job-assistant && docker compose -f docker-compose.prod.yml up -d web'
```

要点：

- 用 `pnpm db:migrate:deploy`（`prisma migrate deploy`）而**不是** `pnpm db:migrate`：后者是 `migrate dev`，会检测 drift、开 shadow database、并交互式询问迁移名，在无人值守场景直接失败。
- `migrate deploy` 幂等，已应用过的迁移会被跳过，可以安全重跑。
- **顺序是先迁移、后上代码**：新代码可能依赖新列，反过来的话会有一小段时间接口报错。

## 备份与恢复

| 项 | 值 |
|---|---|
| 脚本 | `/root/backup.sh` |
| 触发 | cron 每天 **3:17**（服务器本地时间；这台机器时区是 `Asia/Shanghai`，所以就是北京时间凌晨） |
| 本地留存 | `/root/backups/`，保留最近 **7 天**（单份约 1.6M，7 天共约 12M。这台**没有独立数据盘**，所以和数据库同一块系统盘） |
| 异地留存 | GitHub 私有仓库 `luyaowang-cv/job-assistant-backup`，克隆在 `/root/backup-repo` |
| 日志 | `/var/log/job-assistant-backup.log`（cron 里重定向过去的，`tail` 就有） |
| 手动跑一次 | `bash /root/backup.sh` |

### 脚本为什么长这样（2026-10-14 重写）

流程是：`pg_dump` → 写成 `*.sql.gz.part` → **三项校验** → 全过才 `mv` 成正式名、`cp` 进备份仓库、`git commit && push`。
任何一项不过就 `exit 1`，**仓库里旧的那份原封不动**。

三项校验（具体常量见脚本）：

1. 文件大小达到下限——`pg_dump` 有时会"成功"地吐出一个几 KB 的空壳；
2. `gzip -t` 能完整解压——磁盘写满时会留下截断的 `.gz`；
3. `zcat | grep -c 'CREATE TABLE'` ≥ 1——解压成功但仍然一句建表语句都没有。

两个反直觉的地方，改脚本时别改回去：

- **`set -euo pipefail` 是核心，不是装饰。** 旧脚本没有它，于是 `pg_dump` 失败时管道照样产出一个空 `.gz`、脚本继续往下走，**`cp` 覆盖掉仓库里唯一那份好备份再推上去**。表面看"每天都在正常备份"，其实早就没有可用备份了。这是重写的主因。
- **用 `grep -c` 而不是 `grep -q`。** `grep -q` 一命中就退出，上游 `zcat` 被 SIGPIPE 杀掉（退出码 141），而 `pipefail` 会把这个 141 当作整条管道失败——于是**校验明明通过却报失败**。这个坑真实发生过，改用 `grep -c` 后消失。

### git 身份写在仓库里，不写在机器上

```bash
git -C /root/backup-repo config user.name  "job-assistant-backup"
git -C /root/backup-repo config user.email "backup@offerscoming.cn"
```

**别用 `git config --global`，也别指望 shell 变量。** cron 是干净环境，不继承你当前终端的任何东西；`--local` 写在仓库自己的 `.git/config` 里，跟着仓库走，任何环境都读得到。没配的话脚本会在 `git commit` 那一步报 `Author identity unknown` 然后退出——**备份文件是生成了，但没推上去**，只有翻日志才看得到。

### 上线/迁移后必做的一次确认

**手动跑通 ≠ cron 跑通。** 重建过机器、迁移过服务器之后，第二天早上（或事后任意一天）看一眼：

```bash
tail -20 /var/log/job-assistant-backup.log
cd /root/backup-repo && git log --oneline -3    # 应有一条当天时间戳的提交
ls -lht /root/backups | head -3
```

### 怎么验证"坏备份不会被推上去"

值得在空闲时演练一次，因为它验证的是"失败时不会破坏好备份"这个最关键的属性：

```bash
docker compose -f docker-compose.prod.yml stop db   # 让 pg_dump 连不上
bash /root/backup.sh; echo "退出码=$?"               # 期望有 ERROR 且退出码非 0
cd /root/backup-repo && git log --oneline -1         # 期望还是上一条，没被污染
docker compose -f docker-compose.prod.yml start db
```

### 从备份恢复

备份是 **`pg_dump` 的明文 SQL 再 gzip**，所以用 `psql` 灌回去——**不能用 `pg_restore`**（那是自定义格式 `-Fc` 才用的）。

```bash
LATEST="$(ls -t /root/backups/*.sql.gz | head -1)"
echo "$LATEST"                                        # 先看清楚要灌的是哪一份
gunzip -c "$LATEST" | docker exec -i job-assistant-db psql -U job_assistant -d job_assistant
```

不要手打文件名——用 `ls -t` 取最新，既避免了记错命名规则，也避免灌到一份旧的。

如果目标库已经有数据，必须先清空，否则主键冲突。**清库前先停 web 容器**，否则它一边连着一边被 drop：

```bash
cd ~/job-assistant
docker compose -f docker-compose.prod.yml stop web
docker exec job-assistant-db psql -U job_assistant -d postgres -c 'DROP DATABASE job_assistant WITH (FORCE);'
docker exec job-assistant-db psql -U job_assistant -d postgres -c 'CREATE DATABASE job_assistant OWNER job_assistant;'
# 灌回备份，然后
docker compose -f docker-compose.prod.yml up -d web
```

### 关于"只保留最新一份"

想过把保留天数改成 1 来省空间，**不建议**：如果有问题的那次写入发生在昨天，今天备份的就是"坏数据的干净快照"，
只留最新等于把好版本挤掉了。7 天一共约 12M，省不出什么。真嫌多就调成 3，别再往下压。

## 服务器迁移

2026-10-14 从香港 VPS（`114.134.185.94`）迁到阿里云首尔（`43.108.107.79`）的完整顺序。

**核心原则：先演练后切换。** 新机全部跑通、数据也灌进去验证过之前，DNS 一直指着旧机——
所以中途任何一步卡住，线上都不受影响，随时可以停下来明天再弄。旧机在切换完成后**不拆**，留着当回滚路径。

### 阶段 0：买机器前先确认四件事

| 确认项 | 怎么确认 | 为什么 |
|---|---|---|
| **在境外** | 香港 / 首尔 / 东京 / 新加坡 | 免备案、Let's Encrypt 能自动签发、CI 镜像能从 ghcr 直拉。大陆机房这三条全都要换做法 |
| **出口真能出去** | `curl -o /dev/null -s -w '%{http_code}\n' https://ghcr.io/v2/` → **401 就是通**（未认证的正常响应），`000` 才是连不上 | 大陆机器实测 ghcr / docker.com / acme-v02 全部 `000`，等于这套部署**根本跑不起来** |
| **内存 ≥ 2G** | 2 核 2G 是下限 | Nuxt + Postgres + Caddy 三个容器，1G 必 OOM |
| **能开 80/443** | 阿里云在控制台「防火墙 / 安全组」放行 | 便宜机器走 NAT 转发的话，要先确认能不能把 80/443 映射出去，不然证书签不出来 |

> **卖家告诉你 IP 的方式有讲究。** 襄阳那台给的是 `远程地址:端口`（形如 `<卖家给的IP>:52709`），端口不是 22，
> 而且是 NAT 转发——`ssh root@<IP>` 会 `Permission denied`，必须 `ssh -p 52709 root@<IP>`。
> 另外 `curl ipinfo.io` 得到的是**出口 IP**，可能和入口公网 IP 不是同一个，别拿它当服务器地址。
> 阿里云 ECS 没这些花活，控制台首页的 IP 就是入口 IP。

### 阶段 1：新机环境

```bash
# 1) 时区先定下来——它会改变 cron 的实际触发时刻
timedatectl set-timezone Asia/Shanghai && date

# 2) swap（2G 内存的机器必须有；没有它，一次构建或一次内存尖峰就是一次 OOM）
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab && free -h

# 3) Docker
curl -fsSL https://get.docker.com | sh && docker --version && docker compose version
```

**时区别跳过。** 旧机是 UTC，新机设成 `Asia/Shanghai`——cron 里的 `17 3 * * *` 从"UTC 3:17（北京 11:17）"
变成"北京 3:17"。这次是朝好的方向变，但**换时区时必须重新核对每条 cron 的意图**，别让它悄悄地一天跑两次或一次都不跑。

### 阶段 2：把代码 / 密钥 / 数据搬过来

```bash
git clone https://github.com/luyaowang-cv/job-assistant.git ~/job-assistant
cd ~/job-assistant && git branch --show-current   # 必须是 main
```

> 现在 `git clone` 的默认分支就是部署分支（`main`），所以不再需要额外 checkout 一步。
> 2026-10-14 之前部署在 `codex/unified-career-agent` 上，那时这条默认值反而是陷阱：
> 新机拿到的是落后的 `main`，`docker-compose.prod.yml` 里少了内存上限那次修复
> （`NITRO_CLUSTER_WORKERS` / `mem_limit`），容器在没有上限的情况下跑起来。
> **clone 完第一件事仍然是 `git branch --show-current`** —— 它现在应该回答 `main`。

```bash
# 密钥：从旧机直接拷，不要手抄（手抄会漏掉或抄错 base64 里的字符）
scp root@114.134.185.94:~/job-assistant/.env ~/job-assistant/.env
chmod 600 ~/job-assistant/.env
grep -oE '^[A-Z_]+' ~/job-assistant/.env    # 只列 key 名核对，不要 cat 出值

# 数据：在旧机上现打一份（旧机的备份目录是 /data/backups，不是新机的 /root/backups）
ssh root@114.134.185.94 'bash /root/backup.sh'
ssh root@114.134.185.94 'ls -t /data/backups/*.sql.gz | head -1'   # 把打印出来的路径填到下面
OLD=/data/backups/<上一步打印的文件名>
scp "root@114.134.185.94:$OLD" /tmp/
```

> 检查 `.env` 里跟地址有关的那几个：`BETTER_AUTH_URL`、`FEISHU_OAUTH_REDIRECT_URI` 之类都应该是**域名**而不是 IP。
> 是域名就不用改，这也是整套迁移能这么顺的原因。

### 阶段 3：起库、灌数据、验证

```bash
cd ~/job-assistant
docker compose -f docker-compose.prod.yml up -d db
docker exec job-assistant-db pg_isready -U job_assistant

DUMP="$(ls -t /tmp/*.sql.gz | head -1)"     # 阶段 2 scp 下来的那份
echo "$DUMP"                                 # 先确认，再灌
gunzip -c "$DUMP" | docker exec -i job-assistant-db psql -U job_assistant -d job_assistant

# 验证：迁移记录 + 行数
docker exec job-assistant-db psql -U job_assistant -d job_assistant -c 'SELECT count(*) FROM "_prisma_migrations";'
docker exec job-assistant-db psql -U job_assistant -d job_assistant -c '\dt'
```

`_prisma_migrations` 里应该带上最近的迁移（含 `rateLimit` 那张表）。
如果 `rateLimit` 缺失，web 起来后会报 `ERROR [Better Auth]: Prisma schema mismatch / Missing tables rateLimit`，见「常见问题」。

### 阶段 4：起 web，确认内存上限在

```bash
docker compose -f docker-compose.prod.yml up -d web
grep -nE 'NITRO_CLUSTER_WORKERS|mem_limit' docker-compose.prod.yml   # 期望 1 / 900m
docker stats --no-stream                                            # web 容器 MEM 应在 900MiB 以内

# 探活：web 只 expose 3000，没有映射到宿主机，所以在宿主机上 curl 127.0.0.1:3000 是连不上的。
# 必须从容器内部探——这也是为什么不加端口映射时别拿 curl 当健康检查。
docker exec job-assistant-web node -e \
  "fetch('http://127.0.0.1:3000/').then(r => console.log('HTTP', r.status)).catch(e => console.log('ERR', e.message))"

docker logs --tail 30 job-assistant-web      # 确认没有启动期报错
```

**这时候先不要起 Caddy。** DNS 还指着旧机，80 端口在等 DNS 生效；这时启动 Caddy 去申请证书，
Let's Encrypt 会因为域名解析到别处而失败——失败次数多了会撞上签发频率限制（每周 5 次），把后面真正要用的那次额度耗掉。
**只在 DNS 已经切到本机之后才起 Caddy。**

### 阶段 5：冻结旧机的备份推送（先腾出唯一的写者）

**备份仓库只允许一个写者。** 两个 clone 同时往 `job-assistant-backup` 推，后推的那个会被 git 以
`! [rejected] main -> main (fetch first)` 拒掉——这次真的发生了，好在 git 的防覆盖救场，但别指望每次都这么幸运。

所以**先停旧机的 cron，再让新机开始推**：

```bash
ssh root@114.134.185.94 'crontab -l > /root/crontab.backup && crontab -r && crontab -l'
```

`crontab -l > /root/crontab.backup` 是回滚时要用的东西，别省这一步。

**为什么必须赶在最终 dump 之前停**：旧机那个任务一旦在你 dump 完之后再跑一次，就会往同一个仓库推一份 stale 快照，
把新机的备份挤到后面（或被拒）。而且这之后你分不清"仓库里最新那份"到底是新机还是旧机的。

停掉之后，旧机上仍然有 `/data/backups` 里的本地历史，需要的话手动 `bash /root/backup.sh` 也能再打一份 ——
只是不再自动往远端推。

### 阶段 6：接通新机备份，并在"干净环境"里验证

现在新机是唯一的写者，可以放心让它推了。

```bash
# 备份仓库的 git 身份（见「备份与恢复」一节，别用 --global）
git -C /root/backup-repo config user.name  "job-assistant-backup"
git -C /root/backup-repo config user.email "backup@offerscoming.cn"

# 用"干净环境"模拟 cron：cron 不继承你现在的任何变量
env -i HOME=/root /bin/bash /root/backup.sh; echo "退出码=$?"   # 期望 0
cd /root/backup-repo && git log --oneline -1                     # 期望有一条新提交
```

`env -i` 会清掉环境，所以**必须显式给 `HOME=/root`**——不给的话 git 读不到任何配置，会报身份未知，
那是测试本身的问题，不是脚本的问题。这一步能抓到 `Author identity unknown` 这类"手动跑好好的、cron 里跑就废"的问题。

### 阶段 7：最终数据移交

```bash
ssh root@114.134.185.94 'bash /root/backup.sh'        # 最终一份
scp "root@114.134.185.94:$OLD" /tmp/final.sql.gz      # $OLD 见阶段 2；重新 ls -t 确认取到的是最新的

# 用最终数据覆盖新机的库
docker compose -f docker-compose.prod.yml stop web
docker exec job-assistant-db psql -U job_assistant -d postgres -c 'DROP DATABASE job_assistant WITH (FORCE);'
docker exec job-assistant-db psql -U job_assistant -d postgres -c 'CREATE DATABASE job_assistant OWNER job_assistant;'
gunzip -c /tmp/final.sql.gz | docker exec -i job-assistant-db psql -U job_assistant -d job_assistant
docker compose -f docker-compose.prod.yml up -d web
```

从阶段 3 到这里，库被灌了两次。这是刻意的：第一次用来验证"备份能恢复"，第二次才是正式搬家。
如果只灌一次，就等于在**唯一一次机会**上同时验证备份有效性和迁移流程本身。

### 阶段 8：切 DNS，然后起 Caddy

在 Cloudflare 把 A 记录从 `114.134.185.94` 改到 `43.108.107.79`。**灰云（DNS Only）**，别点成橙色云。

```bash
# 等解析生效（大陆网络下 1.1.1.1 常常超时，用 8.8.8.8 查）
nslookup offerscoming.cn 8.8.8.8

# 确认解析已经指向新机，再起 Caddy
cd ~/job-assistant && docker compose -f docker-compose.prod.yml up -d caddy
docker logs -f job-assistant-caddy      # 看到证书签发成功就能 Ctrl-C
```

Cloudflare 的 TTL 是 300 秒起，实际几十秒到几分钟。等解析确认了再起 Caddy，别抢。

### 阶段 9：验证与回滚

```bash
curl -sI https://offerscoming.cn/ | head -1
docker compose -f docker-compose.prod.yml ps
free -h
```

观察几天（至少一个完整的备份周期）再拆旧机。

**回滚**（换机器后任何时候发现严重问题）：

1. **先把新机当前的库 dump 下来**——切换后产生的数据都在新机上，不先拿就丢了：
   `ssh root@43.108.107.79 'bash /root/backup.sh'`，再 `ls -t /root/backups/*.sql.gz | head -1` 拿到文件名、`scp` 回本地
2. Cloudflare 把 A 记录改回 `114.134.185.94`（灰云不变）
3. `ssh root@114.134.185.94 'crontab /root/crontab.backup && crontab -l'` —— 恢复备份任务
4. `ssh root@114.134.185.94 'cd ~/job-assistant && docker compose -f docker-compose.prod.yml up -d'` —— 旧机本来就是好的，起回来即可
5. 如果第 1 步的 dump 里确实有新数据，按「从备份恢复」那一节把它灌回旧机的库（**先停 web 容器再清库**）
6. 回滚完成后，**把新机的 cron 也停掉**，否则又变成两个写者

回滚的代价是"新机上这段时间产生的数据"——所以**切换尽量选在深夜**，把窗口压到最短，并且按第 1 步先留底。

### 这次踩到的坑，一次列全

| 症状 | 真因 |
|---|---|
| `ssh root@<IP>` 一直 `Permission denied` | 卖家给的是 `IP:端口`，端口不是 22，且走 NAT 转发 |
| 新机起来后内存没有上限 | 当时 `git clone` 默认到 `main`，而部署在 `codex/unified-career-agent`（2026-10-14 把主线切到 `main` 之后这条陷阱消失） |
| 备份脚本手动跑成功、cron 跑失败 | `git commit` 报 `Author identity unknown`；cron 不继承终端环境，身份要写进备份仓库自己的 `.git/config` |
| 校验通过却报失败（退出码 141） | `grep -q` 命中即退，`zcat` 被 SIGPIPE，`pipefail` 把它算成管道失败 |
| "每天都在正常备份"其实没有可用备份 | 旧脚本缺 `set -euo pipefail`，`pg_dump` 失败时用空文件覆盖了好备份 |
| 旧机 push 被拒 `fetch first` | 同一备份仓库有了两个写者（新旧机各一个 clone）；git 拒绝覆盖，属于保护而非故障。所以要先冻结旧机 cron |
| cron 触发时刻和预期差 8 小时 | 旧机 UTC、新机 `Asia/Shanghai` |
| `ERROR [Better Auth]: Prisma schema mismatch / Missing tables rateLimit` | Prisma 客户端过期（生成于模型创建之前），重新生成 / `db:migrate:deploy` |
| 全站 500，但容器都在跑 | 同上；也可能是内存打满（见「常见问题」） |
| 大陆机器上 ghcr / acme 全部超时 | 出口被墙，这套部署在大陆机房不成立 |

### 旧机退役清单（观察期结束后）

- [ ] 从 `/data/backup-repo/.git/config` 里**清掉明文 GitHub token**（`git remote set-url`），这个仓库要被删掉之前必须做
- [ ] 撤销那次临时创建的 GitHub token
- [ ] 更换旧机 root 密码（迁移过程中它出现在聊天记录里）
- [ ] 确认新机备份连续成功至少 3 天
- [ ] 再销毁实例（**先确认 DNS 已经稳定指向新机**）

## 关键环境变量

服务器 `~/job-assistant/.env`（不提交 git，需手动维护）：

- `POSTGRES_PASSWORD` / `BETTER_AUTH_SECRET` / `AI_KEY_ENCRYPTION_KEY`（密钥）
- `ALLOW_PUBLIC_SIGNUP=true`（开放注册总开关）
- `ADMIN_EMAILS`（管理员邮箱，逗号分隔）
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM`（邮件发信，见 `web/.env.example` 的注释）
- `MAIL_DEV_LOG_ONLY`（仅本地开发用，生产必须为 `false`）
- `FEISHU_OAUTH_REDIRECT_URI=https://offerscoming.cn/api/v1/integrations/feishu/callback`（**必须用域名，不能用 IP**，否则迁移服务器时它就成了唯一要改的坑）
- 备份任务用的 GitHub token 不在这里，见「备份与恢复」

> **换 `BETTER_AUTH_SECRET` 会让已发出的邮箱验证链接立即作废**——验证用的是无状态令牌，不落库。有效期只有 1 小时，影响面有限，但轮换密钥时要知道这一点。

### 密钥卫生

- **改完 `.env` 必须 `up -d` 重建容器**，`restart` 不会重新读环境变量。
- **排查问题时不要 `cat .env`**。需要核对就在服务器上 `grep -oE '^[A-Z_]+' .env` 只列 key 名，或 `grep '^KEY=' .env | sed 's/=.*/=<set>/'`。
  这些值一旦进了终端记录、聊天记录或者截图，就等于泄露，之后要挨个轮换。迁移过程中拷 `.env` 用 `scp` 直传，不要手抄。
- **Token 有生命周期**：临时创建的 PAT（用来让服务器 push 备份）用完就撤；
  轮换时要同步更新服务器上的 remote，否则备份会在某天凌晨悄悄开始失败，而你不会知道——除非去看 `/var/log/job-assistant-backup.log`。
- **不要把 token 写在 remote URL 里**（`https://<token>@github.com/...`）。`git remote -v` 会明文打印出来，
  `.git/config` 也会一直留在磁盘上——旧机的 `/data/backup-repo/.git/config` 就是这个状态，退役前必须清掉。

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
  - **排查顺序**：`free -h`（available 是不是只剩几十兆）→ `docker stats --no-stream`（哪个容器在吃）→ `dmesg -T | grep -iE "blocked for more than|killed process"` → `docker logs -t job-assistant-web | ...`。
    **`docker logs -t` 和 `dmesg` 的时间戳都按宿主机时区走**：这台现在是 `Asia/Shanghai`，所以直接就是北京时间；
    但上面 2026-10-12 那次的记录来自旧机（UTC），当时要减 8 小时才对得上——**换过机器之后别再沿用旧时区换算。**
  - **别一上来怀疑磁盘或备份**：备份 cron 在 03:17 且只是 `pg_dump | gzip`，`/root/backups` 实测才 12M，跟上午的故障对不上。
- **简历 PDF 导出**：服务器未装 Chrome，需设 `RESUME_CHROMIUM_PATH` 指向浏览器。
- **飞书同步/登录**：OAuth 回调需改成线上域名 `https://offerscoming.cn/api/v1/integrations/feishu/callback`。
- **浏览器插件**：连 `https://offerscoming.cn`（`extension/wxt.config.ts` 与 `popup/main.ts`）；打包用 `pnpm zip`。
  - **改插件不需要部署。** 开发者模式加载的是 `extension/.output/chrome-mv3`，`pnpm build` 重写该目录后 Chrome 会自动重载扩展。只有改 `web/` 的服务端代码（含 `/api/v1/**` 接口）才需要走上面的 pull + `up -d`。判断依据很简单：改动落在 `extension/` 还是 `web/`。
- **全站 500 / 登录页报错，但三个容器都在 `Up`**：先看 `docker logs job-assistant-web | grep -i 'Better Auth'`。
  如果出现 **`Prisma schema mismatch` / `Missing tables: rateLimit`**，是 **Prisma 客户端过期**（生成时间早于模型创建时间），
  不是"数据库里没表"。修法：本地 `cd web && npx auth generate`（或重新生成 Prisma 客户端）后重建镜像；
  生产上表本来就在（否则线上早就跑不起来），必要时用 `corepack pnpm db:migrate:deploy` 补。
  - **本地开发也会遇到同一个报错**，而且它不一定意味着后端没起——先 `docker compose ps` 看 `db` 健不健康，再 grep 这个关键词。
- **备份"跑成功了"但远端没有新提交**：看 `/var/log/job-assistant-backup.log`。
  最常见是 `Author identity unknown`（cron 环境没有 git 身份，见「备份与恢复」），其次是 token 过期 / remote 仍是旧的。
  **本地有 `.gz` 不代表异地有备份**——这台机器只有一个盘，本地那份和数据库同生共死。
- **改了 DNS 但 `nslookup` 不生效**：大陆网络下 `1.1.1.1` 常常直接超时（不是解析错，是连不上），换 `8.8.8.8` 查。
  另外改完 A 记录**等解析确实生效再启动 Caddy**，否则证书签发失败会吃掉 Let's Encrypt 的频率额度。
- **换了时区之后 cron 的行为变了**：`crontab -l` 里的时间永远按**服务器本地时区**解释。这台是 `Asia/Shanghai`，
  旧机是 UTC——迁移或改时区时，每条 cron 的"意图时刻"都要重新确认一遍。
- **服务器上跑 `curl` 一切正常，从大陆访问却超时**：先确认是不是线路/出口问题，而不是服务挂了。
  在两台机器上分别测同一个目标，就能区分"服务端问题"和"网络可达性问题"——迁移时正是这么发现大陆机器到 ghcr 全 `000` 的。
