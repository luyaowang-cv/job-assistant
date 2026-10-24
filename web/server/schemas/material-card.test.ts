import assert from 'node:assert/strict'
import test from 'node:test'

import { MATERIAL_CARD_TYPES, MATERIAL_TYPE_SPECS } from '#shared/material-types'

import { createMaterialCardSchema, materialCardListQuerySchema, saveMaterialVariantSchema, updateMaterialCardSchema } from './material-card'

test('accepts all material card types', () => {
  // 遍历注册表而不是手写清单：将来加 EDUCATION 时这条测试自动覆盖，不会因为忘记改清单而漏测。
  for (const type of MATERIAL_CARD_TYPES) {
    assert.equal(createMaterialCardSchema.safeParse({
      type, title: '示例', tags: [], facts: {}, variant: { name: '标准版', content: '已确认事实' },
    }).success, true)
  }
})

test('标题必填规则由注册表决定，不在校验里写死类型名', () => {
  for (const type of MATERIAL_CARD_TYPES) {
    const result = createMaterialCardSchema.safeParse({
      type, title: '', tags: [], facts: {}, variant: { name: '标准版', content: '内容' },
    })
    assert.equal(result.success, !MATERIAL_TYPE_SPECS[type].titleRequired, `${type} 的标题必填与注册表不一致`)
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

test('日期接受日精度，同时继续接受月精度的存量值', () => {
  const base = { type: 'INTERNSHIP', title: '实习', tags: [], variant: { name: '标准版', content: '完成模块开发' } }
  // 新数据：精确到日
  assert.equal(createMaterialCardSchema.safeParse({ ...base, facts: { startDate: '2025-06-15', endDate: '2025-08-01' } }).success, true)
  // 存量数据：精确到月，必须继续通过，否则老卡片一编辑就保存失败
  assert.equal(createMaterialCardSchema.safeParse({ ...base, facts: { startDate: '2025-06', endDate: '2025-08' } }).success, true)
  // 结束不能早于开始（两种精度混着比也要成立）
  assert.equal(createMaterialCardSchema.safeParse({ ...base, facts: { startDate: '2025-06-15', endDate: '2025-06-01' } }).success, false)
  assert.equal(createMaterialCardSchema.safeParse({ ...base, facts: { startDate: '2025-06', endDate: '2025-05' } }).success, false)
  // 不补零、缺日缺月的都不算合法日期
  assert.equal(createMaterialCardSchema.safeParse({ ...base, facts: { startDate: '2025-6-15' } }).success, false)
  assert.equal(createMaterialCardSchema.safeParse({ ...base, facts: { startDate: '2025' } }).success, false)
})

test('normalizes list query and enforces page limits', () => {
  const parsed = materialCardListQuerySchema.parse({ page: '2', pageSize: '50', tags: '前端,校招', includeArchived: 'true' })
  assert.deepEqual(parsed.tags, ['前端', '校招'])
  assert.equal(parsed.includeArchived, true)
  assert.equal(materialCardListQuerySchema.safeParse({ pageSize: '101' }).success, false)
})

test('requires explicit overwrite authorization for a saved material variant', () => {
  assert.deepEqual(saveMaterialVariantSchema.parse({ name: '网申版', content: '更新后的正文' }), { name: '网申版', content: '更新后的正文', overwrite: false })
  assert.equal(saveMaterialVariantSchema.parse({ name: '网申版', content: '更新后的正文', overwrite: true }).overwrite, true)
  assert.equal(saveMaterialVariantSchema.safeParse({ name: '网申版', content: '更新后的正文', overwrite: 'true' }).success, false)
  assert.equal(saveMaterialVariantSchema.safeParse({ name: '网申版', content: '更新后的正文', force: true }).success, false)
})
