import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_CHARACTERS,
  MAX_TURNS,
  appendTurn,
  readThread,
  toRequestMessages,
  trimThread,
  writeThread,
} from './open-question-thread.js'

const question = index => ({ role: 'user', content: `第 ${index} 个问题` })
const answer = index => ({ role: 'assistant', content: `第 ${index} 个回答` })

test('appends a question together with its answer', () => {
  const once = appendTurn([], '你的职业规划是什么？', '我想继续做前端。')

  assert.deepEqual(once, [
    { role: 'user', content: '你的职业规划是什么？' },
    { role: 'assistant', content: '我想继续做前端。' },
  ])
  assert.deepEqual(appendTurn(once, '再具体点', ''), [...once, { role: 'user', content: '再具体点' }])
})

test('ignores a blank question so the thread cannot end on nothing', () => {
  assert.deepEqual(appendTurn([], '   ', '答案'), [])
})

test('keeps the newest turns and drops the oldest', () => {
  const thread = Array.from({ length: 20 }, (_, index) => [question(index), answer(index)]).flat()
  const trimmed = trimThread(thread)

  assert.ok(trimmed.length <= MAX_TURNS)
  assert.equal(trimmed.at(-1).content, answer(19).content)
  assert.equal(trimmed[0].role, 'user')
})

test('drops turns until the thread fits the character budget', () => {
  const long = '答'.repeat(3_000)
  const thread = Array.from({ length: 8 }, (_, index) => [question(index), { role: 'assistant', content: long }]).flat()
  const trimmed = trimThread(thread)

  const characters = trimmed.reduce((total, message) => total + message.content.length, 0)
  assert.ok(characters <= MAX_CHARACTERS, `trimmed thread was ${characters} characters`)
  assert.ok(trimmed.length > 0)
})

test('never starts on a dangling answer', () => {
  // Filled to the character cap, so the survivor set is decided by size. The
  // first message must still be a question.
  const long = '答'.repeat(3_000)
  const thread = [{ role: 'user', content: '第一个问题' }, { role: 'assistant', content: long }]
  for (let index = 0; index < 6; index += 1) thread.push(question(index), { role: 'assistant', content: long })

  const trimmed = trimThread(thread)
  assert.equal(trimmed[0].role, 'user')
  assert.equal(trimmed.at(-1).role, 'assistant')
})

test('sends a thread the endpoint will accept', () => {
  const thread = Array.from({ length: 30 }, (_, index) => [question(index), answer(index)]).flat()
  const payload = toRequestMessages(thread)

  assert.ok(payload.length <= MAX_TURNS)
  assert.ok(payload.every(message => ['user', 'assistant'].includes(message.role)))
  assert.equal(payload.at(-1).role, 'assistant')
  assert.ok(payload.reduce((total, message) => total + message.content.length, 0) <= MAX_CHARACTERS)
})

test('keeps one thread per profile', () => {
  let store = writeThread({}, 'profile_a', [{ role: 'user', content: 'A 的问题' }])
  store = writeThread(store, 'profile_b', [{ role: 'user', content: 'B 的问题' }])

  assert.equal(readThread(store, 'profile_a')[0].content, 'A 的问题')
  assert.equal(readThread(store, 'profile_b')[0].content, 'B 的问题')
  assert.deepEqual(readThread(store, 'profile_c'), [])
})

test('clearing a thread removes it from the store instead of leaving it empty', () => {
  const store = writeThread(writeThread({}, 'profile_a', [question(1)]), 'profile_a', [])

  assert.deepEqual(store, {})
  assert.deepEqual(readThread(store, 'profile_a'), [])
})

test('reads an absent or malformed store as no thread', () => {
  assert.deepEqual(readThread(undefined, 'profile_a'), [])
  assert.deepEqual(readThread({ profile_a: 'not a thread' }, 'profile_a'), [])
})
