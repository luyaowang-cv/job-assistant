import assert from 'node:assert/strict'
import test from 'node:test'

import { buildFillPlan, classifyField, reconcileFillOutcome } from './form-fill-rules.js'

const profile = {
  basics: {
    fullName: '王路瑶',
    phone: '13800138000',
    email: 'wang@example.com',
    city: '北京',
    countryRegion: '中国',
    gender: '女',
    birthDate: '2000-01-01',
    wechatId: 'wangluyao',
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
  assert.deepEqual(plan.entries.map(entry => entry.target), ['fullName', 'email', 'phone'])
})

test('fills F-006 common fields only for exact, text-like labels', () => {
  const plan = buildFillPlan(profile, [
    { id: 'country', label: '国家/地区', inputType: 'text' },
    { id: 'gender', label: '性别', inputType: 'text' },
    { id: 'wechat', label: '微信号', inputType: 'text' },
    { id: 'political-status', label: '政治面貌', inputType: 'text' },
    { id: 'document-type', label: '个人证件', inputType: 'text' },
  ])

  assert.deepEqual(plan.summary, { filled: 5, skipped_existing: 0, skipped_sensitive: 0, needs_manual: 0 })
  assert.deepEqual(plan.entries.map(entry => entry.target), ['countryRegion', 'gender', 'wechatId', 'politicalStatus', 'documentType'])
})

test('accepts labels with required markers and trailing colons after page-side normalization', () => {
  const plan = buildFillPlan(profile, [
    { id: 'name', label: '姓名 *', inputType: 'text' },
    { id: 'city', label: '所在城市：', inputType: 'text' },
  ])

  assert.deepEqual(plan.summary, { filled: 2, skipped_existing: 0, skipped_sensitive: 0, needs_manual: 0 })
  assert.deepEqual(plan.entries.map(entry => entry.target), ['fullName', 'city'])
})

test('derives age only from a valid full birth date', () => {
  const plan = buildFillPlan(profile, [{ id: 'age', label: '年龄', inputType: 'text' }])

  assert.equal(plan.entries[0].status, 'filled')
  assert.equal(plan.entries[0].target, 'age')
  assert.equal(plan.entries[0].value, String(new Date().getFullYear() - 2000))

  const incomplete = buildFillPlan({ basics: { birthDate: '2000-01' } }, [{ id: 'age', label: '年龄', inputType: 'text' }])
  assert.equal(incomplete.entries[0].status, 'needs_manual')
})

test('fills only a native select with one exact option', () => {
  const plan = buildFillPlan(profile, [
    { id: 'country', label: '国家/地区', controlType: 'select', options: ['请选择', '中国'] },
    { id: 'gender', label: '性别', controlType: 'select', options: ['男', '女'] },
    { id: 'fuzzy', label: '国家/地区', controlType: 'select', options: ['中国大陆'] },
    { id: 'multiple', label: '所在城市', controlType: 'select', multiple: true, options: ['北京', '上海'] },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), ['filled', 'filled', 'needs_manual', 'needs_manual'])
  assert.equal(plan.entries[2].reason, '下拉选项不存在唯一精确匹配，需要人工确认。')
  assert.equal(plan.entries[3].reason, '多选下拉框需要人工确认。')
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
  assert.deepEqual(plan.entries.map(entry => entry.target), ['documentNumber', 'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone', 'birthDate'])
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
  assert.deepEqual(plan.entries.map(entry => entry.target), ['documentType', 'documentNumber'])
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
  assert.deepEqual(plan.entries.map(entry => entry.target), ['gender', 'targetCity'])
  assert.deepEqual(plan.entries.map(entry => entry.value), ['女', '北京'])
})

test('fills highest education fields locally before requesting AI', () => {
  const educationProfile = {
    basics: { fullName: '王路瑶', email: 'wang@example.com' },
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
  assert.deepEqual(plan.entries.map(entry => entry.value), ['王路瑶', 'wang@example.com', 'B 大学', '计算机科学与技术', '硕士研究生', '工学硕士', '2027-06-30'])
})

test('keeps ATSX custom selectors manual while filling Formily metadata text fields', () => {
  const educationProfile = {
    basics: { fullName: '王路瑶', phone: '13800138000', email: 'wang@example.com', documentNumber: '110101199001011234' },
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

test('leaves dates, radios, repeated fields and unknown labels for manual review', () => {
  const plan = buildFillPlan(profile, [
    { id: 'start', label: '入学日期', inputType: 'date' },
    { id: 'city', label: '所在城市', controlType: 'select', options: ['北京', '上海'] },
    { id: 'gender', label: '性别', controlType: 'radio', options: ['男', '女'] },
    { id: 'document-type', label: '证件类型', controlType: 'select', options: ['居民身份证', '护照'] },
    { id: 'first-name', label: '姓名' },
    { id: 'second-name', label: '姓名' },
    { id: 'question', label: '最喜欢的颜色' },
  ])

  assert.deepEqual(plan.entries.map(entry => entry.status), ['needs_manual', 'filled', 'needs_manual', 'filled', 'filled', 'needs_manual', 'needs_manual'])
  assert.equal(plan.entries[5].reason, '页面存在多个相同目标字段，需要人工确认。')
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
