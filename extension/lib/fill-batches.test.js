import assert from 'node:assert/strict'
import test from 'node:test'

import { buildFillBatches, estimateFieldCost, isNarrativeField } from './fill-batches.js'

const field = (id, extra = {}) => ({ id, label: id, controlType: 'input', inputType: 'text', ...extra })
const entry = (fieldId, target, record) => ({ fieldId, target, record })

test('puts every field of one record in the same batch', () => {
  const fields = [field('a'), field('b'), field('c')]
  const batches = buildFillBatches([
    entry('a', 'work.company', 0),
    entry('b', 'work.title', 0),
    entry('c', 'work.startDate', 0),
  ], fields)

  assert.equal(batches.length, 1)
  assert.deepEqual(batches[0].map(item => item.id), ['a', 'b', 'c'])
})

test('closes a batch once it spans records and has grown enough to matter', () => {
  const fields = Array.from({ length: 12 }, (_, index) => field(`f${index}`))
  const entries = fields.map((item, index) => entry(item.id, 'work.company', index < 8 ? 0 : 1))
  const batches = buildFillBatches(entries, fields)

  // The first eight fill the initial batch; the record change then opens a new one.
  assert.deepEqual(batches.map(batch => batch.length), [8, 4])
})

test('keeps a short batch spanning records together', () => {
  const fields = [field('a'), field('b'), field('c')]
  const batches = buildFillBatches([
    entry('a', 'work.company', 0),
    entry('b', 'work.title', 1),
    entry('c', 'work.startDate', 1),
  ], fields)

  // Three fields is not worth splitting; the request is cheap either way.
  assert.equal(batches.length, 1)
})

test('gives a narrative field a batch of its own', () => {
  const fields = [
    field('company'),
    field('desc', { label: '工作描述', controlType: 'textarea', inputType: 'textarea' }),
    field('title'),
  ]
  const batches = buildFillBatches([
    entry('company', 'work.company', 0),
    entry('desc', 'work.description', 0),
    entry('title', 'work.title', 0),
  ], fields)

  assert.deepEqual(batches.map(batch => batch.map(item => item.id)), [['company'], ['desc'], ['title']])
})

test('closes a batch that has reached the field limit', () => {
  const fields = Array.from({ length: 20 }, (_, index) => field(`f${index}`))
  const batches = buildFillBatches(fields.map(item => entry(item.id, 'basics.fullName', 0)), fields)

  // Plain fields are cheap, so the field limit is what closes these batches
  // rather than the answer budget.
  assert.deepEqual(batches.map(batch => batch.length), [16, 4])
  assert.deepEqual(batches.flat().map(item => item.id), fields.map(item => item.id))
})

test('closes a batch that has spent its answer budget', () => {
  // A long option list is expensive, so a handful of them fill a batch.
  const fields = Array.from({ length: 12 }, (_, index) => field(`f${index}`, { options: Array.from({ length: 20 }, (_, option) => `选项 ${option}`) }))
  const batches = buildFillBatches(fields.map(item => entry(item.id, 'basics.city', 0)), fields)

  assert.ok(batches.length > 1)
  assert.ok(batches.every(batch => batch.length <= 18))
  for (const batch of batches) {
    const cost = batch.reduce((total, item) => total + estimateFieldCost(item), 0)
    assert.ok(cost <= 1_700 + 180, `batch cost ${cost} exceeded the budget`)
  }
})

test('skips entries whose field is no longer on the page', () => {
  const fields = [field('a')]
  const batches = buildFillBatches([
    entry('a', 'basics.fullName', 0),
    entry('gone', 'basics.email', 0),
  ], fields)

  assert.deepEqual(batches.map(batch => batch.map(item => item.id)), [['a']])
})

test('returns no batches when there is nothing to answer', () => {
  assert.deepEqual(buildFillBatches([], []), [])
})

test('treats long free-text labels as narrative', () => {
  assert.equal(isNarrativeField(field('x', { label: '自我评价' })), true)
  assert.equal(isNarrativeField(field('x', { label: '请描述一次你克服困难的经历' })), true)
  assert.equal(isNarrativeField(field('x', { label: '职业规划' })), true)
  assert.equal(isNarrativeField(field('x', { label: '邮箱' })), false)
  assert.equal(isNarrativeField(field('x', { label: '毕业时间' })), false)
})
