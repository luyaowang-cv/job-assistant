import { defineEventHandler } from 'h3'

import { getCurrentUser } from '../../services/current-user'
import { apiSuccess } from '../../utils/api-response'

// 返回当前登录用户（含 isAdmin），供前端判断是否展示管理员操作。
export default defineEventHandler(async (event) => {
  return apiSuccess(event, { user: await getCurrentUser() })
})
