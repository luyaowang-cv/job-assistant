import assert from 'node:assert/strict'
import test from 'node:test'

import { formatTechStack, groupFieldRows, MATERIAL_TYPE_SPECS, materialDateInput, materialHasVersion, materialPeriod, parseTechStack } from './material-types'

test('技术栈读进来再写出去必须原样往返', () => {
  const list = ['Vue 3', 'TypeScript', 'Vite']
  // 曾经回填用 '、'、保存按 ,，/ 拆，两边分隔符不一致：每编辑保存一次就把数组又合并一层，
  // ["Vue 3","TypeScript"] → ["Vue 3、TypeScript"] → 再合并一层。这条测试锁住往返。
  assert.deepEqual(parseTechStack(formatTechStack(list)), list)
  assert.deepEqual(parseTechStack(formatTechStack(parseTechStack(formatTechStack(list)))), list)
})

test('技术栈接受手打的四种分隔符', () => {
  assert.deepEqual(parseTechStack('Vue 3, TypeScript/Vite、React，Node'), ['Vue 3', 'TypeScript', 'Vite', 'React', 'Node'])
  assert.deepEqual(parseTechStack('   '), [])
  assert.deepEqual(parseTechStack(''), [])
  assert.deepEqual(formatTechStack(undefined), '')
  assert.deepEqual(formatTechStack(['Vue', '', 42, 'React']), 'Vue、React')
})

test('起止时间只显示到月，两种精度都能读', () => {
  assert.equal(materialPeriod({ startDate: '2024-09-15', endDate: '2025-03-01' }), '2024-09 — 2025-03')
  assert.equal(materialPeriod({ startDate: '2024-09-15' }), '2024-09')
  assert.equal(materialPeriod({ startDate: '2024-09-15', endDate: '至今' }), '2024-09 — 至今')
  // 存量数据是月精度，截断逻辑不能把它弄坏
  assert.equal(materialPeriod({ startDate: '2024-09', endDate: '2025-03' }), '2024-09 — 2025-03')
  assert.equal(materialPeriod({}), '')
})

test('日期回填把月精度补成当月 1 日', () => {
  assert.equal(materialDateInput('2024-09'), '2024-09-01')
  assert.equal(materialDateInput('2024-09-15'), '2024-09-15')
  assert.equal(materialDateInput('至今'), '至今')
  assert.equal(materialDateInput(undefined), '')
  assert.equal(materialDateInput(20240915), '')
})

test('字段分行：可并排的控件两两一组，多行文本和日期整行独占', () => {
  const rows = groupFieldRows([
    { key: 'college', label: '学院', kind: 'text' },
    { key: 'major', label: '专业', kind: 'text' },
    { key: 'educationLevel', label: '学历', kind: 'select' },
    { key: 'academicDegree', label: '学位', kind: 'text' },
    { key: 'majorDescription', label: '专业描述', kind: 'textarea', fullWidth: true },
    { key: 'courses', label: '专业课程', kind: 'textarea', fullWidth: true },
    { key: 'startDate', label: '起止时间', kind: 'dateRange' },
  ])
  assert.deepEqual(rows.map(row => row.map(field => field.key)), [
    ['college', 'major'],
    ['educationLevel', 'academicDegree'],
    ['majorDescription'],
    ['courses'],
    ['startDate'],
  ])
})

test('教育卡的字段：专业排名是下拉，不再有班级排名', () => {
  const spec = MATERIAL_TYPE_SPECS.EDUCATION
  const keys = spec.fields.map(field => field.key)
  assert.ok(!keys.includes('classRanking'), '班级排名不做了')
  const ranking = spec.fields.find(field => field.key === 'ranking')
  assert.equal(ranking?.kind, 'select')
  assert.deepEqual(ranking?.options?.map(option => option.value), ['前5%', '前10%', '前20%', '前30%', '前50%', '其他'])
  // 教育背景不是"成果要点可以不填"，是这个框根本不该出现
  assert.equal(spec.contentRequired, false)
  assert.equal(spec.contentField, 'hidden')
  // 奖项、证书是"可以不填"，框仍然要显示
  assert.equal(MATERIAL_TYPE_SPECS.AWARD.contentRequired, false)
  assert.equal(MATERIAL_TYPE_SPECS.AWARD.contentField, undefined)
  // 学校里那批网申常见字段都在
  for (const key of ['studyMode', 'duration', 'schoolCategory', 'trainingMode', 'overseas', 'studentId', 'thesis', 'majorDescription', 'courses']) {
    assert.ok(keys.includes(key), `缺少字段 ${key}`)
  }
})

test('只有有文案的类型才谈版本', () => {
  // 教育背景没有文案，界面上不该出现版本概念。
  // 数据层仍会挂一个默认版本——DocumentCardReference.variantId 是非空外键，卡片要能被引用就必须有版本。
  assert.equal(materialHasVersion('EDUCATION'), false)
  for (const type of ['PROJECT', 'INTERNSHIP', 'AWARD', 'CERTIFICATE', 'SKILL', 'SELF_EVALUATION', 'CUSTOM_ANSWER']) {
    assert.equal(materialHasVersion(type), true, `${type} 应该保留版本`)
  }
})
