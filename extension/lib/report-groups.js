/**
 * Splits a fill report into the sections the applicant actually thinks in.
 *
 * “需手动处理 26 项” is one number covering four unrelated situations: the model
 * answered and the page refused it, the model was asked and had nothing to say,
 * the model was never asked, and the rule table already knew a person had to
 * decide. Only the first is a tool failure; the last is by design. Rolling them
 * together makes a healthy fill look broken and a broken one look ordinary.
 *
 * A `needs_manual` entry always lands in exactly one bucket, so the four counts
 * add up to the manual total — that equality is what keeps the summary honest.
 */

/** The four reasons a field can still need the applicant, in reading order. */
export const MANUAL_GROUPS = [
  { key: 'write_failed', label: '写入失败', hint: '答案有了，但页面控件没有接受它。' },
  { key: 'unanswered', label: '模型没答', hint: '问过模型，它没有给出可用的答案。' },
  { key: 'not_attempted', label: '未尝试', hint: '本次没有问模型（提前停止或前面的请求失败）。' },
  { key: 'manual', label: '需手动确认', hint: '规则层就判断这里需要你自己决定。' },
]

/**
 * Groups entries for rendering. `filled` and the two skip statuses stay as flat
 * lists — they are not something the applicant has to act on.
 */
export function groupReportEntries(entries) {
  const list = Array.isArray(entries) ? entries : []
  const filled = list.filter(entry => entry?.status === 'filled')
  const skipped = list.filter(entry => entry?.status === 'skipped_existing' || entry?.status === 'skipped_sensitive')
  const manual = list.filter(entry => entry?.status === 'needs_manual')
  const buckets = MANUAL_GROUPS.map(group => ({
    ...group,
    entries: manual.filter(entry => (entry?.group ?? 'manual') === group.key),
  })).map(group => ({ ...group, count: group.entries.length }))
  // An entry carrying an unknown group would vanish from every bucket and break
  // the tally; count them under 需手动确认 instead of dropping them.
  const bucketed = buckets.reduce((total, group) => total + group.count, 0)
  if (bucketed < manual.length) {
    const missing = manual.filter(entry => !MANUAL_GROUPS.some(group => group.key === (entry?.group ?? 'manual')))
    buckets[buckets.length - 1] = {
      ...buckets[buckets.length - 1],
      entries: [...buckets[buckets.length - 1].entries, ...missing],
      count: buckets[buckets.length - 1].count + missing.length,
    }
  }
  return { filled, skipped, buckets, manualTotal: manual.length }
}
