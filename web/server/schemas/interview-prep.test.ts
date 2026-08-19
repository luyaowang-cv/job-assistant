import assert from 'node:assert/strict'
import test from 'node:test'

import {
  interviewPrepGenerateSchema,
  interviewPrepSaveSchema,
  interviewPrepSectionsSchema,
  interviewReflectionConfirmSchema,
  interviewReflectionExtractedSchema,
  interviewReflectionPreviewSchema,
} from './interview-prep'

const section = { id: 'intro', title: '自我介绍', content: '## 30 秒版本\n我叫某某。' }

test('accepts generate/save/reflection payloads', () => {
  assert.equal(interviewPrepGenerateSchema.safeParse({ resumeVersionId: 'v1', jdText: 'jd', extraText: 'extra' }).success, true)
  assert.equal(interviewPrepGenerateSchema.safeParse({ resumeVersionId: 'v1' }).success, true)
  assert.equal(interviewPrepSaveSchema.safeParse({ resumeVersionId: 'v1', jdText: '', extraText: '', sections: [section, section, section] }).success, true)
  const extracted = { keyPoints: ['要点'], questions: [], weaknesses: ['不足'], nextFocus: [] }
  assert.equal(interviewReflectionExtractedSchema.safeParse(extracted).success, true)
  assert.equal(interviewReflectionPreviewSchema.safeParse({ resumeVersionId: 'v1', recordText: '面试记录' }).success, true)
  assert.equal(interviewReflectionConfirmSchema.safeParse({ resumeVersionId: 'v1', recordText: '面试记录', extracted }).success, true)
})


test('tolerates wrapped or partial AI structures', () => {
  const section = { id: 'intro', title: '自我介绍', content: '内容' }
  assert.equal(interviewPrepSectionsSchema.safeParse({ sections: [section, section] }).success, true)
  assert.equal(interviewPrepSectionsSchema.safeParse({ data: [section] }).success, true)
  assert.equal(interviewPrepSectionsSchema.safeParse({ title: '自我介绍', content: '内容' }).success, true)
  assert.equal(interviewPrepSectionsSchema.safeParse([{ title: '缺少内容' }]).success, true)
  assert.equal(interviewReflectionExtractedSchema.safeParse({ data: { keyPoints: '单一要点', questions: [], weaknesses: [], nextFocus: [] } }).success, true)
})
test('rejects missing or invalid fields', () => {
  assert.equal(interviewPrepSaveSchema.safeParse({ resumeVersionId: '', jdText: '', extraText: '', sections: [] }).success, false)
  assert.equal(interviewPrepSectionsSchema.safeParse([]).success, false)
  assert.equal(interviewPrepSectionsSchema.safeParse(null).success, false)
  assert.equal(interviewReflectionPreviewSchema.safeParse({ resumeVersionId: 'v1', recordText: '  ' }).success, false)
})