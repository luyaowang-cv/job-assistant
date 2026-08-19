import assert from 'node:assert/strict'
import test from 'node:test'
import { compositionInputSchema } from './document-composition'
import { countCodePoints, resolveDocument } from '../services/document-resolver'

const reference = {
  cardId: 'card-1', variantId: 'variant-1', section: 'projects', fieldKey: null, sortOrder: 0,
  visible: true, renderRules: { compact: false, hideTechnicalDetails: false },
}

test('composition rejects facts and duplicate ordering', () => {
  assert.equal(compositionInputSchema.safeParse({ fieldVisibility: {}, config: {}, references: [reference], basics: { fullName: 'forbidden' } }).success, false)
  assert.equal(compositionInputSchema.safeParse({ fieldVisibility: {}, config: {}, references: [reference, { ...reference, cardId: 'card-2' }] }).success, false)
})

test('resolver hides base fields and pins visible variants', () => {
  const resolved = resolveDocument({
    basics: { fullName: '张三', phone: '13800000000' },
    fieldVisibility: { phone: false },
    references: [{ ...reference, id: 'ref-1', card: { id: 'card-1', title: '项目 A', type: 'PROJECT' }, variant: { id: 'variant-1', name: '标准版', content: '固定内容' } }],
  })
  assert.deepEqual(resolved.basics, { fullName: '张三' })
  assert.equal(resolved.references[0]?.variantId, 'variant-1')
  assert.equal(resolved.references[0]?.content, '固定内容')
})

test('counts Unicode code points without truncation', () => {
  assert.equal(countCodePoints('中A😀'), 3)
  const resolved = resolveDocument({
    references: [{ ...reference, id: 'ref-1', fieldKey: 'answer', card: { id: 'card-1', title: '回答', type: 'CUSTOM_ANSWER' }, variant: { id: 'variant-1', name: '标准版', content: '中A😀' } }],
    blocks: [{ key: 'extra', title: '附加', fields: [{ key: 'answer', label: '回答', limit: 2, referenceId: 'ref-1' }] }],
  })
  assert.equal(resolved.blocks[0]?.fields[0]?.count, 3)
  assert.equal(resolved.blocks[0]?.fields[0]?.overLimit, true)
  assert.equal(resolved.blocks[0]?.fields[0]?.text, '中A😀')
})
