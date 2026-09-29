import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'

import { renderAuthMail, type AuthMailKind } from '../lib/email-templates'
import { sendMail } from '../lib/mailer'
import { prisma } from '../lib/prisma'

const APP_NAME = 'Offer来'
const APP_URL = process.env.BETTER_AUTH_URL?.trim() || 'http://localhost:3000'
const TOKEN_TTL_MINUTES = 60
const TOKEN_TTL_SECONDS = TOKEN_TTL_MINUTES * 60

// 邮件链接最终落到哪里。用站内相对路径而不是绝对 URL：better-auth 的 origin
// 校验对相对路径直接放行，写死绝对域名会在换域名和本地开发时失效。
const VERIFY_CALLBACK = '/verify-email'
const RESET_CALLBACK = '/reset-password'

// 邮件里的链接必须是**绝对地址**，否则收件人根本点不开。better-auth 在未配置
// baseURL 时（本地开发、或环境变量漏配）会给出相对路径，所以这里用 APP_URL 兜底解析。
// 顺带统一改写 callbackURL：注册后自动发的那封不带它，不改写就会跳回默认首页。
function toAbsoluteUrl(url: string, callbackPath: string, baseUrl: string) {
  try {
    const parsed = new URL(url, baseUrl)
    parsed.searchParams.set('callbackURL', callbackPath)
    return parsed.toString()
  }
  catch {
    return url
  }
}

async function deliverAuthMail(
  kind: AuthMailKind,
  callbackPath: string,
  data: { user: { email: string, name?: string | null }, url: string },
) {
  const mail = renderAuthMail({
    kind,
    url: toAbsoluteUrl(data.url, callbackPath, APP_URL),
    displayName: data.user.name || data.user.email.split('@')[0] || '同学',
    expiresInMinutes: TOKEN_TTL_MINUTES,
    appName: APP_NAME,
    appUrl: APP_URL,
  })

  // sendMail 永不抛错：SMTP 故障不该让注册或找回密码接口失败。
  await sendMail({ to: data.user.email, ...mail })
}

// better-auth 实例：邮箱密码登录 + 邮箱验证 + 找回密码，复用现有 User 表。
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  // 必须显式设置。不设时 better-auth 无法拼出完整端点地址，会把邮件里的
  // 验证链接生成为 `/verify-email?token=...`——指向站内页面而不是验证端点，
  // 结果就是用户点了链接却什么都没发生，token 永远不会被消费。
  baseURL: APP_URL,

  emailAndPassword: {
    enabled: true,
    // 公开注册由 ALLOW_PUBLIC_SIGNUP 总开关控制；未设置时默认关闭。
    disableSignUp: process.env.ALLOW_PUBLIC_SIGNUP !== 'true',
    minPasswordLength: 8,
    // 刻意不设门禁：邮箱未验证也能正常登录使用，只在界面上软提醒。
    // 开启它会让所有存量账号（emailVerified 全为 false）当场被锁在门外，
    // 而验证邮件本身也有发不出去的可能。
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: TOKEN_TTL_SECONDS,
    // 改密码后踢掉所有旧会话：否则密码被盗改后，攻击者手上的旧 cookie 仍然有效。
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async (data) => {
      await deliverAuthMail('reset-password', RESET_CALLBACK, data)
    },
  },

  emailVerification: {
    // 注册成功后自动发一封验证信，用于界面上的软提醒与后续找回密码。
    sendOnSignUp: true,
    sendOnSignIn: false,
    expiresIn: TOKEN_TTL_SECONDS,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async (data) => {
      await deliverAuthMail('verify-email', VERIFY_CALLBACK, data)
    },
  },

  session: {
    // 求职工具的打开频率是"想起来才用"，7 天默认值会导致频繁重新登录。
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    // 关键：默认的 memory 存储在 node-cluster 下每个 worker 各存一份，
    // 限额被放大成 N 倍且重启清零。database 才是真正共享的。
    storage: 'database',
    customRules: {
      // key 是相对 /api/auth 的路径——写成完整路径不会报错，只是静默失效。
      '/sign-up/email': { window: 3600, max: 5 },
      '/sign-in/email': { window: 300, max: 10 },
      '/request-password-reset': { window: 900, max: 3 },
      '/send-verification-email': { window: 900, max: 3 },
      '/reset-password': { window: 900, max: 10 },
      '/verify-email': { window: 300, max: 20 },
      // 热路径豁免：每次页面加载都会打 get-session，限流它等于每页写一次库。
      '/get-session': false,
      '/sign-out': false,
      '/ok': false,
    },
  },

  advanced: {
    ipAddress: {
      ipAddressHeaders: ['x-forwarded-for'],
      // 必须配：Caddy 的 reverse_proxy 是**追加**而非覆盖 X-Forwarded-For。
      // 不声明信任网段时，任何人带一个伪造的 XFF 头就能让 IP 解析失败，
      // 所有请求落进同一个限流桶——等于全站共用一个配额。
      // 172.16.0.0/12 覆盖 Docker 网桥里的 Caddy。
      trustedProxies: ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
    },
    backgroundTasks: {
      // 把发信挪出请求链路：sendOnSignUp 默认会让注册请求同步等待 SMTP，
      // 握手慢或超时会把注册从 1 秒拖到 10 秒。失败靠日志与 /api/v1/email/health 兜底。
      handler: (promise) => {
        void promise.catch(error => console.error('[auth] 后台任务失败', error))
      },
    },
  },

  user: {
    // better-auth 的 name 字段映射到现有 displayName 列。
    fields: { name: 'displayName' },
  },

  secret: process.env.BETTER_AUTH_SECRET,
})
