import assert from 'node:assert/strict'
import test from 'node:test'

import { buildFillPlan, classifyField, reconcileFillOutcome } from './form-fill-rules.js'
import { applyChoiceEntries, applyFillEntries, scanVisibleFormFields } from './form-page-bridge.js'

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
  ]) {
    assert.match(source, /shadowRoot/)
    assert.match(source, /const queryAll = /)
  }
})

test('keeps scanned fields in DOM order with repeated-label context', () => {
  const source = scanVisibleFormFields.toString()
  assert.match(source, /sortIndex/)
  assert.match(source, /同名字段/)
  assert.match(source, /相邻字段/)
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
