import assert from 'node:assert/strict'
import test from 'node:test'
import { createMaterialCardSchema, materialCardListQuerySchema, updateMaterialCardSchema } from './material-card'

test('accepts all material card types', () => {
  for (const type of ['PROJECT', 'INTERNSHIP', 'WORK', 'CAMPUS', 'AWARD', 'RESEARCH', 'CERTIFICATE', 'SKILL', 'SELF_EVALUATION', 'CUSTOM_ANSWER']) {
    assert.equal(createMaterialCardSchema.safeParse({
      type, title: '示例', tags: [], facts: {}, variant: { name: '标准版', content: '已确认事实' },
    }).success, true)
  }
})

test('validates optional material experience months', () => {
  const input = { type: 'INTERNSHIP', title: '研发实习', tags: [], variant: { name: '标准版', content: '完成模块开发' } }
  assert.equal(createMaterialCardSchema.safeParse({ ...input, facts: { organization: '智能平台部', role: '前端开发实习生', techStack: ['Vue 3', 'TypeScript'], startDate: '2025-06', endDate: '至今' } }).success, true)
  assert.equal(createMaterialCardSchema.safeParse({ ...input, facts: { startDate: '2025-13', endDate: '至今' } }).success, false)
  assert.equal(createMaterialCardSchema.safeParse({ ...input, facts: { startDate: '2025-06', endDate: '2025-05' } }).success, false)
  assert.equal(createMaterialCardSchema.safeParse({ ...input, facts: { techStack: 'Vue 3' } }).success, false)
})

test('rejects empty variants and ownership fields', () => {
  assert.equal(createMaterialCardSchema.safeParse({
    type: 'PROJECT', title: '项目', tags: [], facts: {}, variant: { name: '', content: '' },
  }).success, false)
  assert.equal(createMaterialCardSchema.safeParse({
    type: 'PROJECT', title: '项目', tags: [], facts: {}, variant: { name: '标准版', content: '内容' }, userId: 'forbidden',
  }).success, false)
})

test('allows an empty title only for self evaluation cards', () => {
  const base = { tags: [], facts: {}, variant: { name: '标准版', content: '能够快速理解业务并推动落地。' } }
  assert.equal(createMaterialCardSchema.safeParse({ ...base, type: 'SELF_EVALUATION', title: '' }).success, true)
  assert.equal(createMaterialCardSchema.safeParse({ ...base, type: 'PROJECT', title: '' }).success, false)
  assert.equal(updateMaterialCardSchema.parse({ title: '   ' }).title, '')
})

test('normalizes list query and enforces page limits', () => {
  const parsed = materialCardListQuerySchema.parse({ page: '2', pageSize: '50', tags: '前端,校招', includeArchived: 'true' })
  assert.deepEqual(parsed.tags, ['前端', '校招'])
  assert.equal(parsed.includeArchived, true)
  assert.equal(materialCardListQuerySchema.safeParse({ pageSize: '101' }).success, false)
})
