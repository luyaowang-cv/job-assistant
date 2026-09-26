/**
 * Splits the fields still needing an answer into small batches.
 *
 * One request for a whole form couples every field's fate together: a slow
 * answer, a truncated response, or a single timeout costs the entire page. Each
 * batch is instead analysed, written and read back on its own, so a failure
 * late in the form leaves everything already verified in place.
 *
 * Batches also carry meaning. Fields are grouped by the record they belong to,
 * which keeps the second internship's description from being answered out of
 * the first internship's facts.
 */

// The budget governs batches of ordinary fields (a plain input costs 95, so 17
// of them would already overrun it); the field limit governs batches of cheap
// ones, and keeps any future cost change from producing an unbounded batch.
const BATCH_FIELD_LIMIT = 16
const BATCH_COST_BUDGET = 1_700
// A batch that already spans several records is worth closing before it drifts
// further; a batch of one or two fields is not.
const BATCH_GROUP_FLUSH_MIN = 8

/** Long free-text answers: the whole batch budget has to serve one field. */
const NARRATIVE_LABEL = /描述|介绍|评价|优势|胜任|动机|为什么|规划|申请原因|自我|总结|经历详情|description|summary|profile|motivation|why|strength|career|introduction|reason/i

function fieldText(field) {
  return [field.label, field.name, field.placeholder, field.context]
    .map(value => String(value ?? ''))
    .filter(Boolean)
    .join(' ')
}

export function isNarrativeField(field) {
  return NARRATIVE_LABEL.test(fieldText(field))
}

/** Rough token cost of the answer a field is expected to produce. */
export function estimateFieldCost(field) {
  if (isNarrativeField(field)) return 850
  if (['textarea', 'contenteditable'].includes(String(field.inputType ?? ''))) return 360
  if (Array.isArray(field.options) && field.options.length > 12) return 180
  return 95
}

function sectionOf(target) {
  const value = String(target ?? '')
  const separator = value.indexOf('.')
  return separator > 0 ? value.slice(0, separator) : 'unknown'
}

/**
 * @param {Array<{ fieldId: string, target?: string, record?: number }>} entries plan entries needing an answer
 * @param {Array<object>} fields the scanned field descriptors those entries refer to
 * @returns {Array<Array<object>>} batches of field descriptors, in page order
 */
export function buildFillBatches(entries, fields) {
  const fieldById = new Map((Array.isArray(fields) ? fields : []).map(field => [field.id, field]))
  const batches = []
  let current = null

  const open = (group) => {
    current = { fields: [], cost: 0, group }
    batches.push(current)
    return current
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    const field = fieldById.get(entry?.fieldId)
    if (!field) continue
    const cost = estimateFieldCost(field)

    if (isNarrativeField(field)) {
      // Alone in its own batch: sharing would push the request towards
      // truncation, and truncation is what the per-batch write exists to avoid.
      const solo = open(`${sectionOf(entry.target)}:${entry.record ?? 0}`)
      solo.fields.push(field)
      current = null
      continue
    }

    const group = `${sectionOf(entry.target)}:${entry.record ?? 0}`
    const full = current && (
      current.fields.length >= BATCH_FIELD_LIMIT
      || current.cost + cost > BATCH_COST_BUDGET
      || (current.group !== group && current.fields.length >= BATCH_GROUP_FLUSH_MIN)
    )
    if (!current || full) open(group)
    current.fields.push(field)
    current.cost += cost
  }

  return batches.map(batch => batch.fields)
}
