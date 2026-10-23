// 日程标签：把投递里的「下一步日期」翻成一眼能看懂的时间说法。
//
// 这个字段是 **date-only** 的：投递表单用 `el-date-picker type="date" value-format="YYYY-MM-DD"`，
// 提交上来是 `'2026-10-24'`，zod 的 `z.coerce.date()` 把它解析成 `2026-10-24T00:00:00Z`。
// 所以这里有两个坑，都必须按下面这样处理：
//
// 1. 取日历日要按 **UTC** 读。按本地读的话，UTC+8 会变成当天 08:00（时间假了），
//    UTC-5 会退到前一天（日期就错了）。
// 2. 「今天/明天」要跟 **本地** 的今天比 —— 用户眼里的今天是本地的今天。
//    做法是把两边都换算成「UTC 零点的日序号」再相减：日期本身是日历日，
//    跨时区、跨夏令时都不会差出一两天。

export type ScheduleTone = 'overdue' | 'today' | 'soon' | 'later'

export type ScheduleDateLabel = {
  /** 相对说法：逾期 2 天 / 今天 / 明天 / 后天 / 3 天后；超过一周就是 null，只显示具体日期 */
  relative: string | null
  /** 具体日期：10/24 · 周六 */
  date: string
  /** 目标日期 − 今天，单位天。负数=逾期 */
  dayDiff: number
  tone: ScheduleTone
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** 日历日 → 自 1970-01-01 起的天序号（纯日历运算，不含时区） */
function dayNumber(year: number, month: number, day: number) {
  return Date.UTC(year, month - 1, day) / MS_PER_DAY
}

/** 取 date-only 字段的日历日（按 UTC 读，理由见文件头） */
export function scheduleDateParts(iso: string) {
  const value = new Date(iso)
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() }
}

/** 目标日期离 now 所在的本地今天还有几天：0=今天，-1=昨天，2=后天 */
export function scheduleDayDiff(iso: string, now: Date): number {
  const target = scheduleDateParts(iso)
  const today = dayNumber(now.getFullYear(), now.getMonth() + 1, now.getDate())
  return dayNumber(target.year, target.month, target.day) - today
}

export function scheduleLabel(iso: string, now: Date): ScheduleDateLabel {
  const value = new Date(iso)
  const dayDiff = scheduleDayDiff(iso, now)

  const relative = dayDiff < 0
    ? `逾期 ${-dayDiff} 天`
    : dayDiff === 0
      ? '今天'
      : dayDiff === 1
        ? '明天'
        : dayDiff === 2
          ? '后天'
          : dayDiff <= 6
            ? `${dayDiff} 天后`
            : null

  return {
    relative,
    date: `${value.getUTCMonth() + 1}/${value.getUTCDate()} · ${WEEKDAYS[value.getUTCDay()]}`,
    dayDiff,
    tone: dayDiff < 0 ? 'overdue' : dayDiff === 0 ? 'today' : dayDiff <= 2 ? 'soon' : 'later',
  }
}
