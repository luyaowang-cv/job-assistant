import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'

import { prisma } from '../lib/prisma'

// better-auth 实例：邮箱密码登录 + 会话 cookie，复用现有 User 表。
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    // 本次只服务所有者账号，关闭公开注册；账号由 auth:bootstrap 命令创建。
    disableSignUp: true,
  },
  user: {
    // better-auth 的 name 字段映射到现有 displayName 列。
    fields: { name: 'displayName' },
  },
  secret: process.env.BETTER_AUTH_SECRET,
})
