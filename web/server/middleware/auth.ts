import { createError, defineEventHandler, sendRedirect } from 'h3'

import { auth } from '../utils/auth'
import { isAdminEmail } from '../utils/admin'

// 保护所有业务 API 与页面路由：
// 1) /api/v1/** → 解析会话注入 event.context.user，未登录返回 401
// 2) 业务页面（非 /api、非 /_nuxt、非 /login、非静态文件）→ 未登录 302 重定向到 /login
// 认证接口在 /api/auth/**，不在此守卫范围内。
export default defineEventHandler(async (event) => {
  // 保护业务 API
  if (event.path.startsWith('/api/v1/')) {
    const session = await auth.api.getSession({ headers: event.headers })
    if (!session?.user) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    event.context.user = {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.name,
      isAdmin: isAdminEmail(session.user.email),
    }
    return
  }

  // 保护页面：未登录访问业务页面 → 重定向到 /login
  const isStaticOrApi = event.path.startsWith('/api/')
    || event.path.startsWith('/_nuxt/')
    || event.path.includes('.')
  if (event.path !== '/login' && !isStaticOrApi) {
    const session = await auth.api.getSession({ headers: event.headers })
    if (!session?.user) {
      return sendRedirect(event, '/login', 302)
    }
  }
})
