import type { ApplicationStatus } from '../generated/prisma/client'

import { prisma } from '../lib/prisma'

import { getCurrentUser } from './current-user'

// "正在跟进"= 还没有走到终态。SAVED 不算：收藏还没投出去，不属于跟进中。
const ACTIVE_STATUSES: ApplicationStatus[] = ['PREPARING', 'APPLIED', 'WRITTEN_TEST', 'INTERVIEWING']
// 走到这一步就算"已经投出去了"。
const APPLIED_OR_LATER: ApplicationStatus[] = ['APPLIED', 'WRITTEN_TEST', 'INTERVIEWING', 'OFFERED']

const DAY = 24 * 60 * 60 * 1000
// 每日投递柱状图的天数。改成 7 会得到一张几乎全平的图——最近一周大概率没投递，
// 那不是图坏了，是这个窗口太小。
const DAILY_WINDOW = 30

// 漏斗里"到达过某阶段"的判定，不能只看当前状态：
// 一条投递可能进过笔试、之后被拒，当前状态已经变成 REJECTED，看快照就会漏掉它。
// 所以要用 ApplicationEvent 的历史状态变更把"到达过"补回来。
type FunnelStageKey = 'total' | 'applied' | 'writtenTest' | 'interviewing' | 'offered'

export type FunnelStage = {
  key: FunnelStageKey
  label: string
  hint: string
  count: number
}

export type FocusItem = {
  id: string
  company: string
  title: string
  status: ApplicationStatus
  statusLabel: string
  /** 机器可读的分档，只用于排序 */
  tier: FocusTier
  /** 为什么它出现在这里 —— 写给用户看的一句话，刻意不与 statusLabel 重复 */
  reason: string
  daysIdle: number
}

export type DashboardSummary = {
  total: number
  active: number
  stages: FunnelStage[]
  rhythm: {
    appliedToday: number
    appliedThisWeek: number
    daysSinceLastActivity: number | null
    /** 近 30 天每日投递量，含 0，用于柱状图 */
    daily: Array<{ date: string, count: number }>
  }
  focus: {
    items: FocusItem[]
    totalActive: number
    idleOver14: number
  }
}

type SummaryOptions = {
  /** 客户端本地时间的"今天 0 点"，由前端传进来 —— 服务端可能是 UTC 容器，自己算会差 8 小时 */
  dayStart: Date
  /** 客户端本地时间的"本周一 0 点" */
  weekStart: Date
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: '收藏', PREPARING: '准备中', APPLIED: '已投递', WRITTEN_TEST: '笔试中',
  INTERVIEWING: '面试中', OFFERED: 'Offer', REJECTED: '已拒绝', WITHDRAWN: '已放弃',
}

// 今日重点的分档，顺序即优先级：先看有外部时间压力的，再看躺太久的。
// 每一档都不依赖用户手填字段，全部由状态和事件时间推导。
type FocusTier = 'interviewing' | 'writtenTest' | 'preparing' | 'stalledApplied' | 'staleSaved'

const TIER_ORDER: FocusTier[] = ['interviewing', 'writtenTest', 'preparing', 'stalledApplied', 'staleSaved']

function focusTier(status: ApplicationStatus, daysIdle: number): FocusTier | null {
  if (status === 'INTERVIEWING') return 'interviewing'
  if (status === 'WRITTEN_TEST') return 'writtenTest'
  if (status === 'PREPARING') return 'preparing'
  if (status === 'APPLIED' && daysIdle >= 14) return 'stalledApplied'
  if (status === 'SAVED' && daysIdle >= 30) return 'staleSaved'
  return null
}

// 小字写"为什么它在这里"，右侧标签写"当前状态"，两者措辞刻意错开，避免同一句话说两遍。
function focusReason(tier: FocusTier, daysIdle: number): string {
  if (daysIdle === 0) return '今天刚动过'
  switch (tier) {
    case 'interviewing': return `已 ${daysIdle} 天没有更新面试进展`
    case 'writtenTest': return `已 ${daysIdle} 天没有更新笔试进展`
    case 'preparing': return `准备了 ${daysIdle} 天还没投出去`
    case 'stalledApplied': return `已投递 ${daysIdle} 天没有动静`
    case 'staleSaved': return `收藏 ${daysIdle} 天还没投`
  }
}

export async function getDashboardSummary(options: SummaryOptions): Promise<DashboardSummary> {
  const user = await getCurrentUser()
  const base = { userId: user.id, deletedAt: null }
  const now = Date.now()

  const reachedAtLeast = (statuses: ApplicationStatus[]) => prisma.application.count({
    where: {
      ...base,
      OR: [
        { status: { in: statuses } },
        {
          events: {
            some: {
              type: 'STATUS_CHANGED',
              OR: statuses.map(status => ({ payload: { path: ['toStatus'], equals: status } })),
            },
          },
        },
      ],
    },
  })

  // "今天投出去几条"有两条入口：看板把状态推进到 APPLIED（有事件），
  // 以及直接以已投递及以后的状态建单（没有事件）。漏掉后者会少算。
  const appliedSince = (from: Date) => Promise.all([
    prisma.applicationEvent.count({
      where: {
        application: base,
        type: 'STATUS_CHANGED',
        occurredAt: { gte: from },
        payload: { path: ['toStatus'], equals: 'APPLIED' },
      },
    }),
    prisma.application.count({ where: { ...base, createdAt: { gte: from }, status: { in: APPLIED_OR_LATER } } }),
  ]).then(([moved, created]) => moved + created)

  // 每日投递量：取窗口内的"推进到已投递"事件，再按天装桶。
  // dayStart 是客户端本地零点换算成的 UTC 时刻，往后每加一天就是本地次日零点
  // （中国无夏令时，一天恒为 24 小时，这里可以直接做减法）。
  const dailySince = new Date(options.dayStart.getTime() - (DAILY_WINDOW - 1) * DAY)
  const appliedEvents = prisma.applicationEvent.findMany({
    where: {
      application: base,
      type: 'STATUS_CHANGED',
      occurredAt: { gte: dailySince },
      payload: { path: ['toStatus'], equals: 'APPLIED' },
    },
    select: { occurredAt: true },
  })

  const [total, active, applied, writtenTest, interviewing, offered, appliedToday, appliedThisWeek, latestEvent, dailyEvents] = await Promise.all([
    prisma.application.count({ where: base }),
    prisma.application.count({ where: { ...base, status: { in: ACTIVE_STATUSES } } }),
    reachedAtLeast(['APPLIED', 'WRITTEN_TEST', 'INTERVIEWING', 'OFFERED']),
    reachedAtLeast(['WRITTEN_TEST', 'INTERVIEWING', 'OFFERED']),
    reachedAtLeast(['INTERVIEWING', 'OFFERED']),
    reachedAtLeast(['OFFERED']),
    appliedSince(options.dayStart),
    appliedSince(options.weekStart),
    prisma.applicationEvent.findFirst({ where: { application: base }, orderBy: { occurredAt: 'desc' }, select: { occurredAt: true } }),
    appliedEvents,
  ])

  const daily = Array.from({ length: DAILY_WINDOW }, (_, index) => ({
    date: new Date(dailySince.getTime() + index * DAY).toISOString(),
    count: 0,
  }))
  for (const event of dailyEvents) {
    const index = Math.floor((event.occurredAt.getTime() - dailySince.getTime()) / DAY)
    if (index >= 0 && index < DAILY_WINDOW) daily[index]!.count += 1
  }

  // 今日重点的候选：所有跟进中的投递 + 躺太久的收藏。
  // 每条取最近一次事件时间作为"最后一次动过"；没有事件的退回创建时间。
  const candidates = await prisma.application.findMany({
    where: { ...base, status: { in: [...ACTIVE_STATUSES, 'SAVED'] } },
    select: {
      id: true,
      status: true,
      createdAt: true,
      job: { select: { title: true, company: { select: { name: true } } } },
      events: { orderBy: { occurredAt: 'desc' }, take: 1, select: { occurredAt: true } },
    },
  })

  const scored = candidates
    .map((item) => {
      const lastActiveAt = item.events[0]?.occurredAt ?? item.createdAt
      const daysIdle = Math.max(0, Math.floor((now - lastActiveAt.getTime()) / DAY))
      const tier = focusTier(item.status, daysIdle)
      return tier
        ? { item, lastActiveAt, daysIdle, tier }
        : null
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => {
      const tierGap = TIER_ORDER.indexOf(left.tier) - TIER_ORDER.indexOf(right.tier)
      // 同档内躺得最久的排前面
      return tierGap !== 0 ? tierGap : right.daysIdle - left.daysIdle
    })

  const idleOver14 = candidates.filter((item) => {
    const lastActiveAt = item.events[0]?.occurredAt ?? item.createdAt
    return ACTIVE_STATUSES.includes(item.status) && now - lastActiveAt.getTime() >= 14 * DAY
  }).length

  return {
    total,
    active,
    stages: [
      { key: 'total', label: '全部记录', hint: '收藏与投递的总和', count: total },
      { key: 'applied', label: '投出去了', hint: '至少进入过已投递', count: applied },
      { key: 'writtenTest', label: '到过笔试', hint: '收到过笔试邀请', count: writtenTest },
      { key: 'interviewing', label: '到过面试', hint: '进入过面试环节', count: interviewing },
      { key: 'offered', label: '拿到 Offer', hint: '最终结果', count: offered },
    ],
    rhythm: {
      appliedToday,
      appliedThisWeek,
      daysSinceLastActivity: latestEvent ? Math.floor((now - latestEvent.occurredAt.getTime()) / DAY) : null,
      daily,
    },
    focus: {
      // 上限 8：高优先档位本身条目就不少，太小的话数量最多的"久投无动静"会一条都露不出来
      items: scored.slice(0, 8).map(entry => ({
        id: entry.item.id,
        company: entry.item.job.company.name,
        title: entry.item.job.title,
        status: entry.item.status,
        statusLabel: STATUS_LABELS[entry.item.status],
        tier: entry.tier,
        reason: focusReason(entry.tier, entry.daysIdle),
        daysIdle: entry.daysIdle,
      })),
      totalActive: scored.length,
      idleOver14,
    },
  }
}
