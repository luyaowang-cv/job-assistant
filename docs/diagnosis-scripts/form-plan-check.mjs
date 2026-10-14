/**
 * 诊断脚本 2/3：把运行报告里的怪标签喂给真实的本地规则模块，
 * 看它们分别落到哪个状态，区分「标签错」「词表缺」「档案里没有」。
 *
 * 运行（无外部依赖，任意目录）：
 *   node docs/diagnosis-scripts/form-plan-check.mjs
 */
import { buildFillPlan, classifyField } from '../../extension/lib/form-fill-rules.js'

const profile = {
  basics: {
    fullName: '王路瑶',
    gender: '女',
    birthDate: '2002-05-01',
    phone: '13800000000',
    email: 'a@b.com',
    city: '北京市',
    politicalStatus: '共青团员',
  },
  educations: [
    { school: '北方工业大学', major: '物联网工程', educationLevel: '本科', academicDegree: '学士', startDate: '2024-09', endDate: '2027-06' },
  ],
  workExperiences: [{ company: '某某科技', title: '前端实习生', startDate: '2025-07', endDate: '2025-09', description: '负责表单引擎' }],
  projects: [{ name: 'Offer来', role: '独立开发', startDate: '2025-01', endDate: '2025-06', description: '求职工作台' }],
  skills: ['TypeScript', 'Vue'],
}

const f = (id, label, over = {}) => ({
  id, label, context: '', name: '', placeholder: '',
  inputType: 'text', controlType: 'input', options: [], multiple: false,
  hasValue: false, isEditable: true, ...over,
})

const cases = [
  ['性别单选组（标签="女"，报告里的样子）', f('g1', '女', { inputType: 'radio', controlType: 'radio-group', options: ['男', '女'] })],
  ['同一组，标签="性别"', f('g1b', '性别', { inputType: 'radio', controlType: 'radio-group', options: ['男', '女'] })],
  ['学历单选组（标签="本科"）', f('g2', '本科', { inputType: 'radio', controlType: 'radio-group', options: ['本科', '硕士'] })],
  ['城市下拉（标签="北京市"）', f('g3', '北京市', { inputType: '', controlType: 'custom-select' })],
  ['区号（标签="+86"）', f('g4', '+86', { inputType: '', controlType: 'custom-select' })],
  ['空态文案（标签="暂无选项"）', f('g5', '暂无选项', { inputType: '', controlType: 'custom-select' })],
  ['导航文案（标签="首页关于我们社会招聘官网"）', f('g6', '首页关于我们社会招聘官网', {})],
  ['年（占位符="年"）', f('g7', '', { placeholder: '年' })],
  ['月（占位符="月"）', f('g8', '', { placeholder: '月' })],
  ['至今', f('g9', '至今', {})],
  ['2024', f('g10', '2024', {})],
  ['推荐码', f('g11', '推荐码', {})],
  ['项目名称', f('g12', '项目名称', {})],
  ['职责', f('g13', '职责', {})],
  ['语言类型', f('g14', '语言类型', { inputType: '', controlType: 'custom-select' })],
  ['掌握程度', f('g15', '掌握程度', { inputType: '', controlType: 'custom-select' })],
  ['公司规模', f('g16', '公司规模', { inputType: '', controlType: 'custom-select' })],
  ['公司网站', f('g17', '公司网站', {})],
  ['到岗时间', f('g18', '到岗时间', {})],
]

const plan = buildFillPlan(profile, cases.map(([, field]) => field))
const byId = new Map(plan.entries.map(entry => [entry.fieldId, entry]))
for (const [name, field] of cases) {
  const entry = byId.get(field.id)
  console.log(`${(entry ? entry.status : '?').padEnd(14)} ${name.padEnd(34)} category=${String(entry?.category).padEnd(13)} ${entry?.reason ?? ''}`)
}

console.log('\n---- classifyField 单独看标签 ----')
for (const label of ['女', '性别', '本科', '学历', '北京市', '+86', '年', '至今', '2024', '推荐码', '公司规模']) {
  console.log(`${label.padEnd(6)} -> ${classifyField(f('x', label))}`)
}
