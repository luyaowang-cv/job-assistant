import { defineEventHandler } from 'h3'

import { apiSuccess } from '../utils/api-response'

// 公开只读：告诉前端是否开放公开注册（由 ALLOW_PUBLIC_SIGNUP 控制）。
export default defineEventHandler((event) => {
  return apiSuccess(event, { enabled: process.env.ALLOW_PUBLIC_SIGNUP === 'true' })
})
