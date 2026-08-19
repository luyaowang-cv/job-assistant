import assert from 'node:assert/strict'
import test from 'node:test'

import {
  interviewPrepBlocksSchema,
  interviewRecordCreateSchema,
  interviewRecordUpdateSchema,
  interviewReviewConfirmSchema,
  interviewReviewExtractedSchema,
  interviewReviewPreviewSchema,
} from './interview-record'

test('accepts a fully empty interview record', () => {
  assert.equal(interviewRecordCreateSchema.safeParse({}).success, true)
  assert.equal(interviewRecordCreateSchema.safeParse({ companyName: '', jobTitle: null, round: null, result: null }).success, true)
})

test('accepts valid round/result and rejects invalid enums', () => {
  assert.equal(interviewRecordCreateSchema.safeParse({ round: 'FIRST', result: 'PASSED' }).success, true)
  assert.equal(interviewRecordCreateSchema.safeParse({ round: 'HR', result: 'WITHDRAWN' }).success, true)
  assert.equal(interviewRecordCreateSchema.safeParse({ round: 'ONLINE' }).success, false)
  assert.equal(interviewRecordCreateSchema.safeParse({ result: 'YES' }).success, false)
})

test('normalizes wrapped or partial prep blocks', () => {
  const block = { title: '项目知识点', content: '复习内容' }
  assert.equal(interviewPrepBlocksSchema.safeParse({ blocks: [block, block] }).success, true)
  assert.equal(interviewPrepBlocksSchema.safeParse({ data: [block] }).success, true)
  assert.equal(interviewPrepBlocksSchema.safeParse({ title: '岗位要点', content: '内容' }).success, true)
  const parsed = interviewPrepBlocksSchema.parse({ blocks: [{ kind: 'question_ask', title: '提问', content: '问什么' }] })
  assert.equal(parsed[0].kind, 'QUESTION_ASK')
  assert.equal(parsed[0].id.startsWith('block-'), true)
  assert.equal(interviewPrepBlocksSchema.safeParse([]).success, true)
})

test('unwraps review extracted structures and coerces strings', () => {
  const extracted = { questionsAsked: '一个问题', strengths: [], improvements: ['改进'] }
  assert.equal(interviewReviewExtractedSchema.safeParse({ data: extracted }).success, true)
  const parsed = interviewReviewExtractedSchema.parse({ extracted })
  assert.deepEqual(parsed.questionsAsked, ['一个问题'])
  assert.deepEqual(parsed.improvements, ['改进'])
  assert.equal(interviewReviewExtractedSchema.safeParse(null).success, false)
})

test('review preview/confirm require non-empty transcript', () => {
  assert.equal(interviewReviewPreviewSchema.safeParse({ transcript: '   ' }).success, false)
  assert.equal(interviewReviewPreviewSchema.safeParse({ transcript: '面试录音文字' }).success, true)
  const extracted = { questionsAsked: ['Q1'], strengths: [], improvements: [] }
  assert.equal(interviewReviewConfirmSchema.safeParse({ transcript: '面试录音文字', extracted }).success, true)
  assert.equal(interviewReviewConfirmSchema.safeParse({ transcript: '', extracted }).success, false)
})

test('update rejects an empty patch', () => {
  assert.equal(interviewRecordUpdateSchema.safeParse({}).success, false)
  assert.equal(interviewRecordUpdateSchema.safeParse({ briefNote: '备注' }).success, true)
})