import assert from 'node:assert/strict'
import test from 'node:test'

import { buildFillEvidence, buildStructuredFillCandidates } from './form-fill-context'

test('compacts resolved profile into form-fill evidence without composition metadata', () => {
  const evidence = buildFillEvidence({
    basics: { fullName: '张三' },
    educations: [{ school: '示例大学', college: '计算机学院' }],
    strategy: { targetLocations: ['北京'] },
    references: [{ id: 'ref-1', cardId: 'card-1', variantId: 'variant-1', type: 'PROJECT', title: '迁移系统', section: 'projects', facts: { role: '负责人' }, content: '项目描述' }],
    blocks: [{ key: 'projects', title: '项目经历', fields: [{ key: 'p1', label: '项目一', text: '项目描述', count: 4, limit: 2, overLimit: true }] }],
    resumeVersion: { id: 'resume-1', type: 'BASE', content: '基础简历正文' },
  })

  assert.deepEqual(evidence.experiences, [{ type: 'PROJECT', title: '迁移系统', section: 'projects', facts: { role: '负责人' }, content: '项目描述' }])
  assert.deepEqual(evidence.sections, [{ title: '项目经历', fields: [{ label: '项目一', text: '项目描述' }] }])
  assert.equal(evidence.resumeContent, '基础简历正文')
  assert.equal(JSON.stringify(evidence).includes('variantId'), false)
  assert.equal(JSON.stringify(evidence).includes('overLimit'), false)
})

test('builds ordered deterministic candidates for education, internships and projects', () => {
  const fills = buildStructuredFillCandidates({
    basics: { phone: '13800138000', documentNumber: '110101199001011234', targetCities: ['北京'] },
    educations: [{ school: '示例大学', degree: '硕士', college: '计算机学院', lab: '智能实验室', researchDirection: '人工智能', advisor: '张老师', startDate: '2024-09', endDate: '2027-06' }],
    references: [
      { type: 'INTERNSHIP', title: '前端实习', facts: { organization: '甲公司', role: '前端工程师', startDate: '2024-01', endDate: '2024-06' }, content: '负责前端平台建设。' },
      { type: 'INTERNSHIP', title: '研发实习', facts: { organization: '乙公司', role: '研发工程师', startDate: '2024-07', endDate: '2024-12' }, content: '负责研发工具建设。' },
      { type: 'PROJECT', title: '迁移系统', facts: { role: '负责人', startDate: '2025-01', endDate: '2025-06' }, content: '设计并实现迁移系统。' },
    ],
  }, [
    { id: 'phone', label: '手机号码', controlType: 'input' },
    { id: 'school', label: '学校名称', controlType: 'input' },
    { id: 'college', label: '学院', controlType: 'input' },
    { id: 'edu-start', label: '起止时间', controlType: 'input' },
    { id: 'edu-end', label: '起止时间', controlType: 'input' },
    { id: 'work-company-1', label: '公司名称', controlType: 'input' },
    { id: 'work-role-1', label: '职位名称', controlType: 'input' },
    { id: 'work-start-1', label: '起止时间', controlType: 'input' },
    { id: 'work-end-1', label: '起止时间', controlType: 'input' },
    { id: 'work-description-1', label: '描述', controlType: 'textarea' },
    { id: 'work-company-2', label: '公司名称', controlType: 'input' },
    { id: 'work-role-2', label: '职位名称', controlType: 'input' },
    { id: 'project-name', label: '项目名称', controlType: 'input' },
    { id: 'project-role', label: '项目角色', controlType: 'input' },
    { id: 'project-start', label: '起止时间', controlType: 'input' },
    { id: 'project-end', label: '起止时间', controlType: 'input' },
    { id: 'project-description', label: '描述', controlType: 'textarea' },
  ])

  assert.deepEqual(Object.fromEntries(fills.map(fill => [fill.fieldId, fill.value])), {
    phone: '13800138000',
    school: '示例大学',
    college: '计算机学院',
    'edu-start': '2024-09',
    'edu-end': '2027-06',
    'work-company-1': '甲公司',
    'work-role-1': '前端工程师',
    'work-start-1': '2024-01',
    'work-end-1': '2024-06',
    'work-description-1': '负责前端平台建设。',
    'work-company-2': '乙公司',
    'work-role-2': '研发工程师',
    'project-name': '迁移系统',
    'project-role': '负责人',
    'project-start': '2025-01',
    'project-end': '2025-06',
    'project-description': '设计并实现迁移系统。',
  })
})

test('keeps education fields on the same record when dates appear before school and stops project descriptions at later sections', () => {
  const fills = buildStructuredFillCandidates({
    educations: [
      { school: '硕士学校', degree: '硕士', college: '软件学院', lab: '智能实验室', researchDirection: '智能软件', advisor: '张老师', startDate: '2024-09', endDate: '2027-06' },
      { school: '本科学校', degree: '学士', college: '计算机学院', startDate: '2019-09', endDate: '2023-06' },
    ],
    references: [{ type: 'PROJECT', title: '迁移平台', facts: { role: '负责人' }, content: '项目事实描述。' }],
    resumeVersion: { content: '## 专业技能\n- 熟悉 Vue 与 TypeScript\n\n### 荣誉奖项\n- 学业一等奖学金 | 数据库系统工程师（中级）| 华为 HCIA-AI 认证\n- CET-6（494）\n\n[GitHub](https://github.com/example)' },
  }, [
    { id: 'edu-start', label: '起止时间' },
    { id: 'edu-end', label: '起止时间' },
    { id: 'school', label: '学校名称' },
    { id: 'college', label: '学院' },
    { id: 'lab', label: '实验室' },
    { id: 'direction', label: '领域方向' },
    { id: 'advisor', label: '导师' },
    { id: 'project-name', label: '项目名称' },
    { id: 'project-description', label: '描述' },
    { id: 'award', label: '竞赛名称' },
    { id: 'award-description', label: '描述' },
    { id: 'certificate', label: '证书名称' },
    { id: 'certificate-description', label: '描述' },
    { id: 'language', label: '语言' },
    { id: 'proficiency', label: '精通程度' },
    { id: 'self', label: '自我评价' },
    { id: 'platform', label: '社交平台' },
    { id: 'social-url', label: 'URL / ID' },
  ])
  const byId = Object.fromEntries(fills.map(fill => [fill.fieldId, fill.value]))

  assert.deepEqual({ start: byId['edu-start'], end: byId['edu-end'], school: byId.school, lab: byId.lab, direction: byId.direction, advisor: byId.advisor }, {
    start: '2024-09', end: '2027-06', school: '硕士学校', lab: '智能实验室', direction: '智能软件', advisor: '张老师',
  })
  assert.equal(byId['project-description'], '项目事实描述。')
  assert.equal(byId.award, '学业一等奖学金')
  assert.equal(byId['award-description'], undefined)
  assert.equal(byId.certificate, '数据库系统工程师（中级）')
  assert.equal(byId['certificate-description'], undefined)
  assert.equal(byId.language, 'CET-6（494）')
  assert.equal(byId.proficiency, 'CET-6（494）')
  assert.match(byId.self, /Vue 与 TypeScript/)
  assert.equal(byId.platform, 'GitHub')
  assert.equal(byId['social-url'], 'https://github.com/example')
})
