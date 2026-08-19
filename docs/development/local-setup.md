# 本地开发环境

## 已锁定的基线

- Node.js：24.x（本机已检测为 24.9.0）
- 包管理器：pnpm 10.14.0（由 Corepack 按 `web/package.json` 锁定）
- Web：Nuxt 4 + Vue 3 + Element Plus
- 数据库：PostgreSQL 16（Docker Compose）
- ORM：Prisma ORM 7

选择 Nuxt 4 是为了保持官方 Element Plus Starter 的原始、可维护基线。Nuxt 4 仍使用 Vue 3 与 Nitro；不为了标签而回退到 Nuxt 3。

## 首次运行

1. 安装并启动 Docker Desktop。
2. 在仓库根目录运行 `docker compose up -d db`。
3. 进入 `web/`，复制环境变量：`Copy-Item .env.example .env`。
4. 安装依赖：`corepack pnpm install`。
5. 启动：`corepack pnpm dev`，在 Windows 上优先访问 `http://127.0.0.1:3000`。

T-003 完成后，再执行数据库迁移和 seed；目前仅验证 Starter 与数据库容器。

## 常用命令

```powershell
# 仓库根目录
docker compose up -d db
docker compose ps
docker compose down

# web/ 目录
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
```

不要使用 `docker compose down -v`，除非明确要删除本地开发数据。
