/**
 * 素材卡引用 → 插件规则的映射检查（2026-10-14）
 *
 * 证明什么：网申档案里「每个字段引用一张素材卡」存下来的 composition.references，经服务端的
 * resolveApplicationProfileVersion / getApplicationProfileFillContext 交到插件手上之后，
 * 规则引擎能不能把经历类的「名称 / 角色 / 文案」填到对应表单框里。
 *
 * 用的是真实的 buildFillPlan，没有重写任何规则。档案按 localFacts 的形状手写：
 *   references = { type, title, facts, content, fieldKey }（见 web/server/services/document-resolver.ts）
 * 卡片的存法见 web/app/pages/materials/index.vue：
 *   title 是该类型的「名称」（实习卡＝公司名），
 *   facts = { organization, role, projectUrl, techStack, startDate, endDate }，
 *   文案在 variant.content 里（服务端会按 fieldKey 解析成 blocks[].fields[].text）。
 *
 * 运行：node docs/diagnosis-scripts/card-reference-plan-check.mjs
 * 期望：MISS 0 —— 修好 form-fill-rules.js 里 fromReference 的键名翻译后就是这个结果。
 *       修之前：公司名称「没有可用内容」、职位名称被写成公司名、项目名称也空着。
 *
 * 注意：同一个单值栏目（如招聘来源）在页面上只放一个框。放两个会被规则表判成
 * 「页面已存在同一档案栏目的另一个字段」而跳过——那是刻意的防止填错，不是缺陷。
 */
import { buildFillPlan } from '../../extension/lib/form-fill-rules.js'

const profile = {
  basics: { fullName: '王路瑶', phone: '13800000000', email: 'a@b.com' },
  educations: [],
  strategy: { targetLocations: ['北京', '杭州'], expectedSalary: '15001～25000', availableDate: '一个月内', recruitmentSource: 'BOSS直聘', referralCode: 'ABC123' },
  // 新流程下档案不再用这些旧数组，全部靠 references —— 这正是规则会走 fromReference 的前提
  workExperiences: [], projects: [], campusExperiences: [], awards: [], certificates: [], languages: [], skills: [],
  references: [
    { id: 'r1', cardId: 'c1', variantId: 'v1', section: 'internship', fieldKey: 'internship1', type: 'INTERNSHIP', title: '搜狐', facts: { organization: '推荐算法组', role: '算法实习生', startDate: '2025-06', endDate: '2025-09' }, content: '负责推荐排序特征工程，CTR 提升 3%。' },
    { id: 'r2', cardId: 'c2', variantId: 'v2', section: 'projects', fieldKey: 'project1', type: 'PROJECT', title: '多 Agent 前端迁移系统', facts: { organization: '某实验室', role: '前端负责人', projectUrl: 'https://github.com/x/y', startDate: '2025-03', endDate: '2025-05' }, content: '用 LangGraph 编排多 Agent 完成前端迁移。' },
    { id: 'r3', cardId: 'c3', variantId: 'v3', section: 'self', fieldKey: 'selfEvaluation', type: 'SELF_EVALUATION', title: '自我评价', facts: {}, content: '两年前端经验，主攻工程化与多 Agent 编排。' },
    { id: 'r4', cardId: 'c4', variantId: 'v4', section: 'campus', fieldKey: 'campus1', type: 'CAMPUS', title: '校学生会', facts: { role: '技术部部长', startDate: '2023-09', endDate: '2024-06' }, content: '带 12 人做校内活动报名系统。' },
    { id: 'r5', cardId: 'c5', variantId: 'v5', section: 'certificates', fieldKey: 'certificate1', type: 'CERTIFICATE', title: '软考数据库系统工程师', facts: {}, content: '2025 年上半年，中级。' },
    { id: 'r6', cardId: 'c6', variantId: 'v6', section: 'research', fieldKey: 'research1', type: 'RESEARCH', title: 'DA-PhysDiff：扩散模型驱动的物理仿真', facts: { organization: '计算机学院', role: '第一作者', startDate: '2024-09', endDate: '2025-06' }, content: '提出了一种物理约束的扩散模型，发表于 AAAI 2025。' },
  ],
  // 服务端会把「引用了卡片」的字段 text 解析成卡片文案，所以这里给的是解析后的样子
  blocks: [
    { key: 'self', title: '自我评价', fields: [{ key: 'selfEvaluation', label: '自我评价', text: '两年前端经验，主攻工程化与多 Agent 编排。' }] },
    { key: 'projects', title: '项目经历', fields: [{ key: 'project1', label: '项目经历 1', text: '用 LangGraph 编排多 Agent 完成前端迁移。' }] },
    { key: 'internship', title: '实习经历', fields: [{ key: 'internship1', label: '实习经历 1', text: '负责推荐排序特征工程，CTR 提升 3%。' }] },
  ],
}

const fields = [
  { id: 'city', label: '期望工作地点', controlType: 'input', inputType: 'text' },
  { id: 'salary', label: '期望薪资', controlType: 'input', inputType: 'text' },
  { id: 'source', label: '招聘来源', controlType: 'input', inputType: 'text' },
  { id: 'available', label: '可到岗时间', controlType: 'input', inputType: 'text' },
  { id: 'referral', label: '内推码', controlType: 'input', inputType: 'text' },
  { id: 'self', label: '自我评价', controlType: 'textarea', inputType: 'textarea' },
  { id: 'company', label: '公司名称', controlType: 'input', inputType: 'text' },
  { id: 'jobTitle', label: '职位名称', controlType: 'input', inputType: 'text' },
  { id: 'workBody', label: '工作内容', controlType: 'textarea', inputType: 'textarea' },
  { id: 'projectName', label: '项目名称', controlType: 'input', inputType: 'text' },
  { id: 'projectRole', label: '项目角色', controlType: 'input', inputType: 'text' },
  { id: 'projectBody', label: '项目描述', controlType: 'textarea', inputType: 'textarea' },
  { id: 'campusName', label: '校园经历名称', controlType: 'input', inputType: 'text' },
  { id: 'campusRole', label: '校园职务', controlType: 'input', inputType: 'text' },
  { id: 'certificate', label: '证书名称', controlType: 'input', inputType: 'text' },
  { id: 'researchName', label: '论文名称', controlType: 'input', inputType: 'text' },
  { id: 'researchRole', label: '作者顺位', controlType: 'input', inputType: 'text' },
  { id: 'researchStart', label: '科研开始时间', controlType: 'input', inputType: 'text' },
  { id: 'researchBody', label: '科研描述', controlType: 'textarea', inputType: 'textarea' },
]

/** 期望填出来的值；写成表是为了把"应该是什么"和"实际是什么"并排看 */
const expected = {
  city: '北京',
  salary: '15001～25000',
  source: 'BOSS直聘',
  available: '一个月内',
  referral: 'ABC123',
  self: '两年前端经验，主攻工程化与多 Agent 编排。',
  company: '搜狐',
  jobTitle: '算法实习生',
  workBody: '负责推荐排序特征工程，CTR 提升 3%。',
  projectName: '多 Agent 前端迁移系统',
  projectRole: '前端负责人',
  projectBody: '用 LangGraph 编排多 Agent 完成前端迁移。',
  campusName: '校学生会',
  campusRole: '技术部部长',
  certificate: '软考数据库系统工程师',
  researchName: 'DA-PhysDiff：扩散模型驱动的物理仿真',
  researchRole: '第一作者',
  researchStart: '2024-09',
  researchBody: '提出了一种物理约束的扩散模型，发表于 AAAI 2025。',
}

const plan = buildFillPlan(profile, fields)
const entryOf = id => plan.entries.find(entry => entry.fieldId === id)
let missed = 0

console.log(`\n填充结果：filled ${plan.summary.filled} / needs_manual ${plan.summary.needs_manual} / skipped ${plan.summary.skipped_existing + plan.summary.skipped_sensitive}\n`)
for (const field of fields) {
  const entry = entryOf(field.id)
  const want = expected[field.id]
  const got = entry?.status === 'filled' ? entry.value : ''
  const pass = got === want
  if (!pass) missed += 1
  console.log(
    `${pass ? 'OK  ' : 'MISS'} ${field.label.padEnd(7, '　')} ${String(entry?.target ?? '-').padEnd(26)}`
    + (pass ? JSON.stringify(got) : `期望 ${JSON.stringify(want)}，实际 ${entry?.status === 'filled' ? JSON.stringify(got) : `未填（${entry?.reason ?? '无该字段'}）`}`),
  )
}

console.log(missed === 0 ? '\n全部符合预期。\n' : `\n${missed} 项与预期不符。\n`)
process.exit(missed === 0 ? 0 : 1)
