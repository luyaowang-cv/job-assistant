import { defineEventHandler, getQuery } from 'h3'

import { getDashboardSummary } from '../../../services/dashboard.service'
import { apiSuccess } from '../../../utils/api-response'

// "今天"和"本周"的边界由前端按浏览器本地时区算好传进来（ISO 字符串）。
// 服务端可能是 UTC 容器，自己算 day boundary 会让早上 8 点前的用户看到"昨天"。
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const now = new Date()
  const dayStart = parseBoundary(query.dayStart, () => {
    const value = new Date(now)
    value.setHours(0, 0, 0, 0)
    return value
  })
  const weekStart = parseBoundary(query.weekStart, () => {
    const value = new Date(dayStart)
    // getDay(): 0 = 周日。回退到最近的周一。
    value.setDate(value.getDate() - ((value.getDay() + 6) % 7))
    return value
  })

  return apiSuccess(event, await getDashboardSummary({ dayStart, weekStart }))
})

function parseBoundary(value: unknown, fallback: () => Date) {
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return fallback()
}
