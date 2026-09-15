import { prisma } from '../lib/prisma'

export interface CurrentUser {
  id: string
  email: string
  displayName: string
}

// 不依赖 h3/nitropack 静态导入的 401 错误（便于服务层在单测环境被直接引用）。
class UnauthorizedError extends Error {
  statusCode = 401
  statusMessage = 'Unauthorized'
  constructor() {
    super('Unauthorized')
  }
}

// 返回当前登录用户；未登录（或缺少请求上下文，如后台任务）时抛 401。
// 用户对象由鉴权中间件写入 event.context，这里用 Nitro 自动导入的 useEvent() 取当前请求事件。
export async function getCurrentUser(): Promise<CurrentUser> {
  let user: CurrentUser | undefined
  try {
    user = useEvent().context.user as CurrentUser | undefined
  }
  catch {
    user = undefined
  }
  if (!user?.id) {
    throw new UnauthorizedError()
  }
  return user
}

// 后台任务（如飞书定时同步）没有请求上下文，解析数据库里唯一的真实用户（所有者）。
// 多用户化后应改为按用户遍历，而非取首个用户。
export async function getOwnerUser(): Promise<CurrentUser> {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!user) throw new UnauthorizedError()
  return { id: user.id, email: user.email, displayName: user.displayName }
}
