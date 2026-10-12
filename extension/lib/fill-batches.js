/**
 * Splits the fields still needing an answer into batches.
 *
 * One request for a whole form couples every field's fate together: a slow
 * answer, a truncated response, or a single timeout costs the entire page. Each
 * batch is instead analysed, written and read back on its own, so a failure
 * late in the form leaves everything already verified in place.
 *
 * Two layers. The page is first cut into records: the fields of one internship
 * are indivisible, because a description answered without its company is a
 * description answered from the wrong company's facts. Those records are then
 * packed in page order until a batch is full, so a record is only ever split
 * when it alone outgrows a whole batch.
 */

// What one batch may write back, in tokens. The server pins `max_tokens` to
// 4096, so sizing this as most of that budget is what keeps a long form from
// arriving truncated and unparseable.
const BATCH_COST_BUDGET = 3_200
// A plain input costs 95, so the budget alone would allow 33 of them. This is a
// backstop against a page of cheap fields producing an unbounded batch, not a
// packing target — it is deliberately the tighter of the two limits, because
// every field also pays for its JSON envelope (`"fieldId":"form-field-12",`).
const BATCH_FIELD_LIMIT = 24

/**
 * Long free-text answers: the answer, not the label around it, is the cost.
 *
 * Read from the field's own identity only. `context` carries the neighbouring
 * labels (“相邻字段：工作描述、项目描述”), so judging by it would price an 结束时间
 * box as the description box beside it — and give a page where every field
 * neighbours a 描述 one batch per field.
 */
const NARRATIVE_LABEL = /描述|介绍|评价|优势|胜任|动机|为什么|规划|申请原因|自我|总结|经历详情|个人简介|description|summary|profilesummary|aboutme|motivation|why|strength|career|introduction|reason/i

function identityText(field) {
  return [field?.label, field?.name, field?.placeholder]
    .map(value => String(value ?? ''))
    .filter(Boolean)
    .join(' ')
}

export function isNarrativeField(field) {
  return NARRATIVE_LABEL.test(identityText(field))
}

/** Rough token cost of the answer a field is expected to produce. */
export function estimateFieldCost(field) {
  if (isNarrativeField(field)) return 850
  if (['textarea', 'contenteditable'].includes(String(field?.inputType ?? ''))) return 360
  if (Array.isArray(field?.options) && field.options.length > 12) return 180
  return 95
}

function sectionOf(target) {
  const value = String(target ?? '')
  const separator = value.indexOf('.')
  return separator > 0 ? value.slice(0, separator) : 'unknown'
}

/**
 * The key two fields must share to be answered together.
 *
 * A missing `record` is deliberately not folded into record zero. A field with
 * no record (`basics.fullName`) answers from the profile, not from saved record
 * zero, and saying otherwise would bind it to the first entry of whichever
 * repeating section happens to share its section name.
 */
function recordKey(entry) {
  const record = entry?.record
  return `${sectionOf(entry?.target)}:${Number.isInteger(record) ? record : '~'}`
}

function sumCost(fields) {
  return fields.reduce((total, field) => total + estimateFieldCost(field), 0)
}

/**
 * Layer one: the page cut into records, each block keeping page order.
 *
 * Driven by `fields` rather than `entries`, because the scanner hands fields
 * over in page order while the order of the caller's entries is its own
 * business. A field repeated in `entries` is still visited once.
 *
 * @param {Array<{ fieldId: string, target?: string, record?: number }>} entries
 * @param {Array<object>} fields page-ordered field descriptors
 * @returns {Array<Array<object>>} one array per record, in page order
 */
export function buildRecordBlocks(entries, fields) {
  const entryById = new Map((Array.isArray(entries) ? entries : [])
    .filter(entry => entry?.fieldId)
    .map(entry => [entry.fieldId, entry]))
  const blocks = []
  let current = null

  for (const field of Array.isArray(fields) ? fields : []) {
    const entry = entryById.get(field?.id)
    if (!entry) continue
    const key = recordKey(entry)
    if (!current || current.key !== key) {
      current = { key, fields: [] }
      blocks.push(current)
    }
    current.fields.push(field)
  }
  return blocks.map(block => block.fields)
}

/**
 * A block that fits is kept whole. One that does not is cut on the same two
 * limits the packer uses, so every part is guaranteed a batch of its own and
 * the cut lands as late as possible — the identity fields stay with the first
 * answers rather than drifting into a batch with nothing to identify them.
 *
 * This is the only path that may split a record.
 */
function splitToFit(block) {
  if (sumCost(block) <= BATCH_COST_BUDGET && block.length <= BATCH_FIELD_LIMIT) return [block]

  const parts = []
  let part = []
  let partCost = 0
  for (const field of block) {
    const cost = estimateFieldCost(field)
    // A field costs at most 850, far under the budget, so a part always takes
    // at least one field and this loop cannot spin. Raising a single field's
    // cost above the budget would break that.
    if (part.length > 0 && (partCost + cost > BATCH_COST_BUDGET || part.length >= BATCH_FIELD_LIMIT)) {
      parts.push(part)
      part = []
      partCost = 0
    }
    part.push(field)
    partCost += cost
  }
  if (part.length > 0) parts.push(part)
  return parts
}

/**
 * Layer two: next-fit packing, in page order.
 *
 * Next-fit rather than first-fit, and never reordering. The model infers which
 * record an answer belongs to from the order it receives, so a batch has to be
 * a contiguous window of the page; first-fit would top up an earlier batch with
 * a later block, and one truncated reply would then break two distant parts of
 * the form at once.
 *
 * @returns {Array<Array<object>>} batches of field descriptors, in page order
 */
export function buildFillBatches(entries, fields) {
  const batches = []
  let current = null

  const open = () => {
    current = { fields: [], cost: 0 }
    batches.push(current)
  }
  const place = (part) => {
    const cost = sumCost(part)
    if (!current || current.cost + cost > BATCH_COST_BUDGET || current.fields.length + part.length > BATCH_FIELD_LIMIT) open()
    current.fields.push(...part)
    current.cost += cost
  }

  for (const block of buildRecordBlocks(entries, fields)) {
    for (const part of splitToFit(block)) place(part)
  }
  return batches.map(batch => batch.fields)
}
