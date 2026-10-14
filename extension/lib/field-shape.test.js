import assert from 'node:assert/strict'
import test from 'node:test'

import { fieldKind, isBinaryQuestion, isPresentToggle, questionOf } from './field-shape.js'

test('keeps a paragraph, a choice and a one-line answer in different buckets', () => {
  assert.equal(fieldKind({ controlType: 'textarea', inputType: 'textarea' }), 'longtext')
  assert.equal(fieldKind({ inputType: 'contenteditable' }), 'longtext')
  assert.equal(fieldKind({ controlType: 'select' }), 'choice')
  assert.equal(fieldKind({ controlType: 'custom-select' }), 'choice')
  assert.equal(fieldKind({ controlType: 'radio-group' }), 'choice')
  assert.equal(fieldKind({ controlType: 'input', inputType: 'text' }), 'text')
})

test('reads the question from whatever the page actually says', () => {
  assert.equal(questionOf({ label: '招聘信息来源' }), '招聘信息来源')
  // The page's decoration is not part of the question: a colon, a required
  // marker and stray spacing must not make two askings of it two questions.
  assert.equal(questionOf({ label: '招聘信息来源：' }), questionOf({ label: '招聘信息来源' }))
  assert.equal(questionOf({ label: '招聘 信息来源' }), questionOf({ label: '招聘信息来源' }))
  // The label wins over the name, and the name over the placeholder.
  assert.equal(questionOf({ label: '招聘信息来源', name: 'channel', placeholder: '请选择' }), '招聘信息来源')
  assert.equal(questionOf({ name: 'channel' }), 'channel')
  assert.equal(questionOf({ label: '', name: '', placeholder: '' }), '')
})

test('tells a “至今” box apart from a question', () => {
  // 北森 renders 开始时间 / 结束时间 / □至今. That box is not asking anything — it is
  // the end of the range — so it must not be classified as a yes/no question and
  // left for the applicant to re-answer on every form.
  assert.equal(isPresentToggle({ inputType: 'checkbox', label: '至今' }), true)
  assert.equal(isPresentToggle({ inputType: 'checkbox', label: ' 至今 ' }), true)
  assert.equal(isPresentToggle({ inputType: 'checkbox', label: '在职' }), true)
  // A checkbox that really is a question stays one.
  assert.equal(isPresentToggle({ inputType: 'checkbox', label: '本人承诺以上信息属实' }), false)
  assert.equal(isPresentToggle({ inputType: 'checkbox', label: '无实习经历' }), false)
  // And a “至今” label on something that is not a checkbox is not the box.
  assert.equal(isPresentToggle({ inputType: 'text', label: '至今' }), false)
})

test('recognises a yes/no question however the page spells it', () => {
  assert.equal(isBinaryQuestion({ controlType: 'radio-group', options: ['是', '否'] }), true)
  assert.equal(isBinaryQuestion({ controlType: 'radio-group', options: ['有', '无'] }), true)
  assert.equal(isBinaryQuestion({ controlType: 'radio-group', options: ['Yes', 'No'] }), true)
  assert.equal(isBinaryQuestion({ controlType: 'radio-group', options: ['同意', '不同意'] }), true)
  assert.equal(isBinaryQuestion({ inputType: 'checkbox', options: [] }), true)
  // Three options is a choice, and “男/女” is not a yes/no either.
  assert.equal(isBinaryQuestion({ controlType: 'radio-group', options: ['是', '否', '不确定'] }), false)
  assert.equal(isBinaryQuestion({ controlType: 'radio-group', options: ['男', '女'] }), false)
  assert.equal(isBinaryQuestion({ controlType: 'select', options: ['是', '否'] }), true)
})
