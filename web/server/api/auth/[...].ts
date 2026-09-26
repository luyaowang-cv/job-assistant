import { fromNodeMiddleware } from 'h3'
import { toNodeHandler } from 'better-auth/node'

import { auth } from '../../utils/auth'

// 把 better-auth 的请求处理器挂到 /api/auth/**（登录/退出/会话等）。
export default fromNodeMiddleware(toNodeHandler(auth))
