import assert from 'node:assert/strict'
import test from 'node:test'

import { countUnreachedFrames, frameOf, groupByFrame, isChoiceField, localFieldId, qualifyFieldId } from './frame-scope.js'

test('round-trips a field id through its frame namespace', () => {
  const qualified = qualifyFieldId(7, 'form-field-12')

  assert.equal(qualified, '7::form-field-12')
  assert.equal(frameOf(qualified), 7)
  assert.equal(localFieldId(qualified), 'form-field-12')
})

test('keeps the top frame, whose id is zero, apart from an unqualified id', () => {
  // The top frame reports frameId 0, so `0` must not be mistaken for “no frame”.
  assert.equal(frameOf(qualifyFieldId(0, 'form-field-1')), 0)
  assert.equal(frameOf('form-field-1'), null)
  assert.equal(localFieldId('form-field-1'), 'form-field-1')
})

test('keeps two frames that both number a control form-field-0 from colliding', () => {
  const top = qualifyFieldId(0, 'form-field-0')
  const nested = qualifyFieldId(3, 'form-field-0')

  assert.notEqual(top, nested)
  assert.deepEqual([frameOf(top), frameOf(nested)], [0, 3])
})

test('recognises choice controls through the frame namespace', () => {
  assert.equal(isChoiceField('2::radio-group-4'), true)
  assert.equal(isChoiceField('2::custom-select-9'), true)
  assert.equal(isChoiceField('2::form-field-4'), false)
  assert.equal(isChoiceField('radio-group-4'), true)
})

test('groups entries and unresolved ids by frame and strips each id', () => {
  const perFrame = groupByFrame(
    [{ fieldId: '0::form-field-1', value: '甲' }, { fieldId: '4::form-field-2', value: '乙' }],
    ['0::form-field-3', '4::form-field-5'],
  )

  assert.deepEqual([...perFrame.keys()].sort(), [0, 4])
  assert.deepEqual(perFrame.get(0), {
    entries: [{ fieldId: 'form-field-1', value: '甲' }],
    unresolvedIds: ['form-field-3'],
  })
  assert.deepEqual(perFrame.get(4), {
    entries: [{ fieldId: 'form-field-2', value: '乙' }],
    unresolvedIds: ['form-field-5'],
  })
})

test('creates a frame bucket for a frame that only has unresolved fields', () => {
  const perFrame = groupByFrame([], ['0::form-field-1'])

  assert.deepEqual(perFrame.get(0), { entries: [], unresolvedIds: ['form-field-1'] })
})

test('ignores ids that never came from a scan', () => {
  const perFrame = groupByFrame([{ fieldId: 'form-field-1', value: '甲' }], ['form-field-2'])

  assert.equal(perFrame.size, 0)
})

test('reports no missed frames when every declared frame answered', () => {
  // A page with no frames at all: only the top frame answers and declares none.
  assert.equal(countUnreachedFrames(1, 0), 0)
  // One same-origin frame: the top declares it and both answered.
  assert.equal(countUnreachedFrames(2, 1), 0)
  // Two frames nested one deep: top declares 1, the child declares 1, all three answered.
  assert.equal(countUnreachedFrames(3, 2), 0)
})

test('reports the frames that were skipped for permission', () => {
  // A form embedded from an origin the extension may not touch: the top frame
  // answers and declares it, but the frame itself never reports in.
  assert.equal(countUnreachedFrames(1, 1), 1)
  // Two iframes, only one of them reachable.
  assert.equal(countUnreachedFrames(2, 2), 1)
})

test('never reports a negative number of missed frames', () => {
  // Defensive: a frame that answered without being declared must not produce a
  // negative warning count.
  assert.equal(countUnreachedFrames(5, 1), 0)
})
