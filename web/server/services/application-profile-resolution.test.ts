import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveBasics, resolveEducations } from './application-profile-resolution'
import { personalProfileSchema } from '../schemas/personal-profile'
import { applicationProfileSchema } from '../schemas/application-profile'

test('inherits common values and accepts only non-empty overrides', () => {
  assert.deepEqual(resolveBasics({ fullName: '王路瑶', city: '北京', targetCities: ['北京'] }, { city: '上海', targetCities: [] }), { fullName: '王路瑶', city: '上海', targetCities: ['北京'] })
})
test('inherits education until the profile supplies a replacement group', () => {
  const common = [{ school: 'A大学', major: '计算机', degree: '本科' }]
  assert.deepEqual(resolveEducations(common, []), common)
})
test('allows locally stored document numbers but still rejects unknown common fields', () => {
  assert.equal(personalProfileSchema.safeParse({ basics: { documentNumber: '110101199001011234' }, educations: [] }).success, true)
  assert.equal(personalProfileSchema.safeParse({ basics: { unknownField: 'value' }, educations: [] }).success, false)
})

test('accepts a strategy-only application profile without legacy content', () => {
  const result = applicationProfileSchema.safeParse({
    name: '前端大厂', targetTags: ['前端'], strategy: { targetLocations: ['北京'] }, resumeVersionId: null,
  })
  assert.equal(result.success, true)
  if (result.success) assert.deepEqual(result.data.strategy.targetLocations, ['北京'])
})

test('accepts natural-language or exact availability and normalizes empty values', () => {
  const immediate = applicationProfileSchema.safeParse({
    name: '前端开发-大厂版',
    targetTags: ['前端开发'],
    strategy: { targetLocations: ['北京'], expectedSalary: '面议', availableDate: '可立即到岗', recruitmentSource: '', referralCode: '' },
    resumeVersionId: null,
  })
  assert.equal(immediate.success, true)
  if (immediate.success) assert.equal(immediate.data.strategy.availableDate, '可立即到岗')

  const exactDate = applicationProfileSchema.safeParse({ name: '日期版', strategy: { targetLocations: [], availableDate: '2026-09-01' } })
  assert.equal(exactDate.success, true)

  const empty = applicationProfileSchema.safeParse({ name: '空值版', strategy: { targetLocations: [], availableDate: null } })
  assert.equal(empty.success, true)
  if (empty.success) assert.equal(empty.data.strategy.availableDate, undefined)

  const tooLong = applicationProfileSchema.safeParse({ name: '超长版', strategy: { targetLocations: [], availableDate: '到'.repeat(81) } })
  assert.equal(tooLong.success, false)
})
