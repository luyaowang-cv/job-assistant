import assert from 'node:assert/strict'
import test from 'node:test'

import { educationSchema, personalProfileSchema } from './personal-profile'

test('accepts new optional education fields', () => {
  const education = {
    school: '示例大学', major: '计算机科学与技术', educationLevel: '硕士',
    college: '计算机学院', lab: 'NLP 实验室', researchDirection: '自然语言处理', advisor: '张三',
    startDate: '2024-09', endDate: '至今',
  }
  assert.equal(educationSchema.safeParse(education).success, true)
  assert.equal(personalProfileSchema.safeParse({ basics: {}, educations: [education] }).success, true)
})

test('new fields remain optional and unknown fields are rejected', () => {
  assert.equal(educationSchema.safeParse({ school: '示例大学' }).success, true)
  assert.equal(educationSchema.safeParse({ school: '示例大学', unknownField: 'x' }).success, false)
})