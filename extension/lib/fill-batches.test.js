import assert from 'node:assert/strict'
import test from 'node:test'

import { buildFillBatches, buildRecordBlocks, estimateFieldCost, isNarrativeField } from './fill-batches.js'

const field = (id, extra = {}) => ({ id, label: id, controlType: 'input', inputType: 'text', ...extra })
const entry = (fieldId, target, record) => ({ fieldId, target, record })
const narrative = id => field(id, { label: '工作描述', controlType: 'textarea', inputType: 'textarea' })
const ids = batch => batch.map(item => item.id)

test('puts every field of one record in the same batch', () => {
  const fields = [field('a'), field('b'), field('c')]
  const batches = buildFillBatches([
    entry('a', 'work.company', 0),
    entry('b', 'work.title', 0),
    entry('c', 'work.startDate', 0),
  ], fields)

  assert.equal(batches.length, 1)
  assert.deepEqual(ids(batches[0]), ['a', 'b', 'c'])
})

test('keeps a record’s narrative field with the rest of that record', () => {
  const fields = [field('company'), narrative('desc'), field('title')]
  const batches = buildFillBatches([
    entry('company', 'work.company', 0),
    entry('desc', 'work.description', 0),
    entry('title', 'work.title', 0),
  ], fields)

  // The old rule gave every narrative field a batch of its own, which is what
  // turned a form with five descriptions into twenty requests.
  assert.deepEqual(batches.map(ids), [['company', 'desc', 'title']])
})

test('does not open a batch just because the record changes', () => {
  const fields = Array.from({ length: 12 }, (_, index) => field(`f${index}`))
  const entries = fields.map((item, index) => entry(item.id, 'work.company', index < 8 ? 0 : 1))
  const batches = buildFillBatches(entries, fields)

  // A record boundary used to flush the batch once eight fields had accrued.
  // The budget is what closes a batch now, and two cheap records fit together.
  assert.deepEqual(batches.map(batch => batch.length), [12])
})

test('keeps a short batch spanning records together', () => {
  const fields = [field('a'), field('b'), field('c')]
  const batches = buildFillBatches([
    entry('a', 'work.company', 0),
    entry('b', 'work.title', 1),
    entry('c', 'work.startDate', 1),
  ], fields)

  // Packing has no minimum batch size: three fields cost less than a request.
  assert.equal(batches.length, 1)
})

test('packs ten internships into five batches', () => {
  const fields = []
  const entries = []
  for (let record = 0; record < 10; record += 1) {
    for (const [key, extra] of [
      ['company', {}], ['title', {}], ['start', {}], ['end', {}], ['desc', {}],
    ]) {
      const id = `r${record}-${key}`
      fields.push(key === 'desc' ? narrative(id) : field(id, extra))
      entries.push(entry(id, `work.${key}`, record))
    }
  }
  const batches = buildFillBatches(entries, fields)

  // 1230 a record against a 3200 budget: two fit, a third does not.
  assert.deepEqual(batches.map(batch => batch.length), [10, 10, 10, 10, 10])
  // Page order survives packing, which is what lets the model tell the
  // internships apart.
  assert.deepEqual(batches.flat().map(item => item.id), fields.map(item => item.id))
})

test('never spreads one record across two batches', () => {
  const fields = []
  const entries = []
  for (let record = 0; record < 6; record += 1) {
    for (const key of ['company', 'title', 'desc']) {
      const id = `r${record}-${key}`
      fields.push(key === 'desc' ? narrative(id) : field(id))
      entries.push(entry(id, `work.${key}`, record))
    }
  }
  const batches = buildFillBatches(entries, fields)

  for (const batch of batches) {
    const perRecord = new Map()
    for (const item of batch) {
      const record = item.id.split('-')[0]
      perRecord.set(record, (perRecord.get(record) ?? 0) + 1)
    }
    for (const [record, count] of perRecord) {
      assert.equal(count, 3, `${record} was split across batches`)
    }
  }
})

test('splits a record that alone outgrows a batch', () => {
  const fields = [
    field('company'), field('title'), field('start'), field('end'),
    narrative('d1'), narrative('d2'), narrative('d3'), narrative('d4'),
  ]
  const entries = fields.map(item => entry(item.id, `work.${item.id}`, 0))

  // 4 × 95 + 4 × 850 = 3780, over the budget: the one case where a record may
  // be cut. The identity fields stay with the first answers rather than
  // drifting into a batch with nothing to identify them.
  const batches = buildFillBatches(entries, fields)
  assert.deepEqual(batches.map(batch => batch.length), [7, 1])
  assert.deepEqual(ids(batches[0]), ['company', 'title', 'start', 'end', 'd1', 'd2', 'd3'])
})

test('closes a batch that has reached the field limit', () => {
  const fields = Array.from({ length: 40 }, (_, index) => field(`f${index}`))
  const batches = buildFillBatches(fields.map(item => entry(item.id, 'basics.fullName', 0)), fields)

  // Forty plain fields cost 3800, so the budget would cut them anyway; the
  // field limit is what makes the first cut land at 24.
  assert.deepEqual(batches.map(batch => batch.length), [24, 16])
  assert.ok(batches.every(batch => batch.length <= 24))
})

test('closes a batch that has spent its answer budget', () => {
  const fields = Array.from({ length: 24 }, (_, index) => field(`f${index}`, { options: Array.from({ length: 20 }, (_, option) => `选项 ${option}`) }))
  const batches = buildFillBatches(fields.map(item => entry(item.id, 'basics.city', 0)), fields)

  // 180 a field against a 3200 budget: seventeen fit, an eighteenth does not.
  assert.deepEqual(batches.map(batch => batch.length), [17, 7])
  for (const batch of batches) {
    const cost = batch.reduce((total, item) => total + estimateFieldCost(item), 0)
    assert.ok(cost <= 3_200 + 180, `batch cost ${cost} exceeded the budget`)
  }
})

test('skips entries whose field is no longer on the page', () => {
  const fields = [field('a')]
  const batches = buildFillBatches([
    entry('a', 'basics.fullName', 0),
    entry('gone', 'basics.email', 0),
  ], fields)

  assert.deepEqual(batches.map(ids), [['a']])
})

test('returns no batches when there is nothing to answer', () => {
  assert.deepEqual(buildFillBatches([], []), [])
})

test('treats long free-text labels as narrative', () => {
  assert.equal(isNarrativeField(field('x', { label: '自我评价' })), true)
  assert.equal(isNarrativeField(field('x', { label: '请描述一次你克服困难的经历' })), true)
  assert.equal(isNarrativeField(field('x', { label: '职业规划' })), true)
  assert.equal(isNarrativeField(field('x', { placeholder: '介绍一下你的项目' })), true)
  assert.equal(isNarrativeField(field('x', { label: '邮箱' })), false)
  assert.equal(isNarrativeField(field('x', { label: '毕业时间' })), false)
})

// ------------------------------------------------------------- neighbour text

test('does not read the neighbouring labels as part of the field', () => {
  // The scanner writes the labels of the two fields either side into `context`,
  // so the 结束时间 box below carries the word 描述 from its neighbour.
  const endDate = field('end', {
    label: '结束时间',
    context: '相邻字段：工作描述、项目描述；页面字段 5/20；同名字段 1/2',
  })

  assert.equal(isNarrativeField(endDate), false)
  assert.equal(estimateFieldCost(endDate), 95)
  // The guard in the other direction: a real description is still narrative.
  assert.equal(isNarrativeField(field('desc', { label: '工作描述' })), true)
})

test('a neighbouring description does not split the record it sits in', () => {
  const fields = [
    field('company', { label: '公司名称' }),
    field('title', { label: '职位名称' }),
    field('end', { label: '结束时间', context: '相邻字段：工作描述；页面字段 3/4' }),
    narrative('desc'),
  ]
  const batches = buildFillBatches([
    entry('company', 'work.company', 0),
    entry('title', 'work.title', 0),
    entry('end', 'work.endDate', 0),
    entry('desc', 'work.description', 0),
  ], fields)

  // Misreading `context` used to price the 结束时间 box as a second narrative
  // field, which cut this one record into two requests.
  assert.equal(batches.length, 1)
  assert.deepEqual(ids(batches[0]), ['company', 'title', 'end', 'desc'])
})

// ------------------------------------------------------------------- records

test('cuts the page into one block per record', () => {
  const blocks = buildRecordBlocks([
    entry('a', 'work.company', 0),
    entry('b', 'work.company', 0),
    entry('c', 'project.name', 0),
  ], [field('a'), field('b'), field('c')])

  assert.deepEqual(blocks.map(ids), [['a', 'b'], ['c']])
})

test('keeps a recordless field out of record zero', () => {
  const blocks = buildRecordBlocks([
    entry('a', 'work.none'),
    entry('b', 'work.company', 0),
  ], [field('a'), field('b')])

  // `work.none` answers from the profile, not from saved record zero; folding
  // the two together would bind it to the first internship's facts.
  assert.deepEqual(blocks.map(ids), [['a'], ['b']])
})

test('skips a field with no entry', () => {
  const blocks = buildRecordBlocks([entry('a', 'work.company', 0)], [field('a'), field('b')])
  assert.deepEqual(blocks.map(ids), [['a']])
})

test('answers a field listed twice only once', () => {
  const batches = buildFillBatches([
    entry('a', 'work.company', 0),
    entry('b', 'work.title', 0),
    entry('a', 'work.company', 0),
  ], [field('a'), field('b')])

  assert.deepEqual(batches.flat().map(item => item.id), ['a', 'b'])
})

test('reads malformed input as nothing to answer', () => {
  assert.deepEqual(buildFillBatches(undefined, undefined), [])
  assert.deepEqual(buildFillBatches(null, null), [])
  assert.deepEqual(buildRecordBlocks(undefined, undefined), [])
})

test('groups fields with neither target nor record without throwing', () => {
  const batches = buildFillBatches([
    { fieldId: 'a' },
    { fieldId: 'b', target: '' },
  ], [field('a'), field('b')])

  assert.deepEqual(batches.map(ids), [['a', 'b']])
})
