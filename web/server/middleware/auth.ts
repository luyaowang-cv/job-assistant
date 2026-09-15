import { createError, defineEventHandler } from 'h3'

import { auth } from '../utils/auth'

// 保护所有业务 API：解析会话 → 注入当前用户到 event.context → 未登录返回 401。
// 认证接口在 /api/auth/**，不在此守卫范围内。
export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/v1/')) {
    return
  }

  const session = await auth.api.getSession({ headers: event.headers })

  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  event.context.user = {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.name,
  }
})
