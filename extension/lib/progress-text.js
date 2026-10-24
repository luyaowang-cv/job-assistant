/**
 * The one line that tells the applicant the fill is still moving.
 *
 * Two rules keep it honest: the numbers come from fields actually processed, and
 * the name comes from the page's own label. When a label could not be read the
 * name is omitted — inventing one ("正在填写 12/34：字段") would be inventing a
 * fact about the page, which is the thing this project keeps refusing to do.
 */
export function progressText({ done, total, label } = {}) {
  const safeDone = Number.isFinite(done) ? Math.max(0, Math.trunc(done)) : 0
  const safeTotal = Number.isFinite(total) ? Math.max(safeDone, Math.trunc(total)) : safeDone
  const name = String(label ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  return `正在填写 ${safeDone}/${safeTotal}${name ? `：${name}` : ''}`
}
