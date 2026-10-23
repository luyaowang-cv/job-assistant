import assert from 'node:assert/strict'
import test from 'node:test'

import { scheduleDayDiff, scheduleLabel } from './schedule'

// now 用本地时区构造（和浏览器里一样），期望值从本地日历日推出来，
// 所以这些用例在任何时区的机器上跑都应该给出同样的结果。
const onMorningOf = (year: number, month: number, day: number) => new Date(year, month - 1, day, 9, 30)

test('reads the stored value as a calendar date, not a local instant', () => {
  // '2026-10-24' 被 z.coerce.date() 存成 UTC 零点。在 UTC+8 本地读是 10/24 08:00，
  // 在 UTC-5 本地读会退到 10/23 —— 这里必须始终是 10 月 24 日。
  const label = scheduleLabel('2026-10-24T00:00:00.000Z', onMorningOf(2026, 10, 23))
  assert.equal(label.date, '10/24 · 周六')
  assert.equal(label.relative, '明天')
  assert.equal(label.tone, 'soon')
})

test('compares against the local today, not the UTC today', () => {
  // 本地刚过零点（UTC 还是前一天）。存的是 10/24，本地今天也是 10/24，应当算「今天」。
  const justAfterMidnight = new Date(2026, 9, 24, 0, 20)
  assert.equal(scheduleDayDiff('2026-10-24T00:00:00.000Z', justAfterMidnight), 0)
  assert.equal(scheduleLabel('2026-10-24T00:00:00.000Z', justAfterMidnight).relative, '今天')
})

test('marks past dates as overdue with the number of days', () => {
  const label = scheduleLabel('2026-10-20T00:00:00.000Z', onMorningOf(2026, 10, 23))
  assert.equal(label.relative, '逾期 3 天')
  assert.equal(label.tone, 'overdue')
  assert.equal(label.dayDiff, -3)
})

test('uses 后天 and N 天后 inside a week, then falls back to the date only', () => {
  const now = onMorningOf(2026, 10, 23)
  assert.equal(scheduleLabel('2026-10-25T00:00:00.000Z', now).relative, '后天')
  assert.equal(scheduleLabel('2026-10-26T00:00:00.000Z', now).relative, '3 天后')
  assert.equal(scheduleLabel('2026-10-29T00:00:00.000Z', now).relative, '6 天后')

  const far = scheduleLabel('2026-11-02T00:00:00.000Z', now)
  assert.equal(far.relative, null)
  assert.equal(far.date, '11/2 · 周一')
  assert.equal(far.tone, 'later')
})

test('crosses month and year boundaries without drifting a day', () => {
  assert.equal(scheduleDayDiff('2027-01-01T00:00:00.000Z', onMorningOf(2026, 12, 31)), 1)
  assert.equal(scheduleDayDiff('2026-03-01T00:00:00.000Z', onMorningOf(2026, 2, 28)), 1)
  // 2028 是闰年，2 月有 29 号
  assert.equal(scheduleDayDiff('2028-03-01T00:00:00.000Z', onMorningOf(2028, 2, 28)), 2)
})
