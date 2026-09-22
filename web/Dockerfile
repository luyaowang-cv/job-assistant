FROM node:20-alpine as build-stage

WORKDIR /app
RUN corepack enable

# 构建期占位数据库地址：prisma generate 会读取 prisma.config.ts 的 env('DATABASE_URL')，
# 这里给占位值避免报错，运行时由 docker-compose 注入真实值覆盖。
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
# 提高 Node 堆内存上限：2GB 小内存服务器上，默认堆上限约 845MB 会导致 Nitro 构建时 heap out of memory
ENV NODE_OPTIONS="--max-old-space-size=2048"

COPY .npmrc package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

COPY . .
# server/generated 目录被 .gitignore 排除，构建期必须重新生成 Prisma Client
RUN pnpm db:generate
RUN pnpm build

# SSR
FROM node:20-alpine as production-stage

WORKDIR /app

COPY --from=build-stage /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
