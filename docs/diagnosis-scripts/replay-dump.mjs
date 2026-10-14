/**
 * Replays an exported page structure through the local rule table.
 *
 * Usage:
 *   node docs/diagnosis-scripts/replay-dump.mjs <dump.json> [profile.json]
 *
 * Use it on the JSON from 「导出当前页字段结构」 to see what the rules would answer
 * for a site *before* anything is sent to a model — which is what a site mapping is
 * for. Nothing here touches a page or a network.
 *
 * One reconstruction is applied first, and only for the 北森 pattern where the
 * scanner used to return a control's own value as its name (“北京市”, “硕士研究生”,
 * “熟练”): when the context begins with the label and repeats it as the value, the
 * label is the part of the context before the first repetition. The shipped scanner
 * now reads the real label from the DOM directly, so this is an approximation of it,
 * not a substitute.
 */
import { readFileSync } from 'node:fs'

import { buildFillPlan } from '../../extension/lib/form-fill-rules.js'

const [, , dumpPath, profilePath] = process.argv
if (!dumpPath) {
  console.error('用法：node docs/diagnosis-scripts/replay-dump.mjs <dump.json> [profile.json]')
  process.exit(2)
}

const dump = JSON.parse(readFileSync(dumpPath, 'utf8'))
const profile = profilePath ? JSON.parse(readFileSync(profilePath, 'utf8')) : {}

/** The label the fixed scanner would have read, where the dump shows a value. */
function correctedLabel(field) {
  const label = String(field.label ?? '').trim()
  const context = String(field.context ?? '')
  const head = context.split('；')[0] ?? ''
  if (!label || !head) return label
  const at = head.indexOf(label)
  // 北森: `<label>意向工作地点</label><value>北京市北京市北京市</value>`
  if (at > 0 && head.slice(at) === label.repeat(Math.floor(head.slice(at).length / label.length))) {
    return head.slice(0, at).trim() || label
  }
  return label
}

const fields = dump.fields.map(field => ({
  id: field.id,
  label: correctedLabel(field),
  context: field.context,
  name: field.name,
  placeholder: field.placeholder,
  inputType: field.inputType,
  controlType: field.controlType,
  options: field.options ?? [],
  multiple: false,
  hasValue: field.hasValue === true,
  dateUnit: field.dateUnit || undefined,
  dateRole: field.dateRole || undefined,
}))

const plan = buildFillPlan(profile, fields)
const byId = new Map(plan.entries.map(entry => [entry.fieldId, entry]))

console.log(`页面：${dump.host}`)
console.log(`控件：${fields.length} 个；档案：${profilePath ?? '（空档案）'}\n`)

for (const field of fields) {
  const entry = byId.get(field.id)
  if (!entry) continue
  const label = correctedLabel(field).padEnd(18)
  const value = entry.value === undefined ? '' : ` = ${entry.value.slice(0, 24)}`
  console.log(`${entry.status.padEnd(15)} ${label} ${entry.reason}${value}`)
}

console.log('\n—— 汇总 ——')
console.log(plan.summary)
const toAsk = plan.entries.filter(entry => entry.status === 'needs_manual' && entry.skipAi !== true)
console.log(`会送进模型的字段：${toAsk.length} 个（其余 ${fields.length - toAsk.length} 个由规则、跳过或人工处理）`)
