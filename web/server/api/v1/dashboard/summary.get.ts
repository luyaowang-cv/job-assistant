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
  // 日程卡只要「今天及以后」，而「下一步日期」是 date-only、库里存成 UTC 零点。
  // 这条边界不能直接复用 dayStart —— 那是本地零点的**时刻**，拿去比 UTC 零点会差出一个时区偏移。
  // 前端把"本地今天的日历日"换算成 UTC 零点传进来，这里只负责解析。
  const scheduleFrom = parseBoundary(query.scheduleFrom, () => {
    const value = new Date(dayStart)
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()))
  })

  return apiSuccess(event, await getDashboardSummary({ dayStart, weekStart, scheduleFrom }))
})

function parseBoundary(value: unknown, fallback: () => Date) {
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return fallback()
}
