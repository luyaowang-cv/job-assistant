import assert from 'node:assert/strict'
import test from 'node:test'

import { buildFillPlan, classifyField, reconcileFillOutcome } from './form-fill-rules.js'
import { applyChoiceEntries, applyFillEntries, collectControlValues, scanVisibleFormFields } from './form-page-bridge.js'

const profile = {
  basics: {
    fullName: '张三',
    phone: '13800138000',
    email: 'wang@example.com',
    city: '北京',
    countryRegion: '中国',
    gender: '女',
    birthDate: '2000-01-01',
    wechatId: 'zhangsan',
    politicalStatus: '中共党员',
    documentType: '居民身份证',
  },
}

test('fills only unique, high-confidence Chinese and English basic fields', () => {
  const plan = buildFillPlan(profile, [
    { id: 'name', label: '姓名', inputType: 'text', hasValue: false },
    { id: 'mail', label: 'Email Address', inputType: 'email', hasValue: false },
    { id: 'mobile', label: '手机号', inputType: 'tel', hasValue: false },
  ])

  assert.deepEqual(plan.summary, { filled: 3, skipped_existing: 0, skipped_sensitive: 0, needs_manual: 0 })
  assert.deepEqual(plan.entries.map(entry => entry.target), ['basics.fullName', 'basics.email', 'basics.phone'])
})

test('fills F-006 common fields, reading the shared document label from a text control', () => {
  const localProfile = {
    basics: { countryRegion: '中国', gender: '女', wechatId: 'zhangsan', politicalStatus: '中共党员', documentNumber: '110101199001011234' },
  }
  const plan = buildFillPlan(localProfile, [
    { id: 'country', label: '国家/地区', controlType: 'input', inputType: 'text' },
    { id: 'gender', label: '性别', controlType: 'input', inputType: 'text' },
    { id: 'wechat', label: '微信号', controlType: 'input', inputType: 'text' },
    { id: 'political-status', label: '政治面貌', controlType: 'input', inputType: 'text' },
    { id: 'document-number', label: '个人证件', controlType: 'input', inputType: 'text' },
  ])

  assert.deepEqual(plan.summary, { filled: 5, skipped_existing: 0, skipped_sensitive: 0, needs_manual: 0 })
  assert.deepEqual(plan.entries.map(entry => entry.target), ['basics.countryRegion', 'basics.gender', 'basics.wechatId', 'basics.politicalStatus', 'basics.documentNumber'])
})

test('accepts labels with required markers and trailing colons after page-side normalization', () => {
  const plan = buildFillPlan(profile, [
    { id: 'name', label: '姓名 *', inputType: 'text' },
    { id: 'city', label: '所在城市：', inputType: 'text' },
  ])

  assert.deepEqual(plan.summary, { filled: 2, skipped_existing: 0, skipped_sensitive: 0, needs_manual: 0 })
  assert.deepEqual(plan.entries.map(entry => entry.target), ['basics.fullName', 'basics.city'])
})

test('derives age only from a valid full birth date', () => {
  const plan = buildFillPlan(profile, [{ id: 'age', label: '年龄', inputType: 'text' }])

  assert.equal(plan.entries[0].status, 'filled')
  assert.equal(plan.entries[0].target, 'basics.age')
  assert.equal(plan.entries[0].derived, true)
  assert.equal(plan.entries[0].value, String(new Date().getFullYear() - 2000))

  const incomplete = buildFillPlan({ basics: { birthDate: '2000-01' } }, [{ id: 'age', label: '年龄', inputType: 'text' }])
  assert.equal(incomplete.entries[0].status, 'needs_manual')
})

test('fills a native select when the saved value names exactly one option', () => {
  const plan = buildFillPlan(profile, [
    { id: 'country', label: '国家/地区', controlType: 'select', options: ['请选择', '中国'] },
    { id: 'gender', label: '性别', controlType: 'select', options: ['男', '女'] },
    { id: 'multiple', label: '所在城市', controlType: 'select', multiple: true, options: ['北京', '上海'] },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), ['filled', 'filled', 'filled'])
  assert.deepEqual(plan.entries.map(entry => entry.value), ['中国', '女', '北京'])
})

test('matches select options through the synonym table instead of exact text alone', () => {
  const localProfile = {
    basics: { countryRegion: '中国', politicalStatus: '中共党员' },
    educations: [{ educationLevel: '本科' }],
  }
  const plan = buildFillPlan(localProfile, [
    { id: 'country', label: '国家/地区', controlType: 'select', options: ['中国大陆'] },
    { id: 'level', label: '最高学历', controlType: 'select', options: ['大学本科', '硕士研究生'] },
    { id: 'political', label: '政治面貌', controlType: 'select', options: ['中共党员（含预备）', '群众'] },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), ['filled', 'filled', 'filled'])
  assert.deepEqual(plan.entries.map(entry => entry.value), ['中国大陆', '大学本科', '中共党员（含预备）'])
})

test('leaves a genuinely ambiguous select option for manual review', () => {
  const plan = buildFillPlan(profile, [
    { id: 'ambiguous', label: '所在城市', controlType: 'select', options: ['北京市朝阳区', '北京市海淀区'] },
  ])

  assert.equal(plan.entries[0].status, 'needs_manual')
  assert.equal(plan.entries[0].reason, '下拉选项不存在可确认的唯一匹配，需要人工确认。')
})

test('never reports or overwrites existing field content', () => {
  const plan = buildFillPlan(profile, [{ id: 'name', label: '姓名', hasValue: true }])

  assert.equal(plan.entries[0].status, 'skipped_existing')
  assert.equal('value' in plan.entries[0], false)
  assert.equal(JSON.stringify(plan).includes('原页面已有内容'), false)
})

test('keeps password, uploads and consent controls excluded', () => {
  const plan = buildFillPlan(profile, [
    { id: 'id-card', label: '身份证号码', inputType: 'text' },
    { id: 'password', label: '登录信息', inputType: 'password' },
    { id: 'upload', label: '普通材料', inputType: 'file' },
    { id: 'consent', label: '个人信息授权声明', inputType: 'checkbox' },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), ['needs_manual', 'skipped_sensitive', 'skipped_sensitive', 'skipped_sensitive'])
  assert.equal(classifyField({ id: 'bank', label: '银行卡号' }), 'sensitive')
})

test('fills explicit local-only identity and emergency-contact labels', () => {
  const localProfile = { basics: { documentNumber: '110101199001011234', emergencyContactName: '张三', emergencyContactRelation: '父亲', emergencyContactPhone: '13900139000', birthDate: '2000-01-01' } }
  const plan = buildFillPlan(localProfile, [
    { id: 'identity', label: '身份证号码', inputType: 'text' },
    { id: 'contact-name', label: '紧急联系人姓名', inputType: 'text' },
    { id: 'contact-relation', label: '紧急联系人关系', inputType: 'text' },
    { id: 'contact-phone', label: '紧急联系电话', inputType: 'text' },
    { id: 'birth', label: '出生日期', inputType: 'date' },
  ])
  assert.deepEqual(plan.entries.map(entry => entry.status), Array(5).fill('filled'))
  assert.deepEqual(plan.entries.map(entry => entry.target), ['basics.documentNumber', 'basics.emergencyContactName', 'basics.emergencyContactRelation', 'basics.emergencyContactPhone', 'basics.birthDate'])
})

test('separates document type from document number when a shared label has paired controls', () => {
  const localProfile = {
    basics: {
      documentType: '居民身份证',
      documentNumber: '110101199001011234',
    },
  }
  const plan = buildFillPlan(localProfile, [
    { id: 'document-type', label: '个人证件', controlType: 'select', options: ['请选择', '居民身份证'] },
    { id: 'document-number', label: '个人证件', controlType: 'input', inputType: 'text' },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), ['filled', 'filled'])
  assert.deepEqual(plan.entries.map(entry => entry.target), ['basics.documentType', 'basics.documentNumber'])
  assert.equal(plan.entries[1].value, '110101199001011234')
})

test('fills an exact gender radio group and the first preferred work location', () => {
  const localProfile = {
    basics: { gender: '女', targetCities: ['北京', '上海'] },
  }
  const plan = buildFillPlan(localProfile, [
    { id: 'gender', label: '性别', controlType: 'radio-group', inputType: 'radio', options: ['男', '女'] },
    { id: 'target-city', label: '期望工作地点', controlType: 'custom-select', options: [] },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), ['filled', 'filled'])
  assert.deepEqual(plan.entries.map(entry => entry.target), ['basics.gender', 'basics.targetCity'])
  assert.deepEqual(plan.entries.map(entry => entry.value), ['女', '北京'])
})

test('fills highest education fields locally before requesting AI', () => {
  const educationProfile = {
    basics: { fullName: '张三', email: 'wang@example.com' },
    educations: [
      { school: 'A 大学', major: '软件工程', educationLevel: '本科', academicDegree: '工学学士', endDate: '2025-06-30' },
      { school: 'B 大学', major: '计算机科学与技术', educationLevel: '硕士研究生', academicDegree: '工学硕士', endDate: '2027-06-30' },
    ],
  }
  const plan = buildFillPlan(educationProfile, [
    { id: 'name', name: 'fullName', inputType: 'text' },
    { id: 'email', name: 'email', inputType: 'email' },
    { id: 'school', label: '毕业院校', inputType: 'text' },
    { id: 'major', label: '专业名称', inputType: 'text' },
    { id: 'level', label: '最高学历', inputType: 'text' },
    { id: 'degree', label: '最高学位', inputType: 'text' },
    { id: 'graduation', label: '毕业时间', inputType: 'text' },
  ])
  assert.deepEqual(plan.entries.map(entry => entry.status), Array(7).fill('filled'))
  assert.deepEqual(plan.entries.map(entry => entry.value), ['张三', 'wang@example.com', 'B 大学', '计算机科学与技术', '硕士研究生', '工学硕士', '2027-06-30'])
})

test('keeps ATSX custom selectors manual while filling Formily metadata text fields', () => {
  const educationProfile = {
    basics: { fullName: '张三', phone: '13800138000', email: 'wang@example.com', documentNumber: '110101199001011234' },
    educations: [{ school: 'A 大学', major: '软件工程', endDate: '2027-06-30' }],
  }
  const plan = buildFillPlan(educationProfile, [
    { id: 'name', label: '姓名', name: 'name', controlType: 'input', inputType: 'text', isEditable: true },
    { id: 'mobile', label: '手机号码', name: 'mobile', controlType: 'input', inputType: 'text', isEditable: true },
    { id: 'email', label: '邮箱', name: 'email', controlType: 'input', inputType: 'text', isEditable: true },
    { id: 'identification', label: '个人证件', name: 'identification', controlType: 'input', inputType: 'text', isEditable: true },
    { id: 'school', label: '学校名称', name: 'school', controlType: 'input', inputType: 'text', isEditable: true },
    { id: 'major', label: '专业', name: 'field_of_study', controlType: 'input', inputType: 'text', isEditable: true },
    { id: 'education-type', label: '学历类型', controlType: 'custom-select', inputType: 'search', isEditable: false },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), ['filled', 'filled', 'filled', 'filled', 'filled', 'filled', 'needs_manual'])
  assert.equal(plan.entries[6].reason, '字段当前不可编辑。')
})

test('fills dates, radios and selects while leaving unknown labels and duplicate single-valued fields manual', () => {
  const localProfile = {
    basics: { ...profile.basics, targetCities: ['北京'] },
    educations: [{ school: 'A 大学', startDate: '2021-09-01' }],
  }
  const plan = buildFillPlan(localProfile, [
    { id: 'start', label: '入学日期', inputType: 'date' },
    { id: 'city', label: '所在城市', controlType: 'select', options: ['北京', '上海'] },
    { id: 'gender', label: '性别', controlType: 'radio-group', options: ['男', '女'] },
    { id: 'document-type', label: '证件类型', controlType: 'select', options: ['居民身份证', '护照'] },
    { id: 'first-name', label: '姓名' },
    { id: 'second-name', label: '姓名' },
    { id: 'question', label: '最喜欢的颜色' },
  ])

  assert.deepEqual(
    plan.entries.map(entry => entry.status),
    ['filled', 'filled', 'filled', 'filled', 'filled', 'needs_manual', 'needs_manual'],
  )
  assert.equal(plan.entries[0].value, '2021-09-01')
  assert.equal(plan.entries[5].reason, '页面已存在同一档案栏目的另一个字段，此字段需要人工确认。')
  assert.equal(plan.entries[6].reason, '字段含义无法可靠确认。')
})

test('maps repeated page blocks onto consecutive saved records', () => {
  const localProfile = {
    workExperiences: [
      { company: '甲公司', title: '前端实习生', startDate: '2023-07', endDate: '2023-09', description: '甲的工作内容' },
      { company: '乙公司', title: '后端实习生', startDate: '2024-01', endDate: '2024-06', description: '乙的工作内容' },
    ],
  }
  // One card per record, the layout ATS forms actually render.
  const plan = buildFillPlan(localProfile, [
    { id: 'c1', label: '公司名称', controlType: 'input', inputType: 'text' },
    { id: 't1', label: '职位名称', controlType: 'input', inputType: 'text' },
    { id: 'd1', label: '工作描述', controlType: 'textarea', inputType: 'textarea' },
    { id: 'c2', label: '公司名称', controlType: 'input', inputType: 'text' },
    { id: 't2', label: '职位名称', controlType: 'input', inputType: 'text' },
    { id: 'd2', label: '工作描述', controlType: 'textarea', inputType: 'textarea' },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), Array(6).fill('filled'))
  assert.deepEqual(
    plan.entries.map(entry => entry.value),
    ['甲公司', '前端实习生', '甲的工作内容', '乙公司', '后端实习生', '乙的工作内容'],
  )
  assert.match(plan.entries[3].reason, /第 2 条记录/)
})

test('never repeats one saved record across two boxes of the same field', () => {
  const localProfile = { workExperiences: [{ company: '甲公司', description: '甲的内容' }] }
  const plan = buildFillPlan(localProfile, [
    { id: 'd1', label: '工作描述', controlType: 'textarea', inputType: 'textarea' },
    { id: 'd2', label: '工作描述', controlType: 'textarea', inputType: 'textarea' },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), ['filled', 'needs_manual'])
  assert.equal(plan.entries[1].reason, '页面中的重复区块多于档案中的记录条数，此字段需要人工确认。')
})

test('uses the section hint to disambiguate generic labels and dates', () => {
  const localProfile = {
    educations: [{ school: 'A 大学', major: '软件工程', startDate: '2021-09' }],
    workExperiences: [{ company: '甲公司', startDate: '2023-07', description: '甲的工作内容' }],
  }
  const plan = buildFillPlan(localProfile, [
    // A generic label with no section evidence names no record, so it stays manual.
    { id: 'bare', label: '描述', context: '页面字段 1/2', controlType: 'textarea', inputType: 'textarea' },
    // The same generic label inside an internship block is the internship description.
    { id: 'work-desc', label: '描述', context: '实习经历；相邻字段：公司名称', controlType: 'textarea', inputType: 'textarea' },
    // “开始时间” appears in every block; the surrounding text decides which.
    { id: 'edu-start', label: '开始时间', context: '教育经历；相邻字段：学校名称', controlType: 'input', inputType: 'text' },
    { id: 'work-start', label: '开始时间', context: '实习经历；相邻字段：公司名称', controlType: 'input', inputType: 'text' },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), ['needs_manual', 'filled', 'filled', 'filled'])
  assert.equal(plan.entries[1].target, 'work.description')
  assert.equal(plan.entries[2].target, 'education.startDate')
  assert.equal(plan.entries[3].target, 'work.startDate')
})

test('vetoes the classic near-miss labels', () => {
  const localProfile = {
    basics: { fullName: '张三' },
    educations: [{ school: 'A 大学' }],
    workExperiences: [{ company: '甲公司' }],
  }
  const plan = buildFillPlan(localProfile, [
    { id: 'pinyin', label: '姓名拼音', controlType: 'input', inputType: 'text' },
    { id: 'company-type', label: '公司性质', controlType: 'select', options: ['民营', '国企'] },
    { id: 'school-as-date', label: '学校名称', controlType: 'input', inputType: 'date' },
    { id: 'name', label: '姓名', controlType: 'input', inputType: 'text' },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), ['needs_manual', 'needs_manual', 'needs_manual', 'filled'])
})

test('formats dates for the control that receives them, including month boundaries', () => {
  const localProfile = { educations: [{ startDate: '2021-09', endDate: '2025-06' }] }
  const valueFor = field => buildFillPlan(localProfile, [field]).entries[0].value

  // A month control keeps month precision; a full-date control gets a real day,
  // and an end date lands on the last day of its month rather than its first.
  assert.equal(valueFor({ id: 'm', label: '毕业时间', controlType: 'input', inputType: 'month' }), '2025-06')
  assert.equal(valueFor({ id: 'd', label: '入学时间', controlType: 'input', inputType: 'date' }), '2021-09-01')
  assert.equal(valueFor({ id: 'h', label: '毕业时间', controlType: 'input', inputType: 'text', placeholder: 'YYYY-MM-DD' }), '2025-06-30')
  // A plain text box states no precision, so the value is passed through as saved.
  assert.equal(valueFor({ id: 'p', label: '入学时间', controlType: 'input', inputType: 'text' }), '2021-09')
})

test('checks the “no internship experience” box only when the profile holds none', () => {
  const withoutWork = buildFillPlan({}, [
    { id: 'none', label: '无实习经历', controlType: 'input', inputType: 'checkbox' },
  ])
  assert.equal(withoutWork.entries[0].status, 'filled')
  assert.equal(withoutWork.entries[0].value, 'true')

  const withWork = buildFillPlan({ workExperiences: [{ company: '甲公司' }] }, [
    { id: 'none', label: '无实习经历', controlType: 'input', inputType: 'checkbox' },
  ])
  assert.equal(withWork.entries[0].status, 'needs_manual')
  assert.equal(withWork.entries[0].reason, '档案中存在实习或工作经历，此项不应勾选。')
})

test('reconciles fields changed after scan without leaking their previous value', () => {
  const plan = buildFillPlan(profile, [
    { id: 'name', label: '姓名' },
    { id: 'mail', label: '邮箱' },
  ])
  const report = reconcileFillOutcome(plan, { appliedIds: ['name'], skippedExistingIds: ['mail'], unavailableIds: [] })

  assert.deepEqual(report.summary, { filled: 1, skipped_existing: 1, skipped_sensitive: 0, needs_manual: 0 })
  assert.equal(report.entries[1].value, undefined)
})

test('classifies complete application-profile content for the AI fallback path', () => {
  const plan = buildFillPlan(profile, [
    { id: 'project', label: '项目描述', controlType: 'textarea', inputType: 'textarea', hasValue: false, isEditable: true },
    { id: 'internship', label: '实习经历', controlType: 'textarea', inputType: 'textarea', hasValue: false, isEditable: true },
    { id: 'self', label: '自我评价', controlType: 'textarea', inputType: 'textarea', hasValue: false, isEditable: true },
    { id: 'start', label: '项目开始时间', controlType: 'input', inputType: 'month', hasValue: false, isEditable: true },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.category), ['project', 'work', 'basic', 'project'])
  assert.ok(plan.entries.every(entry => entry.status === 'needs_manual'))
  assert.ok(plan.entries.every(entry => entry.status !== 'skipped_sensitive'))
})

test('answers project, internship and self-evaluation blocks from saved data before asking the AI', () => {
  const localProfile = {
    ...profile,
    blocks: [{ title: '自我评价', fields: [{ label: '内容', text: '踏实肯干，熟悉前端工程化。' }] }],
    projects: [{ name: '网申助手', role: '前端负责人', startDate: '2024-03', description: '负责扩展的字段识别与填写链路。' }],
    workExperiences: [{ company: '甲公司', title: '前端实习生', startDate: '2023-07', description: '维护组件库与构建流程。' }],
  }
  const plan = buildFillPlan(localProfile, [
    { id: 'project', label: '项目描述', controlType: 'textarea', inputType: 'textarea', isEditable: true },
    { id: 'internship', label: '工作描述', controlType: 'textarea', inputType: 'textarea', isEditable: true },
    { id: 'self', label: '自我评价', controlType: 'textarea', inputType: 'textarea', isEditable: true },
    { id: 'start', label: '项目开始时间', controlType: 'input', inputType: 'month', isEditable: true },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), Array(4).fill('filled'))
  assert.deepEqual(plan.entries.map(entry => entry.value), [
    '负责扩展的字段识别与填写链路。',
    '维护组件库与构建流程。',
    '踏实肯干，熟悉前端工程化。',
    '2024-03',
  ])
})

test('writes text through the full input contract a controlled component needs', () => {
  const source = applyFillEntries.toString()
  assert.match(source, /new InputEvent\('beforeinput'/)
  assert.match(source, /Object\.getOwnPropertyDescriptor\(prototype, 'value'\)/)
  assert.match(source, /new InputEvent\('input'/)
  // A real blur, not only a synthesised event, so validators that watch
  // document.activeElement notice the field was committed.
  assert.match(source, /element\.blur\?\.\(\)/)
  assert.match(source, /COMMIT_SETTLE_MS/)
  // Values a framework can revert are re-checked once for the whole batch.
  assert.match(source, /deferredReadbacks/)
  assert.match(source, /await auditDeferredReadbacks\(\)/)
  // The per-field sleeps that used to dominate a long form are gone.
  assert.doesNotMatch(source, /pause\(180\)/)
  assert.doesNotMatch(source, /pause\(220\)/)
})

test('accepts a page that reformats what was written as a successful fill', () => {
  const source = applyFillEntries.toString()
  // Exact equality first, then a containment check so reformatting such as
  // “北京” → “北京市” is not reported as a failure.
  assert.match(source, /actual\.includes\(wanted\) \|\| wanted\.includes\(actual\)/)
})

test('refuses a control that has nothing left to identify it', () => {
  // A split date control's label comes back as the unit character beside it
  // (“年”, “至”), and the scan filters those out. What remains names nothing,
  // so neither the rule table nor the model should answer it.
  const plan = buildFillPlan(profile, [{ id: 'separator', label: '', name: '', placeholder: '' }])

  assert.equal(plan.entries[0].status, 'needs_manual')
  assert.equal(plan.entries[0].category, 'unlabeled')
  assert.equal(plan.entries[0].reason, '这个控件没有任何可识别的标签，无法判断它该填什么。')
  // The popup skips anything the plan marked, so a model never sees it.
  assert.equal(plan.entries[0].skipAi, true)
})

test('does not ask the model about a page block with no saved record behind it', () => {
  const localProfile = {
    educations: [{ school: 'A 大学', educationLevel: '本科', endDate: '2025-06-30' }],
  }
  const plan = buildFillPlan(localProfile, [
    { id: 'level-1', label: '学历', controlType: 'input', inputType: 'text' },
    { id: 'level-2', label: '学历', controlType: 'input', inputType: 'text' },
  ])

  assert.equal(plan.entries[0].status, 'filled')
  // One saved education, two page blocks: the second has no facts behind it.
  assert.equal(plan.entries[1].status, 'needs_manual')
  assert.equal(plan.entries[1].skipAi, true)
  assert.equal(plan.entries[1].reason, '页面中的重复区块多于档案中的记录条数，此字段需要人工确认。')
})

test('filters the stray unit characters a split date control sits next to', () => {
  const source = scanVisibleFormFields.toString()
  assert.match(source, /const isUselessLabel = /)
  // A sibling that contains another control is a previous field, not a label.
  assert.match(source, /const hasControl = /)
  assert.match(source, /\.find\(candidate => candidate && !isUselessLabel\(candidate\)\)/)
})

test('reads a split date from the field name', () => {
  const localProfile = {
    educations: [{ school: 'A 大学', startDate: '2021-09', endDate: '2025-06' }],
    workExperiences: [{ company: '甲公司', startDate: '2023-07', endDate: '2024-01' }],
  }
  // Frame works name these controls from the backend, and the name says which
  // record, which end of the range, and which component — the visible label is
  // often nothing but the unit character beside the box.
  const plan = buildFillPlan(localProfile, [
    { id: 'sy', name: 'RecruitmentPortalEducation_StartDate_Year', controlType: 'select', options: ['', '2020', '2021', '2022'] },
    { id: 'sm', name: 'RecruitmentPortalEducation_StartDate_Month', controlType: 'select', options: ['', ...Array.from({ length: 12 }, (_, i) => String(i + 1))] },
    { id: 'ey', name: 'RecruitmentPortalEducation_EndDate_Year', controlType: 'select', options: ['', '2024', '2025'] },
    { id: 'em', name: 'RecruitmentPortalEducation_EndDate_Month', controlType: 'select', options: ['', ...Array.from({ length: 12 }, (_, i) => String(i + 1))] },
    { id: 'wy', name: 'RecruitmentPortalWork_StartDate_Year', controlType: 'select', options: ['', '2023', '2024'] },
    { id: 'wm', name: 'RecruitmentPortalWork_EndDate_Month', controlType: 'select', options: ['', ...Array.from({ length: 12 }, (_, i) => String(i + 1))] },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), Array(6).fill('filled'))
  assert.deepEqual(plan.entries.map(entry => entry.target), [
    'education.startDate', 'education.startDate',
    'education.endDate', 'education.endDate',
    'work.startDate', 'work.endDate',
  ])
  // Each box gets its own component, not the whole date.
  assert.deepEqual(plan.entries.map(entry => entry.value), ['2021', '9', '2025', '6', '2023', '1'])
})

test('does not repeat one saved record across two page blocks', () => {
  const localProfile = { educations: [{ school: 'A 大学', startDate: '2021-09', endDate: '2025-06' }] }
  const months = ['', ...Array.from({ length: 12 }, (_, index) => String(index + 1))]
  const block = index => [
    { id: `s${index}y`, name: 'RecruitmentPortalEducation_StartDate_Year', controlType: 'select', options: ['', '2021', '2025'] },
    { id: `s${index}m`, name: 'RecruitmentPortalEducation_StartDate_Month', controlType: 'select', options: months },
    { id: `e${index}y`, name: 'RecruitmentPortalEducation_EndDate_Year', controlType: 'select', options: ['', '2021', '2025'] },
    { id: `e${index}m`, name: 'RecruitmentPortalEducation_EndDate_Month', controlType: 'select', options: months },
  ]
  const plan = buildFillPlan(localProfile, [...block(1), ...block(2)])

  assert.deepEqual(plan.entries.slice(0, 4).map(entry => entry.value), ['2021', '9', '2025', '6'])
  // One saved education, two page blocks: the second must not silently repeat it.
  assert.deepEqual(plan.entries.slice(4).map(entry => entry.status), Array(4).fill('needs_manual'))
  assert.ok(plan.entries.slice(4).every(entry => entry.skipAi === true))
})

test('leaves a split date part manual when no block can be identified', () => {
  const plan = buildFillPlan({ educations: [{ startDate: '2021-09' }] }, [
    { id: 'orphan', name: 'SomeWidget_StartDate_Month', controlType: 'select', options: ['', '9'] },
  ])

  assert.equal(plan.entries[0].status, 'needs_manual')
  assert.equal(plan.entries[0].skipAi, true)
  assert.equal(plan.entries[0].reason, '这是日期的一部分，但无法确定它属于哪一段档案记录。')
})

test('reads a date-format placeholder as one whole date, not as a split', () => {
  const plan = buildFillPlan({ educations: [{ endDate: '2025-06' }] }, [
    { id: 'full', label: '毕业时间', name: 'endDate', controlType: 'input', inputType: 'text', placeholder: 'YYYY-MM-DD' },
  ])

  assert.equal(plan.entries[0].status, 'filled')
  assert.equal(plan.entries[0].value, '2025-06-30')
})

test('does not mistake another tool’s tooltip for the field label', () => {
  // An autofill tool writes its status into `title` ("拾星已填写：姓名"). Reading
  // that as the label shadows the page's real one and shows up in the report.
  const source = scanVisibleFormFields.toString()
  assert.match(source, /const titleLabel = /)
  const attributeLabel = source.slice(source.indexOf('const attributeLabelFor'), source.indexOf('const titleLabel'))
  assert.doesNotMatch(attributeLabel, /getAttribute\('title'\)/)
  // It stays available, but only after the page's own structure has been tried.
  const chain = source.slice(source.indexOf('const labelFor ='))
  assert.ok(chain.indexOf('adjacentLabel(element),') < chain.indexOf('titleLabel(element),'))
})

test('reads a language proficiency box as the level, not the language name', () => {
  const plan = buildFillPlan({ languages: [{ name: '英语', detail: 'CET-6' }] }, [
    { id: 'level', label: '外语水平', controlType: 'input', inputType: 'text' },
    { id: 'name', label: '外语', controlType: 'input', inputType: 'text' },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.target), ['languages.detail', 'languages.name'])
  assert.deepEqual(plan.entries.map(entry => entry.value), ['CET-6', '英语'])
})

test('walks open shadow roots in every page-side pass', () => {
  // A form rendered inside a web component is invisible to `document.querySelectorAll`,
  // and the scan and both writers have to see the same controls in the same order
  // or `form-field-N` stops naming the control the plan was built for.
  for (const source of [
    scanVisibleFormFields.toString(),
    applyFillEntries.toString(),
    applyChoiceEntries.toString(),
    collectControlValues.toString(),
  ]) {
    assert.match(source, /shadowRoot/)
    assert.match(source, /const queryAll = /)
  }
})

test('names controls the same way in every page-side pass', () => {
  // An id is a control's position in the selector's result, so a pass that spells
  // one of these differently files a value against the wrong question — silently,
  // because nothing about the write would look wrong.
  const idSpellings = [
    'form-field-${index}',
    'radio-group-${anchorIndex}',
    'custom-select-${index}',
  ]
  const scan = scanVisibleFormFields.toString()
  const read = applyFillEntries.toString()
  const choice = applyChoiceEntries.toString()
  const collect = collectControlValues.toString()

  for (const spelling of idSpellings) {
    assert.ok(scan.includes(spelling), `扫描缺少 ${spelling}`)
    assert.ok(collect.includes(spelling), `取值器缺少 ${spelling}`)
  }
  assert.ok(read.includes('form-field-${index}'))
  assert.ok(choice.includes('radio-group-${anchorIndex}'))
  assert.ok(choice.includes('custom-select-${index}'))
})

test('keeps scanned fields in DOM order with repeated-label context', () => {
  const source = scanVisibleFormFields.toString()
  assert.match(source, /sortIndex/)
  assert.match(source, /同名字段/)
  assert.match(source, /相邻字段/)
})

test('scans and writes through the very same control selector', () => {
  // `form-field-N` names a control by its position in this list, so a selector
  // that differs by even one branch sends a value to the wrong box — silently,
  // since nothing about the write would look wrong.
  const declaration = /const CONTROL_SELECTOR = '([^']+)'/
  const selectors = [scanVisibleFormFields, applyFillEntries, applyChoiceEntries, collectControlValues]
    .map(func => declaration.exec(func.toString())?.[1])

  assert.ok(selectors.every(Boolean), 'every page-side pass must declare CONTROL_SELECTOR')
  assert.equal(new Set(selectors).size, 1)
  for (const selector of selectors) {
    // Under a literal `contenteditable="true"` these two spellings are skipped
    // entirely, and the field is never seen by any layer.
    assert.match(selector, /contenteditable=""/)
    assert.match(selector, /contenteditable="plaintext-only"/)
  }
})

test('supports Universe Design custom selects without the legacy hard block', () => {
  const scanSource = scanVisibleFormFields.toString()
  const applySource = applyChoiceEntries.toString()
  assert.doesNotMatch(scanSource, /isEditable:\s*!element\.closest\('\.ud__select'\)/)
  assert.match(applySource, /element\.closest\('\.ud__select, \.el-select/)
  assert.match(applySource, /\.ud__select-option/)
})

test('supports common framework comboboxes and contenteditable controls generically', () => {
  const scanSource = scanVisibleFormFields.toString()
  const applySource = applyChoiceEntries.toString()
  const textApplySource = applyFillEntries.toString()
  assert.match(scanSource, /contenteditable/)
  assert.match(scanSource, /\.ant-select/)
  assert.match(scanSource, /\.arco-select/)
  assert.match(scanSource, /\.semi-select/)
  assert.match(applySource, /\.ant-select-item-option/)
  assert.match(applySource, /\.arco-select-option/)
  assert.match(applySource, /\.semi-select-option/)
  assert.match(applySource, /scrollIntoView/)
  assert.match(applySource, /behavior:\s*'smooth'/)
  assert.match(textApplySource, /scrollIntoView/)
  assert.match(textApplySource, /await pause/)
})

test('never asks a model to guess a yes/no answer', () => {
  // The page is asking about the employer's own records, so the profile says
  // nothing about it, and a coin flip is indistinguishable from an answer in the
  // report. It goes to the person who can decide, and the answer memory keeps
  // that decision for next time.
  const plan = buildFillPlan(profile, [
    { id: 'kin', label: '是否有亲属在交银集团工作', controlType: 'radio-group', inputType: 'radio', options: ['是', '否'], skipAi: false },
    { id: 'channel', label: '招聘信息来源', controlType: 'select', options: ['BOSS直聘', '智联招聘', '其他'] },
  ])

  assert.equal(plan.entries[0].status, 'needs_manual')
  assert.equal(plan.entries[0].skipAi, true)
  assert.equal(plan.entries[0].reason, '这是是非题，档案里没有可以判断它的事实，需要你自己确认（确认一次就会被记住）。')
  // Everything else that the rules cannot place is still worth asking the model,
  // because the profile may well hold the answer in prose.
  assert.equal(plan.entries[1].status, 'needs_manual')
  assert.equal(plan.entries[1].skipAi, undefined)
})

test('answers a yes/no question from the profile when a rule covers it', () => {
  // The gate is only for questions the profile cannot answer. “是否有实习经历”
  // has a saved fact behind it, so it is answered rather than deferred.
  const plan = buildFillPlan({ workExperiences: [] }, [
    { id: 'none', label: '无实习经历', inputType: 'checkbox', controlType: 'input', options: [] },
  ])

  assert.equal(plan.entries[0].status, 'filled')
  assert.equal(plan.entries[0].value, 'true')
})

test('does not mistake 男/女 for a yes/no question', () => {
  const plan = buildFillPlan({ basics: { gender: '女' } }, [
    { id: 'gender', label: '性别', controlType: 'radio-group', inputType: 'radio', options: ['男', '女'] },
  ])

  assert.equal(plan.entries[0].status, 'filled')
  assert.equal(plan.entries[0].value, '女')
})

test('does not report a placeholder as the name of a field', () => {
  // “请选择” is what the page shows before an answer, not what the column is
  // called; printing it as the field's name reads like the tool understood the
  // form when it did not.
  const plan = buildFillPlan(profile, [
    { id: 'unset', label: '', name: '', placeholder: '请选择', controlType: 'input', inputType: 'text' },
    { id: 'named', label: '学历', name: '', placeholder: '请选择', controlType: 'input', inputType: 'text' },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.label), ['未命名字段', '学历'])
})

test('reads a split date box from the unit beside it and the block it sits in', () => {
  // A box whose whole visible name is “年” carries no other identity, which is
  // why the unit and the end of the range are read on the page and handed over
  // as `dateUnit` / `dateRole`. Without them this whole class of field — half of
  // a real application form — is unanswerable.
  const localProfile = { educations: [{ school: 'A 大学', startDate: '2021-09', endDate: '2025-06' }] }
  // One block holds both ends, so its text is what says which section this is.
  const context = '教育经历 入学时间 年 月 至 毕业时间 年 月'
  const box = (id, dateUnit, dateRole) => ({
    id,
    label: '',
    name: '',
    placeholder: dateUnit === 'year' ? '年' : '月',
    context,
    controlType: 'input',
    inputType: 'text',
    dateUnit,
    dateRole,
  })
  const plan = buildFillPlan(localProfile, [
    box('sy', 'year', 'start'),
    box('sm', 'month', 'start'),
    box('ey', 'year', 'end'),
    box('em', 'month', 'end'),
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), Array(4).fill('filled'))
  assert.deepEqual(plan.entries.map(entry => entry.target), [
    'education.startDate', 'education.startDate',
    'education.endDate', 'education.endDate',
  ])
  // Unpadded: these boxes are almost always a plain list of numbers.
  assert.deepEqual(plan.entries.map(entry => entry.value), ['2021', '9', '2025', '6'])
})

test('finds which end of a date a bare unit box belongs to from its block text', () => {
  // “入学时间” / “毕业时间” is written on the block around the box. Only the block
  // text may decide the role — a neighbour's label must not.
  const plan = buildFillPlan({ educations: [{ startDate: '2021-09', endDate: '2025-06' }] }, [
    { id: 'y', label: '', name: '', placeholder: '年', controlType: 'input', inputType: 'text', dateUnit: 'year', context: '入学时间；页面字段 3/12；相邻字段：专业名称、学历' },
  ])

  assert.equal(plan.entries[0].status, 'filled')
  assert.equal(plan.entries[0].target, 'education.startDate')
  assert.equal(plan.entries[0].value, '2021')
})

test('leaves a bare unit box alone when its block names both ends of the range', () => {
  // “起止时间 年 月 至 年 月” says which end nowhere: the boxes are ordered, not
  // labelled. Guessing a role from that order is a claim the page never made.
  const plan = buildFillPlan({ educations: [{ startDate: '2021-09' }] }, [
    { id: 'y', label: '', name: '', placeholder: '年', controlType: 'input', inputType: 'text', dateUnit: 'year', context: '起止时间；页面字段 1/4' },
  ])

  assert.equal(plan.entries[0].status, 'needs_manual')
})

test('reads a bare 职责 box in the block it belongs to', () => {
  // “职责” alone is what a work block calls its description box, and “项目中职责”
  // is the project one. The project rule must win over the work rule for its own
  // wording, or a project's duties would be answered from an internship's facts.
  const localProfile = {
    workExperiences: [{ company: '甲公司', description: '负责表单引擎' }],
    projects: [{ name: 'Offer来', description: '独立开发求职工作台' }],
  }
  const plan = buildFillPlan(localProfile, [
    { id: 'w', label: '职责', name: 'workResponsibilities', controlType: 'textarea', inputType: 'textarea' },
    { id: 'p', label: '项目中职责', name: '', controlType: 'textarea', inputType: 'textarea' },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.target), ['work.description', 'project.description'])
  assert.deepEqual(plan.entries.map(entry => entry.value), ['负责表单引擎', '独立开发求职工作台'])
})

test('answers the two questions the profile has always held the answers to', () => {
  // 招聘信息来源 and 推荐码 have been on the profile since the strategy schema was
  // written; no rule read them, so both came back as unanswerable on a real form
  // while the answer sat in the profile the whole time.
  const plan = buildFillPlan({ strategy: { recruitmentSource: 'BOSS直聘', referralCode: 'ABC123' } }, [
    { id: 'src', label: '招聘信息来源', controlType: 'input', inputType: 'text' },
    { id: 'code', label: '推荐码', controlType: 'input', inputType: 'text' },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), ['filled', 'filled'])
  assert.deepEqual(plan.entries.map(entry => entry.value), ['BOSS直聘', 'ABC123'])
})

test('reads the field names one real ATS uses for facts the profile already has', () => {
  // 生源地 is what 北森 calls 籍贯, and 职务 is what its project block calls the role.
  const plan = buildFillPlan({
    basics: { nativePlace: '河北省邯郸市' },
    projects: [{ name: 'Offer来', role: '独立开发' }],
  }, [
    { id: 'origin', label: '生源地', controlType: 'input', inputType: 'text' },
    { id: 'role', label: '职务', context: '相邻字段：项目名称、项目描述', controlType: 'input', inputType: 'text' },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.target), ['basics.nativePlace', 'project.role'])
  assert.deepEqual(plan.entries.map(entry => entry.value), ['河北省邯郸市', '独立开发'])
})

test('does not ask a model for a column the profile has no shape for', () => {
  // `skills` is a flat list of names: there is no per-skill duration and no
  // per-skill description anywhere in the profile. Nine rows of “使用时间总计” on one
  // real form would otherwise be nine invented durations.
  const plan = buildFillPlan({ skills: ['TypeScript', 'Vue'] }, [
    { id: 'dur', label: '使用时间总计', controlType: 'input', inputType: 'text' },
    { id: 'desc', label: '技能描述', controlType: 'textarea', inputType: 'textarea' },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), ['needs_manual', 'needs_manual'])
  assert.deepEqual(plan.entries.map(entry => entry.skipAi), [true, true])
  assert.equal(plan.entries[0].reason, '所选资料档案没有该字段的可用内容。')
})

test('reads the “至今” box from the end date of the record beside it', () => {
  // 北森 renders 单位名称 / 开始时间 / 结束时间 / □至今 per block. The box is checked
  // exactly when that record has no end date — a fact the profile already holds.
  const localProfile = {
    workExperiences: [
      { company: '甲公司', title: '实习生', startDate: '2026-04', endDate: '' },
      { company: '乙公司', title: '实习生', startDate: '2025-07', endDate: '2025-09' },
    ],
  }
  const block = index => [
    { id: `c${index}`, label: '单位名称', controlType: 'input', inputType: 'text' },
    { id: `s${index}`, label: '开始时间', context: '相邻字段：单位名称、结束时间、至今', controlType: 'input', inputType: 'text' },
    { id: `e${index}`, label: '结束时间', context: '相邻字段：开始时间、至今、单位名称', controlType: 'input', inputType: 'text' },
    { id: `p${index}`, label: '至今', controlType: 'input', inputType: 'checkbox' },
  ]
  const plan = buildFillPlan(localProfile, [...block(1), ...block(2)])

  assert.equal(plan.entries[3].status, 'filled')
  assert.equal(plan.entries[3].value, 'true')
  assert.equal(plan.entries[3].reason, '这段经历没有结束时间，勾选「至今」。')
  // The finished record's box stays unchecked, and says why instead of joining the
  // manual pile.
  assert.equal(plan.entries[7].status, 'skipped_existing')
  assert.equal(plan.entries[7].reason, '这段经历有结束时间（2025-09），不需要勾选「至今」。')
})

test('does not treat a “至今” box as a yes/no question', () => {
  // It has no end-date box to belong to, so it stays manual — but the reason names
  // the real problem rather than calling it a 是非题 the applicant must decide.
  const plan = buildFillPlan({ workExperiences: [] }, [
    { id: 'p', label: '至今', controlType: 'input', inputType: 'checkbox' },
  ])

  assert.equal(plan.entries[0].status, 'needs_manual')
  assert.equal(plan.entries[0].skipAi, true)
  assert.equal(plan.entries[0].reason, '这是「至今」开关，但没能确定它属于哪一段经历，需要你确认。')
})

test('never unchecks a box the applicant ticked herself', () => {
  const localProfile = { workExperiences: [{ company: '甲公司', startDate: '2026-04', endDate: '' }] }
  const plan = buildFillPlan(localProfile, [
    { id: 'c', label: '单位名称', controlType: 'input', inputType: 'text' },
    { id: 'e', label: '结束时间', context: '相邻字段：单位名称、至今', controlType: 'input', inputType: 'text' },
    { id: 'p', label: '至今', controlType: 'input', inputType: 'checkbox', hasValue: true },
  ])

  assert.equal(plan.entries[2].status, 'skipped_existing')
  assert.equal(plan.entries[2].reason, '字段已有内容，不会覆盖。')
})

test('reads a material-card reference the way the material library stores it', () => {
  // 素材卡把「名称」放在 title（实习卡就是公司名，见素材库各类型的标题标签），
  // 文案放在 variant 的 content 里；规则读的却是 company / name / detail。
  // 两边不翻译的话，公司名称会空着、公司名还会被写进职位名称。
  const localProfile = {
    workExperiences: [],
    projects: [],
    references: [
      { type: 'INTERNSHIP', title: '搜狐', facts: { organization: '推荐算法组', role: '算法实习生', startDate: '2025-06', endDate: '2025-09' }, content: '负责推荐排序特征工程。' },
      { type: 'PROJECT', title: '多 Agent 前端迁移系统', facts: { role: '前端负责人', startDate: '2025-03', endDate: '2025-05' }, content: '用 LangGraph 编排多 Agent 完成迁移。' },
      { type: 'AWARD', title: '全国大学生竞赛一等奖', facts: {}, content: '2025 年，国家级。' },
    ],
  }
  const plan = buildFillPlan(localProfile, [
    { id: 'company', label: '公司名称', controlType: 'input', inputType: 'text' },
    { id: 'job', label: '职位名称', controlType: 'input', inputType: 'text' },
    { id: 'work', label: '工作内容', controlType: 'textarea', inputType: 'textarea' },
    { id: 'pname', label: '项目名称', controlType: 'input', inputType: 'text' },
    { id: 'prole', label: '项目角色', controlType: 'input', inputType: 'text' },
    { id: 'award', label: '奖项名称', controlType: 'input', inputType: 'text' },
  ])
  const value = id => plan.entries.find(entry => entry.fieldId === id)?.value

  assert.equal(value('company'), '搜狐')
  assert.equal(value('job'), '算法实习生')
  assert.equal(value('work'), '负责推荐排序特征工程。')
  assert.equal(value('pname'), '多 Agent 前端迁移系统')
  assert.equal(value('prole'), '前端负责人')
  assert.equal(value('award'), '全国大学生竞赛一等奖')
})

test('fills 招聘来源 itself, not only its longer spellings', () => {
  const plan = buildFillPlan({ strategy: { recruitmentSource: 'BOSS直聘' } }, [
    { id: 'source', label: '招聘来源', controlType: 'input', inputType: 'text' },
  ])

  assert.equal(plan.entries[0].status, 'filled')
  assert.equal(plan.entries[0].target, 'basics.recruitmentSource')
  assert.equal(plan.entries[0].value, 'BOSS直聘')
})

test('fills a 科研经历 block from a research card, author position included', () => {
  const localProfile = {
    references: [
      { type: 'RESEARCH', title: 'DA-PhysDiff：扩散模型驱动的物理仿真', facts: { organization: '计算机学院', role: '第一作者', startDate: '2024-09', endDate: '2025-06' }, content: '提出了一种物理约束的扩散模型，发表于 AAAI 2025。' },
    ],
  }
  const plan = buildFillPlan(localProfile, [
    { id: 'name', label: '论文名称', controlType: 'input', inputType: 'text' },
    { id: 'author', label: '作者顺位', controlType: 'input', inputType: 'text' },
    { id: 'start', label: '开始时间', context: '相邻字段：论文名称、作者顺位', controlType: 'input', inputType: 'text' },
    { id: 'desc', label: '科研描述', controlType: 'textarea', inputType: 'textarea' },
  ])
  const value = id => plan.entries.find(entry => entry.fieldId === id)?.value

  assert.equal(value('name'), 'DA-PhysDiff：扩散模型驱动的物理仿真')
  assert.equal(value('author'), '第一作者')
  assert.equal(value('start'), '2024-09')
  assert.equal(value('desc'), '提出了一种物理约束的扩散模型，发表于 AAAI 2025。')
})

test('puts research records behind projects when a form only has 项目经历 blocks', () => {
  // 校招表常常只有一栏「项目经历」。科研记录拼在 projects 后面，所以项目不够时顶上，
  // 但永远不会把科研挤到项目前面。
  const localProfile = {
    projects: [],
    references: [
      { type: 'PROJECT', title: '多 Agent 前端迁移系统', facts: {}, content: '用 LangGraph 编排多 Agent。' },
      { type: 'RESEARCH', title: 'DA-PhysDiff', facts: {}, content: '物理约束的扩散模型。' },
    ],
  }
  const plan = buildFillPlan(localProfile, [
    { id: 'first', label: '项目名称', controlType: 'input', inputType: 'text' },
    { id: 'second', label: '项目名称', controlType: 'input', inputType: 'text' },
  ])
  const value = id => plan.entries.find(entry => entry.fieldId === id)?.value

  assert.equal(value('first'), '多 Agent 前端迁移系统')
  assert.equal(value('second'), 'DA-PhysDiff')
})
