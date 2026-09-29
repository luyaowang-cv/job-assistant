import { createError, defineEventHandler, sendRedirect } from 'h3'

import { auth, EMAIL_VERIFICATION_REQUIRED_SINCE } from '../utils/auth'
import { isAdminEmail } from '../utils/admin'

// 无需登录即可访问的页面。邮件里的验证与重置链接会直接落到这些路径上，
// 漏掉任何一条，用户点开链接都会被弹回登录页、令牌白白作废。
const PUBLIC_PAGES = new Set(['/login', '/forgot-password', '/reset-password', '/verify-email'])

// 保护所有业务 API 与页面路由：
// 1) /api/v1/** → 解析会话注入 event.context.user，未登录返回 401
// 2) 业务页面（非 /api、非 /_nuxt、非公开页、非静态文件）→ 未登录 302 重定向到 /login
// 认证接口在 /api/auth/**，不在此守卫范围内。
// /api/inbound/** 由外部邮件系统调用，靠自身的 HMAC 签名鉴权，同样不在此范围内。
export default defineEventHandler(async (event) => {
  // 保护业务 API
  if (event.path.startsWith('/api/v1/')) {
    const session = await auth.api.getSession({ headers: event.headers })
    if (!session?.user) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    // 分界点之后注册的账号必须先验证邮箱，否则不给任何业务数据。
    // 这是"新注册强制验证"的第二道防线：第一道是 auth.ts 的 autoSignIn: false
    // （注册后不建会话），前端也会在登录后立刻拦一次给出友好提示；这里兜底防止
    // 有人绕过界面直接调接口。分界点之前注册的存量账号不受影响。
    if (!session.user.emailVerified && new Date(session.user.createdAt) >= EMAIL_VERIFICATION_REQUIRED_SINCE) {
      throw createError({ statusCode: 403, statusMessage: 'Email not verified' })
    }

    event.context.user = {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.name,
      isAdmin: isAdminEmail(session.user.email),
      // session 自带该字段，无需额外查库。
      emailVerified: session.user.emailVerified ?? false,
    }
    return
  }

  // 保护页面：未登录访问业务页面 → 重定向到 /login
  const isStaticOrApi = event.path.startsWith('/api/')
    || event.path.startsWith('/_nuxt/')
    || event.path.includes('.')
  if (!PUBLIC_PAGES.has(event.path) && !isStaticOrApi) {
    const session = await auth.api.getSession({ headers: event.headers })
    if (!session?.user) {
      return sendRedirect(event, '/login', 302)
    }
  }
})
