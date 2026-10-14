/**
 * 诊断脚本 3/3：为什么"年 / 月"这类日期分片框永远填不上。
 *
 * 四组对照说明：扫描器不产出 dateUnit（规则的 dateUnit 分支是死代码），
 * 而 dateRoleOf 又只看控件自身文字、不看 context ——
 * 只有 ATS 把 role 和单位都写进 name 时这条路才通。
 *
 * 运行（无外部依赖，任意目录）：
 *   node docs/diagnosis-scripts/date-role-check.mjs
 */
import { buildFillPlan } from '../../extension/lib/form-fill-rules.js'

const profile = { educations: [{ school: '北方工业大学', major: '物联网工程', startDate: '2024-09', endDate: '2027-06' }] }
const f = (id, over = {}) => ({
  id, label: '', context: '', name: '', placeholder: '',
  inputType: 'text', controlType: 'input', options: [], multiple: false,
  hasValue: false, isEditable: true, ...over,
})

const cases = [
  ['年 框（只有占位符"年"）', f('a', { placeholder: '年' })],
  ['年 框 + dateUnit=year（扫描器从不产出）', f('b', { placeholder: '年', dateUnit: 'year' })],
  ['年 框 + dateUnit=year + 上下文含"入学时间"', f('c', { placeholder: '年', dateUnit: 'year', context: '教育经历 入学时间 年 月' })],
  ['年 框 + name=educationStartYear（role 可从 name 读出）', f('d', { placeholder: '年', dateUnit: 'year', name: 'educationStartYear' })],
  ['月 框 + name=educationStartMonth', f('e', { placeholder: '月', dateUnit: 'month', name: 'educationStartMonth' })],
]

const plan = buildFillPlan(profile, cases.map(([, field]) => field))
const byId = new Map(plan.entries.map(entry => [entry.fieldId, entry]))
for (const [name, field] of cases) {
  const entry = byId.get(field.id)
  console.log(`${entry.status.padEnd(14)} ${name.padEnd(48)} value=${JSON.stringify(entry.value ?? null)} ${entry.reason}`)
}
