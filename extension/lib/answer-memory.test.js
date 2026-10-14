import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_ENTRIES,
  answerKey,
  clearMemory,
  forgetAnswer,
  listAnswers,
  lookupAnswer,
  readMemory,
  rememberAnswer,
  scopeOf,
  touchAnswer,
} from './answer-memory.js'

const binary = { label: '是否有亲属在交银集团工作', controlType: 'radio-group', inputType: 'radio', options: ['是', '否'] }
const preference = { label: '招聘信息来源', controlType: 'select', inputType: 'select-one', options: ['BOSS直聘', '智联招聘', '其他'] }
const narrative = { label: '为什么选择我们公司', controlType: 'textarea', inputType: 'textarea', options: [] }
const shortFact = { label: '个人年薪期望值 (税前含福利)', controlType: 'input', inputType: 'text', options: [] }

test('separates an answer that belongs to one employer from one that travels', () => {
  // “否” to “是否有亲属在本公司工作” means one company; so does a paragraph written
  // for one company's form. A source channel or a salary figure is the applicant's
  // own, and is the same answer everywhere.
  assert.equal(scopeOf(binary), 'host')
  assert.equal(scopeOf(narrative), 'host')
  assert.equal(scopeOf(preference), 'global')
  assert.equal(scopeOf(shortFact), 'global')
})

test('keeps the same question in different shapes out of each other’s way', () => {
  // The window title of the same question asked by a dropdown and by a text box.
  assert.equal(answerKey(preference, 'a.com'), answerKey({ ...preference, controlType: 'custom-select' }, 'a.com'))
  assert.notEqual(answerKey(preference, 'a.com'), answerKey({ ...preference, controlType: 'input', inputType: 'text' }, 'a.com'))
})

test('answers a host-scoped question only on the host it was given on', () => {
  const memory = rememberAnswer(readMemory(null), binary, '否', { host: 'talent.italent.cn' })

  assert.equal(lookupAnswer(memory, binary, 'talent.italent.cn')?.value, '否')
  assert.equal(lookupAnswer(memory, binary, 'job.italent.cn'), null)
  assert.equal(lookupAnswer(memory, narrative, 'talent.italent.cn'), null)
})

test('answers a preference anywhere', () => {
  const memory = rememberAnswer(readMemory(null), preference, 'BOSS直聘', { host: 'a.com' })

  assert.equal(lookupAnswer(memory, preference, 'a.com')?.value, 'BOSS直聘')
  assert.equal(lookupAnswer(memory, preference, 'b.com')?.value, 'BOSS直聘')
  // …but never in a different shape of control.
  assert.equal(lookupAnswer(memory, shortFact, 'a.com'), null)
})

test('never hands a narrative written for one employer to another', () => {
  const memory = rememberAnswer(readMemory(null), narrative, '因为贵司在大模型上的投入', { host: 'a.com' })

  assert.equal(lookupAnswer(memory, narrative, 'a.com')?.value, '因为贵司在大模型上的投入')
  assert.equal(lookupAnswer(memory, narrative, 'b.com'), null)
})

test('re-answering a question replaces the answer instead of adding one', () => {
  const first = rememberAnswer(readMemory(null), preference, 'BOSS直聘', { host: 'a.com', now: '2026-01-01T00:00:00.000Z' })
  const second = rememberAnswer(first, preference, '牛客', { host: 'a.com', now: '2026-02-01T00:00:00.000Z' })

  assert.equal(second.entries.length, 1)
  assert.equal(lookupAnswer(second, preference, 'a.com')?.value, '牛客')
  assert.equal(lookupAnswer(second, preference, 'a.com')?.updatedAt, '2026-02-01T00:00:00.000Z')
})

test('ignores an empty answer, an empty question and junk in storage', () => {
  const empty = readMemory(null)
  assert.deepEqual(rememberAnswer(empty, preference, '   ').entries, [])
  assert.deepEqual(rememberAnswer(empty, { label: '', name: '', placeholder: '' }, '是').entries, [])
  assert.equal(lookupAnswer(empty, preference, 'a.com'), null)

  const junk = readMemory({ version: 9, entries: [null, { key: 'k' }, { value: 'v' }, { key: 'k2', value: 'v2', scope: 'nonsense' }] })
  assert.equal(junk.version, 1)
  assert.deepEqual(junk.entries.map(entry => entry.key), ['k2'])
  assert.equal(junk.entries[0].scope, 'global')
})

test('drops the least recently answered once the cap is reached', () => {
  let memory = readMemory(null)
  for (let index = 0; index < MAX_ENTRIES + 5; index += 1) {
    memory = rememberAnswer(memory, { label: `问题 ${index}`, controlType: 'input' }, `答案 ${index}`, {
      host: 'a.com',
      now: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    })
  }

  assert.equal(memory.entries.length, MAX_ENTRIES)
  assert.equal(lookupAnswer(memory, { label: '问题 0', controlType: 'input' }, 'a.com'), null)
  assert.equal(lookupAnswer(memory, { label: `问题 ${MAX_ENTRIES + 4}`, controlType: 'input' }, 'a.com')?.value, `答案 ${MAX_ENTRIES + 4}`)
})

test('counts a lookup so the cap drops what is never met again', () => {
  const memory = rememberAnswer(readMemory(null), preference, 'BOSS直聘', { host: 'a.com', now: '2026-01-01T00:00:00.000Z' })
  const key = answerKey(preference, 'a.com')
  const touched = touchAnswer(memory, key, '2026-03-01T00:00:00.000Z')

  assert.equal(touched.entries[0].uses, 1)
  assert.equal(touched.entries[0].updatedAt, '2026-03-01T00:00:00.000Z')
  assert.equal(touched.entries[0].value, 'BOSS直聘')
})

test('forgets one answer, or all of them, and lists newest first', () => {
  let memory = rememberAnswer(readMemory(null), preference, 'BOSS直聘', { host: 'a.com', now: '2026-01-01T00:00:00.000Z' })
  memory = rememberAnswer(memory, shortFact, '20 万', { host: 'a.com', now: '2026-02-01T00:00:00.000Z' })

  assert.deepEqual(listAnswers(memory).map(entry => entry.value), ['20 万', 'BOSS直聘'])

  const one = forgetAnswer(memory, answerKey(preference, 'a.com'))
  assert.deepEqual(listAnswers(one).map(entry => entry.value), ['20 万'])
  assert.deepEqual(clearMemory().entries, [])
})
